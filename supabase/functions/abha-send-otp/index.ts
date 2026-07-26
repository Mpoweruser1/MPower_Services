// supabase/functions/abha-send-otp/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ABDM_BASE_URL = Deno.env.get('ABDM_BASE_URL') || 'https://abhasbx.abdm.gov.in/abha/api/v3';
const ABDM_CLIENT_ID = Deno.env.get('ABDM_CLIENT_ID');
const ABDM_CLIENT_SECRET = Deno.env.get('ABDM_CLIENT_SECRET');

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function getAbdmAccessToken() {
  const res = await fetch(`${ABDM_BASE_URL}/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: ABDM_CLIENT_ID, clientSecret: ABDM_CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error('Failed to authenticate with ABDM');
  const data = await res.json();
  return data.accessToken;
}

Deno.serve(async (req) => {
  try {
    const { phone } = await req.json();
    if (!phone || phone.trim().length < 10) return new Response(JSON.stringify({ error: 'Valid phone number required' }), { status: 400 });

    const accessToken = await getAbdmAccessToken();

    const otpRes = await fetch(`${ABDM_BASE_URL}/enrollment/request/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ scope: ['abha-enrol'], loginHint: 'mobile', loginId: phone, otpSystem: 'abdm' }),
    });

    if (!otpRes.ok) {
      console.error('ABDM OTP request failed:', await otpRes.text());
      return new Response(JSON.stringify({ error: 'Failed to send OTP via ABDM' }), { status: 502 });
    }

    const otpData = await otpRes.json();

    await supabase.from('abha_consent_log').insert({ consent_type: 'creation', otp_verified: false, consent_text_language: 'english', signed_at: new Date().toISOString() });

    return new Response(JSON.stringify({ sent: true, txnId: otpData.txnId }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Internal error sending ABHA OTP' }), { status: 500 });
  }
});