// supabase/functions/approve-staff-verification/index.ts — REWRITTEN
//
// Adapted to the CURRENT flow: staff_access_requests (public form, no
// login required to submit) instead of the old staff_verification_requests
// table. This is the one privileged step in the whole module — it's what
// actually creates a real, working login for an MLA/MP office, so it's
// the only place service_role is used here.
//
// What changed from the old version, and why:
//  1. Reads staff_access_requests, not staff_verification_requests — the
//     table the current public form actually writes to.
//  2. Requires verificationMethod to be passed in and non-empty. The old
//     flow required this to already be set on the request row before
//     calling approve; the current form has no login step at all, so
//     there's no earlier point to record it — the admin picks it right
//     here, at approval time, and it's saved as part of this same call.
//  3. staff_access_requests has NO auth_id — nobody logged in to submit
//     it. So unlike the old function (which only had to link an EXISTING
//     auth account to a new users row), this one has to CREATE the auth
//     account itself:
//       - If the request has an email: supabase.auth.admin.inviteUserByEmail
//         creates the account AND sends a real magic-link invite email
//         automatically, via whatever SMTP is configured on this Supabase
//         project. No custom email-sending code needed — this is Supabase's
//         own native invite mechanism.
//       - If there's no email (phone-only submissions are allowed by the
//         form): the account is created via admin.createUser with the
//         phone marked confirmed. There is no email to send a magic link
//         to in this case — first login for a phone-only account depends
//         on whatever phone/OTP sign-in path portal login actually
//         supports, which this function does not implement or assume.
//  4. constituency_name on staff_access_requests is plain text, not a
//     constituency_id — this function looks up the matching row in
//     constituencies (scoped to the same app_id) by name. If nothing
//     matches, it fails clearly rather than guessing or creating one.
//  5. WhatsApp notification (both email and phone cases) goes through the
//     existing send-whatsapp function with type 'staff_access_approved'.
//     KNOWN DEPENDENCY: send-whatsapp only delivers a message if its
//     Twilio Content Template has been approved — 'staff_access_approved'
//     is not one of the currently-approved templates, so this call will
//     currently no-op (send-whatsapp itself handles that gracefully, no
//     error is thrown). Once that template is approved on Twilio's side,
//     this starts working with no code change needed here.
//
// Deploy: supabase functions deploy approve-staff-verification
// Secrets needed: none beyond SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
// SUPABASE_ANON_KEY, already available to every Edge Function by default.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Browsers require a CORS preflight (OPTIONS) response before allowing
// the actual POST through, since this function lives on a different
// origin (*.supabase.co) than the app calling it. Without this, the
// browser blocks the response before it ever reaches the code below,
// and supabase-js reports a generic "Failed to send a request" — which
// is exactly what was happening here.
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

    const { requestId, verificationMethod, note, repPhotoPath } = await req.json();
    if (!requestId) return json({ error: 'requestId is required' }, 400);
    if (!verificationMethod || !verificationMethod.trim()) {
      return json({ error: 'verificationMethod is required before approving' }, 400);
    }

    // Two clients: one scoped to the CALLER's own JWT (to find out who
    // they are and check their role honestly), one with service_role
    // (to actually perform the privileged writes — creating a real
    // auth account).
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
      return json({ error: 'Not authorized to approve staff access requests' }, 403);
    }

    const { data: request, error: requestError } = await adminClient
      .from('staff_access_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !request) return json({ error: 'Access request not found' }, 404);
    if (request.status !== 'pending') return json({ error: `Request is already ${request.status}` }, 409);

    // A grievance_admin can only approve requests within their own state,
    // unless they're Mpower's own staff (developer/support), who can act
    // across tenants — same boundary as everywhere else in this module.
    if (callerProfile.role === 'grievance_admin' && callerProfile.app_id !== request.app_id) {
      return json({ error: 'Cannot approve a request outside your own state' }, 403);
    }

    // Resolve constituency_name (plain text on this table) to a real
    // constituency row within the same app_id AND the matching tier
    // (role_requested is literally 'MLA'/'MP'/'MLC', which corresponds
    // exactly to constituencies.tier — filtering by both name and tier
    // also resolves the same-name-across-tiers ambiguity we found
    // earlier, e.g. an "Adilabad" MLA seat and "Adilabad" MP seat
    // sharing a name). Authorities don't need a constituency at all,
    // so this is skipped for them.
    const REP_TIERS = ['MLA', 'MP', 'MLC'];
    let constituency = null;
    if (REP_TIERS.includes(request.role_requested)) {
      const { data: matched, error: constError } = await adminClient
        .from('constituencies')
        .select('id, name')
        .eq('app_id', request.app_id)
        .eq('tier', request.role_requested)
        .ilike('name', request.constituency_name.trim())
        .maybeSingle();

      if (constError) return json({ error: `Constituency lookup failed: ${constError.message}` }, 500);
      if (!matched) {
        return json({ error: `No ${request.role_requested} constituency named "${request.constituency_name}" found for this state — check the name on the request before approving` }, 400);
      }
      constituency = matched;
    }

    // The actual privileged step: create the auth account. Email path
    // uses Supabase's own invite mechanism (creates the account AND
    // sends a real magic-link email in one call). Phone-only path
    // creates the account with the phone marked confirmed — there's no
    // email to send a magic link to in that case.
    let newAuthUserId;
    if (request.email) {
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        request.email,
        { data: { full_name: request.contact_person, phone: request.phone } }
      );
      if (inviteError) return json({ error: `Could not create account: ${inviteError.message}` }, 500);
      newAuthUserId = invited.user.id;
    } else {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        phone: request.phone,
        phone_confirm: true,
        user_metadata: { full_name: request.contact_person },
      });
      if (createError) return json({ error: `Could not create account: ${createError.message}` }, 500);
      newAuthUserId = created.user.id;
    }

    // Create the users row linked to that new auth account. The role
    // vocabulary the rest of the app checks against (RequireRole,
    // permission logic) uses 'representative' — MLA/MP/MLC is which
    // tier of constituency they're linked to, tracked via
    // rep_assignments -> constituencies.tier, not the users.role value
    // itself.
    const normalizedRole = REP_TIERS.includes(request.role_requested) ? 'representative' : request.role_requested;

    const { data: newUser, error: userInsertError } = await adminClient
      .from('users')
      .insert({
        auth_id: newAuthUserId,
        app_id: request.app_id,
        full_name: request.contact_person,
        phone: request.phone,
        role: normalizedRole,
      })
      .select()
      .single();

    if (userInsertError) return json({ error: `Account created but user record failed: ${userInsertError.message}` }, 500);

    // Wire up the representative assignment, if applicable.
    if (constituency) {
      const { error: repError } = await adminClient
        .from('rep_assignments')
        .insert({ user_id: newUser.id, constituency_id: constituency.id });
      if (repError) {
        // The unique constraint (one rep per seat) is the most likely
        // failure here — surface it clearly, since it usually means a
        // handover step is needed rather than a fresh approval.
        return json({ error: `Account created but could not assign constituency: ${repError.message}` }, 409);
      }

      // Rep photo — reuses the SAME constituency.id already resolved
      // above (app_id + tier + name match), rather than doing a second,
      // separate lookup that could theoretically resolve to a different
      // row. Storage upload itself happens client-side before this call;
      // this just records the resulting path against the right seat.
      // Optional — a request approved without a photo is fine, the
      // Batch Report already handles a missing rep_photo_url gracefully.
      if (repPhotoPath) {
        const { error: photoError } = await adminClient
          .from('constituencies')
          .update({ rep_photo_url: repPhotoPath })
          .eq('id', constituency.id);
        if (photoError) {
          return json({ error: `Account created but rep photo could not be saved: ${photoError.message}` }, 500);
        }
      }
    }

    const { error: updateError } = await adminClient
      .from('staff_access_requests')
      .update({
        status: 'approved',
        verification_method: verificationMethod.trim(),
        notes: note || null,
        processed_by: newUser.id,
        processed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) return json({ error: `Account created but request update failed: ${updateError.message}` }, 500);

    // Best-effort WhatsApp notification — see file header note on the
    // template-approval dependency. Never lets a delivery failure here
    // undo the account already created above.
    try {
      await adminClient.functions.invoke('send-whatsapp', {
        body: { type: 'staff_access_approved', phone: request.phone, officeName: request.office_name },
      });
    } catch {
      // intentionally swallowed — account creation already succeeded
    }

    return json({ success: true, userId: newUser.id });
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