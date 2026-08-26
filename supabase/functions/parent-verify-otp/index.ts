// supabase/functions/parent-verify-otp/index.ts
//
// Verifies the OTP and issues a server-side session token — the
// client never learns or handles the raw phone-to-student link
// itself, it just holds this token, which parent-get-data checks on
// every subsequent request.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { phone, otp } = await req.json();
    if (!phone || !otp) return json({ error: 'Phone and OTP are required' }, 400);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: otpRow } = await adminClient
      .from('parent_otp_verifications')
      .select('id, expires_at, used')
      .eq('phone', phone).eq('otp_code', otp)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (!otpRow) return json({ error: 'Incorrect code.' }, 401);
    if (otpRow.used) return json({ error: 'This code has already been used.' }, 401);
    if (new Date(otpRow.expires_at) < new Date()) return json({ error: 'This code has expired.' }, 401);

    await adminClient.from('parent_otp_verifications').update({ used: true }).eq('id', otpRow.id);

    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    const { data: session, error: sessionErr } = await adminClient
      .from('parent_sessions').insert({ phone, expires_at: sessionExpiry })
      .select('token').single();

    if (sessionErr) return json({ error: 'Failed to create session.' }, 500);

    return json({ verified: true, token: session.token });
  } catch (err) {
    console.error(err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
