// supabase/functions/correction-reminders/index.ts
// Runs daily via cron — sends WhatsApp reminders for pending
// correction requests that haven't been actioned.
// Schedule: every day at 9 AM IST (3:30 AM UTC)
// Stops after 3 reminders (3 working days)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const TWILIO_ACCOUNT_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN    = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM')!;

async function sendWhatsApp(to: string, message: string) {
  if (!to || !TWILIO_ACCOUNT_SID) return;
  const phone = to.startsWith('+') ? to : `+91${to}`;
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
        To:   `whatsapp:${phone}`,
        Body: message,
      }),
    }
  );
}

function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  // 0 = Sunday, 6 = Saturday
  return day !== 0 && day !== 6;
}

function workingDaysSince(date: Date): number {
  let count = 0;
  const now = new Date();
  const d   = new Date(date);
  while (d < now) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) count++;
  }
  return count;
}

Deno.serve(async (req) => {
  try {
    const now = new Date().toISOString();

    // Get all pending requests that are due a reminder
    const { data: pending, error } = await supabase
      .from('correction_requests')
      .select(`
        id, app_id, record_label, module, request_type,
        field_name, old_value, new_value, reason,
        requested_at, reminder_count, last_reminder_at,
        next_reminder_at,
        users!correction_requests_requested_by_fkey(full_name, phone)
      `)
      .eq('status', 'pending')
      .lte('next_reminder_at', now)
      .lt('reminder_count', 3); // max 3 reminders

    if (error) throw error;
    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No reminders due' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let sent = 0;

    for (const req of pending) {
      const workingDays = workingDaysSince(new Date(req.requested_at));
      const reminderNum = (req.reminder_count || 0) + 1;

      // Find admin/principal for this app to send reminder to
      const { data: admins } = await supabase
        .from('users')
        .select('phone, full_name')
        .eq('app_id', req.app_id)
        .in('role', ['principal', 'doctor', 'grievance_admin'])
        .not('phone', 'is', null);

      // Build reminder message
      const moduleLabel = req.module.charAt(0).toUpperCase() + req.module.slice(1);
      const changeDesc  = req.request_type === 'deletion'
        ? `DELETE this ${moduleLabel} record`
        : `Change ${req.field_name}: "${req.old_value}" → "${req.new_value}"`;

      const dayLabel = reminderNum === 1 ? 'first' : reminderNum === 2 ? 'second' : 'third (final)';

      const message = [
        `⏰ *MPower — Correction Request Reminder (${dayLabel})*`,
        ``,
        `📋 *Record:* ${req.record_label}`,
        `📝 *Change requested:* ${changeDesc}`,
        `💬 *Reason:* ${req.reason}`,
        `👤 *Requested by:* ${req.users?.full_name || '—'}`,
        `📅 *Pending since:* ${new Date(req.requested_at).toLocaleDateString('en-IN')} (${workingDays} working days)`,
        ``,
        reminderNum < 3
          ? `Please review and approve or reject this request in MPower.`
          : `⚠️ *This is the final reminder.* Please action this request today — no further reminders will be sent.`,
        ``,
        `Open MPower → Corrections to review.`,
      ].join('\n');

      // Send to all admins of this app
      if (admins && admins.length > 0) {
        for (const admin of admins) {
          if (admin.phone) {
            await sendWhatsApp(admin.phone, message);
            sent++;
          }
        }
      }

      // Calculate next reminder date (skip weekends)
      const nextReminder = new Date();
      nextReminder.setDate(nextReminder.getDate() + 1);
      while (!isWorkingDay(nextReminder)) {
        nextReminder.setDate(nextReminder.getDate() + 1);
      }

      // Update reminder count
      await supabase
        .from('correction_requests')
        .update({
          reminder_count:   reminderNum,
          last_reminder_at: now,
          // If this was the 3rd reminder stop scheduling more
          next_reminder_at: reminderNum < 3 ? nextReminder.toISOString() : null,
        })
        .eq('id', req.id);
    }

    return new Response(
      JSON.stringify({ sent, reminders: pending.length }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});