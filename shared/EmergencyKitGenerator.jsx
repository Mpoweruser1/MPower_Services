// shared/EmergencyKitGenerator.jsx — REBUILT
// Was previously non-functional: window.print() fired on whatever was
// currently on screen — the list of buttons itself, not any actual
// kit content. No template existed for any of the 12 kit types. This
// version builds real, distinct printable content per kit: live data
// pulled from the database where that makes sense (student lists,
// patient lists, hostel residents, current bed status), and genuine
// blank paper templates where there's no live data to pull (registers,
// receipt books, prescription pads).
//
// Honest exception: 'Critical drug stock list' cannot show real data
// — there is no pharmacy/drug inventory table in this app yet (Hospital
// Pharmacy is confirmed not built). Rather than fake it, this kit
// prints a blank fill-in-the-blank stock sheet instead, with a clear
// note explaining why.
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

const KIT_TYPES = {
  school: [
    { code: 'attendance', label: 'Blank attendance register', freq: 'Weekly', live: false },
    { code: 'fee_receipt', label: 'Manual fee receipt book', freq: 'Always available', live: false },
    { code: 'student_master', label: 'Student master list', freq: 'Monthly', live: true },
    { code: 'medical', label: 'Medical emergency cards', freq: 'Per admission', live: true },
    { code: 'hostel', label: 'Hostel student list', freq: 'Weekly', live: true },
    { code: 'transport', label: 'Transport route sheets', freq: 'Per term', live: true },
  ],
  hospital: [
    { code: 'opd_token', label: 'OPD token/queue register', freq: 'Always available', live: false },
    { code: 'prescription_pad', label: 'Manual prescription pad', freq: 'Always available', live: false },
    { code: 'patient_master', label: 'Patient master list', freq: 'Weekly', live: true },
    { code: 'bed_status', label: 'Bed status board (paper backup)', freq: 'Daily', live: true },
    { code: 'billing_receipt', label: 'Manual billing receipt book', freq: 'Always available', live: false },
    { code: 'drug_stock', label: 'Critical drug stock list', freq: 'Weekly', live: false, unavailableNote: true },
  ],
};

const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #333', fontSize: 11 };
const td = { padding: '6px 8px', borderBottom: '1px solid #ccc', fontSize: 11, minHeight: 22 };
const blankTd = { padding: '10px 8px', borderBottom: '1px solid #ccc' };

function PrintDoc({ title, orgName, children }) {
  return (
    <div style={{ padding: '24px 28px', fontFamily: 'sans-serif', color: '#000' }}>
      <div style={{ borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 10, color: '#666', margin: 0 }}>{orgName} — Emergency Continuity Kit</p>
          <h3 style={{ fontSize: 16, margin: '2px 0 0' }}>{title}</h3>
        </div>
        <p style={{ fontSize: 10, color: '#666', margin: 0 }}>Generated: {new Date().toLocaleString('en-IN')}</p>
      </div>
      {children}
    </div>
  );
}

function blankRows(n, cols) {
  return Array.from({ length: n }, (_, i) => (
    <tr key={i}>{cols.map((_, c) => <td key={c} style={blankTd}>&nbsp;</td>)}</tr>
  ));
}

