// shared/PatientSelector.jsx
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

export default function PatientSelector({
  selectedPatient, onSelect, onClear,
  label = 'Select patient',
  showTodayQueue = false,
  showAdmitted = true,
}) {
  const { tenant } = useTenant();
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function search(q) {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('patients')
      .select('id, full_name, patient_uid, phone, gender, dob, blood_group')
      .eq('app_id', tenant.appId)
      .or(`full_name.ilike.%${q}%,patient_uid.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8);
    setResults(data || []);
    setSearching(false);
  }

  if (selectedPatient) {
    return (
      <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{selectedPatient.full_name}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            {selectedPatient.patient_uid}
            {selectedPatient.gender ? ` · ${selectedPatient.gender}` : ''}
            {selectedPatient.phone ? ` · ${selectedPatient.phone}` : ''}
            {selectedPatient.blood_group ? ` · ${selectedPatient.blood_group}` : ''}
          </p>
        </div>
        <button onClick={onClear}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.5)', padding: '4px 10px', fontFamily: 'inherit' }}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>{label}</p>
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search by name, UID or phone..."
        style={{ width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
        autoFocus
      />
      {searching && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>Searching...</p>}
      {results.length > 0 && (
        <div style={{ marginTop: 8, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
          {results.map((p) => (
            <div key={p.id}
              onClick={() => { onSelect(p); setQuery(''); setResults([]); }}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#111113' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{p.full_name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                {p.patient_uid}
                {p.gender ? ` · ${p.gender}` : ''}
                {p.phone ? ` · ${p.phone}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
      {query.length >= 2 && !searching && results.length === 0 && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>No patients found for "{query}"</p>
      )}
    </div>
  );
}