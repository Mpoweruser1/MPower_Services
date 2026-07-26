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

export async function fetchAppSettings(appId) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('app_id, has_sachivalayam, default_language, party_name')
    .eq('app_id', appId)
    .maybeSingle();
  if (error) throw error;
  // app_settings may not have a row yet for a freshly-provisioned app —
  // fall back to sane defaults rather than throwing.
  return data || { app_id: appId, has_sachivalayam: false, default_language: 'English', party_name: null };
}

export async function fetchConstituencies(appId) {
  const { data, error } = await supabase
    .from('constituencies')
    .select('id, name, tier, rep_name, branch_id')
    .eq('app_id', appId)
    .order('name');
  if (error) throw error;
  return data;
}

export async function fetchMandals(constituencyId) {
  const { data, error } = await supabase
    .from('mandals')
    .select('id, name')
    .eq('constituency_id', constituencyId)
    .order('name');
  if (error) throw error;
  return data;
}

export async function fetchVillages(mandalId) {
  const { data, error } = await supabase
    .from('villages')
    .select('id, name')
    .eq('mandal_id', mandalId)
    .order('name');
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
export async function fetchCategories(appId) {
  const { data, error } = await supabase
    .from('complaint_categories')
    .select('id, category_key, label_en, sort_order, complaint_subissues(id, subissue_key, label_en, sort_order)')
    .or(`app_id.eq.${appId},app_id.is.null`)
    .order('sort_order');
  if (error) throw error;
  // sort nested subissues too (Supabase doesn't order embedded relations)
  return (data || []).map((c) => ({
    ...c,
    complaint_subissues: [...(c.complaint_subissues || [])].sort((a, b) => a.sort_order - b.sort_order),
  }));
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
export async function fetchStaffQueue() {
  const { data, error } = await supabase
    .from('complaints')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// The one function every staff action (acknowledge, resolve, escalate,
// decline, sanction, send-back, reopen) funnels through — it's just a
// complaint_history insert. The apply_history_entry trigger updates
// complaints.stage/updated_at server-side; the app never writes those
// columns directly.
export async function advanceComplaint({ complaintId, stage, byName, note, visibility }) {
  const { error } = await supabase.from('complaint_history').insert({
    complaint_id: complaintId,
    stage,
    by_name: byName,
    note: note || '',
    visibility: visibility || 'public',
  });
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
