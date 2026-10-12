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

// Moved off a direct client-side insert — the RLS policy governing
// this required current_app_id(), which can never resolve for a
// citizen (no users row exists for anonymous sessions), and villages
// has no app_id column of its own to check directly anyway. See
// suggest-village.ts: it verifies the mandal genuinely belongs to
// this appId server-side, before writing anything.
export async function createVillage({ appId, mandalId, name, suggestedBy }) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Village name is required');

  const { data, error } = await supabase.functions.invoke('suggest-village', {
    body: { appId, mandalId, name: trimmed, suggestedBy },
  });
  if (error || data?.error) throw new Error(data?.error || 'Failed to save the village.');
  return data.village;
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

// 3 complaints per citizen per calendar day. This is the friendly early check;
// the database now enforces the same limit (India date) for every caller, and
// its message reaches the citizen if this check is ever passed.
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

// Public, no-login tracking (12-10-2026). The database checks the case number
// together with the registered mobile number and answers with status, category
// and dates only. Returns { status: 'ok', complaint } | { status: 'not_found' }
// | { status: 'blocked' }. A wrong case number and a wrong mobile number are
// deliberately the same 'not_found'. Throws only when the check itself failed.
export async function trackComplaint({ caseNo, phone }) {
  const { data, error } = await supabase.rpc('track_complaint', {
    p_case_no: caseNo || '',
    p_phone: phone || '',
  });
  if (error) throw new Error('Could not check the complaint right now. Please try again.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.outcome === 'not_found') return { status: 'not_found' };
  if (row.outcome === 'blocked') return { status: 'blocked' };
  const { outcome, ...complaint } = row;
  return { status: 'ok', complaint };
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

/* ---------------------------------------------------------------------
 * Response deadline (12-10-2026)
 * One rule used by the Queue, the Reports screen and the citizen's own
 * list, so they can never disagree about whether a complaint is late.
 *   Normal complaint: 15 days from filing.   Urgent: 7 days.
 * The clock runs while a complaint is Submitted, Acknowledged, In Progress
 * or Escalated, and stops at Resolved, Sanctioned or Declined.
 * A "day" here is a full 24 hours since the complaint was filed.
 * ------------------------------------------------------------------- */
export const SLA_DAYS = { Normal: 15, Urgent: 7 };
const DAY_MS = 24 * 60 * 60 * 1000;

// 12-10-2026 (round 3): the clock starts at sla_started_at -- the day the
// complaint was filed, or the day the citizen reopened it (the database sets
// this). Falls back to created_at for any row that does not carry the column.
export function slaStart(complaint) {
  return (complaint && (complaint.sla_started_at || complaint.created_at)) || null;
}

export function slaInfo(complaint, now = new Date()) {
  const startRaw = slaStart(complaint);
  if (!startRaw) return null;
  const filed = new Date(startRaw);
  if (Number.isNaN(filed.getTime())) return null;
  const allowedDays = complaint.priority === 'Urgent' ? SLA_DAYS.Urgent : SLA_DAYS.Normal;
  const reopened = !!complaint.reopened_at;

  if (TERMINAL_STAGES.includes(complaint.stage)) {
    const end = new Date(complaint.updated_at || startRaw);
    const ageDays = Math.max(0, Math.floor((end - filed) / DAY_MS));
    return { closed: true, status: 'closed', reopened, ageDays, allowedDays, daysLeft: null, label: `Closed in ${ageDays}d` };
  }

  const ageDays = Math.max(0, Math.floor((now - filed) / DAY_MS));
  const daysLeft = allowedDays - ageDays;
  let status = 'ok';
  let label = `${daysLeft}d left`;
  if (daysLeft < 0) { status = 'overdue'; label = `Overdue by ${-daysLeft}d`; }
  else if (daysLeft === 0) { status = 'soon'; label = 'Due today'; }
  else if (daysLeft <= 2) { status = 'soon'; }
  return { closed: false, status, reopened, ageDays, allowedDays, daysLeft, label };
}

// Complaints still open past their deadline, for the "Overdue" filter and
// counts. Cut-off dates are worked out here and sent to the database, so the
// rule matches slaInfo() exactly: a complaint is overdue once it is a full
// day past its allowance -- clock started more than 16 days ago (Normal / no
// priority set) or more than 8 days ago (Urgent). On the last allowed day it
// shows "Due today", not overdue. The clock start is sla_started_at (filing
// date, or reopen date for a reopened complaint).
function overdueCutoffs(now = new Date()) {
  return {
    normal: new Date(now.getTime() - (SLA_DAYS.Normal + 1) * DAY_MS).toISOString(),
    urgent: new Date(now.getTime() - (SLA_DAYS.Urgent + 1) * DAY_MS).toISOString(),
  };
}
export function applyOverdueFilter(query, now = new Date()) {
  const { normal, urgent } = overdueCutoffs(now);
  return query.or(
    `and(priority.eq.Urgent,sla_started_at.lt.${urgent}),and(priority.eq.Normal,sla_started_at.lt.${normal}),and(priority.is.null,sla_started_at.lt.${normal})`
  );
}

// How many open complaints are past their deadline, within whatever this
// signed-in user is allowed to see (database rules scope it, as for the queue).
export async function fetchOverdueCount() {
  let query = supabase.from('complaints').select('id', { count: 'exact', head: true });
  query = query.not('stage', 'in', `(${TERMINAL_STAGES.join(',')})`);
  query = applyOverdueFilter(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

// Staff-side complaint search: matches the title OR the case number
// (old style GR/2026/000070 and new style EGMAN202600000084 alike), case
// ignored. Added 9-10-2026 -- search used to look at the title only, so a
// case number typed into any search box found nothing.
// The typed text goes inside double quotes, so commas and brackets are safe;
// only %, *, double quotes and backslashes (wildcard / quote characters) are
// removed first.
export function applyComplaintSearch(query, search) {
  const safe = String(search || '').replace(/[%*"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe) return query;
  return query.or(`title.ilike."%${safe}%",case_no.ilike."%${safe}%"`);
}

// Real server-side pagination — previously fetched every single
// complaint in one call with no limit at all, which doesn't scale
// once a queue has hundreds or thousands of entries. handled=false
// (the default) returns the active/pending queue; handled=true
// returns the resolved/sanctioned/declined ones separately, so the
// two lists can be paginated and searched independently.
export async function fetchStaffQueue({ page = 0, pageSize = 25, search = '', category = '', priority = '', handled = false, constituencyId = '', mandalId = '', villageId = '', dateFrom = '', dateTo = '', overdueOnly = false, oldestFirst = false } = {}) {
  let query = supabase.from('complaints').select('*', { count: 'exact' });
  query = handled ? query.in('stage', TERMINAL_STAGES) : query.not('stage', 'in', `(${TERMINAL_STAGES.join(',')})`);
  query = applyComplaintSearch(query, search);
  if (category) query = query.eq('category', category);
  if (priority) query = query.eq('priority', priority);
  if (constituencyId) query = query.eq('constituency_id', constituencyId);
  if (mandalId) query = query.eq('mandal_id', mandalId);
  if (villageId) query = query.eq('village_id', villageId);
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
  if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);
  // Overdue only makes sense for open complaints; ignored on the Handled list.
  if (overdueOnly && !handled) query = applyOverdueFilter(query);
  // Ordered by the deadline clock start, so a reopened complaint is listed by
  // the day it was reopened, not the day it was first filed.
  query = query.order('sla_started_at', { ascending: !!oldestFirst });

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
  // Supabase returns at most 1,000 rows per request, so this reads page after
  // page until a short page comes back. (Before 12-10-2026 it made one request
  // and silently stopped at 1,000 complaints.)
  const rows = await fetchAllPages(() => supabase
    .from('complaints')
    .select('*')
    .eq('app_id', appId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }));

  const mandalIds = [...new Set(rows.map((r) => r.mandal_id).filter(Boolean))];
  const villageIds = [...new Set(rows.map((r) => r.village_id).filter(Boolean))];
  const citizenIds = [...new Set(rows.map((r) => r.citizen_id).filter(Boolean))];
  const constituencyIds = [...new Set(rows.map((r) => r.constituency_id).filter(Boolean))];

  const [mandalRes, villageRes, citizenRes, constRes] = await Promise.all([
    selectIn('mandals', 'id, name', mandalIds),
    selectIn('villages', 'id, name', villageIds),
    selectIn('citizens', 'id, full_name, phone, ward_no, father_husband_name, membership_id', citizenIds),
    selectIn('constituencies', 'id, name', constituencyIds),
  ]);
  const mandalMap = Object.fromEntries(mandalRes.map((m) => [m.id, m.name]));
  const villageMap = Object.fromEntries(villageRes.map((v) => [v.id, v.name]));
  const citizenMap = Object.fromEntries(citizenRes.map((c) => [c.id, c]));
  const constMap = Object.fromEntries(constRes.map((c) => [c.id, c.name]));

  return rows.map((r) => ({
    ...r,
    mandals: r.mandal_id ? { name: mandalMap[r.mandal_id] } : null,
    villages: r.village_id ? { name: villageMap[r.village_id] } : null,
    citizens: r.citizen_id ? citizenMap[r.citizen_id] : null,
    constituencies: r.constituency_id ? { name: constMap[r.constituency_id] } : null,
  }));
}

// Reads every page of a query. `build` must return a FRESH query each call
// (a query can only be used once) and should carry a stable order.
async function fetchAllPages(build, pageSize = 1000) {
  const all = [];
  for (let from = 0; from < 200 * pageSize; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

// `.in('id', [...])` puts every id in the web address, which breaks once the
// list is long; so the ids are sent in groups of 150.
async function selectIn(table, columns, ids, column = 'id') {
  const out = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from(table).select(columns).in(column, ids.slice(i, i + 150));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

// The one function every staff action (acknowledge, resolve, escalate,
// decline, sanction, send-back) funnels through. Since 12-10-2026 the database
// refuses a status change that is not allowed (back to Submitted, Escalated
// back to Acknowledged, or outside the person's own scope) and then writes
// NOTHING -- so this throws, and callers must show the message.
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
  if (error) throw new Error(error.message || 'Could not update the complaint. Please try again.');
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
 * Citizen feedback: "was it really solved?" (12-10-2026)
 * Rating and reopening go through two database functions that check the
 * rules (own complaint, Resolved only, 30 days, twice at most), so the
 * messages below come straight from the database.
 * ------------------------------------------------------------------- */
export const REOPEN_WINDOW_DAYS = 30;
export const REOPEN_MAX = 2;

// Mirror of the database rule, only used to decide what to show the citizen.
// The database is the one that actually enforces it.
export function reopenEligibility(complaint, now = new Date()) {
  if (!complaint || complaint.stage !== 'Resolved') return { ok: false, reason: 'not_resolved' };
  if ((Number(complaint.reopen_count) || 0) >= REOPEN_MAX) return { ok: false, reason: 'max' };
  const resolvedAt = new Date(complaint.updated_at || complaint.created_at);
  if (!Number.isNaN(resolvedAt.getTime()) && now - resolvedAt > REOPEN_WINDOW_DAYS * DAY_MS) return { ok: false, reason: 'expired' };
  return { ok: true, reason: null };
}

export async function rateComplaint({ complaintId, rating, comment }) {
  const { error } = await supabase.rpc('citizen_rate_complaint', {
    p_complaint_id: complaintId,
    p_rating: rating,
    p_comment: comment || null,
  });
  if (error) throw new Error(error.message || 'Could not save your rating. Please try again.');
}

export async function reopenComplaint({ complaintId, reason }) {
  const { error } = await supabase.rpc('citizen_reopen_complaint', {
    p_complaint_id: complaintId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || 'Could not reopen the complaint. Please try again.');
}

// Ratings given on one complaint, oldest round first. Visible to the citizen
// who filed it and to staff whose scope covers it (database rules).
export async function fetchComplaintFeedback(complaintId) {
  const { data, error } = await supabase
    .from('complaint_citizen_feedback')
    .select('cycle, rating, comment, created_at')
    .eq('complaint_id', complaintId)
    .order('cycle', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Numbers for the Reports screen, within what this user may see:
//  - ratingCount / avgRating: every rating given (all rounds)
//  - confirmedCount of resolvedCount: complaints now Resolved whose citizen has
//    rated the current round, i.e. confirmed it was really solved
//  - reopenedCount: complaints reopened at least once
export async function fetchFeedbackStats(appId) {
  const [resolved, ratings, reopenedRes] = await Promise.all([
    fetchAllPages(() => supabase.from('complaints').select('id, reopen_count').eq('app_id', appId).eq('stage', 'Resolved').order('id', { ascending: true })),
    fetchAllPages(() => supabase.from('complaint_citizen_feedback').select('complaint_id, cycle, rating').eq('app_id', appId).order('complaint_id', { ascending: true }).order('cycle', { ascending: true })),
    supabase.from('complaints').select('id', { count: 'exact', head: true }).eq('app_id', appId).gt('reopen_count', 0),
  ]);
  if (reopenedRes.error) throw reopenedRes.error;

  const ratedRounds = new Set(ratings.map((r) => `${r.complaint_id}|${r.cycle}`));
  const confirmedCount = resolved.filter((c) => ratedRounds.has(`${c.id}|${Number(c.reopen_count) || 0}`)).length;
  const ratingCount = ratings.length;
  const avgRating = ratingCount ? ratings.reduce((sum, r) => sum + Number(r.rating), 0) / ratingCount : null;
  return {
    ratingCount,
    avgRating,
    resolvedCount: resolved.length,
    confirmedCount,
    confirmedPct: resolved.length ? Math.round((confirmedCount / resolved.length) * 100) : null,
    reopenedCount: reopenedRes.count || 0,
  };
}

/* ---------------------------------------------------------------------
 * Evidence attachments
 * ------------------------------------------------------------------- */

const EVIDENCE_BUCKET = 'complaint-evidence';

// Evidence size rules. Photos are shrunk in the browser before upload
// (longest side 1600 px, JPEG quality 0.8 -- normally a few hundred KB
// instead of the 2-5 MB a phone camera produces). Videos are not shrunk,
// so they get a hard size cap instead.
const EVIDENCE_PHOTO_MAX_SIDE = 1600;
const EVIDENCE_PHOTO_QUALITY = 0.8;
const EVIDENCE_PHOTO_SKIP_BELOW_BYTES = 300 * 1024;
const EVIDENCE_PHOTO_UNSHRUNK_MAX_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const SHRINKABLE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Decodes the picture so it can be drawn on a canvas. createImageBitmap
// with imageOrientation 'from-image' applies the phone's rotation tag, so
// a portrait photo does not come out sideways. Older browsers fall back
// to a plain <img>.
async function loadForDrawing(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, cleanup: () => bmp.close() };
    } catch {
      // fall through to the <img> route below
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
}

// Returns { blob, ext, contentType } for the shrunk copy, or null when the
// original should be uploaded as it is (unsupported type, already small,
// shrinking made it bigger, or the picture could not be decoded).
async function shrinkPhoto(file) {
  if (!SHRINKABLE_PHOTO_TYPES.includes(file.type)) return null;
  let loaded = null;
  try {
    loaded = await loadForDrawing(file);
    const scale = Math.min(1, EVIDENCE_PHOTO_MAX_SIDE / Math.max(loaded.width, loaded.height));
    if (scale === 1 && file.size <= EVIDENCE_PHOTO_SKIP_BELOW_BYTES) return null;
    const w = Math.max(1, Math.round(loaded.width * scale));
    const h = Math.max(1, Math.round(loaded.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // JPEG has no transparency; without this a see-through PNG goes black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(loaded.source, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', EVIDENCE_PHOTO_QUALITY));
    if (!blob || blob.size >= file.size) return null;
    return { blob, ext: 'jpg', contentType: 'image/jpeg' };
  } catch {
    return null;
  } finally {
    if (loaded) loaded.cleanup();
  }
}

export async function uploadEvidence({ complaintId, file, uploadedByCitizenId, uploadedByUserId, caption }) {
  const isVideo = file.type.startsWith('video');

  let body = file;
  let ext = file.name.split('.').pop();
  let contentType = file.type || undefined;

  if (isVideo) {
    if (file.size > EVIDENCE_VIDEO_MAX_BYTES) {
      throw new Error('Video is too large. Please keep it under 20 MB.');
    }
  } else {
    const shrunk = await shrinkPhoto(file);
    if (shrunk) {
      body = shrunk.blob;
      ext = shrunk.ext;
      contentType = shrunk.contentType;
    } else if (file.size > EVIDENCE_PHOTO_UNSHRUNK_MAX_BYTES) {
      throw new Error('This photo is too large and could not be reduced. Please try a smaller one.');
    }
  }

  // First folder must be the complaint's own id -- the storage rules
  // (evidence_insert_by_citizen / evidence_insert_by_staff) check it.
  const path = `${complaintId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, body, contentType ? { contentType } : undefined);
  if (uploadError) throw uploadError;

  const fileType = isVideo ? 'video' : 'photo';

  const { data, error } = await supabase
    .from('complaint_attachments')
    .insert({
      complaint_id: complaintId,
      file_type: fileType,
      storage_path: path,
      file_size_bytes: body.size,
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