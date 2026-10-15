// hospital/HospitalReports.jsx — UPDATED
// Round 3 (on top of the print standard): every report prints the dates / years it really covers (a blank
// choice says "All dates" / "All years"; reports with a default range print that range); OPD visits with
// only a "To" date no longer come back empty; the ward list shows ward type and AC; every report can be
// exported to a CSV file (Excel opens it) exactly as it is shown.
// Printing now follows one standard on every report here: hospital heading + one title + one print
// date (shared PrintHeader), the filters used, the table, "Notes" explaining how the figures are
// worked out, signature lines on reports that carry money, and an end-of-report line (records,
// generated, printed by) — see shared/ReportFooter.jsx. The page wrapper no longer adds screen padding
// / height / dark background to the printed page.
// Six reports follow the newer Hospital features:
//   - Bed occupancy by ward   : rebuilt — ward type, AC / non-AC, beds on hold (reserved / out of service),
//                               occupied %, with filters for ward type and AC.
//   - IPD deposits (advance)  : NEW — what each admission paid, was refunded, used on its bill, still holds.
//   - Collections             : NEW — cash actually received per payment mode (bill payments + deposits taken
//                               − deposits refunded); scheme / insurance bills are shown apart (claimed later).
//   - Claims (scheme / insurance) : NEW — covered amounts still to be received, and those received.
//   - Cancelled bills             : NEW — who cancelled which bill, when and why.
//   - Revenue by service type     : NEW — billed amount per kind of service (consultation, lab, bed charges ...).
// A report whose database script has not been run yet says so instead of showing wrong numbers.
// Mirrors school/ReportsSearchIdCards.jsx's ReportEngine structure —
// same catalog/lock-by-tier pattern, same print-safe CSS, same fix
// for the "print to see all" bug (all rows always in the DOM, screen
// just scrolls, print releases the cap).
import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { MONEY_REPORT_IDS } from '../shared/hospitalAccess';
import HospitalNav from '../shared/HospitalNav';
import PrintHeader from '../shared/PrintHeader';
import ReportRemark from '../shared/ReportRemark';
import BugReporter from '../shared/BugReporter';
import { istToday, istDateOf, istMonthKey, istMonthLabel, istDayStart, istDayEnd, addDays, fetchAllRows } from './hospitalUtils';
import { buildWardWithBeds } from '../shared/bedLogic';
import ReportFooter from '../shared/ReportFooter';

const TIER_ORDER = ['basic', 'standard', 'advanced', 'specialised'];
function canAccess(userTier, reportTier) {
  return TIER_ORDER.indexOf(userTier) >= TIER_ORDER.indexOf(reportTier);
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 },
};

const REPORT_CATALOG = [
  { id: 'daily_opd',        name: "Today's OPD visits",         tier: 'basic',    icon: '🩺', params: ['dateRange', 'doctor'] },
  { id: 'lab_pending',      name: 'Pending lab tests',           tier: 'basic',    icon: '🔬', params: ['dateRange'] },
  { id: 'lab_tests_completed', name: 'Completed lab tests',      tier: 'basic',    icon: '✅', params: ['dateRange'] },
  { id: 'new_registrations',name: 'New patient registrations',   tier: 'basic',    icon: '🆕', params: ['dateRange'] },
  { id: 'doctor_wise_opd',  name: 'OPD visits by doctor',        tier: 'standard', icon: '👨‍⚕️', params: ['dateRange'] },
  { id: 'ipd_admission_history', name: 'IPD admission history',  tier: 'standard', icon: '📋', params: ['ward', 'dateRange'] },
  { id: 'bed_occupancy',    name: 'Bed occupancy by ward',       tier: 'standard', icon: '🛏️', params: ['wardKind', 'acType'] },
  { id: 'ipd_deposits',     name: 'IPD deposits (advance paid)', tier: 'standard', icon: '💰', params: ['ward', 'dateRange', 'depositStatus'] },
  { id: 'collections',      name: 'Collections (money received)', tier: 'standard', icon: '🧾', params: ['dateRange', 'paymentMode'] },
  { id: 'claims',           name: 'Scheme / insurance claims',    tier: 'standard', icon: '🏷️', params: ['dateRange', 'claimStatus', 'claimScheme'] },
  { id: 'cancelled_bills',  name: 'Cancelled bills',              tier: 'standard', icon: '🚫', params: ['dateRange'] },
  { id: 'revenue_by_service', name: 'Revenue by service type',    tier: 'standard', icon: '🧮', params: ['dateRange'] },
  { id: 'monthly_revenue_trend', name: 'Monthly revenue trend',      tier: 'standard', icon: '📈', params: ['financialYear'] },
  { id: 'opd_appointment_engagement', name: 'OPD appointment engagement', tier: 'standard', icon: '📅', params: ['doctor', 'dateRange'] },
  { id: 'avg_length_of_stay', name: 'Average IPD length of stay',    tier: 'standard', icon: '⏱️', params: ['dateRange'] },
  { id: 'most_prescribed_medicines', name: 'Most prescribed medicines', tier: 'standard', icon: '💊', params: ['dateRange'] },
  { id: 'gender_distribution',   name: 'Patient gender distribution', tier: 'standard', icon: '👥', params: ['calendarYear'] },
  { id: 'abha_consent_status',   name: 'ABHA consent status',         tier: 'standard', icon: '📋' },
  { id: 'revenue_by_mode',  name: 'Revenue by payment mode',     tier: 'standard', icon: '📊', params: ['financialYear'] },
  { id: 'abha_linked',      name: 'ABHA-linked patients',        tier: 'standard', icon: '🔗' },
];

