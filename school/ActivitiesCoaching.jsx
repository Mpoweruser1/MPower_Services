// school/ActivitiesCoaching.jsx — FINAL (Supabase wired)
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const ACTIVITY_TYPES = ['Sports', 'NCC', 'NSS', 'Trip', 'Cultural', 'Other'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
};

const TYPE_ICONS = {
  Sports: '⚽', NCC: '🪖', NSS: '🌿',
  Trip: '🚌', Cultural: '🎭', Other: '📋',
};

// Shared by both the Activities and Coaching tabs — enrolled list,
// search-to-add below it. Search results already exclude students
// who are already enrolled (filtered in searchStudentsToEnroll).
function ParticipantManager({ participants, studentQuery, studentResults, enrolling, onSearch, onEnroll, onRemove }) {
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 8px' }}>
        Participants {participants.length > 0 ? `(${participants.length})` : ''}
      </p>

      {participants.length === 0 ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>No students enrolled yet.</p>
      ) : (
        <div style={{ marginBottom: 10 }}>
          {participants.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: 12.5, color: '#fff' }}>
                {p.students?.full_name} <span style={{ color: 'rgba(255,255,255,0.4)' }}>· {p.students?.sid} · {p.students?.classes?.class_name}</span>
              </span>
              <button onClick={() => onRemove(p.id)}
                style={{ background: 'none', border: 'none', color: '#E05A5A', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <input value={studentQuery} onChange={(e) => onSearch(e.target.value)}
        placeholder="Search student to add..." disabled={enrolling}
        style={{ width: '100%', padding: '8px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12.5, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      {studentResults.map((s) => (
        <div key={s.id} onClick={() => onEnroll(s.id)}
          style={{ padding: '7px 10px', cursor: enrolling ? 'not-allowed' : 'pointer', fontSize: 12, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {s.full_name} <span style={{ color: 'rgba(255,255,255,0.4)' }}>· {s.sid} · {s.classes?.class_name}</span>
        </div>
      ))}
    </div>
  );
}

export default function ActivitiesCoaching() {
  const { tenant } = useTenant();
  const [tab, setTab]               = useState('activities');
  const [activities, setActivities] = useState([]);
  const [coaching, setCoaching]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [participantCounts, setParticipantCounts] = useState({});

  // Enrollment — items #10/#16: both Activities and Coaching showed
  // 0 participants everywhere, because there was no screen to actually
  // enroll a student into either. Uses the already-declared but never-
  // wired `expandedId` above: click a card to expand it and manage who's
  // enrolled, matching how the original code's own naming suggested it
  // was meant to work.
  const [participants, setParticipants] = useState([]); // for whichever card is expanded
  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [enrolling, setEnrolling] = useState(false);

  const [newActivity, setNewActivity] = useState({
    activity_name: '', activity_type: 'Sports', activity_date: '',
  });
  const [newCoaching, setNewCoaching] = useState({
    subject: '', class_range: '', schedule: '',
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (tenant?.appId) loadAll();
  }, [tenant?.appId]);

  async function loadAll() {
    setLoading(true);

    const [activitiesRes, coachingRes] = await Promise.allSettled([
      supabase.from('activities')
        .select('*')
        .eq('app_id', tenant.appId)
        .order('activity_date', { ascending: false }),

      supabase.from('coaching_classes')
        .select('*, coaching_participants(id)')
        .eq('app_id', tenant.appId)
        .order('subject'),
    ]);

    const activitiesData = activitiesRes.status === 'fulfilled' ? (activitiesRes.value.data || []) : [];
    setActivities(activitiesData);
    setCoaching(coachingRes.status === 'fulfilled' ? (coachingRes.value.data || []) : []);

    // Get participant counts for activities
    if (activitiesData.length > 0) {
      const { data: counts } = await supabase
        .from('activity_participants')
        .select('activity_id')
        .in('activity_id', activitiesData.map((a) => a.id));

      const countMap = {};
      (counts || []).forEach((c) => {
        countMap[c.activity_id] = (countMap[c.activity_id] || 0) + 1;
      });
      setParticipantCounts(countMap);
    }

    setLoading(false);
  }

  // One set of functions serves both tabs — the two participant
  // tables differ only in their join-column name (activity_id vs
  // coaching_id), passed in as `linkCol`.
  function participantTable() { return tab === 'activities' ? 'activity_participants' : 'coaching_participants'; }
  function linkCol() { return tab === 'activities' ? 'activity_id' : 'coaching_id'; }

  async function toggleExpand(id) {
    if (expandedId === id) { setExpandedId(null); setParticipants([]); setStudentQuery(''); setStudentResults([]); return; }
    setExpandedId(id);
    setStudentQuery('');
    setStudentResults([]);
    await loadParticipants(id);
  }

  async function loadParticipants(recordId) {
    const { data, error } = await supabase
      .from(participantTable())
      .select('id, student_id, students(full_name, sid, classes(class_name))')
      .eq(linkCol(), recordId);
    if (error) { console.error('Loading participants failed:', error); return; }
    setParticipants(data || []);
  }

  async function searchStudentsToEnroll(q) {
    setStudentQuery(q);
    if (q.trim().length < 2) { setStudentResults([]); return; }
    const alreadyIn = new Set(participants.map((p) => p.student_id));
    const { data, error } = await supabase
      .from('students')
      .select('id, full_name, sid, classes(class_name)')
      .eq('app_id', tenant.appId)
      .eq('status', 'active')
      .or(`full_name.ilike.%${q}%,sid.ilike.%${q}%`)
      .limit(8);
    if (error) { console.error('Searching students failed:', error); return; }
    setStudentResults((data || []).filter((s) => !alreadyIn.has(s.id)));
  }

  async function enrollStudent(studentId) {
    setEnrolling(true);
    // onConflict on the real unique constraint just added — re-adding
    // an already-enrolled student is a harmless no-op instead of a
    // duplicate row or a thrown error.
    const { error } = await supabase
      .from(participantTable())
      .upsert({ [linkCol()]: expandedId, student_id: studentId }, { onConflict: `${linkCol()},student_id` });
    if (error) {
      console.error('Enrolling student failed:', error);
      alert(`Could not enroll: ${error.message || 'please try again.'}`);
      setEnrolling(false);
      return;
    }
    setStudentQuery('');
    setStudentResults([]);
    setEnrolling(false);
    await loadParticipants(expandedId);
    loadAll(); // refresh the card's participant count
  }

  async function removeParticipant(participantRowId) {
    const { error } = await supabase.from(participantTable()).delete().eq('id', participantRowId);
    if (error) {
      console.error('Removing participant failed:', error);
      alert(`Could not remove: ${error.message || 'please try again.'}`);
      return;
    }
    await loadParticipants(expandedId);
    loadAll();
  }

  function validateActivity() {
    const errors = {};
    if (!newActivity.activity_name.trim()) errors.activity_name = 'Activity name required';
    if (!newActivity.activity_date)        errors.activity_date = 'Date required';
    if (new Date(newActivity.activity_date) < new Date(new Date().setFullYear(new Date().getFullYear() - 1))) {
      errors.activity_date = 'Date cannot be more than 1 year in the past';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateCoaching() {
    const errors = {};
    if (!newCoaching.subject.trim()) errors.subject = 'Subject is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function addActivity() {
    if (!validateActivity()) return;
    setSaving(true);
    setSubmitError('');

    const { error } = await supabase.from('activities').insert({
      app_id:        tenant.appId,
      activity_name: newActivity.activity_name.trim(),
      activity_type: newActivity.activity_type,
      activity_date: newActivity.activity_date,
    });

    if (error) { setSubmitError('Failed to add activity.'); setSaving(false); return; }

    setNewActivity({ activity_name: '', activity_type: 'Sports', activity_date: '' });
    setShowAdd(false);
    setSaving(false);
    loadAll();
  }

  async function addCoaching() {
    if (!validateCoaching()) return;
    setSaving(true);
    setSubmitError('');

    const { error } = await supabase.from('coaching_classes').insert({
      app_id:      tenant.appId,
      subject:     newCoaching.subject.trim(),
      class_range: newCoaching.class_range.trim() || null,
      schedule:    newCoaching.schedule.trim() || null,
    });

    if (error) { setSubmitError('Failed to add coaching class.'); setSaving(false); return; }

    setNewCoaching({ subject: '', class_range: '', schedule: '' });
    setShowAdd(false);
    setSaving(false);
    loadAll();
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Activities & Coaching · కార్యక్రమాలు
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Activities & Coaching</h1>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { k: 'activities', l: `Activities (${activities.length})` },
            { k: 'coaching',   l: `Coaching (${coaching.length})` },
          ].map((t) => (
            <button key={t.k} onClick={() => { setTab(t.k); setShowAdd(false); }}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
          <button onClick={() => setShowAdd(true)}
            style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: 'none', background: '#6AAA90', color: '#111113', fontFamily: 'inherit', fontWeight: 600 }}>
            + Add
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        ) : (
          <>
            {/* Activities */}
            {tab === 'activities' && (
              activities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 32, marginBottom: 12 }}>⚽</p>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>No activities added yet.</p>
                </div>
              ) : (
                activities.map((a) => (
                  <div key={a.id} style={S.card}>
                    <div onClick={() => toggleExpand(a.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 24, flexShrink: 0 }}>{TYPE_ICONS[a.activity_type] || '📋'}</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{a.activity_name}</p>
                          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                            {a.activity_type} · {a.activity_date}
                            {participantCounts[a.id] ? ` · ${participantCounts[a.id]} participants` : ''}
                          </p>
                        </div>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{expandedId === a.id ? '▲' : '▼'}</span>
                    </div>
                    {expandedId === a.id && (
                      <ParticipantManager
                        participants={participants} studentQuery={studentQuery} studentResults={studentResults}
                        enrolling={enrolling} onSearch={searchStudentsToEnroll} onEnroll={enrollStudent} onRemove={removeParticipant}
                      />
                    )}
                  </div>
                ))
              )
            )}

            {/* Coaching */}
            {tab === 'coaching' && (
              coaching.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 32, marginBottom: 12 }}>📚</p>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>No coaching classes added yet.</p>
                </div>
              ) : (
                coaching.map((c) => (
                  <div key={c.id} style={S.card}>
                    <div onClick={() => toggleExpand(c.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{c.subject}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                          {c.class_range ? `Class ${c.class_range}` : ''}
                          {c.class_range && c.schedule ? ' · ' : ''}
                          {c.schedule || ''}
                          {(c.coaching_participants || []).length > 0
                            ? ` · ${c.coaching_participants.length} students`
                            : ''}
                        </p>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{expandedId === c.id ? '▲' : '▼'}</span>
                    </div>
                    {expandedId === c.id && (
                      <ParticipantManager
                        participants={participants} studentQuery={studentQuery} studentResults={studentResults}
                        enrolling={enrolling} onSearch={searchStudentsToEnroll} onEnroll={enrollStudent} onRemove={removeParticipant}
                      />
                    )}
                  </div>
                ))
              )
            )}
          </>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif' }}>
            <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#fff' }}>
              {tab === 'activities' ? 'Add activity' : 'Add coaching class'}
            </p>

            {submitError && <p style={{ fontSize: 12, color: '#E05A5A', marginBottom: 10 }}>⚠ {submitError}</p>}

            {tab === 'activities' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label htmlFor="activity-name" style={S.label}>Activity name *</label>
                  <input id="activity-name" name="activity-name" value={newActivity.activity_name}
                    onChange={(e) => { setNewActivity((a) => ({ ...a, activity_name: e.target.value })); setFormErrors({}); }}
                    placeholder="e.g. Annual Sports Day" style={S.input} />
                  {formErrors.activity_name && <p style={{ fontSize: 12, color: '#E05A5A', marginTop: 4 }}>⚠ {formErrors.activity_name}</p>}
                </div>
                <div>
                  <label htmlFor="activity-type" style={S.label}>Type</label>
                  <select id="activity-type" name="activity-type" value={newActivity.activity_type}
                    onChange={(e) => setNewActivity((a) => ({ ...a, activity_type: e.target.value }))}
                    style={{ ...S.input, cursor: 'pointer' }}>
                    {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="activity-date" style={S.label}>Date *</label>
                  <input id="activity-date" name="activity-date" type="date" value={newActivity.activity_date}
                    onChange={(e) => { setNewActivity((a) => ({ ...a, activity_date: e.target.value })); setFormErrors({}); }}
                    style={S.input} />
                  {formErrors.activity_date && <p style={{ fontSize: 12, color: '#E05A5A', marginTop: 4 }}>⚠ {formErrors.activity_date}</p>}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label htmlFor="activity-coaching-subject" style={S.label}>Subject *</label>
                  <input id="activity-coaching-subject" name="activity-coaching-subject" value={newCoaching.subject}
                    onChange={(e) => { setNewCoaching((c) => ({ ...c, subject: e.target.value })); setFormErrors({}); }}
                    placeholder="e.g. Mathematics — Foundation" style={S.input} />
                  {formErrors.subject && <p style={{ fontSize: 12, color: '#E05A5A', marginTop: 4 }}>⚠ {formErrors.subject}</p>}
                </div>
                <div>
                  <label htmlFor="activity-coaching-class-range" style={S.label}>Class range</label>
                  <input id="activity-coaching-class-range" name="activity-coaching-class-range" value={newCoaching.class_range}
                    onChange={(e) => setNewCoaching((c) => ({ ...c, class_range: e.target.value }))}
                    placeholder="e.g. 6–10" style={S.input} />
                </div>
                <div>
                  <label htmlFor="activity-coaching-schedule" style={S.label}>Schedule</label>
                  <input id="activity-coaching-schedule" name="activity-coaching-schedule" value={newCoaching.schedule}
                    onChange={(e) => setNewCoaching((c) => ({ ...c, schedule: e.target.value }))}
                    placeholder="e.g. Mon/Wed/Fri 4–5 PM" style={S.input} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowAdd(false); setFormErrors({}); setSubmitError(''); }}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={tab === 'activities' ? addActivity : addCoaching} disabled={saving}
                style={{ flex: 2, padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Save →'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SchoolNav />
      <BugReporter screenName="activities_coaching" />
    </div>
  );
}