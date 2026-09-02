// school/MarksEntry.jsx — NEW
// Grading scale verified real against actual board sources — the A1
// through C2 bands (91-100 down to 41-50) are identical between AP/TS
// State Board and CBSE, but the D/E boundary genuinely differs:
// State Board (AP SSC / TS SSC): D is 35-40, E/fail is below 35.
// CBSE: D is 33-40, E/fail is below 33.
// A student scoring 33-34% is D/pass under CBSE but E/fail under
// State Board — board-aware, not a single hardcoded threshold.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

function gradeFor(pct, boardType = 'state_board') {
  const passThreshold = boardType === 'cbse' ? 33 : 35;
  if (pct >= 91) return 'A1';
  if (pct >= 81) return 'A2';
  if (pct >= 71) return 'B1';
  if (pct >= 61) return 'B2';
  if (pct >= 51) return 'C1';
  if (pct >= 41) return 'C2';
  if (pct >= passThreshold) return 'D';
  return 'E';
}

function passThresholdFor(boardType = 'state_board') {
  return boardType === 'cbse' ? 33 : 35;
}
const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  input: { padding: '8px 10px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#fff', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit', width: '100%' },
  select: { padding: '9px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', width: '100%' },
};

export default function MarksEntry() {
  const { tenant } = useTenant();
  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [marks, setMarks] = useState({});
  const [showNewExam, setShowNewExam] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [newExam, setNewExam] = useState({
    exam_name: '', exam_type: 'Term 1', academic_year: `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}`,
    class_id: '', start_date: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    if (tenant?.appId) { loadExams(); loadClasses(); loadSubjects(); }
  }, [tenant?.appId]);

  useEffect(() => {
    if (selectedExam && selectedSubject) loadStudentsAndMarks();
  }, [selectedExam, selectedSubject]);

  async function loadExams() {
    const { data } = await supabase.from('exams').select('id, exam_name, exam_type, academic_year, class_id, classes(class_name)').eq('app_id', tenant.appId).order('start_date', { ascending: false });
    setExams(data || []);
    if (data?.length > 0) setSelectedExam(data[0].id);
  }
  async function loadClasses() {
    const { data } = await supabase.from('classes').select('id, class_name').eq('app_id', tenant.appId).order('class_order');
    setClasses(data || []);
    if (data?.length > 0) setNewExam((f) => ({ ...f, class_id: data[0].id }));
  }
  async function loadSubjects() {
    const { data } = await supabase.from('subjects').select('id, subject_name').eq('app_id', tenant.appId).order('subject_name');
    setSubjects(data || []);
    if (data?.length > 0) setSelectedSubject(data[0].id);
  }

  async function createExam() {
    if (!newExam.exam_name.trim() || !newExam.class_id) { setMessage('Exam name and class are required.'); return; }
    setSaving(true);
    const { error } = await supabase.from('exams').insert({
      app_id: tenant.appId, exam_name: newExam.exam_name.trim(), exam_type: newExam.exam_type,
      academic_year: newExam.academic_year, class_id: newExam.class_id, start_date: newExam.start_date,
    });
    setSaving(false);
    if (error) { setMessage('Failed to create exam.'); return; }
    setShowNewExam(false);
    setMessage('✅ Exam created');
    loadExams();
  }

  async function loadStudentsAndMarks() {
    const exam = exams.find((e) => e.id === selectedExam);
    if (!exam) return;
    const { data: studentData } = await supabase
      .from('students').select('id, full_name, sid').eq('app_id', tenant.appId)
      .eq('class_id', exam.class_id).eq('status', 'active').order('full_name');
    setStudents(studentData || []);

    const { data: existingMarks } = await supabase
      .from('marks').select('student_id, theory_marks, internal_marks')
      .eq('exam_id', selectedExam).eq('subject_id', selectedSubject);
    const marksMap = {};
    (existingMarks || []).forEach((m) => { marksMap[m.student_id] = { theory: m.theory_marks ?? '', internal: m.internal_marks ?? '' }; });
    (studentData || []).forEach((s) => { if (!marksMap[s.id]) marksMap[s.id] = { theory: '', internal: '' }; });
    setMarks(marksMap);
  }

  function updateMark(studentId, field, value) {
    setMarks((m) => ({ ...m, [studentId]: { ...m[studentId], [field]: value.replace(/[^0-9]/g, '') } }));
  }

  async function saveAll() {
    setSaving(true);
    setMessage('');
    const rows = students
      .filter((s) => marks[s.id]?.theory !== '' || marks[s.id]?.internal !== '')
      .map((s) => {
        const theory = Number(marks[s.id]?.theory || 0);
        const internal = Number(marks[s.id]?.internal || 0);
        const total = theory + internal;
        const percentage = total; // out of 100 (theory+internal assumed to sum to 100)
        const grade = gradeFor(percentage, tenant.boardType);
        return {
          exam_id: selectedExam, subject_id: selectedSubject, student_id: s.id,
          theory_marks: theory, internal_marks: internal, total, percentage, grade,
          pass_fail: percentage >= passThresholdFor(tenant.boardType) ? 'Pass' : 'Fail', entered_by: tenant.userRowId,
        };
      });

    if (rows.length === 0) { setMessage('No marks entered yet.'); setSaving(false); return; }

    const { error } = await supabase.from('marks').upsert(rows, { onConflict: 'exam_id,subject_id,student_id' });
    setSaving(false);
    if (error) { setMessage('Failed to save marks. Please try again.'); return; }
    setMessage(`✅ Saved marks for ${rows.length} students`);
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Academics</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Marks Entry</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
            Grading as {tenant.boardType === 'cbse' ? 'CBSE' : 'State Board (AP/TS SSC)'} \u2014 pass mark {passThresholdFor(tenant.boardType)}%
          </p>
        </div>

        {message && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>
            {message}
          </div>
        )}

        {exams.length === 0 && !showNewExam && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#E8A020' }}>No exams set up yet.</p>
            <button onClick={() => setShowNewExam(true)}
              style={{ padding: '8px 16px', border: 'none', borderRadius: 7, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
              + Create your first exam
            </button>
          </div>
        )}

        {!showNewExam && exams.length > 0 && (
          <button onClick={() => setShowNewExam(true)}
            style={{ marginBottom: 14, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            + New exam
          </button>
        )}

        {showNewExam && (
          <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
            <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>Create exam</p>
            <div style={{ marginBottom: 10 }}>
              <label htmlFor="exam-name" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Exam name</label>
              <input id="exam-name" name="exam-name" value={newExam.exam_name} onChange={(e) => setNewExam((f) => ({ ...f, exam_name: e.target.value }))} placeholder="e.g. Term 1 Examination" style={S.input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label htmlFor="exam-class" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Class</label>
                <select id="exam-class" name="exam-class" value={newExam.class_id} onChange={(e) => setNewExam((f) => ({ ...f, class_id: e.target.value }))} style={S.select}>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="exam-date" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Date</label>
                <input id="exam-date" name="exam-date" type="date" value={newExam.start_date} onChange={(e) => setNewExam((f) => ({ ...f, start_date: e.target.value }))} style={S.input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowNewExam(false)} style={{ flex: 1, padding: 9, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={createExam} disabled={saving} style={{ flex: 2, padding: 9, border: 'none', borderRadius: 7, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                {saving ? 'Creating...' : 'Create exam'}
              </button>
            </div>
          </div>
        )}

        {exams.length > 0 && !showNewExam && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label htmlFor="marks-exam-select" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Exam</label>
                <select id="marks-exam-select" name="marks-exam-select" value={selectedExam} onChange={(e) => setSelectedExam(e.target.value)} style={S.select}>
                  {exams.map((e) => <option key={e.id} value={e.id}>{e.exam_name} · {e.classes?.class_name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="marks-subject-select" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Subject</label>
                <select id="marks-subject-select" name="marks-subject-select" value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} style={S.select}>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
                </select>
              </div>
            </div>

            {students.length > 0 && (
              <div style={S.card}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <td style={{ padding: '6px 4px' }}>Student</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>Theory</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>Internal</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>Total</td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>Grade</td>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const m = marks[s.id] || { theory: '', internal: '' };
                      const total = Number(m.theory || 0) + Number(m.internal || 0);
                      return (
                        <tr key={s.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '8px 4px', color: '#fff' }}>{s.full_name}</td>
                          <td style={{ padding: '6px 4px', width: 60 }}><input id={`marks-theory-${s.id}`} name={`marks-theory-${s.id}`} aria-label={`Theory marks for ${s.full_name}`} value={m.theory} onChange={(e) => updateMark(s.id, 'theory', e.target.value)} style={{ ...S.input, textAlign: 'center', padding: '6px 4px' }} /></td>
                          <td style={{ padding: '6px 4px', width: 60 }}><input id={`marks-internal-${s.id}`} name={`marks-internal-${s.id}`} aria-label={`Internal marks for ${s.full_name}`} value={m.internal} onChange={(e) => updateMark(s.id, 'internal', e.target.value)} style={{ ...S.input, textAlign: 'center', padding: '6px 4px' }} /></td>
                          <td style={{ padding: '6px 4px', textAlign: 'center', color: '#5A9ADF', fontWeight: 600 }}>{total || '—'}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'center', color: total >= passThresholdFor(tenant.boardType) ? '#6AAA90' : '#E05A5A', fontWeight: 600 }}>{total ? gradeFor(total, tenant.boardType) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button onClick={saveAll} disabled={saving}
                  style={{ width: '100%', marginTop: 16, padding: 12, border: 'none', borderRadius: 8, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                  {saving ? 'Saving...' : `✓ Save marks (${students.length} students)`}
                </button>
              </div>
            )}
          </>
        )}

      </div>
      <SchoolNav />
      <BugReporter screenName="marks_entry" />
    </div>
  );
}
