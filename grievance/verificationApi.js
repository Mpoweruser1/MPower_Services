// src/lib/verificationApi.js
//
// Client-side calls for the verification flow. Everything here runs
// under the caller's own session/RLS EXCEPT approveRequest(), which
// invokes the Edge Function — that's the only privileged step, and it
// never touches service_role from the browser.

import { supabase } from '../lib/supabaseClient';

export async function submitVerificationRequest({
  appId, requestedRole, fullName, phone, claimedConstituencyId, claimedAuthorityTitle,
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to submit a verification request');

  const { data, error } = await supabase
    .from('staff_verification_requests')
    .insert({
      app_id: appId,
      requesting_auth_id: user.id,
      requested_role: requestedRole,
      full_name: fullName,
      phone,
      claimed_constituency_id: claimedConstituencyId || null,
      claimed_authority_title: claimedAuthorityTitle || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchMyVerificationRequest() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('staff_verification_requests')
    .select('*')
    .eq('requesting_auth_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Admin-only (RLS enforces this) — every pending request in their state.
export async function fetchPendingVerificationRequests() {
  const { data, error } = await supabase
    .from('staff_verification_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Admin fills in evidence before approving/rejecting — a plain update,
// no elevated privilege needed for this part.
export async function recordVerificationEvidence(requestId, { verificationMethod, evidenceNote }) {
  const { error } = await supabase
    .from('staff_verification_requests')
    .update({ verification_method: verificationMethod, evidence_note: evidenceNote })
    .eq('id', requestId);
  if (error) throw error;
}

export async function rejectVerificationRequest(requestId) {
  const { error } = await supabase
    .from('staff_verification_requests')
    .update({ status: 'rejected', decided_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw error;
}

// The one privileged action — routed through the Edge Function, not a
// direct table write. This is what actually creates the login-capable
// account once an admin has verified the evidence.
export async function approveVerificationRequest(requestId) {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('approve-staff-verification', {
    body: { requestId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  return data;
}
