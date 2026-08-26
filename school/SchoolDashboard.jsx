// school/Dashboard.jsx — FINAL (Supabase wired + Settings section)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import { FeedbackWidget } from '../shared/FeedbackWidget';
import BugReporter from '../shared/BugReporter';

// ─────────────────────────────────────────────────────────────
// Shared UI components
// ─────────────────────────────────────────────────────────────
function Counter({ label, value, color = '#E8A020', alert = false, loading = false }) {
  return (
    <div style={{ background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: `1px solid ${alert ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
      {loading
        ? <div style={{ height: 26, background: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 6 }} />
        : <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: alert ? '#E05A5A' : color }}>{value}</p>
      }
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{label}</p>
    </div>
  );
}

function SimpleBarChart({ data }) {
  const max = Math.max(...data.map((d) => d.pct), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
      {data.map((d) => (
        <div key={d.day} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ height: `${(d.pct / max) * 60}px`, background: '#E8A020', borderRadius: '3px 3px 0 0', marginBottom: 4 }} />
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{d.day}</p>
          <p style={{ fontSize: 10, color: '#fff', margin: 0, fontWeight: 500 }}>{d.pct}%</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Data fetchers
// ─────────────────────────────────────────────────────────────
async function fetchTodayAttendance(appId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: students } = await supabase
    .from('students').select('id').eq('app_id', appId).eq('status', 'active');
  const ids = (students || []).map((s) => s.id);
  if (ids.length === 0) return { pct: 0, present: 0, total: 0 };
  const { data: marks } = await supabase
    .from('attendance').select('status').eq('date', today).in('student_id', ids);
  const present = (marks || []).filter((m) => m.status === 'P' || m.status === 'L').length;
  return { pct: ids.length > 0 ? Math.round((present / ids.length) * 100) : 0, present, total: ids.length };
}

async function fetchFeeCollectedToday(appId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('fee_payments')
    .select('amount, fee_dues(student_id, students(app_id))')
    .gte('paid_at', today + 'T00:00:00')
    .lte('paid_at', today + 'T23:59:59');
  return (data || [])
    .filter((p) => p.fee_dues?.students?.app_id === appId)
    .reduce((s, p) => s + Number(p.amount || 0), 0);
}

async function fetchFeeDefaultersCount(appId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('fee_dues')
    .select('id, amount_due, amount_paid, students(app_id)')
    .lt('due_date', today);
  return (data || []).filter((d) =>
    d.students?.app_id === appId && Number(d.amount_due) > Number(d.amount_paid)
  ).length;
}


// With this simpler version:
async function fetchLowAttendanceCount(appId) {
  try {
    const { data: students } = await supabase
      .from('students')
      .select('id')
      .eq('app_id', appId)
      .eq('status', 'active')
      .limit(200);

    if (!students || students.length === 0) return 0;

    const yearStart = `${new Date().getFullYear()}-06-01`;
    const ids = students.map((s) => s.id);

    // Get all attendance in one query
    const { data: allAtt } = await supabase
      .from('attendance')
      .select('student_id, status')
      .in('student_id', ids)
      .gte('date', yearStart);

    if (!allAtt || allAtt.length === 0) return 0;

    // Group by student
    const map = {};
    allAtt.forEach((a) => {
      if (!map[a.student_id]) map[a.student_id] = { total: 0, present: 0 };
      map[a.student_id].total++;
      if (a.status === 'P') map[a.student_id].present++;
    });

    // Count students below 75%
    return Object.values(map).filter((s) =>
      s.total > 10 && Math.round((s.present / s.total) * 100) < 75
    ).length;
  } catch {
    return 0;
  }
}
async function fetchWeeklyAttendanceTrend(appId) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const results = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0) continue;
    const dateStr = d.toISOString().slice(0, 10);
    const { data: students } = await supabase.from('students').select('id').eq('app_id', appId).eq('status', 'active');
    const ids = (students || []).map((s) => s.id);
    if (ids.length === 0) continue;
    const { data: marks } = await supabase.from('attendance').select('status').eq('date', dateStr).in('student_id', ids);
    const present = (marks || []).filter((m) => m.status === 'P').length;
    const pct = ids.length > 0 ? Math.round((present / ids.length) * 100) : 0;
    results.push({ day: days[d.getDay() - 1] || dateStr.slice(5), pct });
  }
  return results;
}

async function fetchStudentParentData(studentId) {
  if (!studentId) return null;
  const { data: s } = await supabase.from('students')
    .select('full_name, classes(class_name), section, fee_dues(amount_due, amount_paid, due_date), marks(percentage, exams(exam_name))')
    .eq('id', studentId).single();
  if (!s) return null;
  const yearStart = `${new Date().getFullYear()}-06-01`;
  const { count: total }   = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', studentId).gte('date', yearStart);
  const { count: present } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('status', 'P').gte('date', yearStart);
  const due = (s.fee_dues || []).reduce((sum, d) => sum + Math.max(0, Number(d.amount_due) - Number(d.amount_paid)), 0);
  return {
    name:           s.full_name,
    className:      s.classes?.class_name || '—',
    section:        s.section || '',
    attendanceTotal: total || 0,
    attendancePresent: present || 0,
    attendancePct:  total > 0 ? Math.round(((present || 0) / total) * 100) : 0,
    feeDue:         due,
    latestPct:      s.marks?.[0]?.percentage || null,
    latestExam:     s.marks?.[0]?.exams?.exam_name || null,
  };
}

// ─────────────────────────────────────────────────────────────
// Dashboard variants
// ─────────────────────────────────────────────────────────────
function PrincipalDashboard({ appId, branchId, tier }) {
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [attendance, feeToday, defaulters, lowAtt] = await Promise.all([
        fetchTodayAttendance(appId),
        fetchFeeCollectedToday(appId),
        fetchFeeDefaultersCount(appId),
        fetchLowAttendanceCount(appId),
      ]);
      setStats({ attendance, feeToday, defaulters, lowAtt });

      if (tier !== 'basic') {
        const w = await fetchWeeklyAttendanceTrend(appId);
        setTrend(w);
      }
      setLoading(false);
    }
    if (appId) load();
  }, [appId]);

  return (
    <>
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <Counter label="Attendance today"     value={loading ? '—' : `${stats?.attendance?.pct ?? 0}%`} loading={loading} />
        <Counter label="Fee collected today"  value={loading ? '—' : `₹${(stats?.feeToday || 0).toLocaleString('en-IN')}`} color="#6AAA90" loading={loading} />
        <Counter label="Fee defaulters"       value={loading ? '—' : stats?.defaulters ?? 0} color="#E05A5A" alert={(stats?.defaulters || 0) > 0} loading={loading} />
        <Counter label="Low attendance"       value={loading ? '—' : stats?.lowAtt ?? 0} color="#E8A020" alert={(stats?.lowAtt || 0) > 0} loading={loading} />
      </div>

      {/* Trend chart */}
      {tier !== 'basic' && trend.length > 0 && (
        <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 12 }}>Attendance — this week</p>
          <SimpleBarChart data={trend} />
        </div>
      )}
      {tier === 'basic' && (
        <div style={{ background: 'rgba(232,160,32,0.05)', border: '1px solid rgba(232,160,32,0.1)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#E8A020' }}>
          📈 Attendance trend charts available on Standard tier and above.
        </div>
      )}
    </>
  );
}

function TeacherDashboard({ appId, classId, sectionId }) {
  const [pct, setPct]                   = useState(null);
  const [pendingMarks, setPendingMarks] = useState(0);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const { data: students } = await supabase.from('students').select('id')
        .eq('app_id', appId).eq('class_id', classId).eq('status', 'active');
      const ids = (students || []).map((s) => s.id);
      const { data: marks } = await supabase.from('attendance').select('status').eq('date', today).in('student_id', ids);
      const present = (marks || []).filter((m) => m.status === 'P' || m.status === 'L').length;
      setPct(ids.length > 0 ? Math.round((present / ids.length) * 100) : null);
      setLoading(false);
    }
    if (appId && classId) load();
    else setLoading(false);
  }, [appId, classId]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <Counter label="My class today" value={loading ? '—' : pct !== null ? `${pct}%` : 'No data'} loading={loading} />
      <Counter label="Marks pending"  value={loading ? '—' : pendingMarks} loading={loading} />
    </div>
  );
}

function ClerkDashboard({ appId }) {
  const [feeToday, setFeeToday]       = useState(null);
  const [defaulters, setDefaulters]   = useState(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    async function load() {
      const [fee, def] = await Promise.all([
        fetchFeeCollectedToday(appId),
        fetchFeeDefaultersCount(appId),
      ]);
      setFeeToday(fee);
      setDefaulters(def);
      setLoading(false);
    }
    if (appId) load();
  }, [appId]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <Counter label="Fee collected today" value={loading ? '—' : `₹${(feeToday || 0).toLocaleString('en-IN')}`} color="#6AAA90" loading={loading} />
      <Counter label="Fee defaulters"      value={loading ? '—' : defaulters ?? 0} color="#E05A5A" alert={(defaulters || 0) > 0} loading={loading} />
    </div>
  );
}

function ParentPortal({ studentId }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const d = await fetchStudentParentData(studentId);
      setData(d);
      setLoading(false);
    }
    if (studentId) load();
    else setLoading(false);
  }, [studentId]);

  if (loading) return <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading...</p>;
  if (!data)   return <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No student linked to this account.</p>;

  return (
    <div>
      <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{data.name}</p>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          {data.className}{data.section ? `-${data.section}` : ''}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <Counter
          label="Attendance"
          value={`${data.attendancePct}%`}
          color={data.attendancePct < 75 ? '#E05A5A' : '#6AAA90'}
          alert={data.attendancePct < 75}
        />
        <Counter label="Days present" value={`${data.attendancePresent}/${data.attendanceTotal}`} />
        <Counter label="Fee due" value={`₹${data.feeDue.toLocaleString('en-IN')}`} color="#E8A020" alert={data.feeDue > 0} />
        {data.latestPct !== null && <Counter label={data.latestExam || 'Latest exam'} value={`${data.latestPct}%`} />}
      </div>

      {data.attendancePct < 75 && (
        <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#E05A5A' }}>
          ⚠️ Attendance below 75% — may affect Talliki Vandanam and welfare scheme eligibility.
        </div>
      )}

      {data.feeDue > 0 && (
        <Link to="/school/fee-collection"
          style={{ display: 'block', width: '100%', padding: 12, background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
          Pay ₹{data.feeDue.toLocaleString('en-IN')} now
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Settings section — principal only
// ─────────────────────────────────────────────────────────────
function SettingsSection() {
  const SETTINGS_LINKS = [
    { label: 'Manage Classes',        path: '/school/classes',       icon: '🏫', desc: 'Add / edit class list' },
    { label: 'Correction Requests',   path: '/corrections',          icon: '✏️', desc: 'Approve data corrections' },
    { label: 'Manage Staff Access',   path: '/control/access',       icon: '🔐', desc: 'Add staff, assign roles' },
    { label: 'Modification Request',  path: '/control/modifications',icon: '📋', desc: 'Request a new feature' },
  ];

  return (
    <div style={{ marginTop: 24 }}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
        ⚙️ Settings & Administration
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {SETTINGS_LINKS.map((item) => (
          <Link key={item.path} to={item.path}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '13px 14px', background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, textDecoration: 'none' }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#fff' }}>{item.label}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────
export default function Dashboard({ classId, sectionId, studentId }) {
  const { tenant } = useTenant();
  const [showFeedback, setShowFeedback] = useState(false);

  if (!tenant) return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: '#1C1C1E', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading...</p>
    </div>
  );

  const role = tenant.role;

  const S = {
    page:  { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
    inner: { maxWidth: 640, margin: '0 auto', padding: '24px 20px' },
  };

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <div style={S.inner}>
        {/* Header */}
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: '0 0 4px' }}>
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: '0 0 2px', letterSpacing: -0.5 }}>
              {tenant.orgName || 'School Dashboard'}
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0, textTransform: 'capitalize' }}>
              {role} · {tenant.fullName}
            </p>
          </div>
          <button onClick={() => setShowFeedback(true)} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
            💬 Feedback
          </button>
        </div>

        {/* Role based dashboard */}
        {role === 'principal' && (
          <PrincipalDashboard
            appId={tenant.appId}
            branchId={tenant.branchId}
            tier={tenant.tier}
          />
        )}
        {role === 'teacher' && (
          <TeacherDashboard
            appId={tenant.appId}
            classId={classId}
            sectionId={sectionId}
          />
        )}
        {(role === 'clerk' || role === 'fee_clerk') && (
          <ClerkDashboard appId={tenant.appId} />
        )}
        {role === 'parent' && (
          <ParentPortal studentId={studentId} />
        )}

        {/* Quick actions */}
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
            Quick actions
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              { to: '/school/admission',    icon: '👤', label: 'Admit student' },
              { to: '/school/attendance',   icon: '✅', label: 'Attendance' },
              { to: '/school/fee-collection',icon: '💰', label: 'Collect fee' },
              { to: '/school/tc',           icon: '📄', label: 'Issue TC' },
              { to: '/school/certificates', icon: '🎓', label: 'Certificate' },
              { to: '/school/reports',      icon: '🔍', label: 'Reports' },
            ].map((item) => (
              <Link key={item.to} to={item.to}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px', background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, textDecoration: 'none' }}>
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <span style={{ fontSize: 11, color: '#fff', fontWeight: 500, textAlign: 'center', lineHeight: 1.3 }}>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Settings — principal only */}
        {role === 'principal' && <SettingsSection />}
      </div>

      {showFeedback && (
        <FeedbackWidget
          appId={tenant.appId}
          userId={tenant.userRowId}
          context="school_dashboard"
          onClose={() => setShowFeedback(false)}
        />
      )}

      <SchoolNav />
      <BugReporter screenName="school_dashboard" />
    </div>
  );
}