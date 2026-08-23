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

    const { action } = await req.json();
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

    // action === 'claim'
    const { data: existing, error: fetchError } = await adminClient
      .from('active_sessions')
      .select('last_seen_at')
      .eq('auth_id', caller.id)
      .maybeSingle();
    if (fetchError) return json({ error: fetchError.message }, 500);

    if (existing) {
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

    const { error: upsertError } = await adminClient
      .from('active_sessions')
      .upsert({ auth_id: caller.id, session_token: crypto.randomUUID(), created_at: new Date().toISOString(), last_seen_at: new Date().toISOString() });
    if (upsertError) return json({ error: upsertError.message }, 500);

    return json({ claimed: true });
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