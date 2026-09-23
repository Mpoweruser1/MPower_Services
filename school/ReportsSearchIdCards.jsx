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
// Field groups for the Student Full Details register — lets someone
// print just "Personal" or "Academic" instead of always all 25
// columns. S.No and Full name are always included regardless of
// selection (a register with names hidden isn't useful) and aren't
// part of any group here.
const FIELD_GROUPS = {
  personal: {
    label: 'Personal',
    fields: [
      { header: 'SID', key: 'sid' },
      { header: 'Full name (Telugu)', key: 'full_name_telugu' },
      { header: 'DOB', key: 'dob' },
      { header: 'Gender', key: 'gender' },
      { header: 'Blood group', key: 'blood_group' },
    ],
  },
  academic: {
    label: 'Academic',
    fields: [
      { header: 'Admission no', key: 'admission_no' },
      { header: 'Admission date', key: 'admission_date' },
      { header: 'Class', key: 'class_name' },
      { header: 'Section', key: 'section' },
      { header: 'Medium', key: 'medium' },
      { header: 'Student type', key: 'student_type' },
    ],
  },
  family: {
    label: 'Family',
    fields: [
      { header: "Father's name", key: 'father_name' },
      { header: "Mother's name", key: 'mother_name' },
      { header: 'Parent phone', key: 'parent_phone' },
      { header: 'Annual income', key: 'annual_income' },
    ],
  },
  location: {
    label: 'Location',
    fields: [
      { header: 'Village', key: 'village_name' },
      { header: 'Mandal', key: 'mandal_name' },
      { header: 'District', key: 'district_name' },
      { header: 'State', key: 'state' },
    ],
  },
  identity: {
    label: 'Identity / Welfare',
    fields: [
      { header: 'Caste category', key: 'caste_category' },
      { header: 'Religion', key: 'religion' },
      { header: 'APAAR ID', key: 'apaar_id' },
    ],
  },
};

// Given which groups are selected (an object like { personal: true,
// academic: false, ... }), returns the ordered field list — S.No and
// Full name first always, then each selected group's fields in a
// fixed order, then Remarks last.
function selectedFieldList(selectedGroups) {
  const groups = selectedGroups || { personal: true, academic: true, family: true, location: true, identity: true };
  const fields = [{ header: 'S.No', key: '__sno' }, { header: 'Full name', key: 'full_name' }];
  ['personal', 'academic', 'family', 'location', 'identity'].forEach((g) => {
    if (groups[g] !== false) fields.push(...FIELD_GROUPS[g].fields);
  });
  fields.push({ header: 'Remarks', key: '__remarks' });
  return fields;
}

const REPORT_CATALOG = [
  // Every field the school actually collects at admission (confirmed
  // against StudentAdmission.jsx's real insert payload), one row per
  // student — matches the traditional General Register every Indian
  // school is required to maintain. Required class param: a real
  // register is kept per class, and 22 columns across every class at
  // once would be unreadable either way.
  { id: 'student_full_details', name: 'Student full details register', tier: 'basic', icon: '📋', params: ['class', 'academicYear', 'fieldGroups'] },
  { id: 'daily_attendance',    name: 'Daily attendance — class-wise',            tier: 'basic',      icon: '✅', params: ['class', 'dateRange'] },
  { id: 'low_attendance',      name: 'Low attendance list',                tier: 'basic',      icon: '⚠️', params: ['class', 'dateRange', 'threshold', 'minDays'] },
  { id: 'fee_defaulters',      name: 'Fee defaulters list',                      tier: 'basic',      icon: '💰', params: ['class', 'overdueOnly'] },
  { id: 'class_rank',          name: 'Class rank list',                           tier: 'basic',      icon: '🏆', params: ['class', 'exam'] },
  { id: 'class_strength',      name: 'Class-wise strength',                      tier: 'basic',      icon: '🏫' },
  { id: 'gender_distribution', name: 'Gender distribution',                      tier: 'basic',      icon: '👥', params: ['class', 'academicYear'] },
  { id: 'new_admissions',      name: 'New admissions (date range)',              tier: 'basic',      icon: '🆕', params: ['class', 'academicYear'] },
  { id: 'tc_issued',           name: 'Transfer certificates issued',             tier: 'basic',      icon: '📜', params: ['class', 'academicYear'] },
  { id: 'certificates_issued', name: 'Certificates issued',                      tier: 'basic',      icon: '📄', params: ['class', 'academicYear'] },
  { id: 'transport_enrollment',name: 'Transport enrollment by route',            tier: 'standard',   icon: '🚌' },
  { id: 'activities_participation', name: 'Activities & coaching participation', tier: 'standard',   icon: '🎭' },
  { id: 'hostel_outings_current', name: 'Hostel — students currently out',       tier: 'standard',   icon: '🏠', params: ['class', 'dateRange'] },
  { id: 'welfare_eligible',    name: 'Welfare scheme eligible students',          tier: 'standard',   icon: '🌿', params: ['class', 'academicYear'] },
  { id: 'admissions_village_category_class', name: 'Admissions by village, category & class', tier: 'standard', icon: '📍', params: ['academicYear'] },
  { id: 'monthly_fee_collection', name: 'Monthly fee collection trend',        tier: 'standard', icon: '📈', params: ['class', 'academicYear'] },
  { id: 'pending_corrections',    name: 'Pending correction requests',          tier: 'standard', icon: '📝' },
  { id: 'homework_compliance',    name: 'Homework posting compliance',          tier: 'standard', icon: '📔' },
  { id: 'ptm_engagement',         name: 'PTM booking engagement',               tier: 'standard', icon: '🗓️' },
  { id: 'caste_gender_filter', name: 'Multi-filter — caste + village + gender',  tier: 'advanced',   icon: '🔍', params: ['class', 'caste', 'gender', 'village'] },
  { id: 'udise_format',        name: 'UDISE+ format export',                     tier: 'specialised', icon: '📋' },
];

// Indian academic year runs June to May, so "2026-27" means
// 1 Jun 2026 to 31 May 2027. Six reports need this same range, so it
// lives here rather than being rewritten in each.
function academicRange(startYear) {
  if (!startYear) return null;
  return { from: `${startYear}-06-01`, to: `${Number(startYear) + 1}-05-31` };
}

