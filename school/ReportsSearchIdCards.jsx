// school/ReportsSearchIdCards.jsx — FINAL (Supabase wired)
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import PrintHeader from '../shared/PrintHeader';
import ReportRemark from '../shared/ReportRemark';
import BugReporter from '../shared/BugReporter';
import { canAccess } from '../shared/tierAccess';

// Verified against StudentAdmission.jsx's own real constants
const FILTER_CASTE_CATEGORIES = ['OC', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'SC', 'ST', 'EWS', 'Other'];
const FILTER_GENDERS = ['Male', 'Female', 'Other'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
};

// ─────────────────────────────────────────────────────────────
// REPORT ENGINE
// ─────────────────────────────────────────────────────────────
const REPORT_CATALOG = [
  { id: 'daily_attendance',    name: 'Daily attendance — class-wise',            tier: 'basic',      icon: '✅' },
  { id: 'low_attendance',      name: 'Below 75% attendance list',                tier: 'basic',      icon: '⚠️' },
  { id: 'fee_defaulters',      name: 'Fee defaulters list',                      tier: 'basic',      icon: '💰' },
  { id: 'class_rank',          name: 'Class rank list (latest exam)',             tier: 'basic',      icon: '🏆' },
  { id: 'class_strength',      name: 'Class-wise strength',                      tier: 'basic',      icon: '🏫' },
  { id: 'gender_distribution', name: 'Gender distribution',                      tier: 'basic',      icon: '👥' },
  { id: 'new_admissions',      name: 'New admissions (date range)',              tier: 'basic',      icon: '🆕' },
  { id: 'tc_issued',           name: 'Transfer certificates issued',             tier: 'basic',      icon: '📜' },
  { id: 'certificates_issued', name: 'Certificates issued',                      tier: 'basic',      icon: '📄' },
  { id: 'transport_enrollment',name: 'Transport enrollment by route',            tier: 'standard',   icon: '🚌' },
  { id: 'activities_participation', name: 'Activities & coaching participation', tier: 'standard',   icon: '🎭' },
  { id: 'hostel_outings_current', name: 'Hostel — students currently out',       tier: 'standard',   icon: '🏠' },
  { id: 'welfare_eligible',    name: 'Welfare scheme eligible students',          tier: 'standard',   icon: '🌿' },
  { id: 'admissions_village_category_class', name: 'Admissions by village, category & class', tier: 'standard', icon: '📍' },
  { id: 'monthly_fee_collection', name: 'Monthly fee collection trend',        tier: 'standard', icon: '📈' },
  { id: 'pending_corrections',    name: 'Pending correction requests',          tier: 'standard', icon: '📝' },
  { id: 'homework_compliance',    name: 'Homework posting compliance',          tier: 'standard', icon: '📔' },
  { id: 'ptm_engagement',         name: 'PTM booking engagement',               tier: 'standard', icon: '🗓️' },
  { id: 'caste_gender_filter', name: 'Multi-filter — caste + village + gender',  tier: 'advanced',   icon: '🔍' },
  { id: 'udise_format',        name: 'UDISE+ format export',                     tier: 'specialised', icon: '📋' },
];

