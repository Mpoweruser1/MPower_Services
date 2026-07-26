// supabase/functions/approve-staff-verification/index.ts
//
// The ONLY place service_role is used in this entire module. Everything
// else runs under the caller's own session and RLS. This function does
// exactly one privileged thing: turning an approved verification request
// into a real, working `users` row + rep_assignments/authority_assignments
// row. It re-checks the caller is actually a grievance_admin itself
// (server-side, via service_role, so it can't be spoofed) before doing
// anything — the restrictive RLS policy on `users` blocks this same
// insert from ever happening client-side, this function is the sanctioned
// exception, gated by its own authorization check.
//
// Deploy: supabase functions deploy approve-staff-verification
// Secrets needed (set via `supabase secrets set`): none beyond the
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY already available to every
// Edge Function by default.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const { requestId } = await req.json();
    if (!requestId) return json({ error: 'requestId is required' }, 400);

    // Two clients: one scoped to the CALLER's own JWT (to find out who
    // they are and check their role honestly), one with service_role
    // (to actually perform the privileged writes).
    const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) return json({ error: 'Could not identify caller' }, 401);

    // Re-verify the caller is genuinely a grievance_admin — don't trust
    // anything the client sent, look it up ourselves.
    const { data: callerProfile, error: profileError } = await adminClient
      .from('users')
      .select('id, app_id, role')
      .eq('auth_id', caller.id)
      .maybeSingle();

    if (profileError || !callerProfile || !['grievance_admin', 'developer', 'support'].includes(callerProfile.role)) {
      return json({ error: 'Not authorized to approve staff verification requests' }, 403);
    }

    const { data: request, error: requestError } = await adminClient
      .from('staff_verification_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !request) return json({ error: 'Verification request not found' }, 404);
    if (request.status !== 'pending') return json({ error: `Request is already ${request.status}` }, 409);
    if (!request.requesting_auth_id) return json({ error: 'Request has no linked auth account' }, 400);

    // A grievance_admin can only approve requests within their own state,
    // unless they're Mpower's own staff (developer/support), who can act
    // across tenants — same boundary as everywhere else in this module.
    if (callerProfile.role === 'grievance_admin' && callerProfile.app_id !== request.app_id) {
      return json({ error: 'Cannot approve a request outside your own state' }, 403);
    }
    if (!request.verification_method) {
      return json({ error: 'verification_method must be set before approving' }, 400);
    }

    // The actual privileged step: create the users row.
    const { data: newUser, error: userInsertError } = await adminClient
      .from('users')
      .insert({
        auth_id: request.requesting_auth_id,
        app_id: request.app_id,
        full_name: request.full_name,
        phone: request.phone,
        role: request.requested_role,
      })
      .select()
      .single();

    if (userInsertError) return json({ error: `Could not create user: ${userInsertError.message}` }, 500);

    // Wire up the corresponding assignment.
    if (request.requested_role === 'representative') {
      if (!request.claimed_constituency_id) {
        return json({ error: 'Representative request has no claimed_constituency_id' }, 400);
      }
      const { error: repError } = await adminClient
        .from('rep_assignments')
        .insert({ user_id: newUser.id, constituency_id: request.claimed_constituency_id });
      if (repError) {
        // The unique constraint from migration 8 (one rep per seat) is the
        // most likely failure here — surface it clearly rather than a
        // generic 500, since it usually means a handover step is needed.
        return json({ error: `Could not assign constituency: ${repError.message}` }, 409);
      }
    } else if (request.requested_role === 'authority') {
      if (!request.claimed_authority_title) {
        return json({ error: 'Authority request has no claimed_authority_title' }, 400);
      }
      const { error: authError } = await adminClient
        .from('authority_assignments')
        .insert({ user_id: newUser.id, authority_title: request.claimed_authority_title });
      if (authError) return json({ error: `Could not assign authority title: ${authError.message}` }, 500);

      // Mark the pre-filled roster position as claimed, if one exists
      // for this title (migration 14) — non-fatal if it doesn't match
      // anything, since not every authority title needs a roster entry.
      await adminClient
        .from('expected_authorities')
        .update({ claimed_by_user_id: newUser.id })
        .eq('app_id', request.app_id)
        .eq('authority_title', request.claimed_authority_title);
    }
    // grievance_admin requests need no separate assignment table — the
    // users row itself, scoped by app_id, is sufficient.

    const { error: updateError } = await adminClient
      .from('staff_verification_requests')
      .update({
        status: 'approved',
        verified_by: callerProfile.id,
        created_users_id: newUser.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) return json({ error: `User created but request update failed: ${updateError.message}` }, 500);

    return json({ success: true, userId: newUser.id });
  } catch (err) {
    return json({ error: err.message || 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
