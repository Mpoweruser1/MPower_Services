// school/StudentDetail.jsx — NEW
// Read-only student record. Anyone with view access can open this.
// parent_phone and blood_group are safety/time-critical — editable
// directly, no approval needed. Everything else (identity, official
// numbers, welfare-eligibility fields) goes through CorrectionRequest,
// which routes to an admin for approval before anything changes.
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { logActivity } from '../shared/logActivity';
import CorrectionRequest, { STUDENT_FIELDS } from '../shared/CorrectionRequest';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

// class_id (belongs to ManageClasses, not a "correction"), parent_phone
// and blood_group (direct-edit below, not request-based) are excluded
// from the correction dropdown — everything else in STUDENT_FIELDS
// still applies.
const REQUESTABLE_FIELDS = STUDENT_FIELDS.filter(
  (f) => !['class_id', 'parent_phone', 'blood_group'].includes(f.key)
);

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 560, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 16 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13.5 },
  label: { color: 'rgba(255,255,255,0.4)' },
  value: { color: '#fff', fontWeight: 500, textAlign: 'right' },
  input: { padding: '7px 10px', background: '#111113', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 13.5, color: '#fff', outline: 'none', fontFamily: 'inherit', width: 150 },
};

function StudentSearch({ appId, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function search(q) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('students')
      .select('id, full_name, sid, section, classes(class_name)')
      .eq('app_id', appId)
      .eq('status', 'active')
      .or(`full_name.ilike.%${q}%,sid.ilike.%${q}%`)
      .limit(8);
    setResults(data || []);
    setSearching(false);
  }

  return (
    <div style={S.card}>
      <label htmlFor="student-search-query" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
        Find student
      </label>
      <input id="student-search-query" name="student-search-query" value={query} onChange={(e) => search(e.target.value)} placeholder="Name or SID..." style={{ ...S.input, width: '100%' }} autoFocus />
      {searching && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>Searching...</p>}
      {results.map((s) => (
        <div key={s.id} onClick={() => onSelect(s.id)}
          style={{ padding: '10px 4px', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: '#fff' }}>{s.full_name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            {s.sid} · {s.classes?.class_name}{s.section ? `-${s.section}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function StudentDetail({ studentId }) {
  const { tenant } = useTenant();
  const [id, setId] = useState(studentId || null);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingField, setEditingField] = useState(null); // 'parent_phone' | 'blood_group' | null
  const [fieldDraft, setFieldDraft] = useState('');
  const [saving, setSaving] = useState(false);

  // Transport enrollment — was reported by item #9: the Transport
  // Enrollment report always showed 0 students, because there was
  // nowhere in the app to actually enroll a student onto a route.
  // transport_students (student_id, route_id, stop_id) exists and is
  // already what that report reads from — this screen just writes to
  // it for the first time.
  const [transportAssignment, setTransportAssignment] = useState(null); // { route_id, stop_id, routes: {...}, transport_stops: {...} } | null | 'none'
  const [assigningTransport, setAssigningTransport] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedStopId, setSelectedStopId] = useState('');
  const [savingTransport, setSavingTransport] = useState(false);

  React.useEffect(() => {
    if (!id) return;
    loadStudent();
  }, [id]);

  async function loadStudent() {
    setLoading(true);
    const { data } = await supabase
      .from('students')
      // village_id/villages(...) removed — that join was against CTS's
      // electoral village table (scoped to specific constituencies),
      // which was never actually populated at admission and would
      // wrongly exclude any family outside a registered constituency
      // anyway. village_name/mandal_name/district_name/state are the
      // real, plain-text columns StudentAdmission.jsx now saves to.
      .select('id, full_name, sid, dob, gender, section, father_name, mother_name, parent_phone, blood_group, admission_no, caste_category, apaar_id, village_name, mandal_name, district_name, state, class_id, classes(class_name)')
      .eq('id', id)
      .single();
    setStudent(data || null);
    setLoading(false);
    if (data) loadTransportAssignment(data.id);
  }

  async function loadTransportAssignment(studentId) {
    const { data, error } = await supabase
      .from('transport_students')
      .select('route_id, stop_id, transport_routes(route_no, driver_name), transport_stops(stop_name, pickup_time)')
      .eq('student_id', studentId)
      .maybeSingle();
    if (error) { console.error('Loading transport assignment failed:', error); return; }
    setTransportAssignment(data || 'none');
  }

  async function loadRoutesForAssignment() {
    const { data, error } = await supabase
      .from('transport_routes')
      .select('id, route_no, driver_name')
      .eq('app_id', tenant.appId)
      .order('route_no');
    if (error) { console.error('Loading routes failed:', error); return; }
    setRoutes(data || []);
  }

  async function loadStopsForRoute(routeId) {
    setSelectedStopId('');
    if (!routeId) { setStops([]); return; }
    const { data, error } = await supabase
      .from('transport_stops')
      .select('id, stop_name, pickup_time, stop_order')
      .eq('route_id', routeId)
      .order('stop_order');
    if (error) { console.error('Loading stops failed:', error); return; }
    setStops(data || []);
  }

  async function saveTransportAssignment() {
    if (!selectedRouteId || !selectedStopId) return;
    setSavingTransport(true);
    // upsert on student_id (now a real unique constraint) — this is
    // what makes reassigning a student to a different route REPLACE
    // their existing row instead of creating a second one.
    const { error } = await supabase
      .from('transport_students')
      .upsert(
        { student_id: id, route_id: selectedRouteId, stop_id: selectedStopId },
        { onConflict: 'student_id' }
      );
    if (error) {
      console.error('Saving transport assignment failed:', error);
      alert(`Could not save: ${error.message || 'please try again.'}`);
      setSavingTransport(false);
      return;
    }
    logActivity(tenant, 'student_transport_assigned', 'info', {
      studentId: id, routeId: selectedRouteId, stopId: selectedStopId,
    });
    setAssigningTransport(false);
    setSavingTransport(false);
    loadTransportAssignment(id);
  }

  async function removeTransportAssignment() {
    if (!window.confirm('Remove this student from their assigned bus route?')) return;
    const { error } = await supabase.from('transport_students').delete().eq('student_id', id);
    if (error) {
      console.error('Removing transport assignment failed:', error);
      alert(`Could not remove: ${error.message || 'please try again.'}`);
      return;
    }
    setTransportAssignment('none');
  }

  function startEdit(field) {
    setEditingField(field);
    setFieldDraft(student[field] || '');
  }

  async function saveDirectEdit() {
    if (!editingField) return;
    setSaving(true);
    const { error } = await supabase
      .from('students')
      .update({ [editingField]: fieldDraft.trim() })
      .eq('id', id);

    // Previously `if (!error)` with no else — a failed save closed the
    // editor and left the old value on screen, indistinguishable from
    // a successful save that simply didn't change anything.
    if (error) {
      console.error('Saving student field failed:', error);
      alert(`Could not save: ${error.message || 'please try again.'}`);
      setSaving(false);
      return;
    }
    setStudent((s) => ({ ...s, [editingField]: fieldDraft.trim() }));
    logActivity(tenant, 'student_field_direct_edit', 'info', {
      studentId: id, field: editingField,
    });
    setSaving(false);
    setEditingField(null);
  }

  if (!id) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Student detail</p>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Find a student</h1>
          </div>
          <StudentSearch appId={tenant?.appId} onSelect={setId} />
        </div>
        <SchoolNav />
      </div>
    );
  }

  if (loading || !student) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        </div>
      </div>
    );
  }

  const initials = student.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(232,160,32,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, color: '#E8A020' }}>
            {initials}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>{student.full_name}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.4)' }}>
              {student.sid} · {student.classes?.class_name}{student.section ? `-${student.section}` : ''}
            </p>
          </div>
        </div>

        {/* Read-only fields */}
        <div style={S.card}>
          <div style={S.row}><span style={S.label}>Date of birth</span><span style={S.value}>{student.dob || '—'}</span></div>
          <div style={S.row}><span style={S.label}>Gender</span><span style={S.value}>{student.gender || '—'}</span></div>
          <div style={{ ...S.row, borderBottom: 'none' }}><span style={S.label}>Admission no</span><span style={S.value}>{student.admission_no || '—'}</span></div>
        </div>

        {/* Directly editable — safety/time critical */}
        <div style={{ ...S.card, background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.2)' }}>
          <p style={{ fontSize: 11, color: '#E8A020', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 10px' }}>Editable directly</p>

          {/* Father's / Mother's name are editable here because every
              student admitted before the admission form was split into
              two fields has these blank — and a Transfer Certificate
              prints "Father's name: —" without them. There was no way
              to fill them in for existing students at all. */}
          <div style={S.row}>
            <span style={S.label}>Father's name</span>
            {editingField === 'father_name' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="student-edit-father-name" name="student-edit-father-name" aria-label="Father's name" value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} style={S.input} autoFocus />
                <button onClick={saveDirectEdit} disabled={saving} style={{ padding: '0 12px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <span style={S.value} onClick={() => startEdit('father_name')} title="Click to edit">
                {student.father_name || '—'} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>✎</span>
              </span>
            )}
          </div>

          <div style={S.row}>
            <span style={S.label}>Mother's name</span>
            {editingField === 'mother_name' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="student-edit-mother-name" name="student-edit-mother-name" aria-label="Mother's name" value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} style={S.input} autoFocus />
                <button onClick={saveDirectEdit} disabled={saving} style={{ padding: '0 12px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <span style={S.value} onClick={() => startEdit('mother_name')} title="Click to edit">
                {student.mother_name || '—'} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>✎</span>
              </span>
            )}
          </div>

          {/* Village/Mandal/District/State — same situation as father's/
              mother's name: every student admitted before this fix has
              these genuinely blank (the old 'address' field was never
              saved at all, to any column), and there was previously no
              way to fill them in for an existing student. */}
          {['village_name', 'mandal_name', 'district_name', 'state'].map((field) => {
            const labels = { village_name: 'Village / Town', mandal_name: 'Mandal', district_name: 'District', state: 'State' };
            return (
              <div style={S.row} key={field}>
                <span style={S.label}>{labels[field]}</span>
                {editingField === field ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input id={`student-edit-${field.replace('_', '-')}`} name={`student-edit-${field.replace('_', '-')}`} aria-label={labels[field]} value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} style={S.input} autoFocus />
                    <button onClick={saveDirectEdit} disabled={saving} style={{ padding: '0 12px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {saving ? '...' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <span style={S.value} onClick={() => startEdit(field)} title="Click to edit">
                    {student[field] || '—'} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>✎</span>
                  </span>
                )}
              </div>
            );
          })}

          <div style={S.row}>
            <span style={S.label}>Parent phone</span>
            {editingField === 'parent_phone' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="student-edit-parent-phone" name="student-edit-parent-phone" aria-label="Parent phone" value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} style={S.input} autoFocus />
                <button onClick={saveDirectEdit} disabled={saving} style={{ padding: '0 12px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <span style={S.value} onClick={() => startEdit('parent_phone')} title="Click to edit">
                {student.parent_phone || '—'} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>✎</span>
              </span>
            )}
          </div>

          <div style={{ ...S.row, borderBottom: 'none' }}>
            <span style={S.label}>Blood group</span>
            {editingField === 'blood_group' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="student-edit-blood-group" name="student-edit-blood-group" aria-label="Blood group" value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} style={{ ...S.input, width: 90 }} autoFocus />
                <button onClick={saveDirectEdit} disabled={saving} style={{ padding: '0 12px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <span style={S.value} onClick={() => startEdit('blood_group')} title="Click to edit">
                {student.blood_group || '—'} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>✎</span>
              </span>
            )}
          </div>
        </div>

        {/* Transport — was nowhere in the app to enroll a student onto
            a route at all, which is why the Transport Enrollment report
            always showed 0 students despite routes genuinely existing. */}
        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 10px' }}>Transport</p>

          {transportAssignment === null ? (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Loading...</p>
          ) : assigningTransport ? (
            <div>
              <label htmlFor="transport-route-select" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Route</label>
              <select id="transport-route-select" name="transport-route-select" value={selectedRouteId}
                onChange={(e) => { setSelectedRouteId(e.target.value); loadStopsForRoute(e.target.value); }}
                style={{ ...S.input, width: '100%', marginBottom: 10, cursor: 'pointer' }}>
                <option value="">-- Select route --</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.route_no} — {r.driver_name}</option>)}
              </select>

              <label htmlFor="transport-stop-select" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Stop</label>
              <select id="transport-stop-select" name="transport-stop-select" value={selectedStopId}
                onChange={(e) => setSelectedStopId(e.target.value)}
                disabled={!selectedRouteId}
                style={{ ...S.input, width: '100%', marginBottom: 12, cursor: selectedRouteId ? 'pointer' : 'not-allowed', opacity: selectedRouteId ? 1 : 0.5 }}>
                <option value="">{selectedRouteId ? '-- Select stop --' : 'Choose a route first'}</option>
                {stops.map((s) => <option key={s.id} value={s.id}>{s.stop_name}{s.pickup_time ? ` · ${s.pickup_time}` : ''}</option>)}
              </select>
              {selectedRouteId && stops.length === 0 && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>No stops defined for this route yet.</p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setAssigningTransport(false)}
                  style={{ flex: 1, padding: '8px 0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={saveTransportAssignment} disabled={!selectedRouteId || !selectedStopId || savingTransport}
                  style={{ flex: 2, padding: '8px 0', border: 'none', borderRadius: 6, background: (selectedRouteId && selectedStopId) ? '#E8A020' : 'rgba(255,255,255,0.08)', color: (selectedRouteId && selectedStopId) ? '#111113' : 'rgba(255,255,255,0.3)', cursor: (selectedRouteId && selectedStopId) ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                  {savingTransport ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : transportAssignment === 'none' ? (
            <div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>Not assigned to a bus route.</p>
              <button onClick={() => { setAssigningTransport(true); setSelectedRouteId(''); setSelectedStopId(''); loadRoutesForAssignment(); }}
                style={{ width: '100%', padding: '8px 0', border: '1px solid rgba(232,160,32,0.3)', borderRadius: 6, background: 'rgba(232,160,32,0.08)', color: '#E8A020', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                + Assign to route
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontSize: 13.5, color: '#fff', fontWeight: 500 }}>
                  {transportAssignment.transport_routes?.route_no} — {transportAssignment.transport_routes?.driver_name}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {transportAssignment.transport_stops?.stop_name}
                  {transportAssignment.transport_stops?.pickup_time ? ` · ${transportAssignment.transport_stops.pickup_time}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { setAssigningTransport(true); setSelectedRouteId(transportAssignment.route_id); setSelectedStopId(transportAssignment.stop_id); loadRoutesForAssignment().then(() => loadStopsForRoute(transportAssignment.route_id)); }}
                  style={{ padding: '6px 10px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                  Change
                </button>
                <button onClick={removeTransportAssignment}
                  style={{ padding: '6px 10px', border: '1px solid rgba(224,90,90,0.3)', borderRadius: 6, background: 'rgba(224,90,90,0.06)', color: '#E05A5A', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Everything else — request-based, admin approval required */}
        <CorrectionRequest
          module="student"
          recordId={student.id}
          recordLabel={`${student.full_name} (${student.sid})`}
          fields={REQUESTABLE_FIELDS}
          currentValues={student}
          buttonStyle={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
        />

      </div>

      <SchoolNav />
      <BugReporter screenName="student_detail" />
    </div>
  );
}