export default function EmergencyKitGenerator({ appType = 'school' }) {
  const { tenant } = useTenant();
  const [generating, setGenerating] = useState(null);
  const [printContent, setPrintContent] = useState(null);
  const [error, setError] = useState('');
  const kits = KIT_TYPES[appType];

  async function generateKit(kit) {
    if (!tenant) { alert('Please log in first.'); return; }
    setGenerating(kit.code);
    setError('');

    const { error: logErr } = await supabase.from('emergency_kit_log').insert({
      app_id: tenant.appId, kit_type: kit.code, generated_by: tenant.userRowId, is_active: true,
    });
    // Non-blocking — a failed usage log shouldn't stop someone from
    // getting the actual paper backup they need right now, but it's
    // still surfaced so it's not silently lost.
    if (logErr) console.error('Emergency kit log failed (non-blocking):', logErr);

    let content = null;
    try {
      content = await buildKitContent(kit, tenant);
    } catch (err) {
      console.error('Kit generation failed:', err);
      setError(`Failed to generate ${kit.label}: ${err.message || 'please try again.'}`);
      setGenerating(null);
      return;
    }

    setPrintContent(content);
    setGenerating(null);
    setTimeout(() => window.print(), 100);
  }

  async function buildKitContent(kit, tenant) {
    const orgName = tenant.orgName || 'MPower';

    if (kit.code === 'student_master') {
      const { data, error } = await supabase.from('students')
        .select('full_name, sid, classes(class_name), section, parent_phone')
        .eq('app_id', tenant.appId).eq('status', 'active').order('full_name');
      if (error) throw error;
      return <PrintDoc title="Student Master List" orgName={orgName}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Name</th><th style={th}>SID</th><th style={th}>Class</th><th style={th}>Parent phone</th></tr></thead>
          <tbody>{(data || []).map((s) => <tr key={s.sid}><td style={td}>{s.full_name}</td><td style={td}>{s.sid}</td><td style={td}>{s.classes?.class_name}{s.section ? `-${s.section}` : ''}</td><td style={td}>{s.parent_phone || '—'}</td></tr>)}</tbody>
        </table>
      </PrintDoc>;
    }

    if (kit.code === 'medical') {
      const { data, error } = await supabase.from('students')
        .select('full_name, sid, classes(class_name), section, blood_group, parent_phone')
        .eq('app_id', tenant.appId).eq('status', 'active').order('full_name');
      if (error) throw error;
      return <PrintDoc title="Medical Emergency Cards" orgName={orgName}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {(data || []).map((s) => (
            <div key={s.sid} style={{ border: '1px solid #000', borderRadius: 6, padding: 10, pageBreakInside: 'avoid' }}>
              <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>{s.full_name}</p>
              <p style={{ fontSize: 10, margin: '2px 0' }}>{s.sid} · {s.classes?.class_name}{s.section ? `-${s.section}` : ''}</p>
              <p style={{ fontSize: 10, margin: '2px 0' }}>Blood group: <strong>{s.blood_group || 'Not recorded'}</strong></p>
              <p style={{ fontSize: 10, margin: '2px 0' }}>Parent contact: <strong>{s.parent_phone || 'Not recorded'}</strong></p>
            </div>
          ))}
        </div>
      </PrintDoc>;
    }

    if (kit.code === 'hostel') {
      const { data, error } = await supabase.from('students')
        .select('full_name, sid, classes(class_name), section, parent_phone')
        .eq('app_id', tenant.appId).eq('status', 'active').eq('student_type', 'hostel').order('full_name');
      if (error) throw error;
      return <PrintDoc title="Hostel Student List" orgName={orgName}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Name</th><th style={th}>SID</th><th style={th}>Class</th><th style={th}>Parent phone</th></tr></thead>
          <tbody>{(data || []).map((s) => <tr key={s.sid}><td style={td}>{s.full_name}</td><td style={td}>{s.sid}</td><td style={td}>{s.classes?.class_name}{s.section ? `-${s.section}` : ''}</td><td style={td}>{s.parent_phone || '—'}</td></tr>)}</tbody>
        </table>
      </PrintDoc>;
    }

    if (kit.code === 'transport') {
      const { data, error } = await supabase.from('transport_routes')
        .select('route_no, driver_name, driver_phone, vehicle_no, transport_stops(stop_name, arrival_time)')
        .eq('app_id', tenant.appId).order('route_no');
      if (error) throw error;
      return <PrintDoc title="Transport Route Sheets" orgName={orgName}>
        {(data || []).map((r) => (
          <div key={r.route_no} style={{ marginBottom: 16, pageBreakInside: 'avoid' }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>Route {r.route_no} — Driver: {r.driver_name || '—'} ({r.driver_phone || '—'}) — Vehicle: {r.vehicle_no || '—'}</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Stop</th><th style={th}>Arrival time</th></tr></thead>
              <tbody>{(r.transport_stops || []).map((s) => <tr key={s.stop_name}><td style={td}>{s.stop_name}</td><td style={td}>{s.arrival_time || '—'}</td></tr>)}</tbody>
            </table>
          </div>
        ))}
      </PrintDoc>;
    }

    if (kit.code === 'patient_master') {
      const { data, error } = await supabase.from('patients')
        .select('full_name, patient_uid, phone, blood_group')
        .eq('app_id', tenant.appId).order('full_name').limit(500);
      if (error) throw error;
      return <PrintDoc title="Patient Master List" orgName={orgName}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Name</th><th style={th}>UID</th><th style={th}>Phone</th><th style={th}>Blood group</th></tr></thead>
          <tbody>{(data || []).map((p) => <tr key={p.patient_uid}><td style={td}>{p.full_name}</td><td style={td}>{p.patient_uid}</td><td style={td}>{p.phone || '—'}</td><td style={td}>{p.blood_group || '—'}</td></tr>)}</tbody>
        </table>
      </PrintDoc>;
    }

    if (kit.code === 'bed_status') {
      const { data: wards, error } = await supabase.from('wards')
        .select('ward_type, total_beds, ipd_admissions(bed_no, discharge_date, patients(full_name))')
        .eq('app_id', tenant.appId);
      if (error) throw error;
      return <PrintDoc title="Bed Status Board" orgName={orgName}>
        {(wards || []).map((w) => {
          const occupied = (w.ipd_admissions || []).filter((a) => !a.discharge_date);
          return (
            <div key={w.ward_type} style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>{w.ward_type} — {occupied.length}/{w.total_beds} occupied</p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Bed</th><th style={th}>Patient</th></tr></thead>
                <tbody>{occupied.map((a) => <tr key={a.bed_no}><td style={td}>{a.bed_no}</td><td style={td}>{a.patients?.full_name}</td></tr>)}</tbody>
              </table>
            </div>
          );
        })}
      </PrintDoc>;
    }

    if (kit.code === 'attendance') {
      return <PrintDoc title="Blank Attendance Register" orgName={orgName}>
        <p style={{ fontSize: 11, marginBottom: 8 }}>Class: ______________  Section: ______  Week of: ______________</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Student name</th><th style={th}>Mon</th><th style={th}>Tue</th><th style={th}>Wed</th><th style={th}>Thu</th><th style={th}>Fri</th><th style={th}>Sat</th></tr></thead>
          <tbody>{blankRows(35, [1, 2, 3, 4, 5, 6, 7])}</tbody>
        </table>
      </PrintDoc>;
    }

    if (kit.code === 'fee_receipt' || kit.code === 'billing_receipt') {
      const label = kit.code === 'fee_receipt' ? 'Fee' : 'Billing';
      return <PrintDoc title={`Manual ${label} Receipt Book`} orgName={orgName}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} style={{ border: '1px dashed #666', borderRadius: 4, padding: 10, marginBottom: 10, pageBreakInside: 'avoid', fontSize: 11 }}>
            <p style={{ margin: 0 }}>Receipt No: ________________  Date: ________________</p>
            <p style={{ margin: '4px 0' }}>Received from: ________________________________________</p>
            <p style={{ margin: '4px 0' }}>Amount: ₹______________  Mode: Cash / UPI / Card</p>
            <p style={{ margin: '4px 0' }}>Received by: ________________________________________</p>
          </div>
        ))}
      </PrintDoc>;
    }

    if (kit.code === 'opd_token') {
      return <PrintDoc title="OPD Token / Queue Register" orgName={orgName}>
        <p style={{ fontSize: 11, marginBottom: 8 }}>Date: ______________</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Token</th><th style={th}>Patient name</th><th style={th}>Time</th><th style={th}>Doctor</th></tr></thead>
          <tbody>{blankRows(30, [1, 2, 3, 4])}</tbody>
        </table>
      </PrintDoc>;
    }

    if (kit.code === 'prescription_pad') {
      return <PrintDoc title="Manual Prescription Pad" orgName={orgName}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ border: '1px solid #000', borderRadius: 4, padding: 14, marginBottom: 14, pageBreakInside: 'avoid', minHeight: 180 }}>
            <p style={{ fontSize: 11, margin: 0 }}>Patient: ________________________  Date: ______________</p>
            <p style={{ fontSize: 11, margin: '4px 0' }}>Diagnosis: ________________________________________</p>
            <p style={{ fontSize: 20, margin: '10px 0 0' }}>℞</p>
            <div style={{ borderTop: '1px solid #ccc', marginTop: 60, paddingTop: 6 }}>
              <p style={{ fontSize: 10, margin: 0 }}>Doctor's signature: ________________________</p>
            </div>
          </div>
        ))}
      </PrintDoc>;
    }

    if (kit.code === 'drug_stock') {
      return <PrintDoc title="Critical Drug Stock List" orgName={orgName}>
        <div style={{ background: '#fff3cd', border: '1px solid #E8A020', borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 11 }}>
          Note: There is no drug inventory system in MPower yet, so this cannot show real stock levels — it's a blank sheet to record counts by hand.
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Drug name</th><th style={th}>Current stock</th><th style={th}>Reorder level</th><th style={th}>Notes</th></tr></thead>
          <tbody>{blankRows(20, [1, 2, 3, 4])}</tbody>
        </table>
      </PrintDoc>;
    }

    return null;
  }

  return (
    <div>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>

      <div className="no-print" style={{ maxWidth: 640, margin: '0 auto', fontFamily: 'sans-serif', padding: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Emergency Continuity Kit</h2>
        <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Print these and keep in a physical folder — your backup if internet, power, or the app is unavailable.</p>

        {error && (
          <div style={{ background: '#FEE', border: '1px solid #E05A5A', borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 12, color: '#A32D2D' }}>
            ⚠ {error}
          </div>
        )}

        {kits.map((kit) => (
          <div key={kit.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid #eee', borderRadius: 8, marginBottom: 8 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>{kit.label}{kit.live && <span style={{ marginLeft: 6, fontSize: 10, color: '#185FA5' }}>● live data</span>}</p>
              <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{kit.freq}{kit.unavailableNote && ' · blank template (no inventory system yet)'}</p>
            </div>
            <button onClick={() => generateKit(kit)} disabled={generating === kit.code} style={{ fontSize: 12, padding: '5px 12px', border: 'none', borderRadius: 6, background: '#A32D2D', color: '#fff', cursor: generating === kit.code ? 'not-allowed' : 'pointer' }}>
              {generating === kit.code ? 'Generating...' : 'Generate & print'}
            </button>
          </div>
        ))}
      </div>

      {/* Print-only content — hidden on screen, only shown via window.print() */}
      <div className="print-only" style={{ display: 'none' }}>
        <style>{`@media print { .print-only { display: block !important; } }`}</style>
        {printContent}
      </div>
    </div>
  );
}
