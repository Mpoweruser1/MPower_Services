// school/Hostel.jsx — FINAL (Supabase wired)
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const MEALS = ['Breakfast', 'Lunch', 'Dinner'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  textarea: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' },
};

export default function Hostel() {
  const { tenant } = useTenant();
  const [tab, setTab]               = useState('meals');
  const [meal, setMeal]             = useState('Dinner');
  const [hostelStudents, setHostelStudents] = useState([]);
  const [mealAttendance, setMealAttendance] = useState({});
  const [outings, setOutings]       = useState([]);
  const [medicalLog, setMedicalLog] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [savingMeal, setSavingMeal] = useState(false);
  const [showAddOuting, setShowAddOuting]   = useState(false);
  const [showAddMedical, setShowAddMedical] = useState(false);
  const [newOuting, setNewOuting]   = useState({ student_id: '', reason: '', return_expected: '' });
  const [newMedical, setNewMedical] = useState({ student_id: '', issue: '', action_taken: '' });
  const [saving, setSaving]         = useState(false);
  const [outingError, setOutingError]   = useState('');
  const [medicalError, setMedicalError] = useState('');

  useEffect(() => {
    if (tenant?.appId) loadAll();
  }, [tenant?.appId]);

  async function loadAll() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    // Load hostel students
    const { data: students } = await supabase
      .from('students')
      .select('id, full_name, sid, section')
      .eq('app_id', tenant.appId)
      .eq('student_type', 'hostel')
      .eq('status', 'active')
      .order('full_name');

    setHostelStudents(students || []);

    // Load today's meal attendance
    const { data: mealData } = await supabase
      .from('meal_attendance')
      .select('student_id, meal_type, present')
      .eq('date', today)
      .in('student_id', (students || []).map((s) => s.id));

    const mealMap = {};
    (mealData || []).forEach((m) => {
      mealMap[`${m.student_id}_${m.meal_type}`] = m.present;
    });
    setMealAttendance(mealMap);

    // Load outings
    const { data: outingData } = await supabase
      .from('hostel_outings')
      .select('*, students(full_name, sid)')
      .in('student_id', (students || []).map((s) => s.id))
      .eq('status', 'out')
      .order('out_date', { ascending: false });

    setOutings(outingData || []);

    // Load medical log
    const { data: medData } = await supabase
      .from('hostel_medical_log')
      .select('*, students(full_name)')
      .in('student_id', (students || []).map((s) => s.id))
      .order('reported_at', { ascending: false })
      .limit(20);

    setMedicalLog(medData || []);
    setLoading(false);
  }

  function isMealPresent(studentId) {
    const key = `${studentId}_${meal}`;
    // Default is present — only absent if explicitly marked
    return mealAttendance[key] !== false;
  }

  async function toggleMealAttendance(studentId) {
    const key      = `${studentId}_${meal}`;
    const today    = new Date().toISOString().slice(0, 10);
    const current  = isMealPresent(studentId);
    const newValue = !current;

    setMealAttendance((prev) => ({ ...prev, [key]: newValue }));

    await supabase.from('meal_attendance').upsert({
      student_id: studentId,
      date:       today,
      meal_type:  meal,
      present:    newValue,
      marked_by:  tenant.userRowId,
    }, { onConflict: 'student_id,date,meal_type' });
  }

  async function addOuting() {
    setOutingError('');
    if (!newOuting.student_id) { setOutingError('Select a student.'); return; }
    if (!newOuting.reason.trim()) { setOutingError('Reason is required.'); return; }
    if (!newOuting.return_expected) { setOutingError('Expected return date/time required.'); return; }

    if (new Date(newOuting.return_expected) <= new Date()) {
      setOutingError('Expected return must be in the future.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('hostel_outings').insert({
      student_id:       newOuting.student_id,
      reason:           newOuting.reason.trim(),
      out_date:         new Date().toISOString().slice(0, 10),
      out_time:         new Date().toTimeString().slice(0, 5),
      return_expected:  newOuting.return_expected,
      approved_by:      tenant.userRowId,
      status:           'out',
    });

    if (error) { setOutingError('Failed to log outing.'); setSaving(false); return; }

    setNewOuting({ student_id: '', reason: '', return_expected: '' });
    setShowAddOuting(false);
    setSaving(false);
    loadAll();
  }

  async function markReturned(outingId) {
    await supabase.from('hostel_outings').update({ status: 'returned' }).eq('id', outingId);
    loadAll();
  }

  async function addMedical() {
    setMedicalError('');
    if (!newMedical.student_id)          { setMedicalError('Select a student.'); return; }
    if (!newMedical.issue.trim())         { setMedicalError('Issue is required.'); return; }
    if (!newMedical.action_taken.trim())  { setMedicalError('Action taken is required.'); return; }

    setSaving(true);
    const { error } = await supabase.from('hostel_medical_log').insert({
      student_id:    newMedical.student_id,
      issue:         newMedical.issue.trim(),
      action_taken:  newMedical.action_taken.trim(),
      reported_at:   new Date().toISOString(),
      notified_parent: false,
    });

    if (error) { setMedicalError('Failed to log incident.'); setSaving(false); return; }

    // WhatsApp to parent
    await supabase.functions.invoke('send-whatsapp', {
      body: {
        type:       'hostel_medical_alert',
        studentId:  newMedical.student_id,
        issue:      newMedical.issue,
        actionTaken: newMedical.action_taken,
      },
    });

    await supabase.from('hostel_medical_log')
      .update({ notified_parent: true })
      .eq('student_id', newMedical.student_id)
      .order('reported_at', { ascending: false })
      .limit(1);

    setNewMedical({ student_id: '', issue: '', action_taken: '' });
    setShowAddMedical(false);
    setSaving(false);
    loadAll();
  }

  const absentees = hostelStudents.filter((s) => !isMealPresent(s.id));

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Hostel · హాస్టల్
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Hostel Management</h1>
          {!loading && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
              {hostelStudents.length} hostel students
            </p>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { k: 'meals',   l: 'Meal attendance' },
            { k: 'outings', l: `Outings (${outings.length})` },
            { k: 'medical', l: 'Medical log' },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        ) : (
          <>
            {/* Meal attendance */}
            {tab === 'meals' && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                  {MEALS.map((m) => (
                    <button key={m} onClick={() => setMeal(m)}
                      style={{ padding: '7px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: meal === m ? 'none' : '1px solid rgba(255,255,255,0.1)', background: meal === m ? '#5A9ADF' : 'transparent', color: meal === m ? '#fff' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: meal === m ? 600 : 400 }}>
                      {m}
                    </button>
                  ))}
                </div>

                <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#6AAA90' }}>
                    Default: all {hostelStudents.length} students present for {meal}.
                    Tap a name only if they did NOT eat.
                  </p>
                </div>

                {absentees.length > 0 && (
                  <div style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
                      {absentees.length} absent for {meal} today
                    </p>
                  </div>
                )}

                {hostelStudents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                      No hostel students found. Students with type "Hostel" will appear here.
                    </p>
                  </div>
                ) : (
                  hostelStudents.map((student) => {
                    const present = isMealPresent(student.id);
                    return (
                      <div key={student.id} onClick={() => toggleMealAttendance(student.id)}
                        style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: `1px solid ${present ? 'rgba(255,255,255,0.07)' : 'rgba(224,90,90,0.2)'}`, background: present ? '#161618' : 'rgba(224,90,90,0.05)' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{student.full_name}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{student.sid}{student.section ? ` · ${student.section}` : ''}</p>
                        </div>
                        <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 500, background: present ? 'rgba(106,170,144,0.12)' : 'rgba(224,90,90,0.12)', color: present ? '#6AAA90' : '#E05A5A' }}>
                          {present ? 'Present' : 'Absent — tap to undo'}
                        </span>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* Outings */}
            {tab === 'outings' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  <button onClick={() => setShowAddOuting(true)}
                    style={{ padding: '8px 16px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                    + Log outing
                  </button>
                </div>

                {outings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No students currently out.</p>
                  </div>
                ) : (
                  outings.map((o) => (
                    <div key={o.id} style={S.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{o.students?.full_name}</p>
                          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                            {o.reason} · Out: {o.out_date} {o.out_time}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                            Expected return: {new Date(o.return_expected).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(232,160,32,0.12)', color: '#E8A020', fontWeight: 500 }}>
                          Out
                        </span>
                      </div>
                      <button onClick={() => markReturned(o.id)}
                        style={{ width: '100%', padding: '8px 0', background: '#6AAA90', color: '#111113', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                        ✓ Mark returned
                      </button>
                    </div>
                  ))
                )}
              </>
            )}

            {/* Medical log */}
            {tab === 'medical' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  <button onClick={() => setShowAddMedical(true)}
                    style={{ padding: '8px 16px', background: '#E05A5A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                    + Log medical incident
                  </button>
                </div>

                {medicalLog.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No medical incidents logged.</p>
                  </div>
                ) : (
                  medicalLog.map((m) => (
                    <div key={m.id} style={S.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{m.students?.full_name} — {m.issue}</p>
                        {m.notified_parent && (
                          <span style={{ fontSize: 11, color: '#6AAA90', flexShrink: 0 }}>✓ Parent notified</span>
                        )}
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{m.action_taken}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{new Date(m.reported_at).toLocaleString('en-IN')}</p>
                    </div>
                  ))
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Add outing modal */}
      {showAddOuting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif' }}>
            <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Log student outing</p>

            {outingError && <p style={{ fontSize: 12, color: '#E05A5A', marginBottom: 10 }}>⚠ {outingError}</p>}

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Student *</label>
                <select value={newOuting.student_id} onChange={(e) => setNewOuting((o) => ({ ...o, student_id: e.target.value }))}
                  style={{ ...S.input, cursor: 'pointer' }}>
                  <option value="">-- Select student --</option>
                  {hostelStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.sid})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Reason *</label>
                <input value={newOuting.reason} onChange={(e) => setNewOuting((o) => ({ ...o, reason: e.target.value }))}
                  placeholder="e.g. Family visit, medical appointment" style={S.input} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Expected return *</label>
                <input type="datetime-local" value={newOuting.return_expected}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(e) => setNewOuting((o) => ({ ...o, return_expected: e.target.value }))}
                  style={S.input} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowAddOuting(false); setOutingError(''); }}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={addOuting} disabled={saving}
                style={{ flex: 2, padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Log outing →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add medical modal */}
      {showAddMedical && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif' }}>
            <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Log medical incident</p>

            {medicalError && <p style={{ fontSize: 12, color: '#E05A5A', marginBottom: 10 }}>⚠ {medicalError}</p>}

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Student *</label>
                <select value={newMedical.student_id} onChange={(e) => setNewMedical((m) => ({ ...m, student_id: e.target.value }))}
                  style={{ ...S.input, cursor: 'pointer' }}>
                  <option value="">-- Select student --</option>
                  {hostelStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.sid})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Issue / complaint *</label>
                <input value={newMedical.issue} onChange={(e) => setNewMedical((m) => ({ ...m, issue: e.target.value }))}
                  placeholder="e.g. Fever, stomach pain, injury" style={S.input} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Action taken *</label>
                <textarea value={newMedical.action_taken} onChange={(e) => setNewMedical((m) => ({ ...m, action_taken: e.target.value }))}
                  placeholder="Medicine given, doctor consulted, parent called..." rows={3}
                  style={S.textarea} />
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 10 }}>
              Parent will be notified via WhatsApp automatically on save.
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={() => { setShowAddMedical(false); setMedicalError(''); }}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={addMedical} disabled={saving}
                style={{ flex: 2, padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E05A5A', color: saving ? 'rgba(255,255,255,0.3)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Log incident & notify parent →'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SchoolNav />
      <BugReporter screenName="hostel" />
    </div>
  );
}