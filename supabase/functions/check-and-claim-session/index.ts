// supabase/functions/check-and-claim-session/index.ts
//
// The one place single-session enforcement actually lives. Called
// right after Supabase's own login succeeds (from every login flow
// — CTS citizen OTP, CTS staff, School, Hospital, Control Panel —
// all the same call, since this is keyed on auth.uid(), not any
// one module's own profile table), and again periodically as a
// heartbeat while the app stays open.
//
// Two very different jobs share this one function, picked by the
// `action` field in the request body:
//   'claim'     — called right after login. Checks whether this
//                 person already has a genuinely active session
//                 elsewhere; if not, claims this one as the new
//                 active session.
//   'heartbeat' — called periodically (every few minutes) while the
//                 app is open, just refreshing last_seen_at so an
//                 actively-used session never goes stale.
//   'release'   — called on Sign Out, from any module. Deletes the
//                 row outright, so signing out and immediately
//                 signing back in (even on the same device) never
//                 hits the wait.
//
// Deploy: supabase functions deploy check-and-claim-session

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Production value. A person who genuinely needs back in immediately
// (their own account, a different device or a closed tab) uses the
// explicit "It's me — sign in here instead" option in PortalLogin.jsx
// rather than this window being shortened — that button releases the
// old session right away, on demand, without weakening this timeout
// for everyone.
const STALE_AFTER_MINUTES = 30;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const { action, resumeToken } = await req.json();
    if (!['claim', 'heartbeat', 'release'].includes(action)) {
      return json({ error: 'action must be claim, heartbeat, or release' }, 400);
    }

    // Identify the caller from their own token — never trust a
    // client-supplied user id for something security-relevant like
    // this.
    const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) return json({ error: 'Could not identify caller' }, 401);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (action === 'release') {
      // Sign Out — always succeeds, always clears the row. No
      // reason to leave a lockout for someone who just deliberately
      // signed out.
      await adminClient.from('active_sessions').delete().eq('auth_id', caller.id);
      return json({ released: true });
    }

    if (action === 'heartbeat') {
      // Only refresh an existing row — a heartbeat should never
      // itself create a session that a 'claim' never approved. If
      // this returns no row, the caller's session was already
      // superseded elsewhere; the app should treat that as a forced
      // sign-out, not silently keep going.
      const { data, error } = await adminClient
        .from('active_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('auth_id', caller.id)
        .select()
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ stillActive: !!data });
    }

    // action === 'claim' — resumeToken already destructured above,
    // from the single request body read.

    const { data: existing, error: fetchError } = await adminClient
      .from('active_sessions')
      .select('last_seen_at, session_token')
      .eq('auth_id', caller.id)
      .maybeSingle();
    if (fetchError) return json({ error: fetchError.message }, 500);

    if (existing) {
      // Confirmed real bug: persistSession:false (deliberate, for
      // shared-device safety) means a mobile browser reloading a
      // backgrounded tab — something that happens constantly, just
      // from switching apps and coming back — wipes the session
      // client-side. The app then has to log back in, sees its own
      // still-fresh session from moments ago, and wrongly concludes
      // a different device claimed it. Same phone, mistaken for
      // someone else, reported by real users as happening
      // "frequently" — because backgrounding a tab is completely
      // routine mobile behavior, not a rare edge case.
      //
      // Fix: the client remembers its own session_token in
      // sessionStorage — survives a tab reload, but genuinely
      // disappears if the browser is actually closed or a new tab is
      // opened, so the real shared-device protection is untouched.
      // If the token presented here matches the existing row's own
      // token, this is the same session resuming, not a competing
      // device — allow it silently instead of rejecting.
      if (resumeToken && resumeToken === existing.session_token) {
        const { error: refreshError } = await adminClient
          .from('active_sessions')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('auth_id', caller.id);
        if (refreshError) return json({ error: refreshError.message }, 500);
        return json({ claimed: true, sessionToken: existing.session_token });
      }

      const lastSeen = new Date(existing.last_seen_at).getTime();
      const minutesSince = (Date.now() - lastSeen) / (1000 * 60);
      if (minutesSince < STALE_AFTER_MINUTES) {
        // Genuinely still active elsewhere — refuse the claim. The
        // caller (the login page) is responsible for signing this
        // just-authenticated Supabase session back out immediately
        // when it gets this response; this function only decides
        // whether the claim is allowed, it can't itself revoke the
        // Supabase session that already succeeded.
        return json({ claimed: false, reason: 'active_elsewhere' }, 409);
      }
    }

    const newToken = crypto.randomUUID();
    const { error: upsertError } = await adminClient
      .from('active_sessions')
      .upsert({ auth_id: caller.id, session_token: newToken, created_at: new Date().toISOString(), last_seen_at: new Date().toISOString() });
    if (upsertError) return json({ error: upsertError.message }, 500);

    return json({ claimed: true, sessionToken: newToken });
  } catch (err) {
    return json({ error: err.message || 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}