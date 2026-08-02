// shared/ActivePatientBanner.jsx — FINAL
import React from 'react';
import { useVisit } from '../context/VisitContext';

export default function ActivePatientBanner() {
  const { activePatient, clearPatient } = useVisit();
  if (!activePatient) return null;

  return (
    <div style={{ background: 'rgba(90,154,223,0.08)', border: '1px solid rgba(90,154,223,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>ACTIVE PATIENT · చురుకైన రోగి</p>
        <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 500, color: '#fff' }}>{activePatient.full_name}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          {activePatient.patient_uid}
          {activePatient.phone ? ` · ${activePatient.phone}` : ''}
          {activePatient.abha_linked ? ' · ABHA ✓' : ''}
        </p>
      </div>
      <button
        onClick={clearPatient}
        style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter, sans-serif' }}
      >
        Clear ✕
      </button>
    </div>
  );
}