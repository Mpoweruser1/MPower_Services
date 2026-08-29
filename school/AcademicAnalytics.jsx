// school/AcademicAnalytics.jsx — UPDATED
// Grounded in verified real-world practice: grade trajectories over
// time (not just current score) catch slow declines before they
// become failures — this is standard K-12 learning-analytics
// practice, not invented here.
//
// PDF and Excel export added alongside the existing CSV — see
// FeeAnalytics.jsx for the rationale.
import React, { useState, useEffect, useMemo } from 'react';
import TierGate from '../shared/TierGate';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import PrintHeader from '../shared/PrintHeader';
import { exportToExcel } from '../shared/exportExcel';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

function AcademicAnalyticsContent() {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState([]);
  const [exams, setExams] = useState([]);
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

    const { data: examRows } = await supabase
      .from('exams').select('id, exam_name, class_id, start_date')
      .eq('app_id', tenant.appId).order('start_date');
    setExams(examRows || []);

    const studentIds = (studentRows || []).map((s) => s.id);
    if (studentIds.length === 0) { setMarks([]); setLoading(false); return; }

    const { data: markRows } = await supabase
      .from('marks').select('student_id, exam_id, subject_id, percentage, pass_fail, subjects(subject_name)')
      .in('student_id', studentIds);
    setMarks(markRows || []);

    const { data: classRows } = await supabase.from('classes').select('id, class_name, class_order').eq('app_id', tenant.appId).order('class_order');
    setClasses(classRows || []);

    setLoading(false);
  }

  const perStudent = useMemo(() => {
    const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));
    const examMap = Object.fromEntries(exams.map((e) => [e.id, e]));
    const byStudent = {};
    marks.forEach((m) => {
      if (!byStudent[m.student_id]) byStudent[m.student_id] = [];
      byStudent[m.student_id].push(m);
    });

    return Object.entries(byStudent).map(([studentId, markList]) => {
      const sorted = markList
        .filter((m) => examMap[m.exam_id])
        .sort((a, b) => new Date(examMap[a.exam_id].start_date) - new Date(examMap[b.exam_id].start_date));

      const avgPct = sorted.length > 0 ? sorted.reduce((s, m) => s + Number(m.percentage || 0), 0) / sorted.length : 0;
      const latest = sorted[sorted.length - 1];
      const previous = sorted[sorted.length - 2];
      const trend = latest && previous ? Number(latest.percentage) - Number(previous.percentage) : null;
      const isDeclining = trend !== null && trend <= -10;

      return {
        studentId, student: studentMap[studentId],
        avgPct, examCount: sorted.length, trend, isDeclining,
        latestPct: latest ? Number(latest.percentage) : null,
      };
    });
  }, [marks, students, exams]);

  const decliningStudents = perStudent.filter((s) => s.isDeclining).sort((a, b) => a.trend - b.trend);

  const byClass = useMemo(() => {
    const map = {};
    perStudent.forEach((s) => {
      const classId = s.student?.class_id || 'unknown';
      if (!map[classId]) map[classId] = [];
      map[classId].push(s);
    });
    return map;
  }, [perStudent]);

  const bySubject = useMemo(() => {
    const map = {};
    marks.forEach((m) => {
      const name = m.subjects?.subject_name;
      if (!name || m.percentage == null) return;
      if (!map[name]) map[name] = { total: 0, count: 0 };
      map[name].total += Number(m.percentage);
      map[name].count += 1;
    });
    return Object.entries(map)
      .map(([subject, v]) => ({ subject, avg: Math.round(v.total / v.count), count: v.count }))
      .sort((a, b) => a.avg - b.avg);
  }, [marks]);

  const overallAvg = perStudent.length > 0
    ? Math.round(perStudent.reduce((s, x) => s + x.avgPct, 0) / perStudent.length)
    : 0;

  const exportHeaders = ['Student', 'SID', 'Class', 'Exams taken', 'Average %', 'Latest %', 'Trend', 'Declining'];
  const exportRows = perStudent.map((s) => [
    s.student?.full_name || '', s.student?.sid || '', s.student?.classes?.class_name || '',
    s.examCount, Math.round(s.avgPct), s.latestPct ?? '', s.trend !== null ? s.trend.toFixed(1) : '', s.isDeclining ? 'Yes' : 'No',
  ]);

  function exportCsv() {
    const rows = [exportHeaders, ...exportRows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `academic_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function exportExcelFile() {
    exportToExcel(`academic_analytics_${new Date().toISOString().slice(0, 10)}`, [
      { name: 'Academic Analytics', headers: exportHeaders, rows: exportRows },
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
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Academic Performance Analytics</h1>
        </div>
        <p className="no-print" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>Trend across exams, ordered chronologically &middot; declining = 10+ point drop between consecutive exams</p>

        <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#6AAA90' }}>{overallAvg}%</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>School average</p>
          </div>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#E05A5A' }}>{decliningStudents.length}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Declining trend</p>
          </div>
        </div>

        <div className="no-print" style={{ ...S.card, marginBottom: 16 }}>
          <button onClick={() => setShowPatterns(!showPatterns)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
              &#128293; Students At Risk {decliningStudents.length > 0 && <span style={{ color: '#E05A5A' }}>({decliningStudents.length})</span>}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{showPatterns ? '\u25b2 Hide' : '\u25bc Show'}</span>
          </button>

          {showPatterns && (
            <div style={{ marginTop: 14 }}>
              {decliningStudents.length === 0 ? (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No significant declines detected between the last two exams for anyone.</p>
              ) : (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#E05A5A', marginBottom: 8 }}>
                    &#128201; Score dropped 10+ points between consecutive exams
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {decliningStudents.slice(0, 6).map((s) => (
                      <div key={s.studentId} style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.15)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#fff' }}>{s.student?.full_name} &middot; {s.student?.classes?.class_name}</span>
                        <span style={{ fontSize: 12, color: '#E05A5A', fontWeight: 600 }}>{s.trend.toFixed(0)}pt &middot; now {s.latestPct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {bySubject.length > 0 && (
          <div className="no-print" style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>By subject &mdash; weakest first</p>
            {bySubject.map((s) => (
              <div key={s.subject} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: '#fff' }}>{s.subject}</span>
                  <span style={{ color: s.avg < 50 ? '#E05A5A' : 'rgba(255,255,255,0.5)' }}>{s.avg}% avg &middot; {s.count} results</span>
                </div>
                <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: s.avg < 50 ? '#E05A5A' : '#6AAA90', width: `${s.avg}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="no-print" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>By class</p>
        <div className="no-print">
        {classes.map((c) => {
          const classStudents = byClass[c.id] || [];
          const isExpanded = expandedClass === c.id;
          const classAvg = classStudents.length > 0
            ? Math.round(classStudents.reduce((s, x) => s + x.avgPct, 0) / classStudents.length)
            : 0;
          return (
            <div key={c.id} style={S.card}>
              <button onClick={() => setExpandedClass(isExpanded ? null : c.id)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, fontFamily: 'inherit' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{isExpanded ? '\u25bc' : '\u25b6'} {c.class_name}</span>
                <span style={{ fontSize: 13, color: classAvg >= 50 ? '#6AAA90' : '#E05A5A', fontWeight: 600 }}>{classAvg}%</span>
              </button>
              <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: classAvg >= 50 ? '#6AAA90' : '#E05A5A', width: `${classAvg}%` }} />
              </div>

              {isExpanded && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gap: 6 }}>
                  {classStudents.sort((a, b) => a.avgPct - b.avgPct).map((s) => (
                    <div key={s.studentId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                      <span style={{ color: '#fff' }}>{s.student?.full_name}{s.isDeclining ? ' \u26a0\ufe0f' : ''}</span>
                      <span style={{ color: s.avgPct < 40 ? '#E05A5A' : 'rgba(255,255,255,0.5)' }}>{Math.round(s.avgPct)}% avg ({s.examCount} exams)</span>
                    </div>
                  ))}
                  {classStudents.length === 0 && (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>No marks entered yet.</p>
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
          <PrintHeader documentTitle="Academic Performance Analytics" />
          <p style={{ fontSize: 12, marginBottom: 16 }}>School average: <strong>{overallAvg}%</strong> · Declining trend: <strong>{decliningStudents.length}</strong> students</p>
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
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.examCount}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{Math.round(s.avgPct)}%</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.latestPct ?? '—'}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.trend !== null ? s.trend.toFixed(1) : '—'}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.isDeclining ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
      <SchoolNav />
      <BugReporter screenName="academic_analytics" />
    </div>
  );
}

export default function AcademicAnalytics() {
  return (
    <TierGate requiredTier="advanced" featureName="Academic Analytics">
      <AcademicAnalyticsContent />
    </TierGate>
  );
}