async function runReportQuery(reportId, appId, extraFilters) {
  const today = new Date().toISOString().slice(0, 10);

  switch (reportId) {
    case 'daily_attendance': {
      const { data: appStudents } = await supabase
        .from('students').select('id').eq('app_id', appId).eq('status', 'active');
      const ids = (appStudents || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: ['Name', 'SID', 'Class', 'Status', 'Remarks'] };
      const { data } = await supabase
        .from('attendance')
        .select('student_id, status, students(full_name, sid, section, classes(class_name))')
        .eq('date', today)
        .in('student_id', ids);
      return { data: data || [], columns: ['Name', 'SID', 'Class', 'Status', 'Remarks'] };
    }
    case 'low_attendance': {
      const { data: students } = await supabase
        .from('students').select('id, full_name, sid, classes(class_name)')
        .eq('app_id', appId).eq('status', 'active');

      const yearStart = `${new Date().getFullYear()}-06-01`;
      const results = [];
      for (const s of (students || []).slice(0, 100)) {
        const { count: total }   = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', s.id).gte('date', yearStart);
        const { count: present } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', s.id).eq('status', 'P').gte('date', yearStart);
        const pct = total > 0 ? Math.round(((present || 0) / total) * 100) : 0;
        if (pct < 75 && total > 10) results.push({ ...s, pct, class: s.classes?.class_name });
      }
      return { data: results, columns: ['Name', 'SID', 'Class', 'Attendance %', 'Remarks'] };
    }
    case 'fee_defaulters': {
      const { data: appStudents } = await supabase
        .from('students').select('id').eq('app_id', appId);
      const ids = (appStudents || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: ['Name', 'SID', 'Class', 'Fee type', 'Balance', 'Due date', 'Remarks'] };
      const { data } = await supabase
        .from('fee_dues')
        .select('id, amount_due, amount_paid, fee_type, due_date, students(full_name, sid, parent_phone, classes(class_name))')
        .lt('due_date', today)
        .in('student_id', ids);
      const filtered = (data || []).filter((d) => Number(d.amount_due) > Number(d.amount_paid));
      return { data: filtered, columns: ['Name', 'SID', 'Class', 'Fee type', 'Balance', 'Due date', 'Remarks'] };
    }
    case 'class_rank': {
      const { data: appStudents } = await supabase
        .from('students').select('id').eq('app_id', appId).eq('status', 'active');
      const ids = (appStudents || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: ['Rank', 'Name', 'SID', 'Class', 'Percentage', 'Remarks'] };
      const { data } = await supabase
        .from('marks')
        .select('student_id, percentage, students(full_name, sid, class_id, classes(class_name, class_order))')
        .in('student_id', ids);

      // Genuinely rank WITHIN each class — the previous version sorted
      // everyone school-wide and capped at 100, which silently dropped
      // entire lower classes from the list whenever other classes'
      // students dominated that top-100 cutoff, and the row number
      // shown was a meaningless global position rather than an actual
      // rank within the student's own class.
      const byClass = {};
      for (const row of data || []) {
        const classId = row.students?.class_id || 'unknown';
        if (!byClass[classId]) byClass[classId] = [];
        byClass[classId].push(row);
      }
      const grouped = Object.values(byClass)
        .sort((a, b) => (a[0]?.students?.classes?.class_order ?? 0) - (b[0]?.students?.classes?.class_order ?? 0))
        .flatMap((rows) =>
          rows
            .sort((a, b) => Number(b.percentage) - Number(a.percentage))
            .map((row, i) => ({ ...row, class_rank: i + 1 }))
        );

      return { data: grouped, columns: ['Rank', 'Name', 'SID', 'Class', 'Percentage', 'Remarks'] };
    }
    case 'class_strength': {
      const { data: classRows } = await supabase.from('classes').select('id, class_name, class_order').eq('app_id', appId).order('class_order');
      const { data: studentRows } = await supabase.from('students').select('id, class_id, section').eq('app_id', appId).eq('status', 'active');
      const grouped = {};
      (studentRows || []).forEach((s) => {
        const key = `${s.class_id}|${s.section || '—'}`;
        grouped[key] = (grouped[key] || 0) + 1;
      });
      const rows = Object.entries(grouped).map(([key, count]) => {
        const [classId, section] = key.split('|');
        const cls = (classRows || []).find((c) => c.id === classId);
        return { id: key, class_name: cls?.class_name || 'Unknown', class_order: cls?.class_order ?? 999, section, count };
      }).sort((a, b) => a.class_order - b.class_order || a.section.localeCompare(b.section));
      return { data: rows, columns: ['Class', 'Section', 'Students', 'Remarks'] };
    }
    case 'gender_distribution': {
      const { data } = await supabase.from('students').select('id, gender').eq('app_id', appId).eq('status', 'active');
      const counts = {};
      (data || []).forEach((s) => { const g = s.gender || 'Unspecified'; counts[g] = (counts[g] || 0) + 1; });
      const rows = Object.entries(counts).map(([gender, count]) => ({ id: gender, gender, count }));
      return { data: rows, columns: ['Gender', 'Count', 'Remarks'] };
    }
    case 'new_admissions': {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90); // last 90 days by default
      const { data } = await supabase
        .from('students')
        .select('id, full_name, sid, admission_date, admission_no, classes(class_name)')
        .eq('app_id', appId)
        .gte('admission_date', cutoff.toISOString().slice(0, 10))
        .order('admission_date', { ascending: false });
      return { data: data || [], columns: ['Name', 'SID', 'Admission no', 'Class', 'Admission date', 'Remarks'] };
    }
    case 'tc_issued': {
      const { data: appStudents } = await supabase.from('students').select('id').eq('app_id', appId);
      const ids = (appStudents || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: ['Name', 'TC no', 'Reason', 'Date of leaving', 'Remarks'] };
      const { data } = await supabase
        .from('transfer_certificates')
        .select('id, tc_no, reason_leaving, date_of_leaving, students(full_name, sid)')
        .in('student_id', ids)
        .order('date_of_leaving', { ascending: false });
      return { data: data || [], columns: ['Name', 'TC no', 'Reason', 'Date of leaving', 'Remarks'] };
    }
    case 'certificates_issued': {
      const { data: appStudents } = await supabase.from('students').select('id').eq('app_id', appId);
      const ids = (appStudents || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: ['Name', 'Certificate type', 'Cert no', 'Issued', 'Remarks'] };
      const { data } = await supabase
        .from('certificates')
        .select('id, cert_type, cert_no, issued_at, students(full_name, sid)')
        .in('student_id', ids)
        .order('issued_at', { ascending: false });
      return { data: data || [], columns: ['Name', 'Certificate type', 'Cert no', 'Issued', 'Remarks'] };
    }
    case 'transport_enrollment': {
      const { data: routes } = await supabase.from('transport_routes').select('id, route_no, driver_name, vehicle_no').eq('app_id', appId);
      const routeIds = (routes || []).map((r) => r.id);
      const { data: enrollments } = routeIds.length
        ? await supabase.from('transport_students').select('route_id').in('route_id', routeIds)
        : { data: [] };
      const counts = {};
      (enrollments || []).forEach((e) => { counts[e.route_id] = (counts[e.route_id] || 0) + 1; });
      const rows = (routes || []).map((r) => ({ id: r.id, route_no: r.route_no, driver_name: r.driver_name, vehicle_no: r.vehicle_no, count: counts[r.id] || 0 }));
      return { data: rows, columns: ['Route no', 'Driver', 'Vehicle', 'Students enrolled', 'Remarks'] };
    }
    case 'activities_participation': {
      const { data: activities } = await supabase.from('activities').select('id, activity_name, activity_type, activity_date').eq('app_id', appId);
      const activityIds = (activities || []).map((a) => a.id);
      const { data: participants } = activityIds.length
        ? await supabase.from('activity_participants').select('activity_id').in('activity_id', activityIds)
        : { data: [] };
      const counts = {};
      (participants || []).forEach((p) => { counts[p.activity_id] = (counts[p.activity_id] || 0) + 1; });
      const rows = (activities || []).map((a) => ({ id: a.id, activity_name: a.activity_name, activity_type: a.activity_type, activity_date: a.activity_date, count: counts[a.id] || 0 }));
      return { data: rows, columns: ['Activity', 'Type', 'Date', 'Participants', 'Remarks'] };
    }
    case 'hostel_outings_current': {
      const { data: appStudents } = await supabase.from('students').select('id').eq('app_id', appId);
      const ids = (appStudents || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: ['Name', 'SID', 'Reason', 'Out since', 'Expected return', 'Remarks'] };
      const { data } = await supabase
        .from('hostel_outings')
        .select('id, reason, out_date, out_time, return_expected, students(full_name, sid)')
        .in('student_id', ids)
        .eq('status', 'out')
        .order('out_date', { ascending: false });
      return { data: data || [], columns: ['Name', 'SID', 'Reason', 'Out since', 'Expected return', 'Remarks'] };
    }
    case 'welfare_eligible': {
      const { data } = await supabase
        .from('students')
        .select('id, full_name, sid, caste_category, classes(class_name)')
        .eq('app_id', appId)
        .eq('status', 'active')
        .in('caste_category', ['SC', 'ST', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'EWS']);
      return { data: data || [], columns: ['Name', 'SID', 'Class', 'Category', 'Remarks'] };
    }
    case 'admissions_village_category_class': {
      const startYear = extraFilters?.academicYearStart;
      if (!startYear) return { data: [], columns: [] };
      const rangeStart = `${startYear}-06-01`;
      const rangeEnd = `${Number(startYear) + 1}-05-31`;

      const { data } = await supabase
        .from('students')
        .select('caste_category, village_id, class_id, villages(name), classes(class_name)')
        .eq('app_id', appId)
        .gte('admission_date', rangeStart)
        .lte('admission_date', rangeEnd);

      const grouped = {};
      (data || []).forEach((s) => {
        const village = s.villages?.name || 'Not recorded';
        const category = s.caste_category || 'Not recorded';
        const className = s.classes?.class_name || 'Not recorded';
        const key = `${village}|${category}|${className}`;
        grouped[key] = (grouped[key] || 0) + 1;
      });

      const rows = Object.entries(grouped).map(([key, count]) => {
        const [village, category, className] = key.split('|');
        return { id: key, village, category, className, count };
      }).sort((a, b) => a.village.localeCompare(b.village) || a.category.localeCompare(b.category) || a.className.localeCompare(b.className));

      return { data: rows, columns: ['Village', 'Category', 'Class', 'Count', 'Remarks'] };
    }
    case 'monthly_fee_collection': {
      const { data: appStudents } = await supabase.from('students').select('id').eq('app_id', appId);
      const dueIds = (appStudents || []).length
        ? (await supabase.from('fee_dues').select('id').in('student_id', (appStudents || []).map((s) => s.id))).data || []
        : [];
      const dueIdList = dueIds.map((d) => d.id);
      if (dueIdList.length === 0) return { data: [], columns: ['Month', 'Total collected', 'Remarks'] };
      const { data } = await supabase.from('fee_payments').select('amount, paid_at').in('due_id', dueIdList);
      const byMonth = {};
      (data || []).forEach((p) => {
        const month = new Date(p.paid_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        byMonth[month] = (byMonth[month] || 0) + Number(p.amount || 0);
      });
      const rows = Object.entries(byMonth).map(([month, total]) => ({ id: month, month, total }))
        .sort((a, b) => new Date(a.month) - new Date(b.month));
      return { data: rows, columns: ['Month', 'Total collected', 'Remarks'] };
    }
    case 'pending_corrections': {
      const { data } = await supabase
        .from('correction_requests')
        .select('id, module, record_label, request_type, field_name, created_at')
        .eq('app_id', appId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      return { data: data || [], columns: ['Module', 'Record', 'Type', 'Field', 'Requested', 'Remarks'] };
    }
    case 'homework_compliance': {
      const { data: classRows } = await supabase.from('classes').select('id, class_name').eq('app_id', appId).order('class_order');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const { data: recent } = await supabase
        .from('homework_entries').select('class_id, section')
        .eq('app_id', appId).gte('homework_date', cutoff.toISOString().slice(0, 10));
      const postedSet = new Set((recent || []).map((h) => `${h.class_id}|${h.section}`));
      const { data: studentSections } = await supabase.from('students').select('class_id, section').eq('app_id', appId).eq('status', 'active');
      const realSections = new Set((studentSections || []).map((s) => `${s.class_id}|${s.section}`));
      const rows = [...realSections].map((key) => {
        const [classId, section] = key.split('|');
        const cls = (classRows || []).find((c) => c.id === classId);
        return { id: key, class_name: cls?.class_name || 'Unknown', section, posted: postedSet.has(key) };
      }).sort((a, b) => a.class_name.localeCompare(b.class_name) || a.section.localeCompare(b.section));
      return { data: rows, columns: ['Class', 'Section', 'Homework posted (last 7 days)', 'Remarks'] };
    }
    case 'ptm_engagement': {
      const { data: sessions } = await supabase.from('ptm_sessions').select('id, title, session_date').eq('app_id', appId).order('session_date', { ascending: false });
      const sessionIds = (sessions || []).map((s) => s.id);
      const { data: slots } = sessionIds.length
        ? await supabase.from('ptm_slots').select('session_id, status').in('session_id', sessionIds)
        : { data: [] };
      const rows = (sessions || []).map((s) => {
        const sessionSlots = (slots || []).filter((sl) => sl.session_id === s.id);
        const booked = sessionSlots.filter((sl) => sl.status === 'booked').length;
        return { id: s.id, title: s.title, session_date: s.session_date, total: sessionSlots.length, booked };
      });
      return { data: rows, columns: ['Session', 'Date', 'Total slots', 'Booked', 'Remarks'] };
    }
    case 'caste_gender_filter': {
      const filters = extraFilters || {};
      let query = supabase
        .from('students')
        .select('id, full_name, sid, caste_category, gender, village_id, villages(name), classes(class_name)')
        .eq('app_id', appId)
        .eq('status', 'active');
      if (filters.caste_category) query = query.eq('caste_category', filters.caste_category);
      if (filters.gender) query = query.eq('gender', filters.gender);
      if (filters.village_id) query = query.eq('village_id', filters.village_id);
      const { data } = await query;
      return { data: data || [], columns: ['Name', 'SID', 'Class', 'Category', 'Gender', 'Village', 'Remarks'] };
    }
    default:
      return { data: [], columns: [] };
  }
}

export function ReportEngine({ userTier = 'basic' }) {
  const { tenant } = useTenant();
  const [running, setRunning]   = useState(null);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  // caste_gender_filter needs real inputs before it can run — every
  // other report runs immediately with zero params, so this is a
  // deliberate one-off case rather than a redesign of the whole
  // interaction model.
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterPanelFor, setFilterPanelFor] = useState(null);
  const [casteFilter, setCasteFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [academicYearStart, setAcademicYearStart] = useState(String(new Date().getFullYear() - (new Date().getMonth() < 5 ? 1 : 0)));
  const [villageFilterQuery, setVillageFilterQuery] = useState('');
  const [villageFilterResults, setVillageFilterResults] = useState([]);
  const [villageFilterId, setVillageFilterId] = useState('');
  const [villageFilterDisplay, setVillageFilterDisplay] = useState('');

  async function searchVillageFilter(q) {
    setVillageFilterQuery(q);
    if (q.trim().length < 2) { setVillageFilterResults([]); return; }
    const { data } = await supabase.from('villages').select('id, name, mandals(name)').ilike('name', `%${q}%`).limit(8);
    setVillageFilterResults(data || []);
  }

  async function runReport(report, extraFilters) {
    if (!canAccess(userTier, report.tier)) {
      setError(`This report needs the "${report.tier}" plan or higher — your current plan doesn't include it.`);
      return;
    }
    if ((report.id === 'caste_gender_filter' || report.id === 'admissions_village_category_class') && !extraFilters) {
      setFilterPanelFor(report.id);
      setShowFilterPanel(true);
      return;
    }
    setShowFilterPanel(false);
    setRunning(report.id);
    setResult(null);
    setError('');
    try {
      const res = await runReportQuery(report.id, tenant.appId, extraFilters);
      setResult({ report, ...res, generatedAt: new Date().toLocaleString('en-IN') });

      // Log to report_history
      await supabase.from('report_history').insert({
        app_id:       tenant.appId,
        generated_by: tenant.userRowId,
        record_count: res.data?.length || 0,
        delivery_mode: 'digital_only',
        is_archived:   false,
      });
    } catch (err) {
      setError('Failed to generate report. Please try again.');
    } finally {
      setRunning(null);
    }
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        .report-table-wrap { max-height: 600px; overflow-y: auto; }
        @media print {
          .no-print { display: none !important; }
          .print-safe, .print-safe * { background: #fff !important; color: #000 !important; border-color: #ccc !important; }
          .report-table-wrap { max-height: none !important; overflow: visible !important; }
        }
      `}</style>
      <div style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}><span style={{ letterSpacing: '2px', textTransform: 'uppercase' }}>Reports</span> · నివేదికలు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Report Engine</h1>
        </div>

        {error && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Report catalog */}
        <div className="no-print" style={{ marginBottom: 20 }}>
          {REPORT_CATALOG.map((report) => {
            const locked    = !canAccess(userTier, report.tier);
            const isRunning = running === report.id;
            return (
              <div key={report.id}
                onClick={() => {
                  if (locked || running) return;
                  if (report.id === 'udise_format') {
                    setError('UDISE+ format export isn\'t built yet — it needs the exact government field mapping confirmed first, rather than guessing at a compliance format.');
                    return;
                  }
                  runReport(report);
                }}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#161618', border: `1px solid ${result?.report.id === report.id ? 'rgba(232,160,32,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, marginBottom: 8, cursor: locked || running ? 'not-allowed' : 'pointer', opacity: locked ? 0.4 : 1 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 20 }}>{report.icon}</span>
                  <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{report.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {locked && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(232,160,32,0.12)', color: '#E8A020' }}>
                      🔒 {report.tier}
                    </span>
                  )}
                  {isRunning && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Running...</span>
                  )}
                  {!locked && !isRunning && (
                    <span style={{ fontSize: 12, color: '#E8A020' }}>Run →</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Filter panel — shown before running whichever report needs
            real inputs first, unlike every other report here which
            runs immediately */}
        {showFilterPanel && filterPanelFor === 'caste_gender_filter' && (
          <div className="no-print" style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
            <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>Multi-filter — caste + village + gender</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={S.label}>Caste category</label>
                <select value={casteFilter} onChange={(e) => setCasteFilter(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                  <option value="">All categories</option>
                  {FILTER_CASTE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Gender</label>
                <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                  <option value="">All genders</option>
                  {FILTER_GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Village (optional)</label>
              {villageFilterDisplay ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8 }}>
                  <span style={{ fontSize: 13, color: '#fff' }}>{villageFilterDisplay}</span>
                  <button onClick={() => { setVillageFilterId(''); setVillageFilterDisplay(''); }}
                    style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.5)', padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>
                    Clear
                  </button>
                </div>
              ) : (
                <>
                  <input value={villageFilterQuery} onChange={(e) => searchVillageFilter(e.target.value)} placeholder="Search village name..." style={S.input} />
                  {villageFilterResults.map((v) => (
                    <div key={v.id} onClick={() => { setVillageFilterId(v.id); setVillageFilterDisplay(`${v.name}${v.mandals?.name ? ` (${v.mandals.name})` : ''}`); setVillageFilterQuery(''); setVillageFilterResults([]); }}
                      style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {v.name}{v.mandals?.name ? <span style={{ color: 'rgba(255,255,255,0.4)' }}> · {v.mandals.name}</span> : ''}
                    </div>
                  ))}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowFilterPanel(false)}
                style={{ flex: 1, padding: 10, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={() => runReport(REPORT_CATALOG.find((r) => r.id === 'caste_gender_filter'), { caste_category: casteFilter, gender: genderFilter, village_id: villageFilterId })}
                style={{ flex: 2, padding: 10, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                Run filtered report →
              </button>
            </div>
          </div>
        )}

        {showFilterPanel && filterPanelFor === 'admissions_village_category_class' && (
          <div className="no-print" style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
            <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 4 }}>Admissions by village, category & class</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
              Academic year treated as an admission-date range — June through the following May.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Academic year starting</label>
              <select value={academicYearStart} onChange={(e) => setAcademicYearStart(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>{y}-{String(y + 1).slice(-2)} (June {y} – May {y + 1})</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowFilterPanel(false)}
                style={{ flex: 1, padding: 10, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={() => runReport(REPORT_CATALOG.find((r) => r.id === 'admissions_village_category_class'), { academicYearStart })}
                style={{ flex: 2, padding: 10, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                Run report →
              </button>
            </div>
          </div>
        )}

        {/* Report result */}
        {result && (
          <>
          <PrintHeader documentTitle={result.report.name} />
          <div className="print-safe" style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{result.report.name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {result.data.length} records · Generated {result.generatedAt}
                </p>
              </div>
              <div className="no-print" style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => window.print()}
                  style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                  🖨️ Print
                </button>
              </div>
            </div>

            {result.data.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px 0' }}>
                No records found for this report.
              </p>
            ) : (
              <div className="report-table-wrap" style={{ overflowX: 'auto' }}>
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
                        {result.report.id === 'daily_attendance' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.students?.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.students?.classes?.class_name}</td>
                            <td style={{ padding: '8px 0', color: row.status === 'A' ? '#E05A5A' : '#6AAA90', fontWeight: 600 }}>{row.status === 'P' ? 'Present' : row.status === 'A' ? 'Absent' : row.status}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="daily_attendance" rowKey={row.student_id} /></td>
                          </>
                        )}
                        {result.report.id === 'low_attendance' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.class}</td>
                            <td style={{ padding: '8px 0', color: '#E05A5A', fontWeight: 600 }}>{row.pct}%</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="low_attendance" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'fee_defaulters' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.students?.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.students?.classes?.class_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.fee_type}</td>
                            <td style={{ padding: '8px 0', color: '#E05A5A', fontWeight: 600 }}>₹{(Number(row.amount_due) - Number(row.amount_paid)).toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.due_date}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="fee_defaulters" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'class_rank' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#E8A020', fontWeight: 700 }}>#{row.class_rank}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.students?.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.students?.classes?.class_name}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 600 }}>{row.percentage}%</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="class_rank" rowKey={row.student_id} /></td>
                          </>
                        )}
                        {result.report.id === 'class_strength' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.class_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.section}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="class_strength" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'gender_distribution' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.gender}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="gender_distribution" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'new_admissions' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.admission_no}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.classes?.class_name}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90' }}>{row.admission_date}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="new_admissions" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'tc_issued' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.tc_no}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.reason_leaving}</td>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{row.date_of_leaving}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="tc_issued" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'certificates_issued' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.cert_type}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.cert_no}</td>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{new Date(row.issued_at).toLocaleDateString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="certificates_issued" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'transport_enrollment' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.route_no}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.driver_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.vehicle_no}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="transport_enrollment" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'activities_participation' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.activity_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.activity_type}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.activity_date}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="activities_participation" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'hostel_outings_current' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.students?.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.reason}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.out_date} {row.out_time}</td>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{row.return_expected}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="hostel_outings_current" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'welfare_eligible' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.classes?.class_name}</td>
                            <td style={{ padding: '8px 0', color: '#E8A020' }}>{row.caste_category}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="welfare_eligible" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'monthly_fee_collection' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.month}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 600 }}>₹{row.total.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="monthly_fee_collection" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'pending_corrections' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.module}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.record_label}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.request_type}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.field_name || '—'}</td>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{new Date(row.created_at).toLocaleDateString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="pending_corrections" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'homework_compliance' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.class_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.section}</td>
                            <td style={{ padding: '8px 0', color: row.posted ? '#6AAA90' : '#E05A5A', fontWeight: 600 }}>{row.posted ? '✓ Posted' : '✗ Not posted'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="homework_compliance" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'ptm_engagement' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.title}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{new Date(row.session_date).toLocaleDateString('en-IN')}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.total}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.booked} ({row.total > 0 ? Math.round((row.booked / row.total) * 100) : 0}%)</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="ptm_engagement" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'caste_gender_filter' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.classes?.class_name}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.caste_category}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.gender}</td>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{row.villages?.name || '—'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="caste_gender_filter" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'admissions_village_category_class' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.village}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.category}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.className}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="admissions_village_category_class" rowKey={row.id} /></td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.data.length > 50 && (
                  <p className="no-print" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8, textAlign: 'center' }}>
                    {result.data.length} records — scroll to see more on screen, or print for the full list.
                  </p>
                )}
              </div>
            )}
          </div>
          </>
        )}
      </div>
      <SchoolNav />
      <BugReporter screenName="reports" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ID CARD PRINTER
