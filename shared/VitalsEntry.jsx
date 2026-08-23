// shared/VitalsEntry.jsx — NEW
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

const S = {
  input: (err) => ({ padding: '9px 12px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 7, fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', width: '100%' }),
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' },
};

export default function VitalsEntry({ patientId, contextType, contextId, onSaved }) {
  const { tenant } = useTenant();
  const [vitals, setVitals] = useState({ bp_systolic: '', bp_diastolic: '', pulse: '', temperature_f: '', weight_kg: '', height_cm: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update(field, value) {
    setVitals((v) => ({ ...v, [field]: value.replace(/[^0-9.]/g, '') }));
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('patient_vitals').insert({
      app_id: tenant.appId,
      patient_id: patientId,
      context_type: contextType,
      context_id: contextId,
      bp_systolic: vitals.bp_systolic ? parseInt(vitals.bp_systolic) : null,
      bp_diastolic: vitals.bp_diastolic ? parseInt(vitals.bp_diastolic) : null,
      pulse: vitals.pulse ? parseInt(vitals.pulse) : null,
      temperature_f: vitals.temperature_f ? Number(vitals.temperature_f) : null,
      weight_kg: vitals.weight_kg ? Number(vitals.weight_kg) : null,
      height_cm: vitals.height_cm ? Number(vitals.height_cm) : null,
      recorded_by: tenant.userRowId,
    });
    setSaving(false);
    if (!error) {
      setSaved(true);
      onSaved?.();
    }
  }

  if (saved) {
    return (
      <div style={{ padding: '10px 14px', background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8, fontSize: 12, color: '#6AAA90' }}>
        ✓ Vitals recorded
      </div>
    );
  }

  return (
    <div style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Vitals (optional)</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <label style={S.label}>BP systolic</label>
          <input value={vitals.bp_systolic} onChange={(e) => update('bp_systolic', e.target.value)} placeholder="120" inputMode="numeric" style={S.input(false)} />
        </div>
        <div>
          <label style={S.label}>BP diastolic</label>
          <input value={vitals.bp_diastolic} onChange={(e) => update('bp_diastolic', e.target.value)} placeholder="80" inputMode="numeric" style={S.input(false)} />
        </div>
        <div>
          <label style={S.label}>Pulse (bpm)</label>
          <input value={vitals.pulse} onChange={(e) => update('pulse', e.target.value)} placeholder="72" inputMode="numeric" style={S.input(false)} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={S.label}>Temp (°F)</label>
          <input value={vitals.temperature_f} onChange={(e) => update('temperature_f', e.target.value)} placeholder="98.6" inputMode="decimal" style={S.input(false)} />
        </div>
        <div>
          <label style={S.label}>Weight (kg)</label>
          <input value={vitals.weight_kg} onChange={(e) => update('weight_kg', e.target.value)} placeholder="65" inputMode="decimal" style={S.input(false)} />
        </div>
        <div>
          <label style={S.label}>Height (cm)</label>
          <input value={vitals.height_cm} onChange={(e) => update('height_cm', e.target.value)} placeholder="165" inputMode="decimal" style={S.input(false)} />
        </div>
      </div>
      <button onClick={save} disabled={saving}
        style={{ width: '100%', padding: 9, border: '1px solid rgba(90,154,223,0.3)', borderRadius: 7, background: 'rgba(90,154,223,0.08)', color: '#5A9ADF', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
        {saving ? 'Saving...' : 'Record vitals'}
      </button>
    </div>
  );
}
