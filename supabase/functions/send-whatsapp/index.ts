// supabase/functions/send-whatsapp/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM');

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const TEMPLATE_SIDS: Record<string, string> = {
  attendance_absent: Deno.env.get('TWILIO_TEMPLATE_ATTENDANCE_ABSENT') || '',
  fee_receipt: Deno.env.get('TWILIO_TEMPLATE_FEE_RECEIPT') || '',
  fee_payment_link: Deno.env.get('TWILIO_TEMPLATE_FEE_PAYMENT_LINK') || '',
  discharge_summary: Deno.env.get('TWILIO_TEMPLATE_DISCHARGE_SUMMARY') || '',
  golive_welcome: Deno.env.get('TWILIO_TEMPLATE_GOLIVE_WELCOME') || '',
  bug_report_ack: Deno.env.get('TWILIO_TEMPLATE_BUG_REPORT_ACK') || '',
  // Previously missing entirely — meaning 'billing_reminder' and
  // 'client_reminder' (the two types Control Panel actually sends)
  // could never have worked, ever, regardless of Twilio approval
  // status. These two secrets don't exist yet and these will keep
  // returning skipped:true until real templates are created and
  // approved in Twilio and these two env vars are set — but the code
  // is now ready to work the moment that happens, no further changes
  // needed here.
  billing_reminder: Deno.env.get('TWILIO_TEMPLATE_BILLING_REMINDER') || '',
  client_reminder: Deno.env.get('TWILIO_TEMPLATE_CLIENT_REMINDER') || '',
};

async function sendTemplateMessage(toPhone: string, templateSid: string, variables: Record<string, string>) {
  if (!templateSid) throw new Error('No approved template configured for this notification type');

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: TWILIO_WHATSAPP_FROM!,
      To: `whatsapp:${toPhone}`,
      ContentSid: templateSid,
      ContentVariables: JSON.stringify(variables),
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Twilio send failed: ${errBody}`);
  }
  return res.json();
}

async function resolveRecipient(body: any) {
  if (body.studentIds) {
    const { data } = await supabase.from('students').select('id, full_name, parent_phone, parent_phone_type').in('id', body.studentIds);
    return data || [];
  }
  if (body.studentId) {
    const { data } = await supabase.from('students').select('id, full_name, parent_phone, parent_phone_type').eq('id', body.studentId).single();
    return data ? [data] : [];
  }
  if (body.patientId) {
    const { data } = await supabase.from('patients').select('id, full_name, phone').eq('id', body.patientId).single();
    return data ? [{ id: data.id, full_name: data.full_name, parent_phone: data.phone, parent_phone_type: 'smartphone' }] : [];
  }
  if (body.clientId) {
    const { data } = await supabase.from('crm_clients').select('id, org_name, phone').eq('id', body.clientId).single();
    return data ? [{ id: data.id, full_name: data.org_name, parent_phone: data.phone, parent_phone_type: 'smartphone' }] : [];
  }
  return [];
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { type } = body;
    if (!type) return new Response(JSON.stringify({ error: 'type is required' }), { status: 400 });

    const templateSid = TEMPLATE_SIDS[type];
    if (!templateSid) {
      console.warn(`No approved template configured for type "${type}"`);
      return new Response(JSON.stringify({ sent: 0, skipped: true, reason: 'template_not_approved' }), { status: 200 });
    }

    const recipients = await resolveRecipient(body);
    const results = [];

    for (const recipient of recipients) {
      if (recipient.parent_phone_type === 'no_phone') continue;

      let optedOut = false;
      if (body.studentIds || body.studentId) {
        const { data: pref } = await supabase.from('parent_comm_prefs').select('opted_out').eq('student_id', recipient.id).maybeSingle();
        optedOut = pref?.opted_out || false;
      }
      if (optedOut) continue;

      const variables = { '1': recipient.full_name, '2': body.date || body.receiptNo || body.ackNumber || body.ticketNo || '' };

      let status = 'queued', twilioSid = null;
      try {
        const result = await sendTemplateMessage(recipient.parent_phone, templateSid, variables);
        status = 'sent'; twilioSid = result.sid;
      } catch (sendErr) {
        console.error(`Failed to send to ${recipient.parent_phone}:`, sendErr);
        status = 'failed';
      }

      await supabase.from('notifications').insert({
        student_id: body.studentIds || body.studentId ? recipient.id : null,
        patient_id: body.patientId ? recipient.id : null,
        channel: 'whatsapp', notif_type: type, message: `Template: ${type}`, status,
      });

      results.push({ recipientId: recipient.id, status, twilioSid });
    }

    return new Response(JSON.stringify({ sent: results.filter((r) => r.status === 'sent').length, total: results.length, results }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Internal error sending WhatsApp message' }), { status: 500 });
  }
});