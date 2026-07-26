// supabase/functions/send-otp/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM');

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

Deno.serve(async (req) => {
  try {
    const { phone, purpose } = await req.json();
    if (!phone || !purpose) return new Response(JSON.stringify({ error: 'phone and purpose are required' }), { status: 400 });

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: dbErr } = await supabase.from('otp_verifications').insert({ phone, purpose, otp_code: otp, expires_at: expiresAt, verified: false });
    if (dbErr) { console.error(dbErr); return new Response(JSON.stringify({ error: 'Failed to store OTP' }), { status: 500 }); }

    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: TWILIO_WHATSAPP_FROM!, To: `whatsapp:${phone}`, Body: `Your MPower verification code is ${otp}. Valid for 10 minutes.` }),
    });

    if (!twilioRes.ok) {
      console.error('Twilio send failed:', await twilioRes.text());
      return new Response(JSON.stringify({ error: 'Failed to send OTP message' }), { status: 502 });
    }

    return new Response(JSON.stringify({ sent: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Internal error sending OTP' }), { status: 500 });
  }
});