// Ward kinds as the Ward screen offers them (wards.ward_kind).
const WARD_KINDS = [
  { k: 'general',      label: 'General ward' },
  { k: 'semi_private', label: 'Semi-private / twin sharing' },
  { k: 'private',      label: 'Private room' },
  { k: 'icu',          label: 'ICU / HDU / critical care' },
  { k: 'emergency',    label: 'Emergency / casualty' },
  { k: 'isolation',    label: 'Isolation' },
  { k: 'day_care',     label: 'Day care' },
  { k: 'maternity',    label: 'Maternity' },
  { k: 'pediatric',    label: 'Pediatric' },
  { k: 'other',        label: 'Other' },
];
const KIND_LABEL = Object.fromEntries(WARD_KINDS.map((x) => [x.k, x.label]));
// Money received at the counter. Scheme / insurance bills are claimed later, so they are not cash.
const CASH_MODES = ['Cash', 'UPI', 'Card'];
const SCHEME_MODES = ['Insurance', 'Aarogyasri', 'PMJAY'];
const DEPOSIT_STATUS_LABEL = {
  held: 'Money still held',
  discharged_held: 'Discharged, money still held',
  settled: 'Nothing held',
};
const CLAIM_STATUS_LABEL = { pending: 'Claims pending', received: 'Claims received' };
// The bill records how it was paid, not which scheme the covered part goes to: a bill paid under a
// scheme mode is clear; a bill paid Cash / UPI / Card with some lines covered is "not specified".
const CLAIM_SCHEME_LABEL = { Aarogyasri: 'Aarogyasri', PMJAY: 'PMJAY', Insurance: 'Insurance', other: 'Not specified (paid Cash / UPI / Card)' };
const SERVICE_ORDER = ['Consultation', 'Lab test', 'Medicines', 'Procedure', 'Bed charges', 'Nursing', 'X-Ray / Scan', 'Other'];
const REPORT_HINTS = {
  claims: 'Covered amounts of bills (the part claimed from PMJAY / Aarogyasri / insurance), by bill date. Pending first, oldest first. Cancelled bills are left out.',
  cancelled_bills: 'Bills cancelled in the chosen dates (by cancellation date; blank = all). A deposit used on a cancelled bill goes back to the patient’s deposit in hand.',
  revenue_by_service: 'Paid bills in the chosen dates (by the day the bill was entered; blank = last 30 days), split by the service type of each bill line, with GST. “Discount given” is worked out from the bills. The total is the billed amount (patient pays + covered by scheme).',
  bed_occupancy: 'Beds as of now (not a past date). “On hold” = reserved or out of service and not occupied.',
  ipd_deposits: 'Admissions that took a deposit in the chosen dates (blank = all). Amounts are the position today: paid, refunded, used on bills, and still in hand. Ward = the ward the patient is in now.',
  collections: 'Money actually received, by the day it was entered: the part of each paid bill paid at billing (a deposit paid earlier is not counted again) + deposits taken − deposits refunded. Bills paid under a scheme or insurance are listed apart — that money arrives later as a claim. Dates blank = today.',
};
// Notes printed at the bottom of each report (and shown under it on screen): how the figures are
// worked out, so a printed sheet can be understood without the screen.
const REPORT_NOTES = {
  daily_opd: ['OPD visits entered for the chosen dates; dates left blank mean today.', 'The doctor filter, when chosen, is shown above the table.'],
  lab_pending: ['Tests that have been ordered and whose result has not been entered yet.', 'Ordered = the day the test was ordered.'],
  lab_tests_completed: ['Tests whose result has been entered.', 'Completed = the day the result was entered.'],
  new_registrations: ['Patients registered in the chosen dates; dates left blank mean the last 90 days.'],
  doctor_wise_opd: ['Number of OPD visits per doctor in the chosen dates; a doctor with no visits shows 0.'],
  ipd_admission_history: ['Ward(s) shows every ward the patient stayed in, in order, when the patient was moved between wards.', 'The ward filter matches any ward the patient stayed in. “Still admitted” = not discharged yet.'],
  bed_occupancy: ['Beds as at the time of printing, not a past date.', 'On hold = reserved (until the date given) or out of service, and not occupied. Available = total beds − occupied − on hold.', 'Occupied % = occupied ÷ total beds.'],
  opd_appointment_engagement: ['Booked includes appointments already completed. Checked in = completed appointments.'],
  avg_length_of_stay: ['Only discharged admissions are counted. The admission day counts, the discharge day does not; a same-day discharge is 1 day.'],
  most_prescribed_medicines: ['Number of prescriptions in which each medicine was written, by the name as written.'],
  monthly_revenue_trend: ['Paid bills only; cancelled bills are left out. Months are by the day the bill was entered (Indian time).', 'Billed = Patient paid + Covered by scheme. Covered by scheme is claimed from the scheme / insurer, not collected at the counter.', 'Patient paid is the bill amount, including any part already paid earlier as a deposit; see Collections for money actually received.'],
  gender_distribution: ['Patients registered in the chosen year (blank = all years). Unspecified = gender not entered.'],
  abha_consent_status: ['All ABHA consents recorded for this hospital’s patients.'],
  revenue_by_mode: ['Paid bills only; cancelled bills are left out. Billed = Patient paid + Covered by scheme.', 'Covered by scheme is claimed from the scheme / insurer, not collected at the counter.', 'Patient paid is the bill amount, including any part already paid earlier as a deposit; see Collections for money actually received.'],
  abha_linked: ['All registered patients. Linked = ABHA number linked.'],
  ipd_deposits: ['Admissions that took a deposit in the chosen dates (blank = all). Amounts are the position at the time of printing.', 'In hand = deposit paid − refunded − used on bills. A deposit used on a cancelled bill goes back into In hand.', 'Ward (now) = the ward the patient is in at present.'],
  collections: ['Money actually received, by the day it was entered: the part of each paid bill paid at billing + deposits taken − deposits refunded. Dates left blank mean today.', 'A deposit paid earlier and used on a bill is not counted again.', 'Bills paid under a scheme or insurance are shown apart: that money arrives later as a claim and is not in the total.', 'Cash returned to a patient for a cancelled bill is not included.'],
  claims: ['Covered amounts of bills (the part claimed from PMJAY / Aarogyasri / insurance), by bill date. Cancelled bills are left out.', 'Pending first, oldest first. Days pending = days since the bill date. Received claims show the date and reference noted when received.', 'The bill records how it was paid, not which scheme the covered part goes to; “Not specified” = paid Cash / UPI / Card with some lines covered.'],
  cancelled_bills: ['Bills cancelled in the chosen dates (by cancellation date); blank = all.', 'Bill amount = patient pays + covered by scheme. Deposit returned = deposit used on the bill, which goes back to the patient’s deposit in hand.'],
  revenue_by_service: ['Paid bills in the chosen dates (blank = last 30 days), by the service type of each bill line. Total = Before GST + GST − Discount given.', 'Discount given is worked out from the bills (lines − covered by scheme − patient pays). Not itemised = older bills without lines.', 'Total (billed) = patient pays + covered by scheme.'],
};
// Reports that carry money get Prepared by / Checked by / Authorised signatory lines when printed.
const SIGNATURE_REPORTS = ['monthly_revenue_trend', 'revenue_by_mode', 'ipd_deposits', 'collections', 'claims', 'cancelled_bills', 'revenue_by_service'];
// A row that only totals or explains (TOTAL, scheme note, discount) is not a record.
const isRecordRow = (r) => !r.isTotal && !r.isNote && !r.isDiscount;
const isMissingObject = (e) => ['42P01', 'PGRST205', '42883', 'PGRST202'].includes(e?.code);
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Hospitals have no academic calendar — School's June-to-May
// convention was wrongly reused here at first. Indian businesses
// report revenue on the financial year (April to March); patient
// registration has no financial logic at all, so gender distribution
// uses a plain calendar year (Jan to Dec) instead — simpler and more
// intuitive than borrowing either business convention for it.
function financialRange(startYear) {
  if (!startYear) return null;
  return { from: `${startYear}-04-01`, to: `${Number(startYear) + 1}-03-31` };
}
function calendarRange(year) {
  if (!year) return null;
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

// Adds a from / to date filter to a query. `isTimestamp` columns (created_at ...) are compared
// by Indian calendar day; plain date columns (visit_date ...) are compared as they are. Either
// end may be left blank.
function applyRange(query, column, filters, isTimestamp) {
  const from = filters?.date_from;
  const to = filters?.date_to;
  let q = query;
  if (from) q = q.gte(column, isTimestamp ? istDayStart(from) : from);
  if (to) q = q.lte(column, isTimestamp ? istDayEnd(to) : to);
  return q;
}

async function runReportQuery(reportId, appId, extraFilters) {
  const today = istToday();

  // Notes that apply to every report below:
  //  - patients are never listed as a long list of ids in the request any more; a record is tied
  //    to the hospital by joining its patient (patients!inner + patients.app_id), or by its own
  //    app_id where the table has one. (The long list stopped working beyond a few hundred patients.)
  //  - every list / total is read page by page (fetchAllRows), because the database returns at most
  //    1,000 rows per request and cuts the rest off silently.
  //  - dates are Indian calendar days.
  switch (reportId) {
    case 'daily_opd': {
      // A date range (defaults to today when left blank) plus an optional doctor filter.
      const cols = ['S.No', 'Patient', 'UID', 'Doctor', 'Visit date', 'Remarks'];
      const to = extraFilters?.date_to || extraFilters?.date_from || today;
      const from = extraFilters?.date_from || to;
      const data = await fetchAllRows(() => {
        let q = supabase
          .from('opd_visits')
          .select('id, visit_date, patients!inner(full_name, patient_uid), doctors(designation, users(full_name))')
          .eq('patients.app_id', appId)
          .gte('visit_date', from).lte('visit_date', to);
        if (extraFilters?.doctor_id) q = q.eq('doctor_id', extraFilters.doctor_id);
        return q.order('visit_date').order('id');
      });
      return { data, columns: cols, rangeUsed: { from, to } };
    }
    case 'lab_pending': {
      const cols = ['S.No', 'Patient', 'UID', 'Test', 'Ordered', 'Status', 'Remarks'];
      const data = await fetchAllRows(() => applyRange(
        supabase.from('lab_tests')
          .select('id, test_name, status, created_at, patients(full_name, patient_uid)')
          .eq('app_id', appId)
          .eq('status', 'pending'),
        'created_at', extraFilters, true).order('created_at').order('id'));
      return { data, columns: cols };
    }
    case 'lab_tests_completed': {
      const cols = ['S.No', 'Patient', 'UID', 'Test', 'Completed', 'Status', 'Remarks'];
      const data = await fetchAllRows(() => applyRange(
        supabase.from('lab_tests')
          .select('id, test_name, status, result_ready_at, patients(full_name, patient_uid)')
          .eq('app_id', appId)
          .eq('status', 'completed'),
        'result_ready_at', extraFilters, true).order('result_ready_at', { ascending: false }).order('id'));
      return { data, columns: cols };
    }
    case 'new_registrations': {
      // A real date range, defaulting to the last 90 days when left blank.
      const cols = ['S.No', 'Patient', 'UID', 'Phone', 'Registered', 'Remarks'];
      const from = extraFilters?.date_from || addDays(today, -90);
      const to = extraFilters?.date_to || today;
      const data = await fetchAllRows(() => supabase
        .from('patients')
        .select('id, full_name, patient_uid, phone, created_at')
        .eq('app_id', appId)
        .gte('created_at', istDayStart(from))
        .lte('created_at', istDayEnd(to))
        .order('created_at', { ascending: false }).order('id'));
      return { data, columns: cols, rangeUsed: { from, to } };
    }
    case 'doctor_wise_opd': {
      const cols = ['S.No', 'Doctor', 'Designation', 'OPD visits', 'Remarks'];
      const visits = await fetchAllRows(() => applyRange(
        supabase.from('opd_visits')
          .select('id, doctor_id, visit_date, patients!inner(app_id)')
          .eq('patients.app_id', appId),
        'visit_date', extraFilters, false).order('visit_date').order('id'));
      const { data: hDoctors, error: docErr } = await supabase.from('doctors').select('id, designation, users(full_name)').eq('app_id', appId);
      if (docErr) { console.error('Report query failed:', docErr); throw docErr; }
      const counts = {};
      visits.forEach((v) => { if (v.doctor_id) counts[v.doctor_id] = (counts[v.doctor_id] || 0) + 1; });
      const rows = (hDoctors || []).map((d) => ({ id: d.id, doctor_name: d.users?.full_name || 'Unknown', designation: d.designation, count: counts[d.id] || 0 }))
        .sort((a, b) => b.count - a.count);
      return { data: rows, columns: cols };
    }
    case 'ipd_admission_history': {
      // A patient moved between wards shows the whole path ("General → ICU"), taken from the
      // stay history; the ward filter matches any ward the patient has stayed in.
      const cols = ['S.No', 'Patient', 'UID', 'Ward(s)', 'Admitted', 'Discharged', 'Remarks'];
      let admissions = await fetchAllRows(() => applyRange(
        supabase.from('ipd_admissions')
          .select('id, ward_id, admission_date, discharge_date, patients!inner(full_name, patient_uid), wards(ward_type)')
          .eq('patients.app_id', appId),
        'admission_date', extraFilters, false).order('admission_date', { ascending: false }).order('id'));

      const stays = [];
      const admIds = admissions.map((a) => a.id);
      for (let i = 0; i < admIds.length; i += 150) {
        const chunkIds = admIds.slice(i, i + 150);
        const chunk = await fetchAllRows(() => supabase
          .from('ipd_stays').select('id, admission_id, ward_id, from_date').in('admission_id', chunkIds).order('from_date').order('id'));
        stays.push(...chunk);
      }
      const { data: wardRows } = await supabase.from('wards').select('id, ward_type').eq('app_id', appId);
      const wardName = Object.fromEntries((wardRows || []).map((w) => [w.id, w.ward_type]));
      const staysByAdmission = {};
      stays.forEach((st) => { (staysByAdmission[st.admission_id] = staysByAdmission[st.admission_id] || []).push(st); });

      admissions = admissions.map((a) => {
        const list = staysByAdmission[a.id] || [];
        const names = [];
        list.forEach((st) => { const n = wardName[st.ward_id] || 'Ward'; if (names[names.length - 1] !== n) names.push(n); });
        return { ...a, ward_path: names.length ? names.join(' → ') : (a.wards?.ward_type || '—'), stay_ward_ids: list.map((st) => st.ward_id) };
      });
      if (extraFilters?.ward_id) {
        admissions = admissions.filter((a) => a.ward_id === extraFilters.ward_id || a.stay_ward_ids.includes(extraFilters.ward_id));
      }
      return { data: admissions, columns: cols };
    }
    case 'bed_occupancy': {
      // Counted the same way the Admissions screen counts: the beds of a ward come from its bed list
      // (a ward without one falls back to its bed count), a held bed is not available, an expired
      // reservation does not count. Wards with a ward type / AC setting can be filtered.
      let wr = await supabase.from('wards')
        .select('id, ward_type, total_beds, ward_kind, is_ac').eq('app_id', appId).order('ward_type').order('id');
      if (wr.error && wr.error.code === '42703') {
        // the ward-type script has not been run: no kind / AC information yet
        wr = await supabase.from('wards').select('id, ward_type, total_beds').eq('app_id', appId).order('ward_type').order('id');
      }
      if (wr.error) { console.error('Report query failed:', wr.error); throw wr.error; }
      const wardRows = wr.data || [];

      let bedRows = [];
      try {
        bedRows = await fetchAllRows(() => supabase.from('ward_beds')
          .select('id, ward_id, room, label, seq, hold_kind, hold_note, hold_until')
          .eq('app_id', appId).order('ward_id').order('seq').order('id'));
      } catch (e) {
        if (e?.code === '42703') {
          // the bed-hold script has not been run: beds exist but nothing can be on hold
          bedRows = await fetchAllRows(() => supabase.from('ward_beds')
            .select('id, ward_id, room, label, seq').eq('app_id', appId).order('ward_id').order('seq').order('id'));
        } else if (!isMissingObject(e)) {
          throw e;
        }
      }
      const active = await fetchAllRows(() => supabase.from('ipd_admissions')
        .select('id, ward_id, bed_no, patients!inner(app_id)')
        .eq('patients.app_id', appId).is('discharge_date', null).order('id'));

      const today = istToday();
      const wantKind = extraFilters?.ward_kind || '';
      const wantAc = extraFilters?.ac_type || '';
      const rows = wardRows
        .filter((w) => !wantKind || (w.ward_kind || 'general') === wantKind)
        .filter((w) => !wantAc || (wantAc === 'ac' ? !!w.is_ac : !w.is_ac))
        .map((w) => {
          const b = buildWardWithBeds(w, active, bedRows, today);
          return {
            id: w.id,
            ward_type: w.ward_type,
            kind_label: w.ward_kind ? (KIND_LABEL[w.ward_kind] || w.ward_kind) : '—',
            ac_label: w.is_ac === undefined || w.is_ac === null ? '—' : (w.is_ac ? 'AC' : 'Non-AC'),
            total_beds: b.total_beds, occupied: b.occupied, held: b.held, available: b.available,
            pct: b.total_beds > 0 ? Math.round((b.occupied / b.total_beds) * 100) : null,
          };
        });
      if (rows.length > 1) {
        const sum = (k) => rows.reduce((s2, r) => s2 + r[k], 0);
        const total = sum('total_beds'), occupied = sum('occupied');
        rows.push({
          id: '__total__', isTotal: true, ward_type: 'TOTAL', kind_label: '', ac_label: '',
          total_beds: total, occupied, held: sum('held'), available: sum('available'),
          pct: total > 0 ? Math.round((occupied / total) * 100) : null,
        });
      }
      return { data: rows, columns: ['S.No', 'Ward', 'Type', 'Air-con', 'Total beds', 'Occupied', 'On hold', 'Available', 'Occupied %', 'Remarks'] };
    }
    case 'ipd_deposits': {
      const cols = ['S.No', 'Patient', 'UID', 'Ward (now)', 'Admitted', 'Discharged', 'Deposit paid', 'Refunded', 'Used on bill', 'In hand', 'Remarks'];
      const notSetUp = new Error('Deposits are not set up in the database yet — ask for the deposits script (fix_hospital_deposits.sql) to be run first.');
      // 1. the admissions that took a deposit in the chosen dates (all of them when no dates are chosen)
      let lines;
      try {
        lines = await fetchAllRows(() => applyRange(
          supabase.from('ipd_deposits').select('id, admission_id, created_at').eq('app_id', appId).eq('kind', 'payment'),
          'created_at', extraFilters, true).order('created_at').order('id'));
      } catch (e) {
        if (isMissingObject(e)) throw notSetUp;
        throw e;
      }
      const ids = [...new Set(lines.map((l) => l.admission_id))];
      // 2. the money position of each (the database works it out: cancelled bills give their deposit back)
      const sums = {};
      const adms = {};
      for (let i = 0; i < ids.length; i += 150) {
        const chunk = ids.slice(i, i + 150);
        const { data: s, error: sErr } = await supabase.rpc('ipd_deposit_summary', { p_admissions: chunk });
        if (sErr) { if (isMissingObject(sErr)) throw notSetUp; console.error('Report query failed:', sErr); throw sErr; }
        (s || []).forEach((r) => { sums[r.admission_id] = r; });
        const { data: a, error: aErr } = await supabase.from('ipd_admissions')
          .select('id, ward_id, admission_date, discharge_date, patients(full_name, patient_uid)').in('id', chunk);
        if (aErr) { console.error('Report query failed:', aErr); throw aErr; }
        (a || []).forEach((r) => { adms[r.id] = r; });
      }
      const { data: wardRows, error: wErr } = await supabase.from('wards').select('id, ward_type').eq('app_id', appId);
      if (wErr) { console.error('Report query failed:', wErr); throw wErr; }
      const wardName = Object.fromEntries((wardRows || []).map((w) => [w.id, w.ward_type]));

      const status = extraFilters?.deposit_status || '';
      let rows = ids.filter((id) => adms[id] && sums[id]).map((id) => {
        const a = adms[id];
        const s = sums[id];
        return {
          id, admission_date: a.admission_date, discharge_date: a.discharge_date, ward_id: a.ward_id,
          patient: a.patients?.full_name || '—', uid: a.patients?.patient_uid || '',
          ward: wardName[a.ward_id] || '—',
          paid: r2(s.paid), refunded: r2(s.refunded), applied: r2(s.applied), in_hand: r2(s.in_hand),
        };
      });
      if (extraFilters?.ward_id) rows = rows.filter((r) => r.ward_id === extraFilters.ward_id);
      if (status === 'held') rows = rows.filter((r) => r.in_hand > 0);
      if (status === 'discharged_held') rows = rows.filter((r) => r.in_hand > 0 && r.discharge_date);
      if (status === 'settled') rows = rows.filter((r) => r.in_hand <= 0);
      rows.sort((a, b) => String(b.admission_date).localeCompare(String(a.admission_date)) || String(a.id).localeCompare(String(b.id)));
      if (rows.length > 1) {
        const sum = (k) => r2(rows.reduce((s2, r) => s2 + r[k], 0));
        rows.push({ id: '__total__', isTotal: true, patient: 'TOTAL', paid: sum('paid'), refunded: sum('refunded'), applied: sum('applied'), in_hand: sum('in_hand') });
      }
      return { data: rows, columns: cols };
    }
    case 'collections': {
      const cols = ['S.No', 'Payment mode', 'Bills', 'Received on bills', 'Deposits taken', 'Deposits refunded', 'Net received', 'Remarks'];
      // Blank dates = today; only "from" = from that day to today; only "to" = that one day.
      const to = extraFilters?.date_to || today;
      const from = extraFilters?.date_from || to;
      const mode = extraFilters?.payment_mode || '';
      const inRange = { date_from: from, date_to: to };

      const billSelect = (withDeposit) => () => {
        let q = supabase.from('billing_invoices')
          .select(withDeposit ? 'id, payment_mode, total_amount, deposit_applied, created_at' : 'id, payment_mode, total_amount, created_at')
          .eq('app_id', appId).eq('status', 'paid');
        if (mode) q = q.eq('payment_mode', mode);
        return applyRange(q, 'created_at', inRange, true).order('created_at').order('id');
      };
      let bills;
      try {
        bills = await fetchAllRows(billSelect(true));
      } catch (e) {
        if (e?.code !== '42703') throw e;
        bills = await fetchAllRows(billSelect(false)); // deposits script not run: no deposit adjustment on bills
      }
      let money = [];
      try {
        money = await fetchAllRows(() => {
          let q = supabase.from('ipd_deposits').select('id, kind, amount, payment_mode, created_at')
            .eq('app_id', appId).in('kind', ['payment', 'refund']);
          if (mode) q = q.eq('payment_mode', mode);
          return applyRange(q, 'created_at', inRange, true).order('created_at').order('id');
        });
      } catch (e) {
        if (!isMissingObject(e)) throw e; // deposits not set up: nothing to add
      }

      const by = {};
      const slot = (m) => (by[m] = by[m] || { bills: 0, billsAmt: 0, taken: 0, refunded: 0 });
      let schemeBills = 0, schemeAmt = 0;
      bills.forEach((b) => {
        const m = b.payment_mode || 'Unknown';
        const cash = Math.max(0, Number(b.total_amount || 0) - Number(b.deposit_applied || 0));
        if (SCHEME_MODES.includes(m)) { schemeBills += 1; schemeAmt += cash; return; }
        const s = slot(m);
        s.bills += 1;
        s.billsAmt += cash;
      });
      money.forEach((d) => {
        const s = slot(d.payment_mode || 'Unknown');
        if (d.kind === 'payment') s.taken += Number(d.amount || 0); else s.refunded += Number(d.amount || 0);
      });
      const rows = Object.entries(by)
        .map(([m, v]) => ({
          id: m, mode: m, bills: v.bills, billsAmt: r2(v.billsAmt), taken: r2(v.taken), refunded: r2(v.refunded),
          net: r2(v.billsAmt + v.taken - v.refunded),
        }))
        .sort((a, b) => b.net - a.net || a.mode.localeCompare(b.mode));
      if (rows.length > 1) {
        const sum = (k) => r2(rows.reduce((s2, r) => s2 + r[k], 0));
        rows.push({ id: '__total__', isTotal: true, mode: 'TOTAL', bills: sum('bills'), billsAmt: sum('billsAmt'), taken: sum('taken'), refunded: sum('refunded'), net: sum('net') });
      }
      if (schemeBills > 0) {
        rows.push({ id: '__scheme__', isNote: true, mode: 'Scheme / insurance bills (claimed later — not cash)', bills: schemeBills, billsAmt: r2(schemeAmt) });
      }
      return {
        data: rows, columns: cols,
        filterLabel: `Received ${from === to ? from : `${from} to ${to}`}  •  ${mode || 'All modes'}`,
      };
    }
    case 'opd_appointment_engagement': {
      const cols = ['S.No', 'Doctor', 'Date', 'Total slots', 'Booked', 'Checked in', 'Remarks'];
      const days = await fetchAllRows(() => {
        let q = supabase.from('opd_appointment_days').select('id, appointment_date, doctor_id, doctors(designation, users(full_name))').eq('app_id', appId);
        if (extraFilters?.doctor_id) q = q.eq('doctor_id', extraFilters.doctor_id);
        q = applyRange(q, 'appointment_date', extraFilters, false);
        return q.order('appointment_date', { ascending: false }).order('id');
      });
      // Slots are read in groups of days (a long list of ids does not fit in one request), page by page.
      const slots = [];
      const dayIds = days.map((d) => d.id);
      for (let i = 0; i < dayIds.length; i += 150) {
        const groupIds = dayIds.slice(i, i + 150);
        const chunk = await fetchAllRows(() => supabase
          .from('opd_appointment_slots').select('id, appointment_day_id, status').in('appointment_day_id', groupIds).order('id'));
        slots.push(...chunk);
      }
      const slotsByDay = {};
      slots.forEach((s) => { (slotsByDay[s.appointment_day_id] = slotsByDay[s.appointment_day_id] || []).push(s); });
      const rows = days.map((d) => {
        const daySlots = slotsByDay[d.id] || [];
        const booked = daySlots.filter((s) => s.status === 'booked' || s.status === 'completed').length;
        const completed = daySlots.filter((s) => s.status === 'completed').length;
        return { id: d.id, doctor: d.doctors?.users?.full_name || 'Unknown', date: d.appointment_date, total: daySlots.length, booked, completed };
      });
      return { data: rows, columns: cols };
    }
    case 'avg_length_of_stay': {
      // Counted the same way as the bill: the admission day counts, the discharge day does not,
      // and a same-day discharge is 1 day.
      const data = await fetchAllRows(() => applyRange(
        supabase.from('ipd_admissions')
          .select('id, admission_date, discharge_date, patients!inner(app_id)')
          .eq('patients.app_id', appId)
          .not('discharge_date', 'is', null),
        'admission_date', extraFilters, false).order('admission_date').order('id'));
      const istDay = (v) => Date.parse(istDateOf(v));
      const stays = data.map((a) => Math.max(1, Math.round((istDay(a.discharge_date) - istDay(a.admission_date)) / 86400000)));
      const total = stays.reduce((s2, v) => s2 + v, 0);
      const avg = stays.length ? total / stays.length : 0;
      const rows = [
        { id: 'avg', metric: 'Average length of stay', value: `${avg.toFixed(1)} days` },
        { id: 'count', metric: 'Completed admissions (discharged)', value: stays.length },
        { id: 'beddays', metric: 'Total bed-days', value: total },
        { id: 'max', metric: 'Longest stay', value: stays.length ? `${Math.max(...stays)} days` : '—' },
      ];
      return { data: rows, columns: ['Metric', 'Value', 'Remarks'] };
    }
    case 'most_prescribed_medicines': {
      const cols = ['S.No', 'Medicine', 'Times prescribed', 'Remarks'];
      // prescriptions carry no hospital column of their own; the database's row-level rules
      // already limit them to this hospital's patients.
      const data = await fetchAllRows(() => applyRange(
        supabase.from('prescriptions').select('id, medicines, created_at'),
        'created_at', extraFilters, true).order('created_at').order('id'));
      const counts = {};
      data.forEach((p) => {
        (p.medicines || []).forEach((m) => {
          const name = m.medicine?.trim();
          if (name) counts[name] = (counts[name] || 0) + 1;
        });
      });
      const rows = Object.entries(counts).map(([medicine, count]) => ({ id: medicine, medicine, count }))
        .sort((a, b) => b.count - a.count || a.medicine.localeCompare(b.medicine));
      return { data: rows, columns: cols };
    }
    case 'monthly_revenue_trend': {
      // Billed = what the patient pays + what a scheme / insurance covers on the same bill.
      // Cancelled bills are not counted (only status 'paid').
      const cols = ['S.No', 'Month', 'Invoices', 'Billed', 'Covered by scheme', 'Patient paid', 'Remarks'];
      const mrtRange = financialRange(extraFilters?.financialYearStart);
      const data = await fetchAllRows(() => {
        let q = supabase.from('billing_invoices').select('id, total_amount, covered_amount, created_at').eq('app_id', appId).eq('status', 'paid');
        if (mrtRange) q = q.gte('created_at', istDayStart(mrtRange.from)).lte('created_at', istDayEnd(mrtRange.to));
        return q.order('created_at').order('id');
      });
      const byMonth = {};
      data.forEach((inv) => {
        const key = istMonthKey(inv.created_at);
        if (!byMonth[key]) byMonth[key] = { month: istMonthLabel(inv.created_at), paid: 0, covered: 0, count: 0 };
        byMonth[key].paid += Number(inv.total_amount || 0);
        byMonth[key].covered += Number(inv.covered_amount || 0);
        byMonth[key].count += 1;
      });
      const rows = Object.entries(byMonth).sort((a2, b2) => a2[0].localeCompare(b2[0]))
        .map(([key, v]) => ({ id: key, ...v, billed: v.paid + v.covered }));
      if (rows.length > 1) {
        const paid = rows.reduce((s2, r) => s2 + r.paid, 0);
        const covered = rows.reduce((s2, r) => s2 + r.covered, 0);
        rows.push({ id: '__total__', month: 'TOTAL', isTotal: true, count: rows.reduce((s2, r) => s2 + r.count, 0), paid, covered, billed: paid + covered });
      }
      return { data: rows, columns: cols };
    }
    case 'gender_distribution': {
      const cols = ['S.No', 'Gender', 'Count', 'Remarks'];
      const gdRange = calendarRange(extraFilters?.calendarYear);
      const data = await fetchAllRows(() => {
        let q = supabase.from('patients').select('id, gender, created_at').eq('app_id', appId);
        if (gdRange) q = q.gte('created_at', istDayStart(gdRange.from)).lte('created_at', istDayEnd(gdRange.to));
        return q.order('created_at').order('id');
      });
      const counts = {};
      data.forEach((p) => { const g = p.gender || 'Unspecified'; counts[g] = (counts[g] || 0) + 1; });
      const rows = Object.entries(counts).map(([gender, count]) => ({ id: gender, gender, count }));
      return { data: rows, columns: cols };
    }
    case 'abha_consent_status': {
      const data = await fetchAllRows(() => supabase
        .from('abha_consent_log')
        .select('id, consent_type, otp_verified, patients!inner(full_name, patient_uid)')
        .eq('patients.app_id', appId)
        .order('id'));
      return { data, columns: ['S.No', 'Patient', 'UID', 'Consent type', 'OTP verified', 'Remarks'] };
    }
    case 'revenue_by_mode': {
      const cols = ['S.No', 'Payment mode', 'Invoices', 'Billed', 'Covered by scheme', 'Patient paid', 'Remarks'];
      const rbmRange = financialRange(extraFilters?.financialYearStart);
      const data = await fetchAllRows(() => {
        let q = supabase
          .from('billing_invoices')
          .select('id, payment_mode, total_amount, covered_amount, created_at')
          .eq('app_id', appId)
          .eq('status', 'paid');
        if (rbmRange) q = q.gte('created_at', istDayStart(rbmRange.from)).lte('created_at', istDayEnd(rbmRange.to));
        return q.order('created_at').order('id');
      });
      const byMode = {};
      data.forEach((inv) => {
        const mode = inv.payment_mode || 'Unknown';
        if (!byMode[mode]) byMode[mode] = { paid: 0, covered: 0, count: 0 };
        byMode[mode].paid += Number(inv.total_amount || 0);
        byMode[mode].covered += Number(inv.covered_amount || 0);
        byMode[mode].count += 1;
      });
      const rows = Object.entries(byMode).map(([mode, v]) => ({ id: mode, mode, ...v, billed: v.paid + v.covered }))
        .sort((a2, b2) => b2.billed - a2.billed);
      if (rows.length > 1) {
        const paid = rows.reduce((s2, r) => s2 + r.paid, 0);
        const covered = rows.reduce((s2, r) => s2 + r.covered, 0);
        rows.push({ id: '__total__', mode: 'TOTAL', isTotal: true, count: rows.reduce((s2, r) => s2 + r.count, 0), paid, covered, billed: paid + covered });
      }
      return { data: rows, columns: cols };
    }
    case 'claims': {
      // The covered part of a bill is money to be received from the scheme / insurer. A bill that
      // carries one is a claim: "pending" until it is marked received on the Bills tab.
      const cols = ['S.No', 'Invoice', 'Patient', 'UID', 'Bill date', 'Paid via', 'Claim amount', 'Status', 'Received on', 'Reference', 'Days pending', 'Remarks'];
      const notSetUp = new Error('Claim tracking is not set up in the database yet — ask for the billing-controls script (fix_hospital_billing_controls.sql) to be run first.');
      let data;
      try {
        data = await fetchAllRows(() => applyRange(
          supabase.from('billing_invoices')
            .select('id, invoice_no, invoice_date, payment_mode, covered_amount, claim_status, claim_ref, claim_received_at, patients(full_name, patient_uid)')
            .eq('app_id', appId).neq('status', 'cancelled').gt('covered_amount', 0),
          'invoice_date', extraFilters, false).order('invoice_date').order('id'));
      } catch (e) {
        if (e?.code === '42703') throw notSetUp;
        throw e;
      }
      const want = extraFilters?.claim_status || '';
      const scheme = extraFilters?.claim_scheme || '';
      const nowDay = Date.parse(today);
      let rows = data.map((b) => {
        const status = b.claim_status === 'received' ? 'received' : 'pending';
        return {
          id: b.id, invoice_no: b.invoice_no || '—', patient: b.patients?.full_name || '—', uid: b.patients?.patient_uid || '',
          invoice_date: b.invoice_date, paid_via: b.payment_mode || '—', amount: r2(b.covered_amount), status,
          received_on: b.claim_received_at ? istDateOf(b.claim_received_at) : '', reference: b.claim_ref || '',
          days: status === 'pending' ? Math.max(0, Math.round((nowDay - Date.parse(b.invoice_date)) / 86400000)) : null,
          mode: b.payment_mode,
        };
      });
      if (want) rows = rows.filter((r) => r.status === want);
      if (scheme === 'other') rows = rows.filter((r) => !SCHEME_MODES.includes(r.mode));
      else if (scheme) rows = rows.filter((r) => r.mode === scheme);
      // pending first, the oldest bill first
      rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'pending' ? -1 : 1)
        || String(a.invoice_date).localeCompare(String(b.invoice_date)) || String(a.id).localeCompare(String(b.id)));
      if (rows.length > 0) {
        const sumOf = (list) => r2(list.reduce((s2, r) => s2 + r.amount, 0));
        const pend = rows.filter((r) => r.status === 'pending');
        const recv = rows.filter((r) => r.status === 'received');
        if (rows.length > 1) rows.push({ id: '__total__', isTotal: true, invoice_no: 'TOTAL', amount: sumOf(rows.filter((r) => !r.isTotal)) });
        if (pend.length > 0 && recv.length > 0) {
          rows.push({ id: '__pending__', isTotal: true, invoice_no: `Still to receive (${pend.length})`, amount: sumOf(pend), pendingRow: true });
          rows.push({ id: '__received__', isTotal: true, invoice_no: `Received (${recv.length})`, amount: sumOf(recv) });
        }
      }
      return { data: rows, columns: cols };
    }
    case 'cancelled_bills': {
      const cols = ['S.No', 'Invoice', 'Patient', 'UID', 'Bill date', 'Cancelled on', 'Cancelled by', 'Reason', 'Bill amount', 'Deposit returned', 'Remarks'];
      const notSetUp = new Error('Bill cancellation records are not set up in the database yet — ask for the billing-controls script (fix_hospital_billing_controls.sql) to be run first.');
      const build = (withDeposit) => () => applyRange(
        supabase.from('billing_invoices')
          .select(`id, invoice_no, invoice_date, total_amount, covered_amount, ${withDeposit ? 'deposit_applied, ' : ''}cancel_reason, cancelled_at, cancelled_by, patients(full_name, patient_uid)`)
          .eq('app_id', appId).eq('status', 'cancelled'),
        'cancelled_at', extraFilters, true).order('cancelled_at', { ascending: false }).order('id');
      let data;
      try {
        try { data = await fetchAllRows(build(true)); } catch (e) {
          if (e?.code !== '42703') throw e;
          data = await fetchAllRows(build(false)); // deposits script not run: nothing was ever adjusted
        }
      } catch (e) {
        if (e?.code === '42703') throw notSetUp;
        throw e;
      }
      // who cancelled: names are looked up by id (a failure only leaves the name blank)
      const staffName = {};
      const staffIds = [...new Set(data.map((b) => b.cancelled_by).filter(Boolean))];
      for (let i = 0; i < staffIds.length; i += 150) {
        const { data: u, error: uErr } = await supabase.from('users').select('id, full_name').in('id', staffIds.slice(i, i + 150));
        if (uErr) { console.error('Loading staff names failed:', uErr); break; }
        (u || []).forEach((x) => { staffName[x.id] = x.full_name; });
      }
      const rows = data.map((b) => ({
        id: b.id, invoice_no: b.invoice_no || '—', patient: b.patients?.full_name || '—', uid: b.patients?.patient_uid || '',
        invoice_date: b.invoice_date, cancelled_on: b.cancelled_at ? istDateOf(b.cancelled_at) : '—',
        by: b.cancelled_by ? (staffName[b.cancelled_by] || '—') : '—', reason: b.cancel_reason || '—',
        amount: r2(Number(b.total_amount || 0) + Number(b.covered_amount || 0)), deposit_returned: r2(b.deposit_applied),
      }));
      if (rows.length > 1) {
        rows.push({ id: '__total__', isTotal: true, invoice_no: 'TOTAL', amount: r2(rows.reduce((s2, r) => s2 + r.amount, 0)), deposit_returned: r2(rows.reduce((s2, r) => s2 + r.deposit_returned, 0)) });
      }
      return { data: rows, columns: cols };
    }
    case 'revenue_by_service': {
      // Each bill line has a service type; line amount = quantity × price (+ GST). A bill's discount is
      // not stored on its own, so it is worked out: lines − covered by scheme − what the patient pays.
      const cols = ['S.No', 'Service type', 'Quantity', 'Before GST', 'GST', 'Total', 'Covered by scheme', 'Remarks'];
      const to = extraFilters?.date_to || today;
      const from = extraFilters?.date_from || addDays(to, -29);
      const bills = await fetchAllRows(() => applyRange(
        supabase.from('billing_invoices').select('id, total_amount, covered_amount, line_items, created_at')
          .eq('app_id', appId).eq('status', 'paid'),
        'created_at', { date_from: from, date_to: to }, true).order('created_at').order('id'));
      const by = {};
      let discount = 0; let plain = 0;
      bills.forEach((b) => {
        const lines = Array.isArray(b.line_items) ? b.line_items : [];
        if (lines.length === 0) { plain += Number(b.total_amount || 0) + Number(b.covered_amount || 0); return; }
        let lineSum = 0;
        lines.forEach((l) => {
          const qty = Number(l.quantity) || 0;
          const base = qty * (Number(l.unit_price) || 0);
          const gst = base * (Number(l.gst_rate) || 0) / 100;
          const type = (l.service_type && String(l.service_type).trim()) || 'Other';
          const s = (by[type] = by[type] || { qty: 0, base: 0, gst: 0, covered: 0 });
          s.qty += qty; s.base += base; s.gst += gst;
          if (l.covered) s.covered += base + gst;
          lineSum += base + gst;
        });
        const d = lineSum - Number(b.covered_amount || 0) - Number(b.total_amount || 0);
        if (d > 0.005) discount += d;
      });
      const types = Object.keys(by).sort((a, b) => {
        const ia = SERVICE_ORDER.indexOf(a), ib = SERVICE_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      });
      const rows = types.map((t) => ({
        id: t, service: t, qty: Math.round(by[t].qty * 100) / 100, base: r2(by[t].base), gst: r2(by[t].gst),
        total: r2(by[t].base + by[t].gst), covered: r2(by[t].covered),
      }));
      if (plain > 0) rows.push({ id: '__plain__', service: 'Not itemised (older bills)', qty: null, base: null, gst: null, total: r2(plain), covered: null });
      if (discount > 0.005) rows.push({ id: '__discount__', isDiscount: true, service: 'Discount given', qty: null, base: null, gst: null, total: -r2(discount), covered: null });
      if (rows.length > 0) {
        rows.push({
          id: '__total__', isTotal: true, service: 'TOTAL (billed)', qty: null,
          base: r2(rows.reduce((s2, r) => s2 + (r.base || 0), 0)), gst: r2(rows.reduce((s2, r) => s2 + (r.gst || 0), 0)),
          total: r2(rows.reduce((s2, r) => s2 + r.total, 0)), covered: r2(rows.reduce((s2, r) => s2 + (r.covered || 0), 0)),
        });
      }
      return { data: rows, columns: cols, filterLabel: `Billed ${from} to ${to}` };
    }
    case 'abha_linked': {
      const data = await fetchAllRows(() => supabase
        .from('patients')
        .select('id, full_name, patient_uid, abha_linked')
        .eq('app_id', appId)
        .order('full_name').order('id'));
      return { data, columns: ['S.No', 'Patient', 'UID', 'ABHA status', 'Remarks'] };
    }
    default:
      return { data: [], columns: [] };
  }
}