// ─────────────────────────────────────────────────────────────
export function IdCardPrinter() {
  const { tenant } = useTenant();
  const [classes, setClasses]   = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (tenant?.appId) loadClasses();
  }, [tenant?.appId]);

  async function loadClasses() {
    const { data } = await supabase
      .from('classes')
      .select('id, class_name, class_order')
      .eq('app_id', tenant.appId)
      .order('class_order');
    setClasses(data || []);
    if (data?.length) setSelectedClass(data[0].id);
  }

  async function loadStudents(classId) {
    if (!classId) return;
    setLoading(true);
    setSelectedClass(classId);
    const { data } = await supabase
      .from('students')
      .select('id, full_name, sid, section, photo_url, blood_group, apaar_id, classes(class_name)')
      .eq('app_id', tenant.appId)
      .eq('class_id', classId)
      .eq('status', 'active')
      .order('full_name');
    setStudents(data || []);
    setLoading(false);
  }

  function printCards() {
    setPrinting(true);
    window.print();
    setTimeout(() => setPrinting(false), 2000);
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print {
          .no-print { display: none !important; }
          .id-card-grid { display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        }
      `}</style>
      <div style={S.inner}>
        <div className="no-print" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}><span style={{ letterSpacing: '2px', textTransform: 'uppercase' }}>ID Cards</span> · ID కార్డులు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>ID Card Printer</h1>
        </div>

        <div className="no-print" style={{ ...S.card, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Select class</label>
            <select value={selectedClass}
              onChange={(e) => loadStudents(e.target.value)}
              style={{ ...S.input, cursor: 'pointer' }}>
              <option value="">-- Select class --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
            </select>
          </div>
          <button onClick={printCards}
            disabled={students.length === 0 || printing}
            style={{ padding: '10px 20px', background: students.length === 0 ? 'rgba(255,255,255,0.08)' : '#E8A020', color: students.length === 0 ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, cursor: students.length === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {printing ? 'Printing...' : `🖨️ Print ${students.length} cards`}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading students...</p>
        ) : students.length > 0 ? (
          <div className="id-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {students.map((s) => (
              <div key={s.id} style={{ background: '#fff', borderRadius: 10, padding: 14, textAlign: 'center', border: '2px solid #185FA5', color: '#111' }}>
                <div style={{ width: 50, height: 50, borderRadius: '50%', background: '#E8A020', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#111' }}>
                  {s.full_name[0]}
                </div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#111' }}>{s.full_name}</p>
                <p style={{ margin: '2px 0', fontSize: 10, color: '#555' }}>{s.sid}</p>
                <p style={{ margin: '2px 0', fontSize: 10, color: '#555' }}>{s.classes?.class_name}{s.section ? ` — ${s.section}` : ''}</p>
                {s.blood_group && <p style={{ margin: '2px 0', fontSize: 10, color: '#185FA5', fontWeight: 600 }}>Blood: {s.blood_group}</p>}
                <p style={{ margin: '6px 0 0', fontSize: 9, color: '#888' }}>{tenant?.orgName}</p>
              </div>
            ))}
          </div>
        ) : selectedClass ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No students found in this class.</p>
          </div>
        ) : null}
      </div>
      <SchoolNav />
      <BugReporter screenName="id_cards" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UNIVERSAL SEARCH
// ─────────────────────────────────────────────────────────────
export function UniversalSearch() {
  const { tenant } = useTenant();
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab]         = useState('students');

  const search = useCallback(async (q) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);

    if (tab === 'students') {
      const { data } = await supabase
        .from('students')
        .select('id, full_name, sid, parent_phone, status, classes(class_name), section')
        .eq('app_id', tenant.appId)
        .or(`full_name.ilike.%${q}%,sid.ilike.%${q}%,parent_phone.ilike.%${q}%,admission_no.ilike.%${q}%`)
        .limit(15);
      setResults(data || []);
    } else if (tab === 'staff') {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, role, phone')
        .eq('app_id', tenant.appId)
        .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(15);
      setResults(data || []);
    }

    setSearching(false);
  }, [tab, tenant?.appId]);

  useEffect(() => {
    if (query.length >= 2) search(query);
    else setResults([]);
  }, [tab]);

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}><span style={{ letterSpacing: '2px', textTransform: 'uppercase' }}>Search</span> · వెతకండి</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Universal Search</h1>
        </div>

        {/* Search tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { k: 'students', l: 'Students' },
            { k: 'staff',    l: 'Staff' },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div style={{ marginBottom: 16 }}>
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder={tab === 'students' ? 'Search by name, SID or parent phone...' : 'Search staff by name or phone...'}
            style={S.input}
            autoFocus
          />
          {searching && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>Searching...</p>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div>
            {tab === 'students' && results.map((s) => (
              <div key={s.id} style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.full_name}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      {s.sid}
                      {s.classes?.class_name ? ` · ${s.classes.class_name}` : ''}
                      {s.section ? `-${s.section}` : ''}
                      {s.parent_phone ? ` · ${s.parent_phone}` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: s.status === 'active' ? 'rgba(106,170,144,0.12)' : 'rgba(224,90,90,0.12)', color: s.status === 'active' ? '#6AAA90' : '#E05A5A', fontWeight: 500 }}>
                    {s.status}
                  </span>
                </div>
              </div>
            ))}
            {tab === 'staff' && results.map((s) => (
              <div key={s.id} style={S.card}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.full_name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {s.role}{s.phone ? ` · ${s.phone}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}

        {query.length >= 2 && !searching && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No results for "{query}"</p>
          </div>
        )}

        {query.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🔍</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
              Search students by name, SID or parent phone number
            </p>
          </div>
        )}
      </div>
      <SchoolNav />
      <BugReporter screenName="search" />
    </div>
  );
}