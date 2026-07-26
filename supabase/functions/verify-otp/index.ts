// supabase/functions/verify-otp/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  try {
    const { phone, otp, purpose } = await req.json();
    if (!phone || !otp || !purpose) return new Response(JSON.stringify({ verified: false, error: 'phone, otp, and purpose are required' }), { status: 400 });

    const { data: record, error: fetchErr } = await supabase
      .from('otp_verifications').select('*').eq('phone', phone).eq('purpose', purpose).eq('verified', false)
      .order('created_at', { ascending: false }).limit(1).single();

    if (fetchErr || !record) return new Response(JSON.stringify({ verified: false, error: 'No pending OTP found' }), { status: 404 });
    if (new Date(record.expires_at) < new Date()) return new Response(JSON.stringify({ verified: false, error: 'OTP expired' }), { status: 410 });
    if (record.otp_code !== otp) return new Response(JSON.stringify({ verified: false, error: 'Incorrect OTP' }), { status: 401 });

    await supabase.from('otp_verifications').update({ verified: true, verified_at: new Date().toISOString() }).eq('id', record.id);

    return new Response(JSON.stringify({ verified: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ verified: false, error: 'Internal error verifying OTP' }), { status: 500 });
  }
});