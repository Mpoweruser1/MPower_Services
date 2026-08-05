// hospital/OpdVisit.jsx — FINAL
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { useVisit } from '../context/VisitContext';
import { useFormValidation, validators } from '../shared/useFormValidation';
import { useAutoSave } from '../shared/useAutoSave';
import PatientSelector from '../shared/PatientSelector';
import DraftBanner from '../shared/DraftBanner';
import UnsavedChangesGuard from '../shared/UnsavedChangesGuard';
import FormField from '../shared/FormField';
import PrintHeader from '../shared/PrintHeader';
import HospitalNav from '../shared/HospitalNav';
import NextActions from '../shared/NextActions';
import BugReporter from '../shared/BugReporter';

const VISIT_TYPES = ['New', 'Follow-up', 'Emergency', 'Review'];

const RULES = {
  chief_complaint: [validators.required, validators.minLength(5)],
  diagnosis:       [validators.required, validators.minLength(3)],
  visit_date:      [validators.required, validators.notFutureDate],
};

const EMPTY_FORM = {
  visit_type: 'New',
  visit_date: new Date().toISOString().slice(0, 10),
  chief_complaint: '', history: '', examination: '',
  diagnosis: '', doctor_id: '', follow_up_date: '', follow_up_notes: '',
};

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  textarea: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', minHeight: 80 }),
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function OpdVisit() {
  const { tenant }                                       = useTenant();
  const { activePatient, setActivePatient, clearPatient } = useVisit();
  const [selectedPatient, setSelectedPatient]            = useState(activePatient);
  const [doctors, setDoctors]                            = useState([]);
  const [form, setForm]                                  = useState(EMPTY_FORM);
  const [prescription, setPrescription]                  = useState([{ medicine: '', dosage: '', duration: '', instructions: '' }]);
  const [medErrors, setMedErrors]                        = useState([{}]);
  const [saving, setSaving]                              = useState(false);
  const [saved, setSaved]                                = useState(null);
  const [submitError, setSubmitError]                    = useState('');

  const { errors, touched, validate, touch, onChange: onValidate, reset } =
    useFormValidation(RULES);

  const { hasDraft, lastSaved, isDirty, clearDraft, dismissDraft } =
    useAutoSave('opd_visit', form, { onRestore: (d) => setForm(d) });

  useEffect(() => {
    if (tenant?.appId) loadDoctors();
  }, [tenant?.appId]);

  useEffect(() => { setSelectedPatient(activePatient); }, [activePatient]);

  async function loadDoctors() {
    const { data } = await supabase.from('doctors')
      .select('id, full_name, specialisation')
      .eq('app_id', tenant.appId)
      .eq('is_active', true);
    setDoctors(data || []);
    if (data?.length) setForm((f) => ({ ...f, doctor_id: data[0].id }));
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    onValidate(field, value);
  }

  function addMedicine() {
    setPrescription((p) => [...p, { medicine: '', dosage: '', duration: '', instructions: '' }]);
    setMedErrors((e) => [...e, {}]);
  }

  function removeMedicine(idx) {
    setPrescription((p) => p.filter((_, i) => i !== idx));
    setMedErrors((e) => e.filter((_, i) => i !== idx));
  }

  function updateMedicine(idx, field, value) {
    setPrescription((p) => {
      const copy = [...p];
      copy[idx]  = { ...copy[idx], [field]: value };
      return copy;
    });
    // Clear error
    if (field === 'medicine' && value.trim()) {
      setMedErrors((e) => { const copy = [...e]; copy[idx] = { ...copy[idx], medicine: null }; return copy; });
    }
  }

  function validateMedicines() {
    const allErrors = prescription.map((med) => {
      const err = {};
      if (!med.medicine.trim()) err.medicine = 'Medicine name required';
      if (!med.dosage.trim())   err.dosage   = 'Dosage required';
      return err;
    });
    setMedErrors(allErrors);
    return allErrors.every((e) => Object.keys(e).length === 0);
  }

  async function saveVisit() {
    setSubmitError('');
    if (!selectedPatient) { setSubmitError('Please select a patient first.'); return; }
    if (!validate(form))  { setSubmitError('Please fix the errors below.'); return; }

    // Validate follow-up date is in future if provided
    if (form.follow_up_date) {
      const followUp = new Date(form.follow_up_date);
      if (followUp <= new Date()) {
        setSubmitError('Follow-up date must be a future date.');
        return;
      }
    }

    const validMeds = prescription.filter((m) => m.medicine.trim());
    setSaving(true);

    // opd_visits has no prescription_id or status column, and the
    // real field is "symptoms" not "chief_complaint" — this insert
    // was failing every single time before. The relationship also
    // actually goes the other way: prescriptions.opd_visit_id points
    // back to the visit, so the visit must be created first.
    const { data: visitRow, error: visitErr } = await supabase.from('opd_visits').insert({
      patient_id: selectedPatient.id,
      doctor_id:  form.doctor_id || null,
      visit_date: form.visit_date,
      visit_type: form.visit_type.toLowerCase(),
      symptoms:   form.chief_complaint.trim(),
      diagnosis:  form.diagnosis.trim(),
    }).select().single();

    if (visitErr) { setSubmitError('Failed to save visit. Please try again.'); setSaving(false); return; }

    if (validMeds.length > 0) {
      await supabase.from('prescriptions').insert({
        patient_id:   selectedPatient.id,
        opd_visit_id: visitRow.id,
        doctor_id:    form.doctor_id || null,
        medicines:    validMeds,
      });
    }

    if (selectedPatient.phone && validMeds.length > 0) {
      await supabase.functions.invoke('send-whatsapp', {
        body: { type: 'opd_prescription', patientId: selectedPatient.id, visitDate: form.visit_date, diagnosis: form.diagnosis },
      });
    }

    clearDraft();
    reset();
    setSaved({ visitRow, patient: selectedPatient, form, prescription: validMeds });
    setSaving(false);
  }

  function startNewVisit() {
    setSaved(null);
    setForm(EMPTY_FORM);
    setPrescription([{ medicine: '', dosage: '', duration: '', instructions: '' }]);
    setMedErrors([{}]);
    setSubmitError('');
    reset();
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print { .no-print { display: none !important; } }
      `}</style>
      <PrintHeader documentTitle="OPD Prescription" />

      <div style={S.inner}>
        <div className="no-print" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>OPD Visit · OPD విజిట్</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>OPD Consultation</h1>
        </div>

        <UnsavedChangesGuard isDirty={isDirty} message="OPD visit form has unsaved data. Leave anyway?" />

        {!saved ? (
          <>
            {hasDraft && <DraftBanner lastSaved={lastSaved} onRestore={() => {}} onDiscard={dismissDraft} />}

            <div style={{ ...S.card, marginBottom: 16 }}>
              <PatientSelector
                selectedPatient={selectedPatient}
                onSelect={(p) => { setSelectedPatient(p); setActivePatient(p); }}
                onClear={() => { setSelectedPatient(null); clearPatient(); }}
                showTodayQueue={true}
                label="Select patient · రోగిని ఎంచుకోండి"
              />
            </div>

            {selectedPatient && (
              <>
                <div style={S.card}>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Visit details</p>

                  <div style={S.row2}>
                    <div>
                      <label style={S.label}>Visit type</label>
                      <select value={form.visit_type} onChange={(e) => update('visit_type', e.target.value)}
                        style={{ ...S.input(false), cursor: 'pointer' }}>
                        {VISIT_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Visit date <span style={{ color: '#E05A5A' }}>*</span></label>
                      <input type="date" value={form.visit_date}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => update('visit_date', e.target.value)}
                        onBlur={() => touch('visit_date', form.visit_date)}
                        style={S.input(touched.visit_date && errors.visit_date)} />
                      {touched.visit_date && errors.visit_date && <p style={S.fieldErr}>⚠ {errors.visit_date}</p>}
                    </div>
                  </div>

                  {doctors.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={S.label}>Doctor</label>
                      <select value={form.doctor_id} onChange={(e) => update('doctor_id', e.target.value)}
                        style={{ ...S.input(false), cursor: 'pointer' }}>
                        {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}{d.specialisation ? ` — ${d.specialisation}` : ''}</option>)}
                      </select>
                    </div>
                  )}

                  <div style={{ marginBottom: 14 }}>
                    <label style={S.label}>Chief complaint <span style={{ color: '#E05A5A' }}>*</span></label>
                    <textarea value={form.chief_complaint}
                      onChange={(e) => update('chief_complaint', e.target.value)}
                      onBlur={() => touch('chief_complaint', form.chief_complaint)}
                      placeholder="Main symptoms and complaints..."
                      style={S.textarea(touched.chief_complaint && errors.chief_complaint)} rows={2} />
                    {touched.chief_complaint && errors.chief_complaint && <p style={S.fieldErr}>⚠ {errors.chief_complaint}</p>}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={S.label}>History & examination</label>
                    <textarea value={form.history} onChange={(e) => update('history', e.target.value)}
                      placeholder="Patient history, examination findings..."
                      style={S.textarea(false)} rows={3} />
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={S.label}>Diagnosis <span style={{ color: '#E05A5A' }}>*</span></label>
                    <input value={form.diagnosis}
                      onChange={(e) => update('diagnosis', e.target.value)}
                      onBlur={() => touch('diagnosis', form.diagnosis)}
                      placeholder="Primary diagnosis"
                      style={S.input(touched.diagnosis && errors.diagnosis)} />
                    {touched.diagnosis && errors.diagnosis && <p style={S.fieldErr}>⚠ {errors.diagnosis}</p>}
                  </div>
                </div>

                {/* Prescription */}
                <div style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>Prescription · మందులు</p>
                    <button onClick={addMedicine}
                      style={{ padding: '6px 14px', border: 'none', borderRadius: 20, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                      + Add medicine
                    </button>
                  </div>

                  {prescription.map((med, idx) => (
                    <div key={idx} style={{ background: '#111113', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Medicine {idx + 1}</p>
                        {prescription.length > 1 && (
                          <button onClick={() => removeMedicine(idx)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#E05A5A', padding: 0 }}>✕</button>
                        )}
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <input value={med.medicine} onChange={(e) => updateMedicine(idx, 'medicine', e.target.value)}
                          placeholder="Medicine name" style={S.input(medErrors[idx]?.medicine)} />
                        {medErrors[idx]?.medicine && <p style={S.fieldErr}>⚠ {medErrors[idx].medicine}</p>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <div>
                          <input value={med.dosage} onChange={(e) => updateMedicine(idx, 'dosage', e.target.value)}
                            placeholder="Dosage (1-0-1)" style={S.input(medErrors[idx]?.dosage)} />
                          {medErrors[idx]?.dosage && <p style={S.fieldErr}>⚠ {medErrors[idx].dosage}</p>}
                        </div>
                        <input value={med.duration} onChange={(e) => updateMedicine(idx, 'duration', e.target.value)}
                          placeholder="Duration (5 days)" style={S.input(false)} />
                        <input value={med.instructions} onChange={(e) => updateMedicine(idx, 'instructions', e.target.value)}
                          placeholder="After food" style={S.input(false)} />
                      </div>
                    </div>
                  ))}

                  <div style={S.row2}>
                    <div>
                      <label style={S.label}>Follow-up date</label>
                      <input type="date" value={form.follow_up_date}
                        min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                        onChange={(e) => update('follow_up_date', e.target.value)}
                        style={S.input(false)} />
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Must be a future date</p>
                    </div>
                    <div>
                      <label style={S.label}>Follow-up notes</label>
                      <input value={form.follow_up_notes} onChange={(e) => update('follow_up_notes', e.target.value)}
                        placeholder="Instructions for patient" style={S.input(false)} />
                    </div>
                  </div>
                </div>

                {submitError && (
                  <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                    ⚠️ {submitError}
                  </div>
                )}

                {isDirty && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginBottom: 12 }}>
                    📝 Draft auto-saved
                  </p>
                )}

                <button onClick={saveVisit} disabled={saving}
                  style={{ width: '100%', padding: 14, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Saving...' : '✓ Save OPD visit & prescription'}
                </button>
              </>
            )}
          </>
        ) : (
          <NextActions
            title="OPD visit saved — what next?"
            actions={[
              { icon: '🔬', label: 'Order lab tests', href: '/hospital/lab', color: '#5A9ADF' },
              { icon: '💳', label: 'Generate bill', href: '/hospital/billing', color: '#6AAA90' },
            ]}
            secondaryActions={[
              { icon: '🛏️', label: 'Admit to IPD', href: '/hospital/ipd' },
              { icon: '👤', label: 'New OPD visit', onClick: startNewVisit },
              { icon: '🏠', label: 'Dashboard', href: '/hospital/dashboard' },
            ]}
          />
        )}
      </div>

      <HospitalNav />
      <BugReporter screenName="opd_visit" />
    </div>
  );
}