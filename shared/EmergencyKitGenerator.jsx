// shared/EmergencyKitGenerator.jsx
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

const KIT_TYPES = {
  school: [
    { code: 'attendance', label: 'Blank attendance register', freq: 'Weekly' },
    { code: 'fee_receipt', label: 'Manual fee receipt book', freq: 'Always available' },
    { code: 'student_master', label: 'Student master list', freq: 'Monthly' },
    { code: 'medical', label: 'Medical emergency cards', freq: 'Per admission' },
    { code: 'hostel', label: 'Hostel student list', freq: 'Weekly' },
    { code: 'transport', label: 'Transport route sheets', freq: 'Per term' },
  ],
  hospital: [
    { code: 'opd_token', label: 'OPD token/queue register', freq: 'Always available' },
    { code: 'prescription_pad', label: 'Manual prescription pad', freq: 'Always available' },
    { code: 'patient_master', label: 'Patient master list', freq: 'Weekly' },
    { code: 'bed_status', label: 'Bed status board (paper backup)', freq: 'Daily' },
    { code: 'billing_receipt', label: 'Manual billing receipt book', freq: 'Always available' },
    { code: 'drug_stock', label: 'Critical drug stock list', freq: 'Weekly' },
  ],
};

export default function EmergencyKitGenerator({ appType = 'school' }) {
  const { tenant } = useTenant();
  const [generating, setGenerating] = useState(null);
  const kits = KIT_TYPES[appType];

  async function generateKit(kit) {
    if (!tenant) { alert('Please log in first.'); return; }
    setGenerating(kit.code);

    const { error } = await supabase.from('emergency_kit_log').insert({
      app_id: tenant.appId, kit_type: kit.code, generated_by: tenant.userRowId, is_active: true,
    });
    if (error) console.error(error);

    setTimeout(() => { setGenerating(null); window.print(); }, 600);
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', fontFamily: 'sans-serif', padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Emergency Continuity Kit</h2>
      <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Print these and keep in a physical folder — your backup if internet, power, or the app is unavailable.</p>
      {kits.map((kit) => (
        <div key={kit.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid #eee', borderRadius: 8, marginBottom: 8 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>{kit.label}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{kit.freq}</p>
          </div>
          <button onClick={() => generateKit(kit)} disabled={generating === kit.code} style={{ fontSize: 12, padding: '5px 12px', border: 'none', borderRadius: 6, background: '#A32D2D', color: '#fff', cursor: generating === kit.code ? 'not-allowed' : 'pointer' }}>
            {generating === kit.code ? 'Generating...' : 'Generate & print'}
          </button>
        </div>
      ))}
    </div>
  );
}