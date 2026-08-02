// school/Attendance.jsx — FINAL
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import PrintHeader from '../shared/PrintHeader';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';
import { logActivity } from '../shared/logActivity';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 640, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  select: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
};

const STATUS_CONFIG = {
  P: { label: 'Present', labelTe: 'హాజరు',    color: '#6AAA90', bg: 'rgba(106,170,144,0.15)', border: 'rgba(106,170,144,0.3)' },
  A: { label: 'Absent',  labelTe: 'గైర్హాజరు', color: '#E05A5A', bg: 'rgba(224,90,90,0.15)',   border: 'rgba(224,90,90,0.3)' },
  L: { label: 'Late',    labelTe: 'ఆలస్యం',    color: '#E8A020', bg: 'rgba(232,160,32,0.15)',  border: 'rgba(232,160,32,0.3)' },
  V: { label: 'Holiday', labelTe: 'సెలవు',     color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)' },
};

export default function Attendance() {
  const { tenant } = useTenant();
  const [classes, setClasses]           = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [sections, setSections]         = useState([]);
  const [students, setStudents]         = useState([]);
  const [attendance, setAttendance]     = useState({});
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  useEffect(() => {
    if (tenant?.appId) loadClasses();
  }, [tenant?.appId]);

  useEffect(() => {
    if (selectedClass) loadSections();
  }, [selectedClass]);

  useEffect(() => {
    if (selectedClass && selectedSection) loadStudents();
  }, [selectedClass, selectedSection, attendanceDate]);

  async function loadClasses() {
    const { data } = await supabase
      .from('classes').select('id, class_name, class_order')
      .eq('app_id', tenant.appId).order('class_order');
    setClasses(data || []);
    if (data?.length > 0) setSelectedClass(data[0].id);
  }

  async function loadSections() {
    const { data } = await supabase
      .from('students').select('section')
      .eq('app_id', tenant.appId).eq('class_id', selectedClass).eq('status', 'active');
    const unique = [...new Set((data || []).map((s) => s.section).filter(Boolean))].sort();
    const combined = [...new Set([...unique, 'A', 'B', 'C'])].sort();
    setSections(combined);
    if (combined.length > 0) setSelectedSection(combined[0]);
  }

  async function loadStudents() {
    setLoading(true);

    const { data: studentData } = await supabase
      .from('students').select('id, full_name, sid, student_type')
      .eq('app_id', tenant.appId).eq('class_id', selectedClass)
      .eq('section', selectedSection).eq('status', 'active')
      .order('full_name');

    setStudents(studentData || []);

    // Load existing attendance for this date
    if (studentData?.length > 0) {
      const { data: attData } = await supabase
        .from('attendance').select('student_id, status')
        .eq('date', attendanceDate)
        .in('student_id', studentData.map((s) => s.id));

      const attMap = {};
      (attData || []).forEach((a) => { attMap[a.student_id] = a.status; });

      // Default unset students to Present
      const defaults = {};
      studentData.forEach((s) => { defaults[s.id] = attMap[s.id] || 'P'; });
      setAttendance(defaults);
    }

    setLoading(false);
  }

  function toggleStatus(studentId) {
    const cycle = ['P', 'A', 'L'];
    setAttendance((prev) => {
      const current = prev[studentId] || 'P';
      const nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
      return { ...prev, [studentId]: cycle[nextIdx] };
    });
  }

  function markAll(status) {
    const updated = {};
    students.forEach((s) => { updated[s.id] = status; });
    setAttendance(updated);
  }

  async function saveAttendance() {
    setSaving(true);
    const rows = students.map((s) => ({
      student_id: s.id,
      date: attendanceDate,
      status: attendance[s.id] || 'P',
      marked_by: tenant.userRowId,
      marked_via: 'manual',
    }));

    const { error } = await supabase.from('attendance').upsert(rows, {
      onConflict: 'student_id,date',
    });

    if (error) { alert('Failed to save attendance. Please try again.'); setSaving(false); return; }

    const absentStudents = students.filter((s) => attendance[s.id] === 'A');
    if (absentStudents.length > 0) {
      await supabase.functions.invoke('send-whatsapp', {
        body: { studentIds: absentStudents.map((s) => s.id), type: 'attendance_absent', date: attendanceDate },
      });
    }

    await logActivity(tenant, 'attendance_saved', 'info', {
      classId: selectedClass, section: selectedSection,
      date: attendanceDate, studentCount: students.length,
      absentCount: absentStudents.length,
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const counts = students.reduce((acc, s) => {
    const st = attendance[s.id] || 'P';
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});

  const className = classes.find((c) => c.id === selectedClass)?.class_name || '';

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print { .no-print { display: none !important; } }
      `}</style>
      <PrintHeader documentTitle={`Attendance — ${className} ${selectedSection} — ${attendanceDate}`} />

      <div style={S.inner}>
        <div className="no-print" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Attendance · హాజరు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0, letterSpacing: -0.5 }}>Daily Attendance</h1>
        </div>

        {/* Filters */}
        <div className="no-print" style={S.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Class</label>
              <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} style={{ ...S.select, width: '100%' }}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Section</label>
              <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} style={{ ...S.select, width: '100%' }}>
                {sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Date</label>
              <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)}
                style={{ ...S.select, width: '100%', boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>

        {/* Counts */}
        {students.length > 0 && (
          <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
              <div key={status} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '10px 0', textAlign: 'center', cursor: 'pointer' }}
                onClick={() => markAll(status)}>
                <p style={{ fontSize: 20, fontWeight: 700, margin: 0, color: cfg.color }}>{counts[status] || 0}</p>
                <p style={{ fontSize: 12, color: cfg.color, margin: '2px 0 0' }}>{cfg.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Quick mark all */}
        {students.length > 0 && (
          <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => markAll('P')} style={{ flex: 1, padding: '8px 0', background: 'rgba(106,170,144,0.12)', color: '#6AAA90', border: '1px solid rgba(106,170,144,0.25)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
              ✓ All Present
            </button>
            <button onClick={() => markAll('A')} style={{ flex: 1, padding: '8px 0', background: 'rgba(224,90,90,0.1)', color: '#E05A5A', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
              All Absent
            </button>
          </div>
        )}

        {/* Student list */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 32 }}>Loading students...</p>
        ) : students.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>No students found for this class and section.</p>
          </div>
        ) : (
          <div style={S.card}>
            {students.map((student, i) => {
              const status = attendance[student.id] || 'P';
              const cfg = STATUS_CONFIG[status];
              return (
                <div
                  key={student.id}
                  onClick={() => toggleStatus(student.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: i < students.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', width: 24, flexShrink: 0 }}>{i + 1}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, color: '#fff', fontWeight: 400 }}>{student.full_name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                        {student.sid}{student.student_type === 'hostel' ? ' · 🏠 Hostel' : ''}
                      </p>
                    </div>
                  </div>
                  <div style={{ padding: '6px 16px', borderRadius: 20, background: cfg.bg, border: `1px solid ${cfg.border}`, minWidth: 80, textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</p>
                    <p style={{ margin: 0, fontSize: 12, color: cfg.color, opacity: 0.8 }}>{cfg.labelTe}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Save button */}
        {students.length > 0 && (
          <div className="no-print">
            {saved ? (
              <div style={{ padding: 14, background: 'rgba(106,170,144,0.1)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, textAlign: 'center' }}>
                <p style={{ margin: 0, color: '#6AAA90', fontSize: 14, fontWeight: 500 }}>
                  ✓ Attendance saved · WhatsApp alerts sent to absent parents
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={saveAttendance} disabled={saving}
                  style={{ flex: 1, padding: 14, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Saving...' : `Save attendance (${students.length} students)`}
                </button>
                <button onClick={() => window.print()}
                  style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
                  🖨️
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <SchoolNav />
      <BugReporter screenName="attendance" />
    </div>
  );
}