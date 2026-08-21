// shared/feedbackApi.js
//
// app_feedback is a genuinely cross-module table (scoped by app_id,
// works the same regardless of whether that app is School, Hospital,
// or Grievance/CTS) — this was previously living inside grievanceApi.js,
// which meant School/Hospital had no clean way to reuse it. Moved here
// so any module can submit or read feedback the same way.

import { supabase } from '../lib/supabaseClient';

export async function submitFeedback({ appId, citizenId, userId, rating, comments, context }) {
  const { error } = await supabase.from('app_feedback').insert({
    app_id: appId,
    citizen_id: citizenId || null,
    user_id: userId || null,
    rating: rating || null,
    comments: comments || null,
    context: context || null,
  });
  if (error) throw error;
}

// Feedback for one specific app (a tenant-scoped view, e.g. a single
// school or hospital's own admin). Resolves citizen/staff names so
// entries aren't just anonymous rows.
export async function fetchFeedback(appId) {
  const { data, error } = await supabase
    .from('app_feedback')
    .select('*')
    .eq('app_id', appId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return await enrichFeedback(data || []);
}

// Feedback across EVERY app at once — for MPower's own Control Panel,
// which is owner-level and not scoped to any single tenant. Also
// resolves which app/module each entry came from.
export async function fetchAllFeedback() {
  const { data, error } = await supabase
    .from('app_feedback')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data || [];
  const appIds = [...new Set(rows.map((r) => r.app_id).filter(Boolean))];
  const { data: apps } = appIds.length
    ? await supabase.from('apps').select('id, org_name, app_type').in('id', appIds)
    : { data: [] };
  const appMap = Object.fromEntries((apps || []).map((a) => [a.id, a]));

  const enriched = await enrichFeedback(rows);
  return enriched.map((r) => ({
    ...r,
    app_org_name: appMap[r.app_id]?.org_name || null,
    app_type: appMap[r.app_id]?.app_type || null,
  }));
}

async function enrichFeedback(rows) {
  const citizenIds = [...new Set(rows.map((r) => r.citizen_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];

  const [citizenRes, userRes] = await Promise.all([
    citizenIds.length ? supabase.from('citizens').select('id, full_name, village_id').in('id', citizenIds) : { data: [] },
    userIds.length ? supabase.from('users').select('id, full_name').in('id', userIds) : { data: [] },
  ]);
  const citizenMap = Object.fromEntries((citizenRes.data || []).map((c) => [c.id, c]));
  const userMap = Object.fromEntries((userRes.data || []).map((u) => [u.id, u.full_name]));

  // Village only exists on citizens — School/Hospital staff (users)
  // have no location field at all, so staff-sourced feedback simply
  // has nothing to show here. Not a gap to fill, just how the data
  // is structured.
  const villageIds = [...new Set((citizenRes.data || []).map((c) => c.village_id).filter(Boolean))];
  const { data: villages } = villageIds.length
    ? await supabase.from('villages').select('id, name').in('id', villageIds)
    : { data: [] };
  const villageMap = Object.fromEntries((villages || []).map((v) => [v.id, v.name]));

  return rows.map((r) => {
    const citizen = r.citizen_id ? citizenMap[r.citizen_id] : null;
    return {
      ...r,
      from_name: citizen ? citizen.full_name : r.user_id ? userMap[r.user_id] : null,
      from_type: r.citizen_id ? 'Citizen' : r.user_id ? 'Staff' : 'Anonymous',
      from_village: citizen?.village_id ? villageMap[citizen.village_id] || null : null,
    };
  });
}
