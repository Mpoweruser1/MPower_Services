// school/Timetable.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIOD_COUNT = 8;

// Common subjects — suggestions only via datalist, not enforced, so a
// school can still type anything not on this list.
const COMMON_SUBJECTS = ['Telugu', 'English', 'Hindi', 'Maths', 'Science', 'Social Studies', 'Physical Education', 'Art', 'Computer Science', 'Free Period'];

// Sensible defaults if a school hasn't set its own period times yet —
// same idea as ManageClasses.jsx/ManageWards.jsx's quick-add defaults.
function defaultPeriodTimes() {
  const starts = ['09:00', '09:45', '10:30', '11:15', '12:30', '13:15', '14:00', '14:45'];
  return starts.map((start, i) => {
    const [h, m] = start.split(':').map(Number);
    const endH = m + 45 >= 60 ? h + 1 : h;
    const endM = (m + 45) % 60;
    return {
      period_number: i + 1,
      start_time: start,
      end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
    };
  });
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 900, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  select: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
};

export default function Timetable() {
  const { tenant } = useTenant();
  const [classes, setClasses]             = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [sections, setSections]           = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [periods, setPeriods]             = useState([]);
  const [entries, setEntries]             = useState({}); // key: "day|period" -> subject
  const [loading, setLoading]             = useState(false);
  const [showPeriodSetup, setShowPeriodSetup] = useState(false);
  const [savingCell, setSavingCell]       = useState(null);

  useEffect(() => {
    if (tenant?.appId) { loadClasses(); loadPeriods(); }
  }, [tenant?.appId]);

  useEffect(() => {
    if (selectedClass) loadSections();
  }, [selectedClass]);

  useEffect(() => {
    if (selectedClass && selectedSection) loadEntries();
  }, [selectedClass, selectedSection]);

  async function loadClasses() {
    const { data } = await supabase
      .from('classes').select('id, class_name, class_order')
      .eq('app_id', tenant.appId).order('class_order');
    setClasses(data || []);
    if (data?.length > 0) setSelectedClass(data[0].id);
  }

  // Same section-discovery pattern as Attendance.jsx
  async function loadSections() {
    const { data } = await supabase
      .from('students').select('section')
      .eq('app_id', tenant.appId).eq('class_id', selectedClass).eq('status', 'active');
    const unique = [...new Set((data || []).map((s) => s.section).filter(Boolean))].sort();
    const combined = [...new Set([...unique, 'A', 'B', 'C'])].sort();
    setSections(combined);
    if (combined.length > 0) setSelectedSection(combined[0]);
  }

  async function loadPeriods() {
    const { data } = await supabase
      .from('class_periods').select('period_number, start_time, end_time')
      .eq('app_id', tenant.appId).order('period_number');
    setPeriods(data?.length ? data : defaultPeriodTimes());
  }

  async function savePeriodTimes(newPeriods) {
    const rows = newPeriods.map((p) => ({ app_id: tenant.appId, ...p }));
    await supabase.from('class_periods').upsert(rows, { onConflict: 'app_id,period_number' });
    setPeriods(newPeriods);
  }

  async function loadEntries() {
    setLoading(true);
    const { data } = await supabase
      .from('timetable_entries')
      .select('day_of_week, period_number, subject')
      .eq('app_id', tenant.appId)
      .eq('class_id', selectedClass)
      .eq('section', selectedSection);

    const map = {};
    (data || []).forEach((e) => { map[`${e.day_of_week}|${e.period_number}`] = e.subject; });
    setEntries(map);
    setLoading(false);
  }

  async function editCell(day, periodNumber) {
    const key = `${day}|${periodNumber}`;
    const current = entries[key] || '';
    const input = window.prompt(`Subject for ${day}, Period ${periodNumber}:`, current);
    if (input === null) return; // cancelled

    setSavingCell(key);
    const subject = input.trim();

    if (!subject) {
      // Empty input clears the slot
      await supabase.from('timetable_entries')
        .delete()
        .eq('app_id', tenant.appId).eq('class_id', selectedClass).eq('section', selectedSection)
        .eq('day_of_week', day).eq('period_number', periodNumber);
      setEntries((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } else {
      await supabase.from('timetable_entries').upsert({
        app_id: tenant.appId, class_id: selectedClass, section: selectedSection,
        day_of_week: day, period_number: periodNumber, subject,
      }, { onConflict: 'app_id,class_id,section,day_of_week,period_number' });
      setEntries((prev) => ({ ...prev, [key]: subject }));
    }
    setSavingCell(null);
  }

  const className = classes.find((c) => c.id === selectedClass)?.class_name || '';

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <datalist id="subject-suggestions">
        {COMMON_SUBJECTS.map((s) => <option key={s} value={s} />)}
      </datalist>

      <div style={S.inner}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Timetable · కాలపట్టిక</p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Class Timetable</h1>
          </div>
          <button onClick={() => setShowPeriodSetup(true)}
            style={{ padding: '8px 14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            ⚙️ Period times
          </button>
        </div>

        {/* Class / section selector */}
        <div style={S.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 32 }}>Loading timetable...</p>
        ) : (
          <div style={{ ...S.card, overflowX: 'auto', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 8px', textAlign: 'left', color: 'rgba(255,255,255,0.3)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', left: 0, background: '#161618' }}>Period</th>
                  {DAYS.map((day) => (
                    <th key={day} style={{ padding: '10px 8px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', minWidth: 100 }}>{day.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.period_number} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 8px', color: 'rgba(255,255,255,0.4)', fontSize: 11, position: 'sticky', left: 0, background: '#161618' }}>
                      <strong style={{ color: '#fff' }}>P{p.period_number}</strong><br />
                      {p.start_time?.slice(0, 5)}–{p.end_time?.slice(0, 5)}
                    </td>
                    {DAYS.map((day) => {
                      const key = `${day}|${p.period_number}`;
                      const subject = entries[key];
                      const isSaving = savingCell === key;
                      return (
                        <td key={day}
                          onClick={() => !isSaving && selectedSection && editCell(day, p.period_number)}
                          style={{ padding: '10px 8px', textAlign: 'center', cursor: selectedSection ? 'pointer' : 'default', color: subject ? '#fff' : 'rgba(255,255,255,0.2)', fontWeight: subject ? 500 : 400 }}>
                          {isSaving ? '...' : subject || '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 12 }}>
            Tap any cell to set or change the subject — {className}{selectedSection ? `-${selectedSection}` : ''}
          </p>
        )}
      </div>

      {/* Period times setup */}
      {showPeriodSetup && (
        <div onClick={() => setShowPeriodSetup(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', fontFamily: 'Inter, sans-serif' }}>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Period times</p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Same {PERIOD_COUNT} periods, every day — set once for the whole school.
            </p>
            {periods.map((p, i) => (
              <div key={p.period_number} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 1fr', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>P{p.period_number}</span>
                <input type="time" value={p.start_time?.slice(0, 5)}
                  onChange={(e) => {
                    const next = [...periods];
                    next[i] = { ...next[i], start_time: e.target.value };
                    setPeriods(next);
                  }}
                  style={{ padding: '8px 10px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 13, color: '#fff', fontFamily: 'inherit' }} />
                <input type="time" value={p.end_time?.slice(0, 5)}
                  onChange={(e) => {
                    const next = [...periods];
                    next[i] = { ...next[i], end_time: e.target.value };
                    setPeriods(next);
                  }}
                  style={{ padding: '8px 10px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 13, color: '#fff', fontFamily: 'inherit' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowPeriodSetup(false)}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={async () => { await savePeriodTimes(periods); setShowPeriodSetup(false); }}
                style={{ flex: 2, padding: 11, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Save period times
              </button>
            </div>
          </div>
        </div>
      )}

      <SchoolNav />
      <BugReporter screenName="timetable" />
    </div>
  );
}