export function HospitalReports({ userTier = 'basic' }) {
  const { tenant } = useTenant();
  // A billing clerk sees only the money reports; owners see all
  const visibleReports = tenant?.role === 'billing_clerk' ? REPORT_CATALOG.filter((r) => MONEY_REPORT_IDS.includes(r.id)) : REPORT_CATALOG;
  const [running, setRunning] = useState(null);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');

  // Reusable parameter system — same design as School's report engine.
  // A report declares what it needs via `params`; one generic panel
  // renders the matching controls.
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterPanelFor, setFilterPanelFor] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [wards, setWards] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedWardId, setSelectedWardId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [financialYearStart, setFinancialYearStart] = useState('');
  const [calendarYear, setCalendarYear] = useState('');
  const [wardKind, setWardKind] = useState('');
  const [acType, setAcType] = useState('');
  const [depositStatus, setDepositStatus] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const tableWrapRef = useRef(null);
  const [claimStatus, setClaimStatus] = useState('');
  const [claimScheme, setClaimScheme] = useState('');

  async function loadDoctors() {
    const { data, error } = await supabase
      .from('doctors').select('id, designation, users(full_name)')
      .eq('app_id', tenant.appId);
    if (error) { console.error('Loading doctors failed:', error); return; }
    setDoctors(data || []);
  }

  async function loadWards() {
    let r = await supabase
      .from('wards').select('id, ward_type, total_beds, ward_kind, is_ac')
      .eq('app_id', tenant.appId).order('ward_type');
    if (r.error && r.error.code === '42703') {
      // the ward-type script has not been run: name and bed count only
      r = await supabase.from('wards').select('id, ward_type, total_beds').eq('app_id', tenant.appId).order('ward_type');
    }
    if (r.error) { console.error('Loading wards failed:', r.error); return; }
    setWards(r.data || []);
  }

  function collectParams(report) {
    const p = report.params || [];
    const out = {};
    if (p.includes('doctor')) out.doctor_id = selectedDoctorId;
    if (p.includes('ward')) out.ward_id = selectedWardId;
    if (p.includes('dateRange')) { out.date_from = dateFrom; out.date_to = dateTo; }
    if (p.includes('financialYear')) out.financialYearStart = financialYearStart;
    if (p.includes('calendarYear')) out.calendarYear = calendarYear;
    if (p.includes('wardKind')) out.ward_kind = wardKind;
    if (p.includes('acType')) out.ac_type = acType;
    if (p.includes('depositStatus')) out.deposit_status = depositStatus;
    if (p.includes('paymentMode')) out.payment_mode = paymentMode;
    if (p.includes('claimStatus')) out.claim_status = claimStatus;
    if (p.includes('claimScheme')) out.claim_scheme = claimScheme;
    return out;
  }

  function paramsReady(report) {
    // Every current Hospital param is optional (a doctor/ward/date left
    // blank just means "all") — nothing here is a hard requirement the
    // way class+exam were for School's rank list, so this always
    // returns true. Kept as its own function so a future required
    // param doesn't mean restructuring the Run button's logic.
    return true;
  }

  function buildFilterLabel(report, params) {
    const p = report.params || [];
    const parts = [];
    if (p.includes('doctor')) {
      const d = doctors.find((x) => x.id === params.doctor_id);
      parts.push(d ? `Dr. ${d.users?.full_name}` : 'All doctors');
    }
    if (p.includes('ward')) {
      const w = wards.find((x) => x.id === params.ward_id);
      parts.push(w ? w.ward_type : 'All wards');
    }
    if (p.includes('wardKind')) parts.push(params.ward_kind ? (KIND_LABEL[params.ward_kind] || params.ward_kind) : 'All ward types');
    if (p.includes('acType')) parts.push(params.ac_type === 'ac' ? 'AC wards' : params.ac_type === 'non_ac' ? 'Non-AC wards' : 'AC and non-AC');
    if (p.includes('claimStatus')) parts.push(CLAIM_STATUS_LABEL[params.claim_status] || 'Pending and received');
    if (p.includes('claimScheme')) parts.push(CLAIM_SCHEME_LABEL[params.claim_scheme] || 'All schemes');
    if (p.includes('depositStatus')) parts.push(DEPOSIT_STATUS_LABEL[params.deposit_status] || 'All deposits');
    if (p.includes('dateRange')) {
      if (params.date_from || params.date_to) {
        parts.push(params.date_from && params.date_from === params.date_to ? params.date_from : `${params.date_from || 'start'} to ${params.date_to || 'today'}`);
      } else {
        parts.push('All dates');
      }
    }
    if (p.includes('financialYear')) {
      if (params.financialYearStart) {
        const y = Number(params.financialYearStart);
        parts.push(`FY ${y}-${String(y + 1).slice(-2)}`);
      } else {
        parts.push('All years');
      }
    }
    if (p.includes('calendarYear')) parts.push(params.calendarYear ? `Year ${params.calendarYear}` : 'All years');
    return parts.join('  •  ');
  }

  // CSV of the report exactly as shown (Excel opens it): the title, filters and time first, then the
  // table. Amounts such as ₹10,000 become plain numbers so they can be added up; the screen-only
  // "+ remark" prompts are left out; a saved remark is included.
  function exportCsv() {
    const wrap = tableWrapRef.current;
    const table = wrap && wrap.querySelector('table');
    if (!table || !result) return;
    const cellText = (el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('.no-print').forEach((n) => n.remove());
      return c.textContent.replace(/\s+/g, ' ').trim();
    };
    const asValue = (t) => {
      const m = /^([−-])?₹([\d,]+(?:\.\d+)?)$/.exec(t);
      return m ? `${m[1] ? '-' : ''}${m[2].replace(/,/g, '')}` : t;
    };
    const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const head = [...table.querySelectorAll('thead th')].map((th) => cellText(th));
    const body = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => asValue(cellText(td))));
    const lines = [
      [result.report.name],
      ...(result.filterLabel ? [[result.filterLabel]] : []),
      [`Generated ${result.generatedAt}`],
      [],
      head, ...body,
    ].map((r) => r.map(esc).join(','));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.report.id}_${istToday()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function runReport(report, extraFilters) {
    if (!canAccess(userTier, report.tier)) return;
    if (!visibleReports.some((r) => r.id === report.id)) return;
    // Any report declaring `params` opens the panel first, exactly
    // like School's engine.
    if (report.params?.length && !extraFilters) {
      setFilterPanelFor(report.id);
      setShowFilterPanel(true);
      setResult(null);
      setError('');
      if (report.params.includes('doctor')) loadDoctors();
      if (report.params.includes('ward')) loadWards();
      return;
    }
    setRunning(report.id);
    setResult(null);
    setError('');
    try {
      const res = await runReportQuery(report.id, tenant.appId, extraFilters);
      setResult({
        report,
        ...res,
        // a report with a default range (blank = today / last 90 days) says which dates it really used
        filterLabel: res.filterLabel !== undefined ? res.filterLabel
          : (extraFilters ? buildFilterLabel(report, res.rangeUsed ? { ...extraFilters, date_from: res.rangeUsed.from, date_to: res.rangeUsed.to } : extraFilters) : ''),
        generatedAt: new Date().toLocaleString('en-IN'),
      });
      setShowFilterPanel(false);
    } catch (err) {
      console.error('Report generation failed:', err);
      setError(err.message || 'Failed to generate report. Please try again.');
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="report-page" style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        .report-table-wrap { max-height: 600px; overflow-y: auto; }
        /* A report with more than 10 columns (IPD deposits, Cancelled bills, Claims) prints on landscape
           paper: the page rule is added below, next to the header, only while such a report is on
           screen. (A named page was tried first: it pushed the hospital heading onto a page of its own and
           the table onto the next, and the browser kept portrait size.) */
        @media print {
          .no-print { display: none !important; }
          .print-safe, .print-safe * { background: #fff !important; color: #000 !important; border-color: #ccc !important; }
          .report-table-wrap { max-height: none !important; overflow: visible !important; }
          /* The screen layout (full-height dark page, side padding, card box) must not leak onto paper:
             it left blank space at the bottom, could add an empty last page and narrowed the table. */
          .report-page { min-height: 0 !important; padding-bottom: 0 !important; background: #fff !important; color: #000 !important; }
          .report-inner { max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .print-safe { border: none !important; border-radius: 0 !important; padding: 0 !important; margin: 0 !important; }
          .print-safe table { font-size: 11px !important; }
          .print-safe th, .print-safe td { padding: 4px 6px !important; }
          .report-footer ol { padding-left: 16px !important; }
        }
      `}</style>
      <div className="report-inner" style={S.inner}>
        <div className="no-print" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Reports · నివేదికలు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Hospital Reports</h1>
        </div>

        {error && (
          <div className="no-print" style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Report catalog */}
        <div className="no-print" style={{ marginBottom: 20 }}>
          {visibleReports.map((report) => {
            const locked    = !canAccess(userTier, report.tier);
            const isRunning = running === report.id;
            return (
              <div key={report.id}
                onClick={() => !locked && !running && runReport(report)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#161618', border: `1px solid ${result?.report.id === report.id ? 'rgba(90,154,223,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, marginBottom: 8, cursor: locked || running ? 'not-allowed' : 'pointer', opacity: locked ? 0.4 : 1 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 20 }}>{report.icon}</span>
                  <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{report.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {locked && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(90,154,223,0.12)', color: '#5A9ADF' }}>
                      🔒 {report.tier}
                    </span>
                  )}
                  {isRunning && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Running...</span>}
                  {!locked && !isRunning && <span style={{ fontSize: 12, color: '#5A9ADF' }}>Run →</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Generic parameter panel — renders whatever controls the
            selected report declares via `params`. */}
        {showFilterPanel && (() => {
          const report = REPORT_CATALOG.find((r) => r.id === filterPanelFor);
          if (!report) return null;
          const p = report.params || [];
          return (
            <div className="no-print" style={{ ...S.card, border: '1px solid rgba(90,154,223,0.3)' }}>
              <p style={{ fontSize: 12, color: '#5A9ADF', fontWeight: 600, marginBottom: REPORT_HINTS[report.id] ? 6 : 14 }}>{report.name}</p>
              {REPORT_HINTS[report.id] && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, margin: '0 0 14px' }}>{REPORT_HINTS[report.id]}</p>
              )}

              {p.includes('doctor') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-param-doctor" style={S.label}>Doctor (optional)</label>
                  <select id="reports-param-doctor" name="reports-param-doctor" value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">All doctors</option>
                    {doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.users?.full_name}{d.designation ? ` — ${d.designation}` : ''}</option>)}
                  </select>
                </div>
              )}

              {p.includes('ward') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-param-ward" style={S.label}>Ward (optional)</label>
                  <select id="reports-param-ward" name="reports-param-ward" value={selectedWardId}
                    onChange={(e) => setSelectedWardId(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">All wards</option>
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.ward_type} ({w.total_beds} beds{w.ward_kind ? ` · ${KIND_LABEL[w.ward_kind] || w.ward_kind}` : ''}{w.is_ac === true ? ' · AC' : w.is_ac === false ? ' · Non-AC' : ''})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {p.includes('dateRange') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label htmlFor="reports-date-from" style={S.label}>From (optional)</label>
                    <input id="reports-date-from" name="reports-date-from" type="date" value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)} style={S.input} />
                  </div>
                  <div>
                    <label htmlFor="reports-date-to" style={S.label}>To (optional)</label>
                    <input id="reports-date-to" name="reports-date-to" type="date" value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)} style={S.input} />
                  </div>
                </div>
              )}

              {p.includes('financialYear') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-financial-year" style={S.label}>Financial year (optional)</label>
                  <select id="reports-financial-year" name="reports-financial-year" value={financialYearStart}
                    onChange={(e) => setFinancialYearStart(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">All years</option>
                    {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <option key={y} value={y}>FY {y}-{String(y + 1).slice(-2)} (Apr {y} – Mar {y + 1})</option>
                    ))}
                  </select>
                </div>
              )}

              {p.includes('calendarYear') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-calendar-year" style={S.label}>Year (optional)</label>
                  <select id="reports-calendar-year" name="reports-calendar-year" value={calendarYear}
                    onChange={(e) => setCalendarYear(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">All years</option>
                    {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <option key={y} value={y}>{y} (Jan – Dec {y})</option>
                    ))}
                  </select>
                </div>
              )}

              {p.includes('wardKind') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-ward-kind" style={S.label}>Ward type (optional)</label>
                  <select id="reports-ward-kind" name="reports-ward-kind" value={wardKind}
                    onChange={(e) => setWardKind(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">All ward types</option>
                    {WARD_KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}
                  </select>
                </div>
              )}

              {p.includes('acType') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-ac-type" style={S.label}>Air-conditioning (optional)</label>
                  <select id="reports-ac-type" name="reports-ac-type" value={acType}
                    onChange={(e) => setAcType(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">AC and non-AC</option>
                    <option value="ac">AC only</option>
                    <option value="non_ac">Non-AC only</option>
                  </select>
                </div>
              )}

              {p.includes('depositStatus') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-deposit-status" style={S.label}>Deposit status (optional)</label>
                  <select id="reports-deposit-status" name="reports-deposit-status" value={depositStatus}
                    onChange={(e) => setDepositStatus(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">All deposits</option>
                    <option value="held">Money still held</option>
                    <option value="discharged_held">Discharged, money still held (refund or adjust)</option>
                    <option value="settled">Nothing held</option>
                  </select>
                </div>
              )}

              {p.includes('claimStatus') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-claim-status" style={S.label}>Claim status (optional)</label>
                  <select id="reports-claim-status" name="reports-claim-status" value={claimStatus}
                    onChange={(e) => setClaimStatus(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">Pending and received</option>
                    <option value="pending">Pending only (still to receive)</option>
                    <option value="received">Received only</option>
                  </select>
                </div>
              )}

              {p.includes('claimScheme') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-claim-scheme" style={S.label}>Scheme (optional)</label>
                  <select id="reports-claim-scheme" name="reports-claim-scheme" value={claimScheme}
                    onChange={(e) => setClaimScheme(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">All schemes</option>
                    {Object.entries(CLAIM_SCHEME_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
              )}

              {p.includes('paymentMode') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-payment-mode" style={S.label}>Payment mode (optional)</label>
                  <select id="reports-payment-mode" name="reports-payment-mode" value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">All modes</option>
                    {CASH_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowFilterPanel(false)}
                  style={{ flex: 1, padding: 10, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={() => runReport(report, collectParams(report))}
                  style={{ flex: 2, padding: 10, border: 'none', borderRadius: 8, background: '#5A9ADF', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                  Run report →
                </button>
              </div>
            </div>
          );
        })()}

        {/* Report result */}
        {result && (
          <>
          <PrintHeader documentTitle={result.report.name} />
          {(result.columns?.length || 0) > 10 && (
            <style>{`@media print { @page { size: A4 landscape; margin: 12mm 14mm; } }`}</style>
          )}
          <div className={`print-safe${(result.columns?.length || 0) > 10 ? ' print-wide-report' : ''}`} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p className="no-print" style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{result.report.name}</p>
                {result.filterLabel && (
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#5A9ADF', fontWeight: 600 }}>
                    {result.filterLabel}
                  </p>
                )}
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {result.data.filter(isRecordRow).length} records<span className="no-print"> · Generated {result.generatedAt}</span>
                </p>
              </div>
              <div className="no-print" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {result.data.length > 0 && (
                    <button onClick={exportCsv}
                      style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                      📥 CSV
                    </button>
                  )}
                  <button onClick={() => window.print()}
                    style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#5A9ADF', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                    🖨️ Print
                  </button>
                </div>
                {(result.columns?.length || 0) > 10 && (
                  <p style={{ margin: 0, maxWidth: 200, textAlign: 'right', fontSize: 11, color: '#E8A020' }}>
                    ⚠️ Many columns — in the print window choose <strong>Landscape</strong>.
                  </p>
                )}
                <p style={{ margin: 0, maxWidth: 200, textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                  For page numbers, tick “Headers and footers” in the print window.
                </p>
              </div>
            </div>

            {result.data.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px 0' }}>
                No records found for this report.
              </p>
            ) : (
              <div className="report-table-wrap" ref={tableWrapRef} style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {result.columns.map((col) => (
                        <th key={col} style={{ padding: '8px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {result.report.id === 'daily_opd' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.patients?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patients?.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.doctors?.users?.full_name}{row.doctors?.designation ? ` (${row.doctors.designation})` : ''}</td>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{row.visit_date}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="daily_opd" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'lab_pending' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.patients?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patients?.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.test_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.created_at ? new Date(row.created_at).toLocaleDateString('en-IN') : '—'}</td>
                            <td style={{ padding: '8px 0', color: '#E8A020', fontWeight: 600 }}>{row.status}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="lab_pending" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'bed_occupancy' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{row.ward_type}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.kind_label}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.ac_label}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.total_beds}</td>
                            <td style={{ padding: '8px 8px', color: row.pct !== null && row.pct >= 85 ? '#E05A5A' : 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.occupied}</td>
                            <td style={{ padding: '8px 8px', color: row.held > 0 ? '#E8A020' : 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.held}</td>
                            <td style={{ padding: '8px 8px', color: '#6AAA90', fontWeight: row.isTotal ? 700 : 600 }}>{row.available}</td>
                            <td style={{ padding: '8px 0', color: row.pct !== null && row.pct >= 85 ? '#E05A5A' : 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.pct === null ? '—' : `${row.pct}%`}</td>
                            <td style={{ padding: '8px 8px' }}>{row.isTotal ? null : <ReportRemark reportId="bed_occupancy" rowKey={row.id} />}</td>
                          </>
                        )}
                        {result.report.id === 'ipd_deposits' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{row.isTotal ? '' : i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{row.patient}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.ward}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.admission_date}</td>
                            <td style={{ padding: '8px 8px', color: row.isTotal ? 'rgba(255,255,255,0.4)' : (row.discharge_date ? '#6AAA90' : '#E8A020') }}>{row.isTotal ? '' : (row.discharge_date || 'Still admitted')}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{rupee(row.paid)}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{rupee(row.refunded)}</td>
                            <td style={{ padding: '8px 8px', color: '#9A8AE0', fontWeight: row.isTotal ? 700 : 400 }}>{rupee(row.applied)}</td>
                            <td style={{ padding: '8px 0', color: row.in_hand > 0 ? '#E8A020' : '#6AAA90', fontWeight: row.isTotal ? 700 : 600 }}>{rupee(row.in_hand)}</td>
                            <td style={{ padding: '8px 8px' }}>{row.isTotal ? null : <ReportRemark reportId="ipd_deposits" rowKey={row.id} />}</td>
                          </>
                        )}
                        {result.report.id === 'claims' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{row.isTotal ? '' : i + 1}</td>
                            <td style={{ padding: '8px 8px', color: row.pendingRow ? '#E8A020' : '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{row.invoice_no}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.patient}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.invoice_date}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.paid_via}</td>
                            <td style={{ padding: '8px 8px', color: '#9A8AE0', fontWeight: row.isTotal ? 700 : 600 }}>{rupee(row.amount)}</td>
                            <td style={{ padding: '8px 8px', color: row.status === 'received' ? '#6AAA90' : '#E8A020', fontWeight: 600 }}>{row.isTotal ? '' : (row.status === 'received' ? 'Received' : 'Pending')}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.received_on}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.reference}</td>
                            <td style={{ padding: '8px 0', color: row.days > 30 ? '#E05A5A' : 'rgba(255,255,255,0.4)', fontWeight: row.days > 30 ? 600 : 400 }}>{row.days === null || row.days === undefined ? '' : row.days}</td>
                            <td style={{ padding: '8px 8px' }}>{row.isTotal ? null : <ReportRemark reportId="claims" rowKey={row.id} />}</td>
                          </>
                        )}
                        {result.report.id === 'cancelled_bills' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{row.isTotal ? '' : i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{row.invoice_no}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.patient}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.invoice_date}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.cancelled_on}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.by}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.reason}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 600 }}>{rupee(row.amount)}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: row.isTotal ? 700 : 400 }}>{row.deposit_returned > 0 || row.isTotal ? rupee(row.deposit_returned) : '—'}</td>
                            <td style={{ padding: '8px 8px' }}>{row.isTotal ? null : <ReportRemark reportId="cancelled_bills" rowKey={row.id} />}</td>
                          </>
                        )}
                        {result.report.id === 'revenue_by_service' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{row.isTotal || row.isDiscount || row.id === '__plain__' ? '' : i + 1}</td>
                            <td style={{ padding: '8px 8px', color: row.isDiscount ? '#E05A5A' : '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{row.service}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.qty === null ? '—' : row.qty}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.base === null ? '—' : rupee(row.base)}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.gst === null ? '—' : rupee(row.gst)}</td>
                            <td style={{ padding: '8px 8px', color: row.isDiscount ? '#E05A5A' : '#fff', fontWeight: row.isTotal ? 700 : 600 }}>{row.total < 0 ? `−${rupee(-row.total)}` : rupee(row.total)}</td>
                            <td style={{ padding: '8px 0', color: '#9A8AE0', fontWeight: row.isTotal ? 700 : 400 }}>{row.covered === null ? '—' : rupee(row.covered)}</td>
                            <td style={{ padding: '8px 8px' }}>{row.isTotal || row.isDiscount || row.id === '__plain__' ? null : <ReportRemark reportId="revenue_by_service" rowKey={row.id} />}</td>
                          </>
                        )}
                        {result.report.id === 'collections' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{row.isTotal || row.isNote ? '' : i + 1}</td>
                            <td style={{ padding: '8px 8px', color: row.isNote ? 'rgba(255,255,255,0.45)' : '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{row.mode}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.bills}</td>
                            <td style={{ padding: '8px 8px', color: row.isNote ? 'rgba(255,255,255,0.45)' : '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{rupee(row.billsAmt)}</td>
                            <td style={{ padding: '8px 8px', color: '#5A9ADF', fontWeight: row.isTotal ? 700 : 400 }}>{row.isNote ? '—' : rupee(row.taken)}</td>
                            <td style={{ padding: '8px 8px', color: '#E05A5A', fontWeight: row.isTotal ? 700 : 400 }}>{row.isNote ? '—' : rupee(row.refunded)}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: row.isTotal ? 700 : 600 }}>{row.isNote ? '—' : rupee(row.net)}</td>
                            <td style={{ padding: '8px 8px' }}>{row.isTotal || row.isNote ? null : <ReportRemark reportId="collections" rowKey={row.id} />}</td>
                          </>
                        )}
                        {result.report.id === 'opd_appointment_engagement' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.doctor}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{new Date(row.date).toLocaleDateString('en-IN')}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.total}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.booked}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 600 }}>{row.completed}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="opd_appointment_engagement" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'avg_length_of_stay' && (
                          <>
                            {/* No S.No — a 3-row summary of metrics, not a
                                list, same convention as School's own
                                avg-length-of-stay-shaped reports. */}
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.metric}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.value}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="avg_length_of_stay" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'most_prescribed_medicines' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.medicine}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="most_prescribed_medicines" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'monthly_revenue_trend' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{row.isTotal ? '' : i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{row.month}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 600 }}>₹{row.billed.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 8px', color: '#9A8AE0', fontWeight: row.isTotal ? 700 : 400 }}>₹{row.covered.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: row.isTotal ? 700 : 600 }}>₹{row.paid.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}>{row.isTotal ? null : <ReportRemark reportId="monthly_revenue_trend" rowKey={row.id} />}</td>
                          </>
                        )}
                        {result.report.id === 'gender_distribution' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.gender}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="gender_distribution" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'abha_consent_status' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.patients?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patients?.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.consent_type}</td>
                            <td style={{ padding: '8px 0', color: row.otp_verified ? '#6AAA90' : '#E8A020', fontWeight: 600 }}>{row.otp_verified ? '✓ Verified' : 'Pending'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="abha_consent_status" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'revenue_by_mode' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{row.isTotal ? '' : i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{row.mode}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 600 }}>₹{row.billed.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 8px', color: '#9A8AE0', fontWeight: row.isTotal ? 700 : 400 }}>₹{row.covered.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: row.isTotal ? 700 : 600 }}>₹{row.paid.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}>{row.isTotal ? null : <ReportRemark reportId="revenue_by_mode" rowKey={row.mode} />}</td>
                          </>
                        )}
                        {result.report.id === 'abha_linked' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patient_uid}</td>
                            <td style={{ padding: '8px 0', color: row.abha_linked ? '#6AAA90' : 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{row.abha_linked ? '✓ Linked' : 'Not linked'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="abha_linked" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'new_registrations' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.phone}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90' }}>{new Date(row.created_at).toLocaleDateString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="new_registrations" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'doctor_wise_opd' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.doctor_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.designation}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="doctor_wise_opd" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'ipd_admission_history' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.patients?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patients?.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.ward_path}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.admission_date}</td>
                            <td style={{ padding: '8px 0', color: row.discharge_date ? '#6AAA90' : '#E8A020', fontWeight: 600 }}>{row.discharge_date || 'Still admitted'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="ipd_admission_history" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'lab_tests_completed' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.patients?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patients?.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.test_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.result_ready_at ? new Date(row.result_ready_at).toLocaleDateString('en-IN') : '—'}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 600 }}>{row.status}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="lab_tests_completed" rowKey={row.id} /></td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <ReportFooter
              notes={REPORT_NOTES[result.report.id] || []}
              recordCount={result.data.filter(isRecordRow).length}
              generatedAt={result.generatedAt}
              signatures={SIGNATURE_REPORTS.includes(result.report.id)}
            />
          </div>
          </>
        )}
      </div>
      <HospitalNav />
      <BugReporter screenName="hospital_reports" />
    </div>
  );
}
