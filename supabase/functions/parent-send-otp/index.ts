// supabase/functions/parent-send-otp/index.ts
//
// Fully self-contained parent OTP send — uses only the new
// parent_otp_verifications table (built for this feature) and the
// already-proven send-whatsapp function for delivery.

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
    const { phone } = await req.json();
    if (!phone) return json({ error: 'Phone number is required' }, 400);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Confirm at least one student is actually linked to this phone
    // before sending anything — no reason to send an OTP to a number
    // that isn't a real parent contact in this school.
    const { data: matchingStudents } = await adminClient
      .from('students').select('id').eq('parent_phone', phone).eq('status', 'active').limit(1);

    if (!matchingStudents || matchingStudents.length === 0) {
      return json({ error: 'No student found with this phone number.' }, 404);
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    await adminClient.from('parent_otp_verifications').insert({
      phone, otp_code: otp, expires_at: expiresAt,
    });

    await adminClient.functions.invoke('send-whatsapp', {
      body: { type: 'parent_otp', phone, otp },
    });

    return json({ sent: true });
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
