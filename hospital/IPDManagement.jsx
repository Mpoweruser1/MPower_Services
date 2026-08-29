// hospital/IPDManagement.jsx — FINAL
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { useVisit } from '../context/VisitContext';
import { sanitize, validators } from '../shared/useFormValidation';
import PatientSelector from '../shared/PatientSelector';
import VitalsEntry from '../shared/VitalsEntry';
import DischargeSummaryDocument from '../shared/DischargeSummaryDocument';
import HospitalNav from '../shared/HospitalNav';
import NextActions from '../shared/NextActions';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  stat: { background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
  textarea: { width: '100%', padding: '10px 14px', background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function IPDManagement() {
  const { tenant }                                       = useTenant();
  const { activePatient, setActivePatient, clearPatient } = useVisit();

  const [wards, setWards]               = useState([]);
  const [admissions, setAdmissions]     = useState([]);
  const [tab, setTab]                   = useState('overview');
  const [loading, setLoading]           = useState(true);

  // Admit patient
  const [admitPatient, setAdmitPatient] = useState(null);
  const [vitalsOpenFor, setVitalsOpenFor] = useState(null);

  // Was importing activePatient from context but never actually using
  // it — a patient set active on Registration never carried through
  // to here. Only takes it on mount, so switching to a different
  // patient later within the same IPD screen doesn't get overridden.
  useEffect(() => {
    if (activePatient) setAdmitPatient(activePatient);
  }, []);
  const [admitWardId, setAdmitWardId]   = useState('');
  const [admitBedNo, setAdmitBedNo]     = useState('');
  const [admitBedError, setAdmitBedError] = useState('');
  const [admitDiagnosis, setAdmitDiagnosis] = useState('');
  const [admitting, setAdmitting]       = useState(false);
  const [admitError, setAdmitError]     = useState('');

  // Discharge
  const [dischargingAdm, setDischargingAdm]     = useState(null);
  const [dischargeSummary, setDischargeSummary] = useState('');
  const [dischargeSummaryError, setDischargeSummaryError] = useState('');
  const [discharging, setDischarging]           = useState(false);
  const [completedDischarge, setCompletedDischarge] = useState(null);

  useEffect(() => {
    if (tenant?.appId) loadAll();
  }, [tenant?.appId]);

  async function loadAll() {
    setLoading(true);
    const { data: wardData } = await supabase
      .from('wards').select('*').eq('app_id', tenant.appId).order('ward_type');

    const { data: admData } = await supabase
      .from('ipd_admissions')
      .select('*, patients(id, full_name, patient_uid, phone, gender, dob), wards(ward_type)')
      .is('discharge_date', null)
      .in('ward_id', (wardData || []).map((w) => w.id));

    const wardsWithBeds = (wardData || []).map((ward) => {
      const occupiedBeds = (admData || []).filter((a) => a.ward_id === ward.id).map((a) => a.bed_no);
      const beds = Array.from({ length: ward.total_beds || 0 }, (_, i) => {
        const bedNo = `${(ward.ward_type || 'W').slice(0, 1).toUpperCase()}${ward.id.slice(0, 4).toUpperCase()}-${i + 1}`;
        return { bedNo, occupied: occupiedBeds.includes(bedNo) };
      });
      return { ...ward, beds, occupied: occupiedBeds.length, available: (ward.total_beds || 0) - occupiedBeds.length };
    });

    setWards(wardsWithBeds);
    setAdmissions((admData || []).map((a) => ({
      id: a.id, patientId: a.patient_id,
      patientName:   a.patients?.full_name || '—',
      patientUid:    a.patients?.patient_uid || '—',
      patientPhone:  a.patients?.phone || '',
      patientGender: a.patients?.gender || '',
      bedNo:         a.bed_no,
      wardId:        a.ward_id,
      wardName:      a.wards?.ward_type || '—',
      admittedOn:    a.admission_date,
      diagnosis:     a.diagnosis || '',
    })));
    setLoading(false);
  }

  function validateBedNo(value, wardId) {
    if (!value.trim()) return 'Bed number is required';
    if (value.trim().length < 1) return 'Bed number too short';
    // Check if bed is already occupied
    const ward = wards.find((w) => w.id === wardId);
    if (ward) {
      const alreadyOccupied = admissions.some((a) => a.wardId === wardId && a.bedNo === value.trim());
      if (alreadyOccupied) return 'This bed is already occupied — please choose another';
    }
    return null;
  }

  async function selectPatientForAdmission(patient) {
    setAdmitPatient(patient);
    const { data: recentVisit } = await supabase
      .from('opd_visits')
      .select('diagnosis')
      .eq('patient_id', patient.id)
      .order('visit_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentVisit?.diagnosis) setAdmitDiagnosis(recentVisit.diagnosis);
  }

  async function admitToWard() {
    setAdmitError('');
    if (!admitPatient)  { setAdmitError('Select a patient.'); return; }
    if (!admitWardId)   { setAdmitError('Select a ward.'); return; }

    const bedErr = validateBedNo(admitBedNo, admitWardId);
    if (bedErr) { setAdmitBedError(bedErr); return; }

    // Check if patient is already admitted
    const alreadyAdmitted = admissions.some((a) => a.patientId === admitPatient.id);
    if (alreadyAdmitted) { setAdmitError('This patient is already admitted. Discharge first before re-admitting.'); return; }

    setAdmitting(true);

    // ipd_admissions_admitting_doctor_id_fkey requires this column to hold a
    // doctors.id, NOT a users.id. tenant.userRowId is the signed-in user's
    // users.id — correct for columns like created_by (FK to users.id) but
    // wrong here. doctors.staff_id is what links a users row to its doctors
    // profile, so look that up first. Not every account admitting a patient
    // has a doctors profile (a nurse or receptionist may do this), and the
    // column is nullable, so fall back to null rather than fail the whole
    // admission when no profile exists.
    const { data: doctorRow } = await supabase
      .from('doctors')
      .select('id')
      .eq('staff_id', tenant.userRowId)
      .maybeSingle();

    const { error } = await supabase.from('ipd_admissions').insert({
      // NOTE: no app_id here — ipd_admissions has no app_id column.
      // Tenant scoping for this table works indirectly through
      // patient_id -> patients.app_id (see the tenant_isolation_ipd
      // RLS policy), unlike most other hospital tables which do carry
      // app_id directly. Sending it here caused every single admission
      // to fail with "Could not find the 'app_id' column of
      // 'ipd_admissions' in the schema cache."
      patient_id:          admitPatient.id,
      ward_id:             admitWardId,
      bed_no:              admitBedNo.trim(),
      admission_date:      new Date().toISOString().slice(0, 10),
      admitting_doctor_id: doctorRow?.id || null,
      diagnosis:           admitDiagnosis.trim() || 'Pending',
    });

    if (error) console.error('Admission failed:', error);

    if (error) {
      // There is no unique constraint on (ward_id, bed_no) in the schema —
      // "bed already occupied" can only ever come from the client-side
      // validateBedNo() check above, which already passed by this point.
      // A DB-level failure here is something else (most commonly a foreign
      // key violation), so say so rather than blaming the bed.
      const isForeignKeyError = error.code === '23503';
      setAdmitError(
        isForeignKeyError
          ? 'Failed to admit patient — a linked record (doctor, patient, or ward) could not be found. Please refresh and try again.'
          : `Failed to admit patient. ${error.message || 'Please try again.'}`
      );
      setAdmitting(false);
      return;
    }

    setAdmitPatient(null);
    setAdmitWardId('');
    setAdmitBedNo('');
    setAdmitBedError('');
    setAdmitDiagnosis('');
    setAdmitting(false);
    loadAll();
    setTab('admissions');
  }

  async function discharge() {
    setDischargeSummaryError('');
    if (!dischargeSummary.trim()) { setDischargeSummaryError('Discharge summary is required.'); return; }
    if (dischargeSummary.trim().length < 10) { setDischargeSummaryError('Discharge summary is too short — please provide more detail.'); return; }

    setDischarging(true);
    await supabase.from('ipd_admissions').update({
      discharge_date: new Date().toISOString().slice(0, 10),
      discharge_summary: dischargeSummary,
    }).eq('id', dischargingAdm.id);

    if (dischargingAdm.patientPhone) {
      await supabase.functions.invoke('send-whatsapp', {
        body: { type: 'discharge_summary', patientId: dischargingAdm.patientId, summary: dischargeSummary },
      });
    }

    setCompletedDischarge({ ...dischargingAdm, summary: dischargeSummary, dischargedAt: new Date().toLocaleString('en-IN') });
    setDischargingAdm(null);
    setDischargeSummary('');
    setDischargeSummaryError('');
    setDischarging(false);
    loadAll();
  }

  const totalBeds     = wards.reduce((s, w) => s + (w.total_beds || 0), 0);
  const occupiedBeds  = admissions.length;
  const availableBeds = totalBeds - occupiedBeds;
  const occupancyPct  = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <div style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>IPD Management · IPD నిర్వహణ</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>IPD / Bed Management</h1>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { value: totalBeds,     label: 'Total beds',   color: '#fff',    alert: false },
            { value: `${occupiedBeds} (${occupancyPct}%)`, label: 'Occupied', color: '#E8A020', alert: occupancyPct > 85 },
            { value: availableBeds, label: 'Available',   color: availableBeds < 3 ? '#E05A5A' : '#6AAA90', alert: availableBeds < 3 },
            { value: wards.length,  label: 'Wards',       color: '#fff',    alert: false },
          ].map((s) => (
            <div key={s.label} style={{ ...S.stat, border: `1px solid ${s.alert ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: s.alert ? '#E05A5A' : s.color }}>{s.value}</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { k: 'overview',   l: 'Ward map' },
            { k: 'admissions', l: `Admitted (${admissions.length})` },
            { k: 'admit',      l: 'Admit patient' },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400, whiteSpace: 'nowrap' }}>
              {t.l}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        ) : (
          <>
            {/* Ward overview */}
            {tab === 'overview' && (
              wards.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No wards configured yet.</p>
                </div>
              ) : (
                wards.map((ward) => (
                  <div key={ward.id} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{ward.ward_type} Ward</p>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{ward.occupied}/{ward.total_beds} beds occupied</p>
                      </div>
                      <div style={{ background: '#111113', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: ward.available === 0 ? '#E05A5A' : '#6AAA90' }}>{ward.available}</p>
                        <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>available</p>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
                      {ward.beds.map((bed) => {
                        const adm = admissions.find((a) => a.bedNo === bed.bedNo && a.wardId === ward.id);
                        return (
                          <div key={bed.bedNo} title={bed.occupied ? (adm?.patientName || 'Occupied') : 'Available'}
                            style={{ padding: '6px 4px', borderRadius: 6, textAlign: 'center', fontSize: 9, fontWeight: 500, background: bed.occupied ? 'rgba(224,90,90,0.15)' : 'rgba(106,170,144,0.12)', color: bed.occupied ? '#E05A5A' : '#6AAA90', border: `1px solid ${bed.occupied ? 'rgba(224,90,90,0.25)' : 'rgba(106,170,144,0.2)'}` }}>
                            {bed.bedNo.split('-').pop()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )
            )}

            {/* Admissions list */}
            {tab === 'admissions' && (
              admissions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 32, marginBottom: 12 }}>🛏️</p>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No patients currently admitted.</p>
                </div>
              ) : (
                admissions.map((a) => (
                  <div key={a.id} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{a.patientName}</p>
                        <p style={{ margin: '3px 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{a.patientUid} · {a.patientGender}</p>
                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Bed {a.bedNo} · {a.wardName} Ward · Admitted {a.admittedOn}</p>
                      </div>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(106,170,144,0.12)', color: '#6AAA90', border: '1px solid rgba(106,170,144,0.2)', fontWeight: 500 }}>Admitted</span>
                    </div>

                    {vitalsOpenFor === a.id && (
                      <VitalsEntry patientId={a.patientId} contextType="ipd" contextId={a.id} onSaved={() => setVitalsOpenFor(null)} />
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setVitalsOpenFor(vitalsOpenFor === a.id ? null : a.id)}
                        style={{ flex: 1, padding: '8px 0', border: '1px solid rgba(90,154,223,0.3)', color: '#5A9ADF', background: 'rgba(90,154,223,0.06)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                        {vitalsOpenFor === a.id ? 'Close' : '🩺 Vitals'}
                      </button>
                      <button onClick={() => { setDischargingAdm(a); setDischargeSummary(''); setDischargeSummaryError(''); }}
                        style={{ flex: 1, padding: '8px 0', border: '1px solid rgba(232,160,32,0.3)', color: '#E8A020', background: 'rgba(232,160,32,0.06)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                        Discharge →
                      </button>
                      <button onClick={() => window.location.href = '/hospital/billing'}
                        style={{ flex: 1, padding: '8px 0', border: 'none', background: '#6AAA90', color: '#111113', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                        Generate bill
                      </button>
                    </div>
                  </div>
                ))
              )
            )}

            {/* Admit patient */}
            {tab === 'admit' && (
              <div style={S.card}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Admit patient · రోగిని చేర్చండి</p>

                {admitError && (
                  <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                    ⚠️ {admitError}
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <PatientSelector
                    selectedPatient={admitPatient}
                    onSelect={selectPatientForAdmission}
                    onClear={() => setAdmitPatient(null)}
                    label="Select patient to admit"
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={S.label}>Ward <span style={{ color: '#E05A5A' }}>*</span></label>
                  <select value={admitWardId}
                    onChange={(e) => { setAdmitWardId(e.target.value); setAdmitBedNo(''); setAdmitBedError(''); }}
                    style={{ ...S.input(false), cursor: 'pointer' }}>
                    <option value="">-- Select ward --</option>
                    {wards.filter((w) => w.available > 0).map((w) => (
                      <option key={w.id} value={w.id}>{w.ward_type} Ward — {w.available} beds available</option>
                    ))}
                  </select>
                  {wards.length === 0 ? (
                    <p style={{ fontSize: 11, color: '#E8A020', marginTop: 4 }}>
                      ⚠ No wards set up yet — <Link to="/hospital/wards" style={{ color: '#E8A020', fontWeight: 600 }}>set up a ward first →</Link>
                    </p>
                  ) : wards.filter((w) => w.available > 0).length === 0 && (
                    <p style={{ fontSize: 11, color: '#E05A5A', marginTop: 4 }}>⚠ No beds available in any ward</p>
                  )}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={S.label}>Bed number <span style={{ color: '#E05A5A' }}>*</span></label>
                  <input value={admitBedNo}
                    onChange={(e) => { setAdmitBedNo(e.target.value); setAdmitBedError(''); }}
                    onBlur={() => {
                      if (admitBedNo && admitWardId) {
                        const err = validateBedNo(admitBedNo, admitWardId);
                        setAdmitBedError(err || '');
                      }
                    }}
                    placeholder="e.g. G-001 or Bed 3"
                    style={S.input(!!admitBedError)} />
                  {admitBedError && <p style={S.fieldErr}>⚠ {admitBedError}</p>}

                  {admitWardId && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {(wards.find((w) => w.id === admitWardId)?.beds || [])
                        .filter((b) => !b.occupied).slice(0, 8)
                        .map((b) => (
                          <button key={b.bedNo} onClick={() => { setAdmitBedNo(b.bedNo); setAdmitBedError(''); }}
                            style={{ padding: '4px 10px', border: '1px solid rgba(106,170,144,0.3)', borderRadius: 6, background: 'rgba(106,170,144,0.08)', color: '#6AAA90', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                            {b.bedNo}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={S.label}>Initial diagnosis</label>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: -4, marginBottom: 6 }}>
                    {admitDiagnosis ? 'Pulled forward from their most recent OPD visit — edit if needed' : ''}
                  </p>
                  <input value={admitDiagnosis} onChange={(e) => setAdmitDiagnosis(e.target.value)}
                    placeholder="e.g. Acute fever, fracture, post-operative care"
                    style={S.input(false)} />
                </div>

                <button onClick={admitToWard}
                  disabled={admitting || !admitPatient || !admitWardId || !admitBedNo}
                  style={{ width: '100%', padding: 13, background: admitting || !admitPatient || !admitWardId || !admitBedNo ? 'rgba(255,255,255,0.08)' : '#6AAA90', color: admitting || !admitPatient || !admitWardId || !admitBedNo ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: admitting || !admitPatient || !admitWardId || !admitBedNo ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {admitting ? 'Admitting...' : '🛏️ Admit to ward'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Discharge modal */}
      {dischargingAdm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif' }}>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Discharge — {dischargingAdm.patientName}</p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Bed {dischargingAdm.bedNo} · {dischargingAdm.wardName} · Admitted {dischargingAdm.admittedOn}</p>

            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
              Discharge summary <span style={{ color: '#E05A5A' }}>*</span>
            </label>
            <textarea
              value={dischargeSummary}
              onChange={(e) => { setDischargeSummary(e.target.value); setDischargeSummaryError(''); }}
              rows={4}
              placeholder="Patient condition at discharge, medicines given, follow-up instructions... (minimum 10 characters)"
              style={{ ...S.textarea, border: `1px solid ${dischargeSummaryError ? '#E05A5A' : 'rgba(255,255,255,0.1)'}` }}
              autoFocus
            />
            {dischargeSummaryError && <p style={S.fieldErr}>⚠ {dischargeSummaryError}</p>}
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
              {dischargeSummary.length} characters · minimum 10
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => { setDischargingAdm(null); setDischargeSummary(''); setDischargeSummaryError(''); }}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={discharge} disabled={discharging || dischargeSummary.trim().length < 10}
                style={{ flex: 2, padding: 11, background: discharging || dischargeSummary.trim().length < 10 ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: discharging || dischargeSummary.trim().length < 10 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {discharging ? 'Discharging...' : 'Complete discharge →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {completedDischarge && (
        <DischargeSummaryDocument admission={completedDischarge} onClose={() => setCompletedDischarge(null)} />
      )}

      <HospitalNav />
      <BugReporter screenName="ipd_management" />
    </div>
  );
}