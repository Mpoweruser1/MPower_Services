// shared/DischargeSummaryDocument.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import PrintHeader from './PrintHeader';

export default function DischargeSummaryDocument({ admission, onClose }) {
  const { tenant } = useTenant();
  const [vitals, setVitals] = useState([]);

  useEffect(() => {
    if (admission?.id) loadVitals();
  }, [admission?.id]);

  async function loadVitals() {
    const { data } = await supabase
      .from('patient_vitals')
      .select('bp_systolic, bp_diastolic, pulse, temperature_f, weight_kg, recorded_at')
      .eq('context_type', 'ipd').eq('context_id', admission.id)
      .order('recorded_at');
    setVitals(data || []);
  }

  if (!admission) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000, overflowY: 'auto', padding: 20 }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-safe, .print-safe * { background: #fff !important; color: #000 !important; border-color: #ccc !important; }
        }
      `}</style>
      <div className="print-safe" style={{ maxWidth: 700, margin: '0 auto', background: '#161618', borderRadius: 12, padding: 32, fontFamily: "'Inter', -apple-system, sans-serif" }}>

        <PrintHeader documentTitle="Discharge Summary" />

        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 20 }}>
          <button onClick={() => window.print()}
            style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
            🖨️ Print
          </button>
          <button onClick={onClose}
            style={{ padding: '8px 16px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            Close
          </button>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 20px', textAlign: 'center' }}>
          Discharge Summary
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, fontSize: 13 }}>
          <div>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase' }}>Patient</p>
            <p style={{ margin: '3px 0 0', color: '#fff', fontWeight: 600 }}>{admission.patientName}</p>
            <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.5)' }}>{admission.patientUid} · {admission.patientGender}</p>
          </div>
          <div>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase' }}>Admission</p>
            <p style={{ margin: '3px 0 0', color: '#fff' }}>{admission.wardName} Ward · Bed {admission.bedNo}</p>
            <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.5)' }}>
              {admission.admittedOn} → {new Date().toISOString().slice(0, 10)}
              {admission.lengthOfStayDays != null && ` · ${admission.lengthOfStayDays} day${admission.lengthOfStayDays === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Diagnosis</p>
          <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{admission.diagnosis || '—'}</p>
        </div>

        {vitals.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Vitals recorded during stay</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 4px', color: 'rgba(255,255,255,0.4)' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '6px 4px', color: 'rgba(255,255,255,0.4)' }}>BP</th>
                  <th style={{ textAlign: 'left', padding: '6px 4px', color: 'rgba(255,255,255,0.4)' }}>Pulse</th>
                  <th style={{ textAlign: 'left', padding: '6px 4px', color: 'rgba(255,255,255,0.4)' }}>Temp</th>
                  <th style={{ textAlign: 'left', padding: '6px 4px', color: 'rgba(255,255,255,0.4)' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {vitals.map((v, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '6px 4px', color: 'rgba(255,255,255,0.6)' }}>{new Date(v.recorded_at).toLocaleDateString('en-IN')}</td>
                    <td style={{ padding: '6px 4px', color: 'rgba(255,255,255,0.6)' }}>{v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : '—'}</td>
                    <td style={{ padding: '6px 4px', color: 'rgba(255,255,255,0.6)' }}>{v.pulse || '—'}</td>
                    <td style={{ padding: '6px 4px', color: 'rgba(255,255,255,0.6)' }}>{v.temperature_f ? `${v.temperature_f}°F` : '—'}</td>
                    <td style={{ padding: '6px 4px', color: 'rgba(255,255,255,0.6)' }}>{v.weight_kg ? `${v.weight_kg}kg` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 6px', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Discharge Summary & Instructions</p>
          <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{admission.summary}</p>
        </div>

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          <span>Discharged: {admission.dischargedAt}</span>
          <span>{tenant?.orgName}</span>
        </div>

      </div>
    </div>
  );
}
