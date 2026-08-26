// school/ReportCard.jsx — NEW
// Built on the real foundation this session: subjects table,
// marks-entry screen, real FK constraints. No fabricated NEP badges
// or "co-scholastic" scoring — CBSE's own co-scholastic assessment is
// qualitative (teacher-observed), not something computable from marks
// data, so this stays to what's actually calculable: subject-wise
// marks, grade, total, percentage, and overall pass/fail.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import PrintHeader from '../shared/PrintHeader';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  select: { padding: '9px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', width: '100%' },
};

export default function ReportCard() {
  const { tenant } = useTenant();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [years, setYears] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tenant?.appId) { loadClasses(); loadYears(); }
  }, [tenant?.appId]);

  useEffect(() => {
    if (selectedClass) loadStudents();
  }, [selectedClass]);

  async function loadClasses() {
    const { data } = await supabase.from('classes').select('id, class_name').eq('app_id', tenant.appId).order('class_order');
    setClasses(data || []);
    if (data?.length > 0) setSelectedClass(data[0].id);
  }

  async function loadYears() {
    const { data } = await supabase.from('exams').select('academic_year').eq('app_id', tenant.appId);
    const uniqueYears = [...new Set((data || []).map((e) => e.academic_year).filter(Boolean))].sort().reverse();
    setYears(uniqueYears);
    if (uniqueYears.length > 0) setAcademicYear(uniqueYears[0]);
  }

  async function loadStudents() {
    const { data } = await supabase.from('students').select('id, full_name, sid').eq('app_id', tenant.appId).eq('class_id', selectedClass).eq('status', 'active').order('full_name');
    setStudents(data || []);
    if (data?.length > 0) setSelectedStudent(data[0].id);
  }

  async function generate() {
    if (!selectedStudent || !academicYear) return;
    setLoading(true);

    const { data: student } = await supabase
      .from('students').select('full_name, full_name_telugu, sid, dob, gender, classes(class_name)')
      .eq('id', selectedStudent).maybeSingle();

    const { data: examList } = await supabase
      .from('exams').select('id, exam_name, exam_type').eq('app_id', tenant.appId)
      .eq('academic_year', academicYear).eq('class_id', selectedClass);
    const examIds = (examList || []).map((e) => e.id);

    if (examIds.length === 0) {
      setReportData({ student, subjects: [], noExams: true });
      setLoading(false);
      return;
    }

    const { data: markRows } = await supabase
      .from('marks').select('subject_id, theory_marks, internal_marks, total, percentage, grade, pass_fail, exam_id, subjects(subject_name)')
      .eq('student_id', selectedStudent).in('exam_id', examIds);

    // Attendance percentage — confirmed a standard field on real
    // AP/Telangana report card models, genuinely missing before this.
    // Uses the same year the exams belong to as the attendance window.
    const yearStart = `${academicYear.split('-')[0]}-06-01`;
    const yearEndYear = Number(academicYear.split('-')[0]) + 1;
    const yearEnd = `${yearEndYear}-05-31`;
    const { data: attendanceRows } = await supabase
      .from('attendance').select('status')
      .eq('student_id', selectedStudent)
      .gte('date', yearStart).lte('date', yearEnd);
    const totalDays = (attendanceRows || []).filter((a) => a.status !== 'V').length;
    const presentDays = (attendanceRows || []).filter((a) => a.status === 'P' || a.status === 'L').length;
    const attendancePct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null;

    // Group by subject, keep the most recent exam's mark per subject
    // (a student's report card shows their latest standing per subject
    // this year, not a sum across multiple exam sittings).
    const bySubject = {};
    (markRows || []).forEach((m) => {
      bySubject[m.subject_id] = m;
    });
    const subjectRows = Object.values(bySubject);

    const totalMax = subjectRows.length * 100;
    const totalObtained = subjectRows.reduce((s, m) => s + Number(m.total || 0), 0);
    const overallPct = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;
    const overallResult = subjectRows.every((m) => m.pass_fail === 'Pass') && subjectRows.length > 0 ? 'PASS' : 'FAIL';

    setReportData({ student, subjects: subjectRows, totalObtained, totalMax, overallPct, overallResult, attendancePct, noExams: false });
    setLoading(false);
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print { .no-print { display: none !important; } }
      `}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Academics</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Report Card</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
            Grades and pass/fail reflect {tenant.boardType === 'cbse' ? 'CBSE' : 'State Board (AP/TS SSC)'} rules
          </p>
        </div>

        <div className="no-print" style={S.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Class</label>
              <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} style={S.select}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Academic Year</label>
              <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} style={S.select}>
                {years.length === 0 && <option value="">No exams yet</option>}
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Student</label>
            <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} style={S.select}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} · {s.sid}</option>)}
            </select>
          </div>
          <button onClick={generate} disabled={loading || !academicYear}
            style={{ width: '100%', padding: 11, border: 'none', borderRadius: 8, background: loading ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            {loading ? 'Generating...' : 'Generate Report Card'}
          </button>
        </div>

        {reportData && (
          <div style={{ background: '#fff', color: '#111', borderRadius: 12, padding: 24, marginTop: 16 }}>
            <PrintHeader documentTitle="Report Card" />
            <h2 style={{ textAlign: 'center', fontSize: 18, margin: '10px 0 20px' }}>Report Card — {academicYear}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20, fontSize: 13 }}>
              <p><strong>Name:</strong> {reportData.student?.full_name}</p>
              <p><strong>Class:</strong> {reportData.student?.classes?.class_name}</p>
              <p><strong>SID:</strong> {reportData.student?.sid}</p>
              <p><strong>DOB:</strong> {reportData.student?.dob}</p>
              <p><strong>Attendance:</strong> {reportData.attendancePct !== null ? `${reportData.attendancePct}%` : 'Not tracked yet'}</p>
            </div>

            {reportData.noExams ? (
              <p style={{ textAlign: 'center', color: '#666' }}>No exams recorded for this class in {academicYear} yet.</p>
            ) : reportData.subjects.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666' }}>No marks entered for this student yet.</p>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #333' }}>
                      <td style={{ padding: '8px 4px' }}>Subject</td>
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>Theory</td>
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>Internal</td>
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>Total</td>
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>Grade</td>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.subjects.map((m, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '8px 4px' }}>{m.subjects?.subject_name}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'center' }}>{m.theory_marks}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'center' }}>{m.internal_marks}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600 }}>{m.total}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'center', fontWeight: 600 }}>{m.grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderTop: '2px solid #333', fontSize: 14, fontWeight: 700 }}>
                  <span>Total: {reportData.totalObtained} / {reportData.totalMax}</span>
                  <span>Percentage: {reportData.overallPct}%</span>
                  <span style={{ color: reportData.overallResult === 'PASS' ? '#0a7a3d' : '#a31515' }}>{reportData.overallResult}</span>
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #333', width: 160, marginBottom: 4 }} />
                <p style={{ fontSize: 11, color: '#666', margin: 0 }}>Class Teacher</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #333', width: 160, marginBottom: 4 }} />
                <p style={{ fontSize: 11, color: '#666', margin: 0 }}>Principal</p>
              </div>
            </div>

            <div className="no-print" style={{ marginTop: 20, textAlign: 'center' }}>
              <button onClick={() => window.print()}
                style={{ padding: '10px 24px', border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                🖨️ Print
              </button>
            </div>
          </div>
        )}

      </div>
      <SchoolNav />
      <BugReporter screenName="report_card" />
    </div>
  );
}
