// hospital/PatientDetail.jsx — NEW
// Read-only patient record. Anyone with view access can open this.
// phone, blood_group, and allergies are safety/time-critical — editable
// directly, no approval needed (a wrong or missing allergy shouldn't
// sit in an approval queue). Identity fields and the ABHA (national
// health ID) link go through CorrectionRequest, which routes to an
// admin for approval before anything changes.
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { logActivity } from '../shared/logActivity';
import CorrectionRequest, { PATIENT_FIELDS } from '../shared/CorrectionRequest';
import HospitalNav from '../shared/HospitalNav';
import BugReporter from '../shared/BugReporter';

// phone, blood_group, and allergies are direct-edit below, not
// request-based — everything else in PATIENT_FIELDS still applies.
const REQUESTABLE_FIELDS = PATIENT_FIELDS.filter(
  (f) => !['phone', 'blood_group', 'allergies'].includes(f.key)
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

function PatientSearch({ appId, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function search(q) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('patients')
      .select('id, full_name, patient_uid, phone, gender')
      .eq('app_id', appId)
      .or(`full_name.ilike.%${q}%,patient_uid.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8);
    setResults(data || []);
    setSearching(false);
  }

  return (
    <div style={S.card}>
      <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
        Find patient
      </label>
      <input value={query} onChange={(e) => search(e.target.value)} placeholder="Name, UID or phone..." style={{ ...S.input, width: '100%' }} autoFocus />
      {searching && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>Searching...</p>}
      {results.map((p) => (
        <div key={p.id} onClick={() => onSelect(p.id)}
          style={{ padding: '10px 4px', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: '#fff' }}>{p.full_name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            {p.patient_uid}{p.phone ? ` · ${p.phone}` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function PatientDetail({ patientId }) {
  const { tenant } = useTenant();
  const [id, setId] = useState(patientId || null);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingField, setEditingField] = useState(null); // 'phone' | 'blood_group' | 'allergies' | null
  const [fieldDraft, setFieldDraft] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!id) return;
    loadPatient();
  }, [id]);

  async function loadPatient() {
    setLoading(true);
    const { data } = await supabase
      .from('patients')
      .select('id, full_name, patient_uid, dob, gender, phone, blood_group, allergies, address, abha_id, abha_linked')
      .eq('id', id)
      .single();
    setPatient(data || null);
    setLoading(false);
  }

  function startEdit(field) {
    setEditingField(field);
    setFieldDraft(patient[field] || '');
  }

  async function saveDirectEdit() {
    if (!editingField) return;
    setSaving(true);
    const { error } = await supabase
      .from('patients')
      .update({ [editingField]: fieldDraft.trim() })
      .eq('id', id);

    if (!error) {
      setPatient((p) => ({ ...p, [editingField]: fieldDraft.trim() }));
      logActivity(tenant, 'patient_field_direct_edit', 'info', {
        patientId: id, field: editingField,
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
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Patient detail</p>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Find a patient</h1>
          </div>
          <PatientSearch appId={tenant?.appId} onSelect={setId} />
        </div>
        <HospitalNav />
      </div>
    );
  }

  if (loading || !patient) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        </div>
      </div>
    );
  }

  const initials = patient.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(90,154,223,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, color: '#5A9ADF' }}>
            {initials}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>{patient.full_name}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>
              {patient.patient_uid}{patient.abha_linked ? ' · ABHA ✓' : ''}
            </p>
          </div>
        </div>

        {/* Read-only fields */}
        <div style={S.card}>
          <div style={S.row}><span style={S.label}>Date of birth</span><span style={S.value}>{patient.dob || '—'}</span></div>
          <div style={S.row}><span style={S.label}>Gender</span><span style={S.value}>{patient.gender || '—'}</span></div>
          <div style={S.row}><span style={S.label}>Address</span><span style={S.value}>{patient.address || '—'}</span></div>
          <div style={{ ...S.row, borderBottom: 'none' }}><span style={S.label}>ABHA ID</span><span style={S.value}>{patient.abha_id || '—'}</span></div>
        </div>

        {/* Directly editable — safety/time critical */}
        <div style={{ ...S.card, background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.2)' }}>
          <p style={{ fontSize: 12, color: '#E05A5A', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 10px' }}>Editable directly</p>

          <div style={S.row}>
            <span style={S.label}>Phone</span>
            {editingField === 'phone' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} style={S.input} autoFocus />
                <button onClick={saveDirectEdit} disabled={saving} style={{ padding: '0 12px', background: '#E05A5A', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <span style={S.value} onClick={() => startEdit('phone')} title="Click to edit">
                {patient.phone || '—'} <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>✎</span>
              </span>
            )}
          </div>

          <div style={S.row}>
            <span style={S.label}>Blood group</span>
            {editingField === 'blood_group' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} style={{ ...S.input, width: 90 }} autoFocus />
                <button onClick={saveDirectEdit} disabled={saving} style={{ padding: '0 12px', background: '#E05A5A', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <span style={S.value} onClick={() => startEdit('blood_group')} title="Click to edit">
                {patient.blood_group || '—'} <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>✎</span>
              </span>
            )}
          </div>

          <div style={{ ...S.row, borderBottom: 'none' }}>
            <span style={S.label}>Allergies</span>
            {editingField === 'allergies' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} style={S.input} autoFocus />
                <button onClick={saveDirectEdit} disabled={saving} style={{ padding: '0 12px', background: '#E05A5A', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {saving ? '...' : 'Save'}
                </button>
              </div>
            ) : (
              <span style={S.value} onClick={() => startEdit('allergies')} title="Click to edit">
                {patient.allergies || 'None recorded'} <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>✎</span>
              </span>
            )}
          </div>
        </div>

        {/* Everything else — request-based, admin approval required */}
        <CorrectionRequest
          module="patient"
          recordId={patient.id}
          recordLabel={`${patient.full_name} (${patient.patient_uid})`}
          fields={REQUESTABLE_FIELDS}
          currentValues={patient}
          buttonStyle={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
        />

      </div>

      <HospitalNav />
      <BugReporter screenName="patient_detail" />
    </div>
  );
}
