// school/AttendanceAnalytics.jsx — NEW
// Grounded in verified real-world standards, not invented: chronic
// absenteeism = missing 10%+ of enrolled days is the actual threshold
// used by California, Ohio, and Georgia state education departments
// and Attendance Works. Consecutive-absence flagging as an early
// warning signal (before a student reaches "chronic") is standard
// practice per multiple K-12 attendance-analytics vendors.
//
// Uses a rolling 90-day window rather than claiming "this academic
// year" — there's no academic_year boundary tracked on attendance
// records in this schema, so a precise year-to-date figure isn't
// something this can honestly compute yet.
//
// PDF and Excel export added alongside the existing CSV — see
// FeeAnalytics.jsx for the rationale (browser print-to-PDF via
// PrintHeader, real .xlsx via the shared exportToExcel helper).
import React, { useState, useEffect, useMemo } from 'react';
import TierGate from '../shared/TierGate';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import PrintHeader from '../shared/PrintHeader';
import { exportToExcel } from '../shared/exportExcel';
import BugReporter from '../shared/BugReporter';

const WINDOW_DAYS = 90;
const CHRONIC_THRESHOLD = 0.10; // verified real standard, not invented

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

function AttendanceAnalyticsContent() {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [classes, setClasses] = useState([]);
  const [expandedClass, setExpandedClass] = useState(null);
  const [showPatterns, setShowPatterns] = useState(false);

  useEffect(() => {
    if (tenant?.appId) loadData();
  }, [tenant?.appId]);

  async function loadData() {
    setLoading(true);
    const { data: studentRows } = await supabase
      .from('students').select('id, full_name, sid, class_id, classes(class_name)')
      .eq('app_id', tenant.appId).eq('status', 'active');
    setStudents(studentRows || []);

    const studentIds = (studentRows || []).map((s) => s.id);
    if (studentIds.length === 0) { setRecords([]); setLoading(false); return; }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);

    const { data: recordRows } = await supabase
      .from('attendance').select('student_id, date, status')
      .in('student_id', studentIds)
      .gte('date', cutoff.toISOString().slice(0, 10))
      .order('date', { ascending: false });
    setRecords(recordRows || []);

    const { data: classRows } = await supabase.from('classes').select('id, class_name, class_order').eq('app_id', tenant.appId).order('class_order');
    setClasses(classRows || []);

    setLoading(false);
  }

  const perStudent = useMemo(() => {
    const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));
    const byStudent = {};
    records.forEach((r) => {
      if (!byStudent[r.student_id]) byStudent[r.student_id] = [];
      byStudent[r.student_id].push(r);
    });

    return Object.entries(byStudent).map(([studentId, recs]) => {
      const sorted = recs.sort((a, b) => new Date(b.date) - new Date(a.date));
      const totalDays = sorted.length;
      const absentDays = sorted.filter((r) => r.status === 'A').length;
      const absentRate = totalDays > 0 ? absentDays / totalDays : 0;

      // Consecutive absence streak — count backward from the most
      // recent record while status stays 'A'.
      let streak = 0;
      for (const r of sorted) {
        if (r.status === 'A') streak++;
        else break;
      }

      return {
        studentId, student: studentMap[studentId],
        totalDays, absentDays, absentRate, streak,
        isChronic: absentRate >= CHRONIC_THRESHOLD && totalDays >= 10,
      };
    });
  }, [records, students]);

  const overallRate = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.status === 'P' || r.status === 'L').length;
    return total > 0 ? Math.round((present / total) * 100) : 0;
  }, [records]);

  const chronicStudents = perStudent.filter((s) => s.isChronic).sort((a, b) => b.absentRate - a.absentRate);
  const streakStudents = perStudent.filter((s) => s.streak >= 2).sort((a, b) => b.streak - a.streak);

  const dayOfWeekPattern = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    records.filter((r) => r.status === 'A').forEach((r) => {
      const day = new Date(r.date).getDay();
      counts[day]++;
    });
    const max = Math.max(...counts, 1);
    return DAY_NAMES.map((name, i) => ({ name, count: counts[i], pct: Math.round((counts[i] / max) * 100) }));
  }, [records]);

  const byClass = useMemo(() => {
    const map = {};
    perStudent.forEach((s) => {
      const classId = s.student?.class_id || 'unknown';
      if (!map[classId]) map[classId] = [];
      map[classId].push(s);
    });
    return map;
  }, [perStudent]);

  const exportHeaders = ['Student', 'SID', 'Class', 'Days tracked', 'Days absent', 'Absent rate', 'Current streak', 'Chronic'];
  const exportRows = perStudent.map((s) => [
    s.student?.full_name || '', s.student?.sid || '', s.student?.classes?.class_name || '',
    s.totalDays, s.absentDays, `${Math.round(s.absentRate * 100)}%`, s.streak, s.isChronic ? 'Yes' : 'No',
  ]);

  function exportCsv() {
    const rows = [exportHeaders, ...exportRows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function exportExcelFile() {
    exportToExcel(`attendance_analytics_${new Date().toISOString().slice(0, 10)}`, [
      { name: 'Attendance Analytics', headers: exportHeaders, rows: exportRows },
    ]);
  }

  if (loading) return <div style={{ ...S.page, textAlign: 'center', paddingTop: 60 }}><p style={{ color: 'rgba(255,255,255,0.3)' }}>Loading...</p></div>;

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print { .no-print { display: none !important; } }
      `}</style>
      <div style={S.inner}>

        <div className="no-print" style={{ marginBottom: 6 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Analytics</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Attendance Analytics</h1>
        </div>
        <p className="no-print" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>Last {WINDOW_DAYS} days &middot; chronic absence = missing 10%+ of tracked days</p>

        <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#6AAA90' }}>{overallRate}%</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Overall attendance</p>
          </div>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#E05A5A' }}>{chronicStudents.length}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Chronically absent</p>
          </div>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#E8A020' }}>{streakStudents.length}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>On absence streak</p>
          </div>
        </div>

        <div className="no-print" style={{ ...S.card, marginBottom: 16 }}>
          <button onClick={() => setShowPatterns(!showPatterns)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
              &#128293; Patterns & At-Risk Students {(chronicStudents.length + streakStudents.length) > 0 && <span style={{ color: '#E05A5A' }}>({chronicStudents.length + streakStudents.length})</span>}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{showPatterns ? '\u25b2 Hide' : '\u25bc Show'}</span>
          </button>

          {showPatterns && (
            <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
              {chronicStudents.length === 0 && streakStudents.length === 0 && (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Nothing concerning right now.</p>
              )}

              {streakStudents.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#E8A020', marginBottom: 8 }}>
                    &#9888;&#65039; Early warning — 2+ consecutive absences right now
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {streakStudents.slice(0, 6).map((s) => (
                      <div key={s.studentId} style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#fff' }}>{s.student?.full_name} &middot; {s.student?.classes?.class_name}</span>
                        <span style={{ fontSize: 12, color: '#E8A020', fontWeight: 600 }}>{s.streak} days straight</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {chronicStudents.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#E05A5A', marginBottom: 8 }}>
                    &#128169; Chronically absent — 10%+ of tracked days missed
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {chronicStudents.slice(0, 6).map((s) => (
                      <div key={s.studentId} style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.15)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#fff' }}>{s.student?.full_name} &middot; {s.student?.classes?.class_name}</span>
                        <span style={{ fontSize: 12, color: '#E05A5A', fontWeight: 600 }}>{s.absentDays}/{s.totalDays} days ({Math.round(s.absentRate * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Absences by day of week</p>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 60 }}>
                  {dayOfWeekPattern.map((d) => (
                    <div key={d.name} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ background: '#E05A5A', opacity: 0.6, height: `${Math.max(d.pct, 4)}%`, borderRadius: 3, marginBottom: 4 }} />
                      <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{d.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="no-print" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>By class</p>
        <div className="no-print">
        {classes.map((c) => {
          const classStudents = byClass[c.id] || [];
          const isExpanded = expandedClass === c.id;
          const totalAbsent = classStudents.reduce((s, x) => s + x.absentDays, 0);
          const totalDays = classStudents.reduce((s, x) => s + x.totalDays, 0);
          const rate = totalDays > 0 ? Math.round(((totalDays - totalAbsent) / totalDays) * 100) : 0;
          return (
            <div key={c.id} style={S.card}>
              <button onClick={() => setExpandedClass(isExpanded ? null : c.id)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, fontFamily: 'inherit' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{isExpanded ? '\u25bc' : '\u25b6'} {c.class_name}</span>
                <span style={{ fontSize: 13, color: rate >= 90 ? '#6AAA90' : '#E8A020', fontWeight: 600 }}>{rate}%</span>
              </button>
              <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: rate >= 90 ? '#6AAA90' : '#E8A020', width: `${rate}%` }} />
              </div>

              {isExpanded && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gap: 6 }}>
                  {classStudents.sort((a, b) => b.absentRate - a.absentRate).map((s) => (
                    <div key={s.studentId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                      <span style={{ color: '#fff' }}>{s.student?.full_name}{s.streak >= 2 ? ' \u26a0\ufe0f' : ''}</span>
                      <span style={{ color: s.isChronic ? '#E05A5A' : 'rgba(255,255,255,0.5)' }}>{s.absentDays}/{s.totalDays} absent</span>
                    </div>
                  ))}
                  {classStudents.length === 0 && (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>No attendance tracked yet.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        </div>

        <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          <button onClick={() => window.print()}
            style={{ padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            🖨️ PDF
          </button>
          <button onClick={exportExcelFile}
            style={{ padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            📊 Excel
          </button>
          <button onClick={exportCsv}
            style={{ padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            &#128229; CSV
          </button>
        </div>

        {/* Print-only formatted table */}
        <div className="print-only" style={{ display: 'none', background: '#fff', color: '#000', padding: '32px 40px' }}>
          <PrintHeader documentTitle="Attendance Analytics" />
          <p style={{ fontSize: 12, marginBottom: 16 }}>Last {WINDOW_DAYS} days · Overall attendance: <strong>{overallRate}%</strong> · Chronically absent: <strong>{chronicStudents.length}</strong></p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>{exportHeaders.map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #000' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {perStudent.map((s) => (
                <tr key={s.studentId}>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.student?.full_name}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.student?.sid}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.student?.classes?.class_name}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.totalDays}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.absentDays}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{Math.round(s.absentRate * 100)}%</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.streak}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.isChronic ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
      <SchoolNav />
      <BugReporter screenName="attendance_analytics" />
    </div>
  );
}

export default function AttendanceAnalytics() {
  return (
    <TierGate requiredTier="advanced" featureName="Attendance Analytics">
      <AttendanceAnalyticsContent />
    </TierGate>
  );
}