async function runReportQuery(reportId, appId, extraFilters) {
  const today = new Date().toISOString().slice(0, 10);

  switch (reportId) {
    case 'student_full_details': {
      // Every field confirmed present in StudentAdmission.jsx's real
      // insert payload, plus sid (auto-generated, not asked on the
      // form, but the real identifier used everywhere else — TCs, fee
      // receipts, ID cards). village_name/mandal_name/district_name/
      // state are the plain-text columns now in use (see
      // StudentAdmission.jsx and StudentDetail.jsx) — NOT the old
      // village_id, which pointed at CTS's unrelated electoral table.
      //
      // Columns are now driven by which field groups were selected
      // (see FIELD_GROUPS/selectedFieldList above) rather than a fixed
      // list — the query itself always fetches every column regardless
      // (the read cost is trivial either way), and only the returned
      // `columns` header list and the display row change based on
      // selection.
      const fields = selectedFieldList(extraFilters?.field_groups);
      const cols = fields.map((f) => f.header);
      const classId = extraFilters?.class_id;
      if (!classId) return { data: [], columns: cols };

      // Year-wise: filters to students admitted in that academic year
      // specifically, rather than only "everyone currently active" —
      // lets a class's admission register be pulled up for a past
      // year, not just today's roster.
      const admRange = academicRange(extraFilters?.academicYearStart);

      let sfdQuery = supabase
        .from('students')
        .select(`
          id, sid, full_name, full_name_telugu, dob, gender, blood_group,
          caste_category, religion, annual_income, apaar_id,
          admission_no, admission_date, section, medium, student_type,
          father_name, mother_name, parent_phone,
          village_name, mandal_name, district_name, state,
          classes(class_name)
        `)
        .eq('app_id', appId)
        .eq('class_id', classId);
      if (admRange) {
        sfdQuery = sfdQuery.gte('admission_date', admRange.from).lte('admission_date', admRange.to);
      } else {
        sfdQuery = sfdQuery.eq('status', 'active');
      }
      const { data, error: qErr } = await sfdQuery.order('full_name');
      if (qErr) { console.error('Report query failed:', qErr); throw qErr; }
      return { data: data || [], columns: cols, fieldsUsed: fields };
    }
    case 'daily_attendance': {
      // Was today-only with every class mixed together. Now a date
      // range per class: from = to gives a single day's register,
      // a wider range gives the summary. Same report, both uses.
      const from = extraFilters?.date_from || today;
      const to = extraFilters?.date_to || from;
      const cols = ['S.No', 'Name', 'SID', 'Class', 'Present', 'Absent', 'Days recorded', 'Attendance %', 'Remarks'];

      let sq = supabase
        .from('students').select('id, full_name, sid, section, classes(class_name)')
        .eq('app_id', appId).eq('status', 'active');
      if (extraFilters?.class_id) sq = sq.eq('class_id', extraFilters.class_id);
      const { data: students, error: sErr } = await sq;
      if (sErr) { console.error('Report query failed:', sErr); throw sErr; }

      const ids = (students || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: cols };

      const { data, error: qErr } = await supabase
        .from('attendance').select('student_id, status')
        .gte('date', from).lte('date', to)
        .in('student_id', ids);
      if (qErr) { console.error('Report query failed:', qErr); throw qErr; }

      const tally = {};
      for (const r of data || []) {
        if (!tally[r.student_id]) tally[r.student_id] = { total: 0, present: 0 };
        tally[r.student_id].total += 1;
        if (r.status === 'P') tally[r.student_id].present += 1;
      }

      const rows = (students || []).map((s) => {
        const t = tally[s.id] || { total: 0, present: 0 };
        return {
          ...s,
          present: t.present,
          absent: t.total - t.present,
          total: t.total,
          pct: t.total > 0 ? Math.round((t.present / t.total) * 100) : 0,
          class: `${s.classes?.class_name || ''}${s.section ? `-${s.section}` : ''}`,
        };
      }).sort((a, b) => a.pct - b.pct);

      return { data: rows, columns: cols };
    }
    case 'low_attendance': {
      // Every constraint here used to be hardcoded and invisible: the
      // window was fixed to June of the current year, students with 10
      // or fewer records were silently skipped, and only the FIRST 100
      // students were checked at all. That last one was a real
      // correctness bug — students beyond 100 were never evaluated,
      // so a genuinely struggling student could be missing from the
      // report entirely. All three are now explicit parameters, and
      // the cap is gone.
      const from = extraFilters?.date_from || `${new Date().getFullYear()}-06-01`;
      const to = extraFilters?.date_to || new Date().toISOString().slice(0, 10);
      const minDays = Number(extraFilters?.min_days ?? 10);
      const limitPct = Number(extraFilters?.threshold ?? 75);
      const classId = extraFilters?.class_id;

      let sq = supabase
        .from('students').select('id, full_name, sid, class_id, section, classes(class_name)')
        .eq('app_id', appId).eq('status', 'active');
      if (classId) sq = sq.eq('class_id', classId);
      const { data: students, error: sErr } = await sq;
      if (sErr) { console.error('Report query failed:', sErr); throw sErr; }

      const ids = (students || []).map((s) => s.id);
      const cols = ['S.No', 'Name', 'SID', 'Class', 'Days present', 'Days recorded', 'Attendance %', 'Remarks'];
      if (ids.length === 0) return { data: [], columns: cols };

      // One query for all students instead of two per student — the old
      // loop fired 200 separate queries for 100 students, which is why
      // it needed a cap in the first place.
      const { data: att, error: aErr } = await supabase
        .from('attendance').select('student_id, status')
        .in('student_id', ids).gte('date', from).lte('date', to);
      if (aErr) { console.error('Report query failed:', aErr); throw aErr; }

      const tally = {};
      for (const r of att || []) {
        if (!tally[r.student_id]) tally[r.student_id] = { total: 0, present: 0 };
        tally[r.student_id].total += 1;
        if (r.status === 'P') tally[r.student_id].present += 1;
      }

      const results = [];
      for (const s of students || []) {
        const t = tally[s.id];
        if (!t || t.total < minDays) continue;
        const pct = Math.round((t.present / t.total) * 100);
        if (pct < limitPct) {
          results.push({
            ...s, pct, present: t.present, total: t.total,
            class: `${s.classes?.class_name || ''}${s.section ? `-${s.section}` : ''}`,
          });
        }
      }
      results.sort((a, b) => a.pct - b.pct);
      return { data: results, columns: cols };
    }
    case 'fee_defaulters': {
      let stq = supabase.from('students').select('id').eq('app_id', appId);
      if (extraFilters?.class_id) stq = stq.eq('class_id', extraFilters.class_id);
      const { data: appStudents } = await stq;
      const ids = (appStudents || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: ['Name', 'SID', 'Class', 'Fee type', 'Balance', 'Due date', 'Remarks'] };
      // Previously read amount_paid directly from fee_dues — never
      // actually updated anywhere by a real payment, so this report
      // showed every due as fully unpaid forever, regardless of what
      // was actually collected via FeeCollection.jsx. Now sums the
      // real fee_payments rows per due, same fix already applied to
      // Dashboard.jsx and TransferCertificate.jsx for this identical bug.
      // Overdue-only used to be hardcoded, so a fee due next month
      // never appeared — indistinguishable from "nothing owed".
      let fdQuery = supabase
        .from('fee_dues')
        .select('id, amount_due, fee_type, due_date, fee_payments(amount), students(full_name, sid, parent_phone, classes(class_name))')
        .in('student_id', ids);
      if (extraFilters?.overdue_only !== false) fdQuery = fdQuery.lt('due_date', today);
      const { data, error: qErr } = await fdQuery;
      if (qErr) { console.error('Report query failed:', qErr); throw qErr; }
      const withRealPaid = (data || []).map((d) => ({
        ...d,
        amount_paid: (d.fee_payments || []).reduce((sum, p) => sum + Number(p.amount), 0),
      }));
      const filtered = withRealPaid.filter((d) => Number(d.amount_due) > Number(d.amount_paid));
      return { data: filtered, columns: ['Name', 'SID', 'Class', 'Fee type', 'Balance', 'Due date', 'Remarks'] };
    }
    case 'class_rank': {
      // Ranked per exam, on the TOTAL across all subjects — which is
      // how an Indian school rank list actually works. The previous
      // version pulled every marks row ever recorded and ranked each
      // subject row separately, so a student with 5 subjects appeared
      // 5 times, and marks from different exams were mixed together.
      const classId = extraFilters?.class_id;
      const examId  = extraFilters?.exam_id;
      const cols = ['Rank', 'Name', 'SID', 'Subjects', 'Total', 'Percentage', 'Remarks'];
      if (!classId || !examId) return { data: [], columns: cols };

      const { data, error: qErr } = await supabase
        .from('marks')
        .select('student_id, total, students(full_name, sid, status)')
        .eq('exam_id', examId);
      if (qErr) { console.error('Report query failed:', qErr); throw qErr; }

      // Sum every subject per student for this one exam.
      const byStudent = {};
      for (const row of data || []) {
        if (row.students?.status !== 'active') continue;
        const sid = row.student_id;
        if (!byStudent[sid]) {
          byStudent[sid] = { student_id: sid, students: row.students, total: 0, subjects: 0 };
        }
        byStudent[sid].total += Number(row.total || 0);
        byStudent[sid].subjects += 1;
      }

      // Percentage = total obtained / total maximum, computed once —
      // NOT an average of per-subject percentages, which only agrees
      // when every subject carries the same maximum. Each subject is
      // out of 100 in this system.
      const rows = Object.values(byStudent).map((r) => ({
        ...r,
        percentage: r.subjects > 0 ? Math.round((r.total / (r.subjects * 100)) * 1000) / 10 : 0,
      }));

      rows.sort((a, b) => b.total - a.total);

      // Dense ranking: equal totals share a rank, and the next distinct
      // total takes the very next number (1, 1, 1, 1, 2 — not 1, 1, 1, 1, 5).
      let rank = 0;
      let lastTotal = null;
      for (const r of rows) {
        if (r.total !== lastTotal) { rank += 1; lastTotal = r.total; }
        r.class_rank = rank;
      }

      return { data: rows, columns: cols };
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
      // Was a single school-wide total. Now broken down per class,
      // with a Total row — and an academic year filter so previous
      // years can be looked at, not just the students on roll today.
      const range = academicRange(extraFilters?.academicYearStart);
      let q = supabase.from('students')
        .select('id, gender, class_id, admission_date, classes(class_name, medium)')
        .eq('app_id', appId);
      if (extraFilters?.class_id) q = q.eq('class_id', extraFilters.class_id);
      // Without a year chosen, show who is on roll now. With one,
      // show everyone admitted during that year regardless of status.
      if (range) q = q.gte('admission_date', range.from).lte('admission_date', range.to);
      else q = q.eq('status', 'active');
      const { data, error: qErr } = await q;
      if (qErr) { console.error('Report query failed:', qErr); throw qErr; }

      const byClass = {};
      for (const s of data || []) {
        const key = s.classes?.class_name
          ? `${s.classes.class_name}${s.classes.medium ? ` · ${s.classes.medium}` : ''}`
          : 'Unassigned';
        if (!byClass[key]) byClass[key] = { male: 0, female: 0, other: 0, total: 0 };
        const g = (s.gender || '').toLowerCase();
        if (g === 'male') byClass[key].male += 1;
        else if (g === 'female') byClass[key].female += 1;
        else byClass[key].other += 1;
        byClass[key].total += 1;
      }
      const rows = Object.entries(byClass)
        .map(([cls, v]) => ({ id: cls, class: cls, ...v }))
        .sort((a, b) => a.class.localeCompare(b.class));
      if (rows.length > 1) {
        rows.push({
          id: '__total__', class: 'TOTAL', isTotal: true,
          male: rows.reduce((s, r) => s + r.male, 0),
          female: rows.reduce((s, r) => s + r.female, 0),
          other: rows.reduce((s, r) => s + r.other, 0),
          total: rows.reduce((s, r) => s + r.total, 0),
        });
      }
      return { data: rows, columns: ['S.No', 'Class', 'Male', 'Female', 'Other', 'Total', 'Remarks'] };
    }
    case 'new_admissions': {
      // Was a fixed 90-day window with no way to change it, so older
      // admissions simply couldn't be looked at. Now the academic year
      // if one is chosen, otherwise the last 90 days as before.
      const admRange = academicRange(extraFilters?.academicYearStart);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      // Deliberately NOT filtered by status: this is a historical
      // record of who joined in the period, so a student who has since
      // left still belongs in the count. The Status column below makes
      // it clear at a glance who is still with the school.
      let naQuery = supabase
        .from('students')
        .select('id, full_name, sid, admission_date, admission_no, status, class_id, classes(class_name)')
        .eq('app_id', appId)
        .gte('admission_date', admRange ? admRange.from : cutoff.toISOString().slice(0, 10))
        .lte('admission_date', admRange ? admRange.to : '9999-12-31');
      if (extraFilters?.class_id) naQuery = naQuery.eq('class_id', extraFilters.class_id);
      const { data, error: qErr } = await naQuery.order('admission_date', { ascending: false });
      if (qErr) { console.error('Report query failed:', qErr); throw qErr; }
      return { data: data || [], columns: ['S.No', 'Name', 'SID', 'Admission no', 'Class', 'Admission date', 'Status', 'Remarks'] };
    }
    case 'tc_issued': {
      let stQ = supabase.from('students').select('id').eq('app_id', appId);
      if (extraFilters?.class_id) stQ = stQ.eq('class_id', extraFilters.class_id);
      const { data: appStudents } = await stQ;
      const tcRange = academicRange(extraFilters?.academicYearStart);
      const ids = (appStudents || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: ['S.No', 'Name', 'TC no', 'Reason', 'Date of leaving', 'Remarks'] };
      // reason_leaving/date_of_leaving were never real columns — this
      // exact mismatch was already found and fixed in
      // TransferCertificate.jsx itself; this report had the identical
      // stale field names and has likely been failing outright every
      // time it ran, since these columns don't exist to select at all.
      let tcQ = supabase
        .from('transfer_certificates')
        .select('id, tc_no, reason, issue_date, students(full_name, sid, classes(class_name))')
        .in('student_id', ids);
      if (tcRange) tcQ = tcQ.gte('issue_date', tcRange.from).lte('issue_date', tcRange.to);
      const { data, error } = await tcQ.order('issue_date', { ascending: false });
      if (error) { console.error('tc_issued report failed:', error); throw error; }
      return { data: data || [], columns: ['S.No', 'Name', 'TC no', 'Reason', 'Date of leaving', 'Remarks'] };
    }
    case 'certificates_issued': {
      let stQ = supabase.from('students').select('id').eq('app_id', appId);
      if (extraFilters?.class_id) stQ = stQ.eq('class_id', extraFilters.class_id);
      const { data: appStudents } = await stQ;
      const certRange = academicRange(extraFilters?.academicYearStart);
      const ids = (appStudents || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: ['S.No', 'Name', 'Certificate type', 'Cert no', 'Issued', 'Remarks'] };
      // issued_at was never a real column — the real column is
      // issue_date (a date, not a timestamp). Same mismatch already
      // found and fixed in Certificates.jsx itself.
      let certQ = supabase
        .from('certificates')
        .select('id, cert_type, cert_no, issue_date, students(full_name, sid, classes(class_name))')
        .in('student_id', ids);
      if (certRange) certQ = certQ.gte('issue_date', certRange.from).lte('issue_date', certRange.to);
      const { data, error } = await certQ.order('issue_date', { ascending: false });
      if (error) { console.error('certificates_issued report failed:', error); throw error; }
      return { data: data || [], columns: ['S.No', 'Name', 'Certificate type', 'Cert no', 'Issued', 'Remarks'] };
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
      // Was currently-out only, with no date filter — so there was no
      // way to review a past day or month. A date range now shows the
      // outings in that window whatever their status; with no range
      // chosen it still shows who is out right now.
      const cols = ['S.No', 'Name', 'SID', 'Class', 'Reason', 'Out since', 'Expected return', 'Status', 'Remarks'];
      let stQ = supabase.from('students').select('id').eq('app_id', appId);
      if (extraFilters?.class_id) stQ = stQ.eq('class_id', extraFilters.class_id);
      const { data: appStudents } = await stQ;
      const ids = (appStudents || []).map((s) => s.id);
      if (ids.length === 0) return { data: [], columns: cols };

      let hoQ = supabase
        .from('hostel_outings')
        .select('id, reason, out_date, out_time, return_expected, status, students(full_name, sid, classes(class_name))')
        .in('student_id', ids);
      if (extraFilters?.date_from) hoQ = hoQ.gte('out_date', extraFilters.date_from).lte('out_date', extraFilters.date_to);
      else hoQ = hoQ.eq('status', 'out');
      const { data, error: qErr } = await hoQ.order('out_date', { ascending: false });
      if (qErr) { console.error('Report query failed:', qErr); throw qErr; }
      return { data: data || [], columns: cols };
    }
    case 'welfare_eligible': {
      const weRange = academicRange(extraFilters?.academicYearStart);
      let weQ = supabase
        .from('students')
        .select('id, full_name, sid, caste_category, admission_date, classes(class_name)')
        .eq('app_id', appId)
        .in('caste_category', ['SC', 'ST', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'EWS']);
      if (extraFilters?.class_id) weQ = weQ.eq('class_id', extraFilters.class_id);
      // A past year means everyone admitted then; no year means who is
      // on roll now.
      if (weRange) weQ = weQ.gte('admission_date', weRange.from).lte('admission_date', weRange.to);
      else weQ = weQ.eq('status', 'active');
      const { data, error: qErr } = await weQ;
      if (qErr) { console.error('Report query failed:', qErr); throw qErr; }
      return { data: data || [], columns: ['S.No', 'Name', 'SID', 'Class', 'Category', 'Remarks'] };
    }
    case 'admissions_village_category_class': {
      const startYear = extraFilters?.academicYearStart;
      if (!startYear) return { data: [], columns: [] };
      const rangeStart = `${startYear}-06-01`;
      const rangeEnd = `${Number(startYear) + 1}-05-31`;

      // village_id/villages(name) removed — that join points at CTS's
      // electoral village table, which was never populated at
      // admission (confirmed: StudentAdmission.jsx never wrote to it)
      // and has no real foreign key relationship PostgREST can use
      // here, which is exactly the "could not find relationship"
      // error this was producing. village_name is the real, plain-text
      // column StudentAdmission.jsx actually saves to.
      const { data, error: qErr } = await supabase
        .from('students')
        .select('caste_category, village_name, class_id, classes(class_name)')
        .eq('app_id', appId)
        .gte('admission_date', rangeStart)
        .lte('admission_date', rangeEnd);
      if (qErr) { console.error('Report query failed:', qErr); throw qErr; }

      const grouped = {};
      (data || []).forEach((s) => {
        const village = s.village_name || 'Not recorded';
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
      // Was one lump figure per month across the whole school. Now
      // filterable by class and academic year, and each month also
      // shows how many payments made it up — a bare total doesn't say
      // whether it came from 2 families or 40.
      const mfRange = academicRange(extraFilters?.academicYearStart);
      const cols = ['S.No', 'Month', 'Payments', 'Total collected', 'Remarks'];

      let stQ = supabase.from('students').select('id').eq('app_id', appId);
      if (extraFilters?.class_id) stQ = stQ.eq('class_id', extraFilters.class_id);
      const { data: appStudents } = await stQ;
      const sIds = (appStudents || []).map((s) => s.id);
      if (sIds.length === 0) return { data: [], columns: cols };

      const { data: dueRows } = await supabase.from('fee_dues').select('id').in('student_id', sIds);
      const dueIdList = (dueRows || []).map((d) => d.id);
      if (dueIdList.length === 0) return { data: [], columns: cols };

      let fpQ = supabase.from('fee_payments').select('amount, paid_at').in('due_id', dueIdList);
      if (mfRange) fpQ = fpQ.gte('paid_at', mfRange.from).lte('paid_at', `${mfRange.to}T23:59:59`);
      const { data, error: qErr } = await fpQ;
      if (qErr) { console.error('Report query failed:', qErr); throw qErr; }

      const byMonth = {};
      (data || []).forEach((p) => {
        const d = new Date(p.paid_at);
        // Sort key keeps chronological order; the label is what prints.
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        if (!byMonth[key]) byMonth[key] = { month: label, total: 0, count: 0 };
        byMonth[key].total += Number(p.amount || 0);
        byMonth[key].count += 1;
      });
      const rows = Object.entries(byMonth)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, v]) => ({ id: key, ...v }));
      if (rows.length > 1) {
        rows.push({
          id: '__total__', month: 'TOTAL', isTotal: true,
          count: rows.reduce((s, r) => s + r.count, 0),
          total: rows.reduce((s, r) => s + r.total, 0),
        });
      }
      return { data: rows, columns: cols };
    }
    case 'pending_corrections': {
      // created_at was never a real column on correction_requests —
      // confirmed real schema uses requested_at.
      const { data, error } = await supabase
        .from('correction_requests')
        .select('id, module, record_label, request_type, field_name, requested_at')
        .eq('app_id', appId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: true });
      if (error) { console.error('pending_corrections report failed:', error); throw error; }
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
      return { data: rows, columns: ['S.No', 'Class', 'Section', 'Homework posted (last 7 days)', 'Remarks'] };
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
      // village_id/villages(name) removed — same fix as
      // admissions_village_category_class above.
      let query = supabase
        .from('students')
        .select('id, full_name, sid, caste_category, gender, village_name, classes(class_name)')
        .eq('app_id', appId)
        .eq('status', 'active');
      if (filters.caste_category) query = query.eq('caste_category', filters.caste_category);
      if (filters.gender) query = query.eq('gender', filters.gender);
      if (filters.village_name) query = query.eq('village_name', filters.village_name);
      if (filters.class_id) query = query.eq('class_id', filters.class_id);
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

  // Reusable parameter system: a report declares what it needs via
  // `params` in REPORT_CATALOG, and one generic panel renders the
  // matching controls. Previously each report needing inputs had its
  // own hardcoded panel and its own entry in a hardcoded if-check,
  // which meant adding a filter to any other report required
  // duplicating the whole panel again.
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterPanelFor, setFilterPanelFor] = useState(null);
  const [paramClasses, setParamClasses] = useState([]);
  const [paramExams, setParamExams] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  // Date range defaults to the current academic year (June onwards) —
  // the same window the attendance report used to hardcode invisibly.
  const academicStart = `${new Date().getMonth() >= 5 ? new Date().getFullYear() : new Date().getFullYear() - 1}-06-01`;
  const [dateFrom, setDateFrom] = useState(academicStart);
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [minDays, setMinDays] = useState('10');
  const [threshold, setThreshold] = useState('75');
  const [overdueOnly, setOverdueOnly] = useState(true);
  // All checked by default — matches the report's original behaviour
  // (every field shown) unless someone deliberately narrows it.
  const [fieldGroups, setFieldGroups] = useState({ personal: true, academic: true, family: true, location: true, identity: true });
  const [casteFilter, setCasteFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [academicYearStart, setAcademicYearStart] = useState(String(new Date().getFullYear() - (new Date().getMonth() < 5 ? 1 : 0)));
  const [villageFilterQuery, setVillageFilterQuery] = useState('');
  const [villageFilterResults, setVillageFilterResults] = useState([]);
  // Was villageFilterId + a separate villages(name) lookup — village_name
  // is plain text with no id, so the chosen value IS the filter value,
  // nothing to look up separately.
  const [villageFilterName, setVillageFilterName] = useState('');

  // Was searching CTS's electoral villages table — unrelated to
  // student data, never populated by admission, and the source of
  // the "could not find relationship" error once village_id stopped
  // being used. Now searches DISTINCT village_name values that
  // actually exist among this school's own students — real
  // suggestions from real data, so staff pick a spelling that's
  // guaranteed to actually match students, rather than free-typing
  // and risking "Dwarapudi" vs "dwarapudi" silently finding nothing.
  async function searchVillageFilter(q) {
    setVillageFilterQuery(q);
    if (q.trim().length < 2) { setVillageFilterResults([]); return; }
    const { data, error } = await supabase
      .from('students').select('village_name')
      .eq('app_id', tenant.appId)
      .not('village_name', 'is', null)
      .ilike('village_name', `%${q}%`)
      .limit(50);
    if (error) { console.error('Searching villages failed:', error); return; }
    const distinct = [...new Set((data || []).map((s) => s.village_name).filter(Boolean))].slice(0, 8);
    setVillageFilterResults(distinct);
  }

  // Classes load once when a class-parameter report is opened.
  async function loadParamClasses() {
    const { data, error } = await supabase
      .from('classes').select('id, class_name, class_order, medium')
      .eq('app_id', tenant.appId).order('class_order');
    if (error) { console.error('Loading classes failed:', error); return; }
    setParamClasses(data || []);
  }

  // Exams cascade off the chosen class — confirmed real schema: every
  // exams row carries its own class_id, so "Exam-1" exists separately
  // per class rather than school-wide.
  async function loadParamExams(classId) {
    setSelectedExamId('');
    if (!classId) { setParamExams([]); return; }
    const { data, error } = await supabase
      .from('exams').select('id, exam_name, academic_year, start_date')
      .eq('app_id', tenant.appId).eq('class_id', classId)
      .order('start_date', { ascending: false });
    if (error) { console.error('Loading exams failed:', error); return; }
    setParamExams(data || []);
  }

  // Collects whatever the open panel's report declared it needs.
  function collectParams(report) {
    const p = report.params || [];
    const out = {};
    if (p.includes('class')) out.class_id = selectedClassId;
    if (p.includes('exam')) out.exam_id = selectedExamId;
    if (p.includes('academicYear')) out.academicYearStart = academicYearStart;
    if (p.includes('caste')) out.caste_category = casteFilter;
    if (p.includes('gender')) out.gender = genderFilter;
    if (p.includes('village')) out.village_name = villageFilterName;
    if (p.includes('dateRange')) { out.date_from = dateFrom; out.date_to = dateTo; }
    if (p.includes('minDays')) out.min_days = Number(minDays) || 0;
    if (p.includes('threshold')) out.threshold = Number(threshold) || 75;
    if (p.includes('overdueOnly')) out.overdue_only = overdueOnly;
    if (p.includes('fieldGroups')) out.field_groups = fieldGroups;
    return out;
  }

  // Class-wise totals shown ABOVE the detail rows. A principal reads
  // the headline first ("4 in Class 2-A") and the names second, and on
  // a printed page both need to be present — a toggle would lose one.
  function buildSummary(report, rows) {
    const SUMMARISED = ['low_attendance', 'fee_defaulters', 'caste_gender_filter', 'welfare_eligible'];
    if (!SUMMARISED.includes(report.id) || !rows?.length) return null;
    const counts = {};
    for (const r of rows) {
      const key = r.class
        || r.classes?.class_name
        || r.students?.classes?.class_name
        || 'Unassigned';
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

  // Turns the chosen parameters into a readable line shown in the
  // report header — on screen AND in print. Without it a printed rank
  // list doesn't say which class or exam it covers, which makes the
  // document ambiguous once it's filed. Driven by the report's own
  // `params`, so any report given a filter later gets its label for
  // free. "All" values are shown explicitly rather than omitted:
  // silence can't be told apart from a filter someone forgot to set.
  function buildFilterLabel(report, params) {
    const p = report.params || [];
    const parts = [];
    if (p.includes('class')) {
      const cl = paramClasses.find((x) => x.id === params.class_id);
      if (cl) parts.push(`${cl.class_name}${cl.medium ? ` · ${cl.medium}` : ''}`);
    }
    if (p.includes('exam')) {
      const ex = paramExams.find((x) => x.id === params.exam_id);
      if (ex) parts.push(`${ex.exam_name}${ex.start_date ? ` (${ex.start_date})` : ''}`);
    }
    if (p.includes('academicYear') && params.academicYearStart) {
      const y = Number(params.academicYearStart);
      parts.push(`Academic year ${y}-${String(y + 1).slice(-2)}`);
    }
    if (p.includes('caste')) parts.push(params.caste_category || 'All categories');
    if (p.includes('gender')) parts.push(params.gender || 'All genders');
    if (p.includes('village')) parts.push(params.village_name || 'All villages');
    if (p.includes('dateRange') && params.date_from) parts.push(`${params.date_from} to ${params.date_to}`);
    if (p.includes('threshold')) parts.push(`below ${params.threshold}%`);
    if (p.includes('minDays')) parts.push(`min ${params.min_days} days recorded`);
    if (p.includes('overdueOnly')) parts.push(params.overdue_only ? 'Overdue only' : 'All unpaid dues');
    if (p.includes('fieldGroups') && params.field_groups) {
      const included = Object.entries(params.field_groups).filter(([, v]) => v !== false).map(([k]) => FIELD_GROUPS[k]?.label).filter(Boolean);
      const allSelected = included.length === Object.keys(FIELD_GROUPS).length;
      parts.push(allSelected ? 'All fields' : (included.length ? included.join(', ') : 'S.No + Name only'));
    }
    return parts.join('  •  ');
  }

  // A report can't run until every parameter it marks as required has
  // a value — otherwise it silently returns an empty table, which
  // reads as "no data" rather than "you haven't chosen yet".
  function paramsReady(report) {
    const p = report.params || [];
    if (p.includes('class') && !selectedClassId) return false;
    if (p.includes('exam') && !selectedExamId) return false;
    return true;
  }

  async function runReport(report, extraFilters) {
    if (!canAccess(userTier, report.tier)) {
      setError(`This report needs the "${report.tier}" plan or higher — your current plan doesn't include it.`);
      return;
    }
    // Any report that declares `params` opens the panel first, rather
    // than a hardcoded list of report ids.
    if (report.params?.length && !extraFilters) {
      setFilterPanelFor(report.id);
      setShowFilterPanel(true);
      setResult(null);
      setError('');
      if (report.params.includes('class')) {
        setSelectedClassId('');
        setSelectedExamId('');
        setParamExams([]);
        loadParamClasses();
      }
      return;
    }
    setShowFilterPanel(false);
    setRunning(report.id);
    setResult(null);
    setError('');
    try {
      const res = await runReportQuery(report.id, tenant.appId, extraFilters);
      setResult({
        report,
        ...res,
        filterLabel: extraFilters ? buildFilterLabel(report, extraFilters) : '',
        generatedAt: new Date().toLocaleString('en-IN'),
      });

      // Log to report_history
      await supabase.from('report_history').insert({
        app_id:       tenant.appId,
        generated_by: tenant.userRowId,
        record_count: res.data?.length || 0,
        delivery_mode: 'digital_only',
        is_archived:   false,
      });
    } catch (err) {
      console.error('Report generation failed:', err);
      setError(err.message || 'Failed to generate report. Please try again.');
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
          /* Resets student_full_details' on-screen minWidth (set
             inline, above) back to filling the full landscape page —
             the minWidth exists only to make the on-screen horizontal
             scrollbar actually work; print has real width to spare
             and doesn't need it. */
          .print-wide-report table { width: 100% !important; min-width: 0 !important; }
        }
      `}</style>
      <div style={S.inner}>
        <div className="no-print" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}><span style={{ letterSpacing: '2px', textTransform: 'uppercase' }}>Reports</span> · నివేదికలు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Report Engine</h1>
        </div>

        {error && (
          <div className="no-print" style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
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
        {/* ONE generic parameter panel for every report that declares
            `params`. Renders only the controls that report asks for,
            so adding a filter to another report is a catalog change
            rather than another copy of this markup. */}
        {showFilterPanel && (() => {
          const report = REPORT_CATALOG.find((r) => r.id === filterPanelFor);
          if (!report) return null;
          const p = report.params || [];
          const ready = paramsReady(report);
          return (
            <div className="no-print" style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
              <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>{report.name}</p>

              {p.includes('class') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-param-class" style={S.label}>Class *</label>
                  <select id="reports-param-class" name="reports-param-class" value={selectedClassId}
                    onChange={(e) => { setSelectedClassId(e.target.value); loadParamExams(e.target.value); }}
                    style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="">-- Select class --</option>
                    {/* Medium shown because a bilingual school legitimately has two
                        classes with the same name — e.g. "Class 2" exists as both
                        English Medium and Telugu Medium, each with its own students
                        and exams. Without the medium they are indistinguishable in
                        the dropdown. */}
                    {paramClasses.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.class_name}{cl.medium ? ` · ${cl.medium}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {p.includes('exam') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-param-exam" style={S.label}>Exam *</label>
                  <select id="reports-param-exam" name="reports-param-exam" value={selectedExamId}
                    onChange={(e) => setSelectedExamId(e.target.value)}
                    disabled={!selectedClassId}
                    style={{ ...S.input, cursor: selectedClassId ? 'pointer' : 'not-allowed', opacity: selectedClassId ? 1 : 0.5 }}>
                    <option value="">{selectedClassId ? '-- Select exam --' : 'Choose a class first'}</option>
                    {paramExams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.exam_name}{ex.start_date ? ` · ${ex.start_date}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedClassId && paramExams.length === 0 && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                      No exams recorded for this class yet.
                    </p>
                  )}
                </div>
              )}

              {p.includes('academicYear') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-academic-year-start" style={S.label}>Academic year starting</label>
                  <select id="reports-academic-year-start" name="reports-academic-year-start" value={academicYearStart}
                    onChange={(e) => setAcademicYearStart(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                    {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <option key={y} value={y}>{y}-{String(y + 1).slice(-2)} (June {y} – May {y + 1})</option>
                    ))}
                  </select>
                </div>
              )}

              {p.includes('dateRange') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label htmlFor="reports-date-from" style={S.label}>From</label>
                    <input id="reports-date-from" name="reports-date-from" type="date" value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)} style={S.input} />
                  </div>
                  <div>
                    <label htmlFor="reports-date-to" style={S.label}>To</label>
                    <input id="reports-date-to" name="reports-date-to" type="date" value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)} style={S.input} />
                  </div>
                </div>
              )}

              {(p.includes('threshold') || p.includes('minDays')) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  {p.includes('threshold') && (
                    <div>
                      <label htmlFor="reports-threshold" style={S.label}>Below (%)</label>
                      <input id="reports-threshold" name="reports-threshold" inputMode="numeric" value={threshold}
                        onChange={(e) => setThreshold(e.target.value.replace(/\D/g, '').slice(0, 3))} style={S.input} />
                    </div>
                  )}
                  {p.includes('minDays') && (
                    <div>
                      {/* Stops a student with 2 records being flagged at 50%.
                          Was hardcoded at 10 and invisible, which made an
                          empty report impossible to explain. */}
                      <label htmlFor="reports-min-days" style={S.label}>Min days recorded</label>
                      <input id="reports-min-days" name="reports-min-days" inputMode="numeric" value={minDays}
                        onChange={(e) => setMinDays(e.target.value.replace(/\D/g, '').slice(0, 3))} style={S.input} />
                    </div>
                  )}
                </div>
              )}

              {p.includes('overdueOnly') && (
                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="reports-overdue-only" style={S.label}>Which dues</label>
                  <select id="reports-overdue-only" name="reports-overdue-only" value={overdueOnly ? 'yes' : 'no'}
                    onChange={(e) => setOverdueOnly(e.target.value === 'yes')} style={{ ...S.input, cursor: 'pointer' }}>
                    <option value="yes">Overdue only (past due date)</option>
                    <option value="no">All unpaid dues</option>
                  </select>
                </div>
              )}

              {p.includes('fieldGroups') && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={S.label}>Which fields to include</label>
                    <button type="button"
                      onClick={() => {
                        const allOn = Object.values(fieldGroups).every((v) => v !== false);
                        const next = {}; Object.keys(FIELD_GROUPS).forEach((g) => { next[g] = !allOn; });
                        setFieldGroups(next);
                      }}
                      style={{ background: 'none', border: 'none', color: '#E8A020', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {Object.values(fieldGroups).every((v) => v !== false) ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  {Object.entries(FIELD_GROUPS).map(([key, group]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13, color: '#fff', cursor: 'pointer' }}>
                      <input type="checkbox" id={`reports-field-group-${key}`} name={`reports-field-group-${key}`}
                        checked={fieldGroups[key] !== false}
                        onChange={(e) => setFieldGroups((prev) => ({ ...prev, [key]: e.target.checked }))} />
                      {group.label}
                    </label>
                  ))}
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>S.No and Full name are always included.</p>
                </div>
              )}

              {(p.includes('caste') || p.includes('gender')) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  {p.includes('caste') && (
                    <div>
                      <label htmlFor="reports-caste-filter" style={S.label}>Caste category</label>
                      <select id="reports-caste-filter" name="reports-caste-filter" value={casteFilter}
                        onChange={(e) => setCasteFilter(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                        <option value="">All categories</option>
                        {FILTER_CASTE_CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </div>
                  )}
                  {p.includes('gender') && (
                    <div>
                      <label htmlFor="reports-gender-filter" style={S.label}>Gender</label>
                      <select id="reports-gender-filter" name="reports-gender-filter" value={genderFilter}
                        onChange={(e) => setGenderFilter(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
                        <option value="">All genders</option>
                        {FILTER_GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {p.includes('village') && (
                <div style={{ marginBottom: 14 }}>
                  <label style={S.label}>Village (optional)</label>
                  {/* Suggestions are real village_name values already used by
                      this school's own students, not a lookup-table search —
                      selecting one guarantees an exact match against real
                      records. */}
                  {villageFilterName ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8 }}>
                      <span style={{ fontSize: 13, color: '#fff' }}>{villageFilterName}</span>
                      <button onClick={() => setVillageFilterName('')}
                        style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.5)', padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>
                        Clear
                      </button>
                    </div>
                  ) : (
                    <>
                      <input id="reports-village-filter-query" name="reports-village-filter-query" value={villageFilterQuery}
                        onChange={(e) => searchVillageFilter(e.target.value)} placeholder="Search village name..." style={S.input} />
                      {villageFilterResults.map((name) => (
                        <div key={name} onClick={() => { setVillageFilterName(name); setVillageFilterQuery(''); setVillageFilterResults([]); }}
                          style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          {name}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowFilterPanel(false)}
                  style={{ flex: 1, padding: 10, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={() => runReport(report, collectParams(report))} disabled={!ready}
                  style={{ flex: 2, padding: 10, border: 'none', borderRadius: 8, background: ready ? '#E8A020' : 'rgba(255,255,255,0.08)', color: ready ? '#111113' : 'rgba(255,255,255,0.3)', cursor: ready ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
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
          {/* Landscape is now decided by actual column count, not a
              fixed report id — the Student Full Details register can
              now have anywhere from 3 columns (S.No, Name, Remarks
              only — everything deselected) up to 25 (everything
              selected), and printing 3 columns in landscape would
              waste as much space sideways as 25 columns crammed into
              portrait would waste vertically. Checked against every
              OTHER report's real column count (max 9) to confirm this
              threshold never accidentally changes their layout. */}
          {/* Was column-count-based (>10 -> landscape) — real testing
              showed this wasn't reliable: even a small selection (say,
              just "Personal", 8 columns) can overlap in portrait once
              actual content is involved — full names, Telugu script,
              and dates all need more room than an even 8-way split of
              portrait's narrower 174mm gives them. Student Full
              Details now ALWAYS prints landscape regardless of how
              many field groups are selected — landscape's 277mm gives
              real breathing room even for a single group, and the
              even-column-width behaviour (table-layout:fixed, still
              scoped to this report below) benefits from the extra
              width rather than needing to fit fewer columns into a
              narrower page. Every other report is unaffected — this
              class is still scoped to student_full_details only. */}
          <div className={`print-safe${result.report.id === 'student_full_details' ? ' print-wide-report' : ''}`} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{result.report.name}</p>
                {result.filterLabel && (
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#E8A020', fontWeight: 600 }}>
                    {result.filterLabel}
                  </p>
                )}
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
                {(() => {
                  const summary = buildSummary(result.report, result.data);
                  if (!summary) return null;
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {summary.map(([label, n]) => (
                        <div key={label} style={{ background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.2)', borderRadius: 8, padding: '6px 12px' }}>
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{label}: </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#E8A020' }}>{n}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <table style={{
                  // Only "width: 100%" for every OTHER report — for
                  // student_full_details specifically, that forced the
                  // table to always compress to exactly fit the screen
                  // no matter how many columns were selected, so it
                  // never actually became wider than its container and
                  // the horizontal scrollbar below had nothing to
                  // scroll to. minWidth instead lets it genuinely
                  // overflow when there are many columns, which is
                  // what actually makes that scrollbar work. Print is
                  // unaffected — a separate @media print rule below
                  // resets this back to width:100% there, since a full
                  // landscape page has enough room for the compressed
                  // version to look fine, unlike a phone or laptop screen.
                  ...(result.report.id === 'student_full_details'
                    ? { minWidth: Math.max(result.columns.length * 110, 600), borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }
                    : { width: '100%', borderCollapse: 'collapse', fontSize: 12 }),
                }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {result.columns.map((col) => (
                        <th key={col} style={{
                          padding: '8px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
                          // Scoped to student_full_details only, where
                          // table-layout:fixed plus up to 23+ narrow
                          // columns meant an unbreakable token (a phone
                          // number, an SID, a name with no spaces) had
                          // nowhere to go but visually overflow into the
                          // next cell — exactly what looked like garbled,
                          // overlapping text on the printed page. Letting
                          // the cell grow taller instead is always safe;
                          // silently cropping real student data (the
                          // overflow:hidden alternative) is not.
                          ...(result.report.id === 'student_full_details' ? { wordBreak: 'break-word', overflowWrap: 'break-word' } : {}),
                        }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {result.report.id === 'student_full_details' && (
                          <>
                            {(result.fieldsUsed || []).map((f, fi) => {
                              // Three keys are special: S.No/Remarks aren't real
                              // student columns, and class comes through the
                              // nested classes(class_name) relation rather than
                              // a flat field. annual_income gets ₹ formatting;
                              // everything else prints as-is.
                              if (f.key === '__sno') return <td key={fi} style={{ padding: '6px 6px', color: 'rgba(255,255,255,0.35)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{i + 1}</td>;
                              if (f.key === '__remarks') return <td key={fi} style={{ padding: '6px 6px', wordBreak: 'break-word', overflowWrap: 'break-word' }}><ReportRemark reportId="student_full_details" rowKey={row.id} /></td>;
                              if (f.key === 'full_name') return <td key={fi} style={{ padding: '6px 6px', color: '#fff', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{row.full_name}</td>;
                              if (f.key === 'sid') return <td key={fi} style={{ padding: '6px 6px', color: '#E8A020', fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{row.sid}</td>;
                              if (f.key === 'class_name') return <td key={fi} style={{ padding: '6px 6px', color: 'rgba(255,255,255,0.6)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{row.classes?.class_name || '—'}</td>;
                              if (f.key === 'annual_income') return <td key={fi} style={{ padding: '6px 6px', color: 'rgba(255,255,255,0.6)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{row.annual_income ? `₹${Number(row.annual_income).toLocaleString('en-IN')}` : '—'}</td>;
                              return <td key={fi} style={{ padding: '6px 6px', color: 'rgba(255,255,255,0.6)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{row[f.key] || '—'}</td>;
                            })}
                          </>
                        )}
                        {result.report.id === 'daily_attendance' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.class}</td>
                            <td style={{ padding: '8px 8px', color: '#6AAA90' }}>{row.present}</td>
                            <td style={{ padding: '8px 8px', color: row.absent > 0 ? '#E05A5A' : 'rgba(255,255,255,0.4)' }}>{row.absent}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.total}</td>
                            <td style={{ padding: '8px 0', color: row.pct < 75 ? '#E05A5A' : '#6AAA90', fontWeight: 600 }}>{row.total > 0 ? `${row.pct}%` : '—'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="daily_attendance" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'low_attendance' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.class}</td>
                            {/* Present/recorded shown so the percentage can be
                                checked — "62%" alone doesn't say whether it's
                                5 of 8 days or 50 of 80. */}
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.present}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.total}</td>
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
                            {/* Class column dropped — every row is already the
                                same class, since the report is now run per
                                class. Subjects and Total shown instead, so the
                                percentage can be checked at a glance. */}
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.subjects}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.total} / {row.subjects * 100}</td>
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
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{row.isTotal ? '' : i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{row.class}</td>
                            <td style={{ padding: '8px 8px', color: '#5A9ADF', fontWeight: row.isTotal ? 700 : 400 }}>{row.male}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020', fontWeight: row.isTotal ? 700 : 400 }}>{row.female}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.other}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 700 }}>{row.total}</td>
                            <td style={{ padding: '8px 8px' }}>{row.isTotal ? null : <ReportRemark reportId="gender_distribution" rowKey={row.id} />}</td>
                          </>
                        )}
                        {result.report.id === 'new_admissions' && (
                          <>
                            {/* S.No — a school register is normally numbered,
                                and a printed list without it is hard to refer
                                to ("row 7" in a phone call). Uses the render
                                index, so it follows the report's own sort. */}
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.admission_no}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.classes?.class_name}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90' }}>{row.admission_date}</td>
                            <td style={{ padding: '8px 8px' }}>
                              {(() => {
                                const LABELS = { active: 'Active', tc_issued: 'TC issued', passed_out: 'Passed out', promoted: 'Promoted' };
                                const COLORS = { active: '#6AAA90', tc_issued: '#E05A5A', passed_out: '#E8A020', promoted: '#5A9ADF' };
                                return (
                                  <span style={{ color: COLORS[row.status] || 'rgba(255,255,255,0.4)', fontWeight: row.status === 'active' ? 400 : 600 }}>
                                    {LABELS[row.status] || row.status || '—'}
                                  </span>
                                );
                              })()}
                            </td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="new_admissions" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'tc_issued' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.tc_no}</td>
                            {/* Query selects `reason` and `issue_date` — the real
                                columns. These cells still read the old
                                reason_leaving/date_of_leaving names, so both
                                printed blank on every row. */}
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.reason || '—'}</td>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{row.issue_date || '—'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="tc_issued" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'certificates_issued' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.cert_type}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.cert_no}</td>
                            {/* issued_at was never a real column — issue_date is,
                                and it's a plain date, so no Date parsing needed
                                (new Date(undefined) rendered "Invalid Date"). */}
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{row.issue_date || '—'}</td>
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
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.students?.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.students?.classes?.class_name || '—'}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.reason}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.out_date} {row.out_time}</td>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{row.return_expected}</td>
                            <td style={{ padding: '8px 8px', color: row.status === 'out' ? '#E05A5A' : '#6AAA90', fontWeight: 600 }}>{row.status === 'out' ? 'Out' : 'Returned'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="hostel_outings_current" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'welfare_eligible' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.classes?.class_name}</td>
                            <td style={{ padding: '8px 0', color: '#E8A020' }}>{row.caste_category}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="welfare_eligible" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'monthly_fee_collection' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{row.isTotal ? '' : i + 1}</td>
                            <td style={{ padding: '8px 8px', color: '#fff', fontWeight: row.isTotal ? 700 : 400 }}>{row.month}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)', fontWeight: row.isTotal ? 700 : 400 }}>{row.count}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: row.isTotal ? 700 : 600 }}>₹{row.total.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}>{row.isTotal ? null : <ReportRemark reportId="monthly_fee_collection" rowKey={row.id} />}</td>
                          </>
                        )}
                        {result.report.id === 'pending_corrections' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.module}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.record_label}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.request_type}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.field_name || '—'}</td>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{new Date(row.requested_at).toLocaleDateString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="pending_corrections" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'homework_compliance' && (
                          <>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.35)' }}>{i + 1}</td>
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
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{row.village_name || '—'}</td>
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
      .select('id, class_name, class_order, medium')
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
        /* Named landscape page — 23+ columns of the classwise full-detail
           register don't fit portrait at all. Follows the same proven
           pattern already used in ComplaintPrint.jsx: a named @page
           rule applied only via a className, so it has zero effect on
           every other report here, which stay on PrintHeader's default
           portrait page. */
        @page wide-report { size: A4 landscape; margin: 10mm; }
        .print-wide-report { page: wide-report; }
        @media print {
          .no-print { display: none !important; }
          /* Deliberately does NOT declare its own @page rule —
             PrintHeader already sets one (A4, 15mm 18mm margins), and
             two competing @page declarations produce unpredictable
             results depending on which wins. The card grid below is
             sized to fit PrintHeader's existing margins instead:
             A4 is 210mm wide, minus 36mm of side margin leaves 174mm,
             which fits two 85mm cards (real ID-card width) with room
             for the gap. */
          .id-card-grid {
            display: grid !important;
            /* Real ID-card proportions (~85mm x 54mm, standard card
               size) instead of a loose auto-fit grid — previously
               cards had no fixed size at all, wasting real page
               space since far fewer fit per sheet than actually
               could. */
            grid-template-columns: repeat(2, 85mm);
            grid-auto-rows: 54mm;
            gap: 4mm;
            justify-content: center;
          }
          .id-card { page-break-inside: avoid; }
        }
      `}</style>
      <div style={S.inner}>
        <div className="no-print" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}><span style={{ letterSpacing: '2px', textTransform: 'uppercase' }}>ID Cards</span> · ID కార్డులు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>ID Card Printer</h1>
        </div>

        <div className="no-print" style={{ ...S.card, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="reports-selected-class" style={S.label}>Select class</label>
            <select id="reports-selected-class" name="reports-selected-class" value={selectedClass}
              onChange={(e) => loadStudents(e.target.value)}
              style={{ ...S.input, cursor: 'pointer' }}>
              <option value="">-- Select class --</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.class_name}{c.medium ? ` · ${c.medium}` : ''}
                </option>
              ))}
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
          <div className="id-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {students.map((s) => (
              <div key={s.id} className="id-card" style={{ background: '#fff', borderRadius: 10, padding: 12, textAlign: 'center', border: '2px solid #185FA5', color: '#111', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#185FA5', textTransform: 'uppercase', letterSpacing: 0.5 }}>{tenant?.orgName}</p>
                  {/* Previously only the school name showed at all —
                      an ID card's whole purpose includes being useful
                      in an emergency, so address and a real contact
                      number matter as much as the name does. */}
                  {[tenant?.address, tenant?.city, tenant?.district].filter(Boolean).join(', ') && (
                    <p style={{ margin: '1px 0 0', fontSize: 7, color: '#666' }}>{[tenant?.address, tenant?.city, tenant?.district].filter(Boolean).join(', ')}</p>
                  )}
                </div>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#E8A020', margin: '4px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#111' }}>
                  {s.full_name[0]}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#111' }}>{s.full_name}</p>
                  <p style={{ margin: '2px 0', fontSize: 10, color: '#555' }}>{s.sid} · {s.classes?.class_name}{s.section ? `-${s.section}` : ''}</p>
                  {s.blood_group && <p style={{ margin: '2px 0', fontSize: 10, color: '#185FA5', fontWeight: 600 }}>Blood Group: {s.blood_group}</p>}
                </div>
                {tenant?.businessPhone && (
                  <p style={{ margin: '4px 0 0', fontSize: 9, color: '#A32D2D', fontWeight: 600, borderTop: '1px solid #eee', paddingTop: 4 }}>
                    🚨 Emergency: {tenant.businessPhone}
                  </p>
                )}
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
          <input id="reports-query" name="reports-query"
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