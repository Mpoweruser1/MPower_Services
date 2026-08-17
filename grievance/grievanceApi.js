// src/lib/grievanceApi.js
//
// Data access layer for the Grievance module. Every function here is a
// thin wrapper over a real Supabase query — no demo/in-memory storage.
// RLS on the underlying tables does the access-control work; this file
// just shapes the requests and responses.
//
// Assumes `supabase` is your existing client (see src/lib/supabaseClient.js,
// same import used in TenantContext.jsx).

import { supabase } from '../lib/supabaseClient';

/* ---------------------------------------------------------------------
 * Geography
 * ------------------------------------------------------------------- */

// Resolves a state's URL slug (e.g. 'andhra-pradesh') to its real app_id.
// This is what lets /grievance/:stateSlug/citizen work for any number of
// states without a code or route change — see migration 16.
export async function fetchAppIdBySlug(stateSlug) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('app_id')
    .eq('state_slug', stateSlug)
    .maybeSingle();
  if (error) throw error;
  return data?.app_id || null;
}

export async function fetchAppSettings(appId) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('app_id, has_sachivalayam, default_language, party_name')
    .eq('app_id', appId)
    .maybeSingle();
  if (error) throw error;

  // Separate query, not a join — same reasoning as TenantContext's fix:
  // avoids the embedded-relation 406 issue entirely.
  const { data: appRow } = await supabase
    .from('apps')
    .select('subscription_tier')
    .eq('id', appId)
    .maybeSingle();

  // app_settings may not have a row yet for a freshly-provisioned app —
  // fall back to sane defaults rather than throwing.
  return {
    ...(data || { app_id: appId, has_sachivalayam: false, default_language: 'English', party_name: null }),
    subscription_tier: appRow?.subscription_tier || 'basic',
  };
}

export async function fetchConstituencies(appId, tier) {
  let query = supabase
    .from('constituencies')
    .select('id, name, tier, rep_name, branch_id')
    .eq('app_id', appId);
  if (tier) query = query.eq('tier', tier);
  const { data, error } = await query.order('name');
  if (error) throw error;
  return data;
}

// A constituency's real representative — name and photo, resolved to a
// usable signed URL (photos live in a private bucket). Used to show a
// citizen their own MLA once their constituency is known — during
// registration review, and persistently afterward on their complaints
// list — instead of nothing at all.
export async function fetchConstituencyRep(constituencyId) {
  if (!constituencyId) return null;
  const { data, error } = await supabase
    .from('constituencies')
    .select('rep_name, rep_photo_url')
    .eq('id', constituencyId)
    .maybeSingle();
  if (error || !data) return null;

  let repPhotoUrl = null;
  if (data.rep_photo_url) {
    const { data: signed } = await supabase.storage
      .from('representative-photos')
      .createSignedUrl(data.rep_photo_url, 3600);
    repPhotoUrl = signed?.signedUrl || null;
  }
  return { repName: data.rep_name || null, repPhotoUrl };
}

