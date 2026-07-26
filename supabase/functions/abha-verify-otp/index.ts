// supabase/functions/abha-verify-otp/index.ts
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
    const { phone, otp, txnId } = await req.json();
    if (!otp || otp.length < 4) return new Response(JSON.stringify({ error: 'Valid OTP required' }), { status: 400 });

    const accessToken = await getAbdmAccessToken();

    const verifyRes = await fetch(`${ABDM_BASE_URL}/enrollment/enrol/byAadhaar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'Transaction_Id': txnId },
      body: JSON.stringify({ otp }),
    });

    if (!verifyRes.ok) {
      console.error('ABDM OTP verify failed:', await verifyRes.text());
      return new Response(JSON.stringify({ verified: false, error: 'OTP verification failed' }), { status: 400 });
    }

    const verifyData = await verifyRes.json();
    const abhaId = verifyData.ABHAProfile?.healthIdNumber || verifyData.healthIdNumber;

    if (!abhaId) return new Response(JSON.stringify({ verified: false, error: 'ABHA ID not returned by ABDM' }), { status: 502 });

    await supabase.from('abha_consent_log').update({ otp_verified: true }).order('signed_at', { ascending: false }).limit(1);

    return new Response(JSON.stringify({ verified: true, abhaId }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ verified: false, error: 'Internal error verifying ABHA OTP' }), { status: 500 });
  }
});