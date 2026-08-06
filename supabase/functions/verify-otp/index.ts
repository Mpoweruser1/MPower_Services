// supabase/functions/verify-otp/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { phone, otp, purpose, newAuthId, appId } = await req.json();
    if (!phone || !otp || !purpose) return new Response(
      JSON.stringify({ verified: false, error: 'phone, otp, and purpose are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    const { data: record, error: fetchErr } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('phone', phone)
      .eq('purpose', purpose)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchErr || !record) return new Response(
      JSON.stringify({ verified: false, error: 'No pending OTP found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    if (new Date(record.expires_at) < new Date()) return new Response(
      JSON.stringify({ verified: false, error: 'OTP expired' }),
      { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    if (record.otp_code !== otp) return new Response(
      JSON.stringify({ verified: false, error: 'Incorrect OTP' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    await supabase.from('otp_verifications')
      .update({ verified: true, verified_at: new Date().toISOString() })
      .eq('id', record.id);

    // Re-link any existing citizen profile for this phone (within this
    // same state/app) to the new anonymous session, so a returning
    // citizen keeps their real profile and complaint history instead of
    // silently becoming a brand-new, disconnected identity every fresh
    // login. Scoped by BOTH phone and app_id — the same phone number
    // could legitimately be a citizen in more than one state, and this
    // must never cross-link those.
    //
    // Uses order+limit rather than maybeSingle(): if more than one
    // citizen row already exists for this phone (which can happen from
    // before this fix existed), maybeSingle() throws on multiple
    // matches — silently, since the error here was never checked —
    // meaning the relink would never run at all and each login would
    // keep creating yet another duplicate. Picking the most recently
    // created one instead is safe either way.
    if (newAuthId && appId) {
      const { data: existingRows } = await supabase
        .from('citizens')
        .select('id')
        .eq('phone', phone)
        .eq('app_id', appId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        await supabase.from('citizens')
          .update({ auth_id: newAuthId })
          .eq('id', existingRows[0].id);
      }
    }

    return new Response(
      JSON.stringify({ verified: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ verified: false, error: 'Internal error verifying OTP' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});