// A representative's own constituency — looked up via rep_assignments,
// the same table approve-staff-verification writes to when an office
// is approved. Used so a real MLA/MP office's own login never has to
// manually search a statewide dropdown for their own seat before
// printing their own Batch Report — it can just default to them.
// Returns null for any non-representative role, or if no assignment
// exists yet (not an error — same "leave it blank, don't guess" stance
// as everywhere else in this module).
export async function fetchMyConstituencyId(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('rep_assignments')
    .select('constituency_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.constituency_id || null;
}

export async function fetchMandals(constituencyId) {
  const { data, error } = await supabase
    .from('mandals')
    .select('id, name, user_suggested')
    .eq('constituency_id', constituencyId)
    .order('name');
  if (error) throw error;
  return data;
}

// Adds a mandal a citizen typed but didn't find in the list. Checks for a
// case-insensitive duplicate first (two citizens typing "Pedana" and
// "pedana" should land on the same row, not create two). Anything created
// this way is flagged user_suggested — not authoritative LGD data, just
// enough for the citizen to keep filing their complaint right away.
export async function createMandal({ constituencyId, name, suggestedBy }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Mandal name is required');

  const { data: existing, error: lookupError } = await supabase
    .from('mandals')
    .select('id, name, user_suggested')
    .eq('constituency_id', constituencyId)
    .ilike('name', trimmed)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('mandals')
    .insert({
      constituency_id: constituencyId,
      name: trimmed,
      user_suggested: true,
      suggested_by: suggestedBy || null,
    })
    .select('id, name, user_suggested')
    .single();
  if (error) throw error;
  return data;
}

export async function fetchVillages(mandalId) {
  const { data, error } = await supabase
    .from('villages')
    .select('id, name, user_suggested')
    .eq('mandal_id', mandalId)
    .order('name');
  if (error) throw error;
  return data;
}

// Same pattern as createMandal, scoped to a village within its mandal.
export async function createVillage({ mandalId, name, suggestedBy }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Village name is required');

  const { data: existing, error: lookupError } = await supabase
    .from('villages')
    .select('id, name, user_suggested')
    .eq('mandal_id', mandalId)
    .ilike('name', trimmed)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('villages')
    .insert({
      mandal_id: mandalId,
      name: trimmed,
      user_suggested: true,
      suggested_by: suggestedBy || null,
    })
    .select('id, name, user_suggested')
    .single();
  if (error) throw error;
  return data;
}

export async function fetchSachivalayams(villageId) {
  const { data, error } = await supabase
    .from('sachivalayams')
    .select('id, name')
    .eq('village_id', villageId)
    .order('name');
  if (error) throw error;
  return data;
}

/* ---------------------------------------------------------------------
 * Category taxonomy (with sub-issue checkboxes)
 * ------------------------------------------------------------------- */

// Returns categories with their sub-issues nested, via Supabase's
// relationship embedding. app_id.is.null picks up the shared default set
// alongside anything a specific state/party has added of its own.
// Postgres doesn't know 'standard' > 'basic' — this ordering is what
// makes min_tier gating actually work, here in the app layer.
const TIER_ORDER = { basic: 0, standard: 1, advanced: 2, specialised: 3 };

function tierAtLeast(appTier, requiredTier) {
  return (TIER_ORDER[appTier] ?? 0) >= (TIER_ORDER[requiredTier] ?? 0);
}

// `appTier` is optional for backward compatibility — if omitted, every
// category is returned (old behavior). Pass the caller's real
// subscription tier (tenant.tier for staff, or the app's tier for
// citizens) to actually gate by subscription.
export async function fetchCategories(appId, appTier) {
  const { data, error } = await supabase
    .from('complaint_categories')
    .select('id, category_key, label_en, min_tier, sort_order, complaint_subissues(id, subissue_key, label_en, sort_order)')
    .or(`app_id.eq.${appId},app_id.is.null`)
    .order('sort_order');
  if (error) throw error;

  const filtered = appTier
    ? (data || []).filter((c) => tierAtLeast(appTier, c.min_tier || 'basic'))
    : (data || []);

  // sort nested subissues too (Supabase doesn't order embedded relations)
  return filtered.map((c) => ({
    ...c,
    complaint_subissues: [...(c.complaint_subissues || [])].sort((a, b) => a.sort_order - b.sort_order),
  }));
}

// Document hints shown to the citizen for categories where specific
// paperwork is typically needed (land disputes, welfare scheme claims).
// Returns a map of category_id -> [document labels], empty for
// categories with no hints configured.
export async function fetchCategoryDocuments(appId) {
  const { data: cats, error: catError } = await supabase
    .from('complaint_categories')
    .select('id')
    .or(`app_id.eq.${appId},app_id.is.null`);
  if (catError) throw catError;

  const categoryIds = (cats || []).map((c) => c.id);
  if (categoryIds.length === 0) return {};

  const { data, error } = await supabase
    .from('complaint_category_documents')
    .select('category_id, document_label, sort_order')
    .in('category_id', categoryIds)
    .order('sort_order');
  if (error) throw error;

  const map = {};
  (data || []).forEach((row) => {
    if (!map[row.category_id]) map[row.category_id] = [];
    map[row.category_id].push(row.document_label);
  });
  return map;
}

export async function fetchCategoryTranslations(language) {
  if (!language || language === 'English') return {};
  const { data, error } = await supabase
    .from('complaint_category_translations')
    .select('category_id, label')
    .eq('language', language);
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.category_id, r.label]));
}

