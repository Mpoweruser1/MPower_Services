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
    const { phone, otp, purpose, newAuthId, appId, bypassOtp } = await req.json();
    if (!phone || !purpose) return new Response(
      JSON.stringify({ verified: false, error: 'phone and purpose are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // Dev-only bypass — mirrors the client's own OTP_BYPASS_ACTIVE gate
    // (import.meta.env.DEV + VITE_SKIP_OTP=true) so local testing can
    // skip real OTP delivery. Double-gated here too: the request must
    // explicitly ask for it AND this project's own function secrets
    // must have ALLOW_OTP_BYPASS=true set — never set on the real
    // production Supabase project, so this can never activate there
    // even if bypassOtp were somehow sent by mistake. Skipping straight
    // to the relink step below is the actual fix: previously the
    // client's bypass branch never called this function at all, which
    // meant it also never relinked a returning citizen's profile —
    // same disconnected-identity bug the 5-8/6-8 fix already solved
    // for the real OTP path, just reintroduced through this side door.
    const bypassAllowed = Deno.env.get('ALLOW_OTP_BYPASS') === 'true';
    const usingBypass = bypassOtp === true && bypassAllowed;

    if (!usingBypass) {
      if (!otp) return new Response(
        JSON.stringify({ verified: false, error: 'otp is required' }),
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
    }

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
    //
    // SAFEGUARD: appId is required for a relink to happen safely (it's
    // the cross-state isolation boundary — without it we could relink
    // the wrong state's citizen row entirely). Previously, a missing
    // appId meant this whole block was silently skipped: OTP still
    // verified successfully, so nobody ever saw an error, but the
    // citizen was quietly left disconnected from their own profile —
    // exactly the "asked to register again" bug reported. Now a
    // missing appId with a real newAuthId fails the request outright
    // instead, so a misconfiguration surfaces immediately as a visible
    // failure rather than a silent, confusing loss of history.
    if (newAuthId) {
      if (!appId) {
        console.error(`verify-otp: newAuthId (${newAuthId}) provided but appId is missing — refusing to proceed without a safe relink. phone=${phone}`);
        return new Response(
          JSON.stringify({ verified: false, error: 'Internal configuration error: appId missing, cannot safely link citizen profile. Please try again or contact support.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: existingRows, error: relinkFetchErr } = await supabase
        .from('citizens')
        .select('id')
        .eq('phone', phone)
        .eq('app_id', appId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (relinkFetchErr) {
        console.error('verify-otp: failed to look up existing citizen for relink', relinkFetchErr);
      } else if (existingRows && existingRows.length > 0) {
        const { error: relinkErr } = await supabase.from('citizens')
          .update({ auth_id: newAuthId })
          .eq('id', existingRows[0].id);
        if (relinkErr) {
          console.error('verify-otp: relink update failed', relinkErr);
        }
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