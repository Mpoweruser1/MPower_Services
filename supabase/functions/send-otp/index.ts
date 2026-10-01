// supabase/functions/send-otp/index.ts
//
// REWRITTEN 02-10-2026.
//   - Sends the code by SMS through MSG91 (DLT-approved template).
//     WhatsApp (Twilio) is still here, switched on with the secret
//     OTP_CHANNEL=whatsapp. Default is sms.
//   - Limits: 3 codes per phone per 10 minutes, 10 per phone per day.
//   - The code is made with a cryptographic random generator
//     (Math.random is predictable and not safe for security codes).
//   - Only valid Indian mobile numbers are accepted.
//   - Failures return a plain message, never internal details.
//
// Secrets used: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID (sms),
//   OTP_CHANNEL (optional), TWILIO_* (only if OTP_CHANNEL=whatsapp).
//
// Needs 009_otp_security.sql (adds phone_norm) to be run first.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const OTP_CHANNEL = (Deno.env.get('OTP_CHANNEL') || 'sms').toLowerCase();
const MSG91_AUTH_KEY = Deno.env.get('MSG91_AUTH_KEY');
const MSG91_TEMPLATE_ID = Deno.env.get('MSG91_TEMPLATE_ID');
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM');

const MAX_PER_WINDOW = 3;     // codes per phone per WINDOW_MINUTES
const WINDOW_MINUTES = 10;
const MAX_PER_DAY = 10;       // codes per phone per 24 hours
const OTP_VALID_MINUTES = 10; // matches the wording of the approved SMS

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Accepts +91 98765 43210, 919876543210, 09876543210 or 9876543210.
// Returns the plain 10 digits, or null if it is not an Indian mobile.
function normalizeIndianMobile(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 20) return null;
  const digits = raw.replace(/\D/g, '');
  let ten = '';
  if (digits.length === 10) ten = digits;
  else if (digits.length === 12 && digits.startsWith('91')) ten = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) ten = digits.slice(1);
  else return null;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

// Uniform 6-digit code from the secure generator. The loop throws away
// the few values that would make some codes slightly more likely.
function generateOtp(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / 900000) * 900000;
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(100000 + (n % 900000));
}

// MSG91 template SMS ("flow") API. Your template is a normal SMS
// template whose variable is ##OTP##, so the code goes in as "OTP".
// The number goes with the country code and no plus sign.
async function sendViaMsg91(ten: string, otp: string): Promise<boolean> {
  if (!MSG91_AUTH_KEY || !MSG91_TEMPLATE_ID) {
    console.error('send-otp: MSG91_AUTH_KEY or MSG91_TEMPLATE_ID is not set in the function secrets');
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: MSG91_AUTH_KEY, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        template_id: MSG91_TEMPLATE_ID,
        short_url: '0',
        recipients: [{ mobiles: `91${ten}`, OTP: otp }],
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: { type?: string } | null = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok || body?.type !== 'success') {
      // The code is never logged; MSG91's own reply is (it names the reason).
      console.error('send-otp: MSG91 did not accept the request', res.status, text.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('send-otp: MSG91 request failed', String(err));
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Kept so WhatsApp can be switched back on later with OTP_CHANNEL=whatsapp.
// Note: once Twilio is out of Sandbox mode, WhatsApp only allows
// business-started messages from approved templates, so this plain text
// would need to become a template then.
async function sendViaWhatsapp(e164: string, otp: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: TWILIO_WHATSAPP_FROM!,
        To: `whatsapp:${e164}`,
        Body: `Your MPower verification code is ${otp}. Valid for ${OTP_VALID_MINUTES} minutes.`,
      }),
    });
    if (!res.ok) {
      console.error('send-otp: Twilio send failed', res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error('send-otp: Twilio request failed', String(err));
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { phone, purpose } = await req.json();
    if (!phone || !purpose) return reply({ sent: false, error: 'phone and purpose are required' }, 400);
    if (typeof purpose !== 'string' || !/^[a-z_]{1,40}$/.test(purpose)) {
      return reply({ sent: false, error: 'Invalid request.' }, 400);
    }
    const ten = normalizeIndianMobile(phone);
    if (!ten) return reply({ sent: false, error: 'Please enter a valid 10-digit Indian mobile number.' }, 400);

    // Limits — checked BEFORE anything is stored or sent.
    const now = Date.now();
    const windowStart = new Date(now - WINDOW_MINUTES * 60 * 1000).toISOString();
    const dayStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const [recent, daily] = await Promise.all([
      supabase.from('otp_verifications').select('id', { count: 'exact', head: true })
        .eq('phone_norm', ten).eq('purpose', purpose).gte('created_at', windowStart),
      supabase.from('otp_verifications').select('id', { count: 'exact', head: true })
        .eq('phone_norm', ten).eq('purpose', purpose).gte('created_at', dayStart),
    ]);
    if (recent.error || daily.error) {
      console.error('send-otp: limit check failed', recent.error?.message || daily.error?.message);
      return reply({ sent: false, error: 'Could not send the code right now. Please try again.' }, 500);
    }
    if ((recent.count ?? 0) >= MAX_PER_WINDOW) {
      return reply({ sent: false, error: `Too many codes requested. Please wait ${WINDOW_MINUTES} minutes and try again.` }, 429);
    }
    if ((daily.count ?? 0) >= MAX_PER_DAY) {
      return reply({ sent: false, error: 'Daily limit reached for this number. Please try again tomorrow.' }, 429);
    }

    // The phone is stored exactly as the app sent it, because verify-otp
    // looks the code up with that same text. phone_norm is only for limits.
    const otp = generateOtp();
    const expiresAt = new Date(now + OTP_VALID_MINUTES * 60 * 1000).toISOString();
    const { data: row, error: dbErr } = await supabase.from('otp_verifications')
      .insert({ phone, phone_norm: ten, purpose, otp_code: otp, expires_at: expiresAt, verified: false })
      .select('id')
      .single();

    if (dbErr || !row) {
      console.error('send-otp: could not store the code', dbErr?.message, dbErr?.code);
      return reply({ sent: false, error: 'Could not send the code right now. Please try again.' }, 500);
    }

    const sent = OTP_CHANNEL === 'whatsapp'
      ? await sendViaWhatsapp(`+91${ten}`, otp)
      : await sendViaMsg91(ten, otp);

    if (!sent) {
      // A code that was never delivered shouldn't use up the person's limit.
      await supabase.from('otp_verifications').delete().eq('id', row.id);
      return reply({ sent: false, error: 'Failed to send OTP message' }, 502);
    }

    return reply({ sent: true });
  } catch (err) {
    console.error('send-otp: unexpected error', String(err));
    return reply({ sent: false, error: 'Internal error sending OTP' }, 500);
  }
});