export async function fetchSubissueTranslations(language) {
  if (!language || language === 'English') return {};
  const { data, error } = await supabase
    .from('complaint_subissue_translations')
    .select('subissue_id, label')
    .eq('language', language);
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.subissue_id, r.label]));
}

/* ---------------------------------------------------------------------
 * UI labels (static form text — section titles, field labels)
 * ------------------------------------------------------------------- */

export async function fetchUiLabels(appId) {
  const { data, error } = await supabase
    .from('ui_labels')
    .select('id, label_key, label_en')
    .or(`app_id.eq.${appId},app_id.is.null`);
  if (error) throw error;
  return data;
}

export async function fetchUiLabelTranslations(language) {
  if (!language || language === 'English') return {};
  const { data, error } = await supabase
    .from('ui_label_translations')
    .select('label_id, label')
    .eq('language', language);
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.label_id, r.label]));
}

/* ---------------------------------------------------------------------
 * Citizen profile
 * ------------------------------------------------------------------- */

export async function fetchCitizenProfile(authId) {
  const { data, error } = await supabase
    .from('citizens')
    .select('*')
    .eq('auth_id', authId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createCitizenProfile(profile) {
  const { data, error } = await supabase
    .from('citizens')
    .insert(profile)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCitizenProfile(citizenId, patch) {
  const { data, error } = await supabase
    .from('citizens')
    .update(patch)
    .eq('id', citizenId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* ---------------------------------------------------------------------
 * Complaints
 * ------------------------------------------------------------------- */

// Real, hard limit — 3 complaints per citizen per calendar day.
// Previously there was no check anywhere in the submission path at
// all, meaning nothing actually stopped repeated same-day submission.
export async function checkDailyComplaintLimit(citizenId) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('complaints')
    .select('id', { count: 'exact', head: true })
    .eq('citizen_id', citizenId)
    .gte('created_at', startOfToday.toISOString());
  if (error) throw error;

  return { count: count || 0, limitReached: (count || 0) >= 3 };
}

// Creates a complaint, its ticked sub-issues, and the initial history row,
// in that order. case_no is generated server-side by the table default —
// the returned `complaint` object already has the real one.
export async function submitComplaint({
  citizenId, appId, constituencyId, mandalId, villageId, sachivalayamId,
  title, description, category, priority, suggestedSolution,
  inputMode, language, transcriptionSource, issueKeys, otherDetail, byName,
}) {
  // branch_id (district) isn't stored on citizens — it's derived from the
  // constituency here, so callers never have to know or pass it themselves.
  const { data: constituency, error: constError } = await supabase
    .from('constituencies')
    .select('branch_id')
    .eq('id', constituencyId)
    .single();
  if (constError) throw constError;

  const { data: complaint, error: insertError } = await supabase
    .from('complaints')
    .insert({
      citizen_id: citizenId,
      app_id: appId,
      branch_id: constituency.branch_id,
      constituency_id: constituencyId,
      mandal_id: mandalId,
      village_id: villageId,
      sachivalayam_id: sachivalayamId || null,
      title,
      description,
      category,
      priority,
      suggested_solution: suggestedSolution || null,
      input_mode: inputMode || 'written',
      language: language || null,
      // Required by the database when input_mode is 'oral' — the
      // chk_oral_has_provenance constraint needs SOME record of how it
      // was captured (transcription_source or recorded_by_user_id).
      transcription_source: inputMode === 'oral' ? (transcriptionSource || 'other') : null,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  if (issueKeys && issueKeys.length > 0) {
    const { data: subissues, error: subError } = await supabase
      .from('complaint_subissues')
      .select('id, subissue_key')
      .in('subissue_key', issueKeys);
    if (subError) throw subError;

    const rows = subissues.map((s) => ({
      complaint_id: complaint.id,
      subissue_id: s.id,
      other_detail: s.subissue_key === 'other' ? (otherDetail || null) : null,
    }));
    if (rows.length > 0) {
      const { error: issuesError } = await supabase.from('complaint_issues').insert(rows);
      if (issuesError) throw issuesError;
    }
  }

  const { error: historyError } = await supabase.from('complaint_history').insert({
    complaint_id: complaint.id,
    stage: 'Submitted',
    by_name: byName || 'Citizen',
    visibility: 'public',
    note: 'Complaint registered.',
  });
  if (historyError) throw historyError;

  return complaint;
}

// Citizens query the MASKED view, never the raw complaints table — this
// is what actually hides "Escalated" behind "In Progress". RLS on the
// view still restricts to the signed-in citizen's own rows.
export async function fetchMyComplaints() {
  const { data, error } = await supabase
    .from('complaints_citizen_view')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchComplaintHistory(complaintId) {
  // RLS here does the Minister<->MLA privacy split automatically: a
  // citizen session only ever gets visibility='public' rows back for
  // this query; a rep/authority session gets everything in scope.
  const { data, error } = await supabase
    .from('complaint_history')
    .select('*')
    .eq('complaint_id', complaintId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchComplaintIssues(complaintId) {
  const { data, error } = await supabase
    .from('complaint_issues')
    .select('id, subissue_id, other_detail, complaint_subissues(subissue_key, label_en)')
    .eq('complaint_id', complaintId);
  if (error) throw error;
  return data;
}

// Staff (rep/authority/admin) queue. Same query regardless of role — RLS
// on `complaints` already scopes the rows to whatever that signed-in
// user is allowed to see (their constituency for a rep, escalated cases
// in-state for an authority, everything in-state for an admin).
const TERMINAL_STAGES = ['Resolved', 'Sanctioned', 'Declined'];

// Real server-side pagination — previously fetched every single
// complaint in one call with no limit at all, which doesn't scale
// once a queue has hundreds or thousands of entries. handled=false
// (the default) returns the active/pending queue; handled=true
// returns the resolved/sanctioned/declined ones separately, so the
// two lists can be paginated and searched independently.
export async function fetchStaffQueue({ page = 0, pageSize = 25, search = '', category = '', priority = '', handled = false, constituencyId = '', mandalId = '', villageId = '', dateFrom = '', dateTo = '' } = {}) {
  let query = supabase.from('complaints').select('*', { count: 'exact' });
  query = handled ? query.in('stage', TERMINAL_STAGES) : query.not('stage', 'in', `(${TERMINAL_STAGES.join(',')})`);
  if (search.trim()) query = query.ilike('title', `%${search.trim()}%`);
  if (category) query = query.eq('category', category);
  if (priority) query = query.eq('priority', priority);
  if (constituencyId) query = query.eq('constituency_id', constituencyId);
  if (mandalId) query = query.eq('mandal_id', mandalId);
  if (villageId) query = query.eq('village_id', villageId);
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
  if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
  query = query.order('created_at', { ascending: false });

  const from = page * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

// Same enrichment pattern as ComplaintPrint.jsx's batch report — the
// base complaints table has no joins at all, so village/mandal/citizen
// names are resolved here in a few batched queries (not one per row).
// Shared here so any screen needing this doesn't have to duplicate it.
export async function fetchEnrichedComplaints(appId) {
  const { data, error } = await supabase
    .from('complaints')
    .select('*')
    .eq('app_id', appId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data || [];
  const mandalIds = [...new Set(rows.map((r) => r.mandal_id).filter(Boolean))];
  const villageIds = [...new Set(rows.map((r) => r.village_id).filter(Boolean))];
  const citizenIds = [...new Set(rows.map((r) => r.citizen_id).filter(Boolean))];
  const constituencyIds = [...new Set(rows.map((r) => r.constituency_id).filter(Boolean))];

  const [mandalRes, villageRes, citizenRes, constRes] = await Promise.all([
    mandalIds.length ? supabase.from('mandals').select('id, name').in('id', mandalIds) : { data: [] },
    villageIds.length ? supabase.from('villages').select('id, name').in('id', villageIds) : { data: [] },
    citizenIds.length ? supabase.from('citizens').select('id, full_name, phone, ward_no, father_husband_name, membership_id').in('id', citizenIds) : { data: [] },
    constituencyIds.length ? supabase.from('constituencies').select('id, name').in('id', constituencyIds) : { data: [] },
  ]);
  const mandalMap = Object.fromEntries((mandalRes.data || []).map((m) => [m.id, m.name]));
  const villageMap = Object.fromEntries((villageRes.data || []).map((v) => [v.id, v.name]));
  const citizenMap = Object.fromEntries((citizenRes.data || []).map((c) => [c.id, c]));
  const constMap = Object.fromEntries((constRes.data || []).map((c) => [c.id, c.name]));

  return rows.map((r) => ({
    ...r,
    mandals: r.mandal_id ? { name: mandalMap[r.mandal_id] } : null,
    villages: r.village_id ? { name: villageMap[r.village_id] } : null,
    citizens: r.citizen_id ? citizenMap[r.citizen_id] : null,
    constituencies: r.constituency_id ? { name: constMap[r.constituency_id] } : null,
  }));
}

// The one function every staff action (acknowledge, resolve, escalate,
// decline, sanction, send-back, reopen) funnels through — it's just a
// complaint_history insert. The apply_history_entry trigger updates
// complaints.stage/updated_at server-side; the app never writes those
// columns directly.
// Writes a new stage to complaint_history AND updates the complaint's
// own current stage — atomically, via a single database transaction
// (see advance_complaint_stage() in the accompanying migration).
// Previously this only ever wrote the history log; complaints.stage
// was never touched, which is why Reports counts, Queue's
// Pending/Handled tabs, and every printed document kept showing each
// complaint's ORIGINAL stage forever, no matter how many times staff
// pressed Acknowledge/Resolved/etc. Fixed 15-8-2026.
export async function advanceComplaint({ complaintId, stage, byName, note, visibility }) {
  const { error } = await supabase.rpc('advance_complaint_stage', {
    p_complaint_id: complaintId,
    p_stage: stage,
    p_by_name: byName,
    p_note: note || '',
    p_visibility: visibility || 'public',
  });
  if (error) throw error;
}

// Records which department is now handling a complaint — typically
// entered by staff after a Collector's office responds to the printed
// batch report. A plain field update, separate from the stage/history
// mechanism above since assigning a department isn't itself a stage
// change.
export async function updateAssignedDepartment(complaintId, department) {
  const { error } = await supabase
    .from('complaints')
    .update({ assigned_department: department })
    .eq('id', complaintId);
  if (error) throw error;
}

/* ---------------------------------------------------------------------
 * Evidence attachments
 * ------------------------------------------------------------------- */

const EVIDENCE_BUCKET = 'complaint-evidence';

export async function uploadEvidence({ complaintId, file, uploadedByCitizenId, uploadedByUserId, caption }) {
  const ext = file.name.split('.').pop();
  const path = `${complaintId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const fileType = file.type.startsWith('video') ? 'video' : 'photo';

  const { data, error } = await supabase
    .from('complaint_attachments')
    .insert({
      complaint_id: complaintId,
      file_type: fileType,
      storage_path: path,
      file_size_bytes: file.size,
      caption: caption || null,
      uploaded_by_citizen_id: uploadedByCitizenId || null,
      uploaded_by_user_id: uploadedByUserId || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchEvidence(complaintId) {
  const { data, error } = await supabase
    .from('complaint_attachments')
    .select('*')
    .eq('complaint_id', complaintId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Evidence is private — always serve via a short-lived signed URL, never
// a public bucket URL.
export async function getEvidenceUrl(storagePath, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

/* ---------------------------------------------------------------------
 * Reporting (migration 9's rollup views)
 * ------------------------------------------------------------------- */

const REPORT_VIEWS = {
  village: 'complaint_stats_by_village',
  mandal: 'complaint_stats_by_mandal',
  constituency: 'complaint_stats_by_constituency',
  district: 'complaint_stats_by_district',
  state: 'complaint_stats_by_state',
  category: 'complaint_stats_by_category',
};

// RLS on every one of these views is security_invoker, so a rep querying
// 'village' only ever gets rows for their own constituency, an authority
// gets their whole state, etc — the same access boundary as everywhere
// else in this module, automatically, with no extra filtering needed here.
export async function fetchReportRollup(level) {
  const view = REPORT_VIEWS[level];
  if (!view) throw new Error(`Unknown report level: ${level}`);
  const { data, error } = await supabase.from(view).select('*');
  if (error) throw error;
  return data;
}

// Fire-and-forget log entry, matching the platform's existing
// report_history convention (used by School/Hospital reports too) —
// doesn't block the UI if it fails, viewing a report shouldn't error out
// over an audit-log write.
export async function logReportView({ appId, reportTemplateId, generatedByUserId, recordCount }) {
  try {
    await supabase.from('report_history').insert({
      app_id: appId,
      report_template_id: reportTemplateId || null,
      generated_by: generatedByUserId || null,
      record_count: recordCount,
      delivery_mode: 'digital_only',
      is_archived: false,
    });
  } catch {
    // intentionally swallowed — see comment above
  }
}

/* ---------------------------------------------------------------------
 * Platform feedback (about the app itself, not a specific complaint)
 * ------------------------------------------------------------------- */

/* submitFeedback/fetchFeedback moved to shared/feedbackApi.js —
   genuinely cross-module (School/Hospital need this too, not just
   CTS), was awkward to have living only inside this grievance-specific
   file. */

/* ---------------------------------------------------------------------
 * Staff profile — first-time photo, phone, emergency contact
 * ------------------------------------------------------------------- */

const STAFF_PHOTO_BUCKET = 'staff-photos';

export async function uploadStaffPhoto({ userId, file }) {
  const ext = file.name.split('.').pop();
  const path = `${userId}/photo.${ext}`;
  const { error } = await supabase.storage.from(STAFF_PHOTO_BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

export async function getStaffPhotoUrl(path, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from(STAFF_PHOTO_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function updateStaffProfile({ userId, phone, alternatePhone, photoUrl }) {
  const patch = {};
  if (phone !== undefined) patch.phone = phone;
  if (alternatePhone !== undefined) patch.alternate_phone = alternatePhone;
  if (photoUrl !== undefined) patch.photo_url = photoUrl;
  const { error } = await supabase.from('users').update(patch).eq('id', userId);
  if (error) throw error;
}

// The roster a rep/authority's request can be checked against — see
// migration 14's notes. Representatives use constituencies.rep_name
// (fetched separately via fetchConstituencies); this covers authorities.
export async function fetchExpectedAuthorities(appId) {
  const { data, error } = await supabase
    .from('expected_authorities')
    .select('id, authority_title, expected_name, claimed_by_user_id')
    .eq('app_id', appId)
    .order('authority_title');
  if (error) throw error;
  return data;
}

// Three distinct insights from one pass over the same enriched
// complaint data ReportsDashboard.jsx already has — no extra query.
//
// 1. Hotspots: 3+ complaints, same village + same category. A real
//    signal that many households are reporting the same underlying
//    problem, not isolated incidents — genuinely strengthens a case
//    when escalated as a group rather than as separate low-priority
//    tickets.
// 2. Family patterns: 2+ complaints from citizens sharing the same
//    father/husband name + village — likely the same household filing
//    across different names/categories, useful context for staff
//    before treating each as unrelated.
// 3. Exact duplicates: the SAME citizen filing the same category twice
//    within 24 hours — almost always an accidental double-submit, not
//    a new insight, just noise worth catching.
export function detectPatterns(complaints) {
  const hotspotGroups = {};
  complaints.forEach((c) => {
    if (!c.village_id || !c.category) return;
    const key = `${c.village_id}|${c.category}`;
    (hotspotGroups[key] = hotspotGroups[key] || []).push(c);
  });
  const hotspots = Object.values(hotspotGroups)
    .filter((g) => g.length >= 3)
    .sort((a, b) => b.length - a.length);

  const familyGroups = {};
  complaints.forEach((c) => {
    const name = c.citizens?.father_husband_name?.trim().toLowerCase();
    if (!name || !c.village_id) return;
    const key = `${name}|${c.village_id}`;
    (familyGroups[key] = familyGroups[key] || []).push(c);
  });
  const familyPatterns = Object.values(familyGroups)
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.length - a.length);

  const byCitizenCategory = {};
  complaints.forEach((c) => {
    if (!c.citizen_id || !c.category) return;
    const key = `${c.citizen_id}|${c.category}`;
    (byCitizenCategory[key] = byCitizenCategory[key] || []).push(c);
  });
  const exactDuplicates = Object.values(byCitizenCategory).filter((group) => {
    if (group.length < 2) return false;
    const sorted = [...group].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 0; i < sorted.length - 1; i++) {
      const hours = (new Date(sorted[i + 1].created_at) - new Date(sorted[i].created_at)) / 3600000;
      if (hours < 24) return true;
    }
    return false;
  });

  return { hotspots, familyPatterns, exactDuplicates };
}