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
  label: { color: 'rgba(255,255,255,0.6)' },
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
      <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
        Find student
      </label>
      <input value={query} onChange={(e) => search(e.target.value)} placeholder="Name or SID..." style={{ ...S.input, width: '100%' }} autoFocus />
      {searching && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>Searching...</p>}
      {results.map((s) => (
        <div key={s.id} onClick={() => onSelect(s.id)}
          style={{ padding: '10px 4px', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: '#fff' }}>{s.full_name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
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

  React.useEffect(() => {
    if (!id) return;
    loadStudent();
  }, [id]);

  async function loadStudent() {
    setLoading(true);
    const { data } = await supabase
      .from('students')
      .select('id, full_name, sid, dob, gender, section, parent_name, parent_phone, blood_group, admission_no, caste_category, apaar_id, village_id, class_id, classes(class_name)')
      .eq('id', id)
      .single();
    setStudent(data || null);
    setLoading(false);
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

    if (!error) {
      setStudent((s) => ({ ...s, [editingField]: fieldDraft.trim() }));
      logActivity(tenant, 'student_field_direct_edit', 'info', {
        studentId: id, field: editingField,
      });
    }
    setSaving(false);
    setEditingField(null);
  }

  if (!id) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Student detail</p>
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
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
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
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>
              {student.sid} · {student.classes?.class_name}{student.section ? `-${student.section}` : ''}
            </p>
          </div>
        </div>

        {/* Read-only fields */}
        <div style={S.card}>
          <div style={S.row}><span style={S.label}>Date of birth</span><span style={S.value}>{student.dob || '—'}</span></div>
          <div style={S.row}><span style={S.label}>Gender</span><span style={S.value}>{student.gender || '—'}</span></div>
          <div style={S.row}><span style={S.label}>Parent name</span><span style={S.value}>{student.parent_name || '—'}</span></div>
          <div style={{ ...S.row, borderBottom: 'none' }}><span style={S.label}>Admission no</span><span style={S.value}>{student.admission_no || '—'}</span></div>
        </div>

        {/* Directly editable — safety/time critical */}
        <div style={{ ...S.card, background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.2)' }}>
          <p style={{ fontSize: 12, color: '#E8A020', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 10px' }}>Editable directly</p>

          <div style={S.row}>
            <span style={S.label}>Parent phone</span>
            {editingField === 'parent_phone' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} style={S.input} autoFocus />
                <button onClick={saveDirectEdit} disabled={saving} style={{ padding: '0 12px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <span style={S.value} onClick={() => startEdit('parent_phone')} title="Click to edit">
                {student.parent_phone || '—'} <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>✎</span>
              </span>
            )}
          </div>

          <div style={{ ...S.row, borderBottom: 'none' }}>
            <span style={S.label}>Blood group</span>
            {editingField === 'blood_group' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} style={{ ...S.input, width: 90 }} autoFocus />
                <button onClick={saveDirectEdit} disabled={saving} style={{ padding: '0 12px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <span style={S.value} onClick={() => startEdit('blood_group')} title="Click to edit">
                {student.blood_group || '—'} <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>✎</span>
              </span>
            )}
          </div>
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
