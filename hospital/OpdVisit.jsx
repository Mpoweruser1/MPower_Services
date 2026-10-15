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
import VitalsEntry from '../shared/VitalsEntry';
import BugReporter from '../shared/BugReporter';
import { istToday, addDays } from './hospitalUtils';

const VISIT_TYPES = ['New patient', 'Follow-up', 'Emergency', 'Review'];

const RULES = {
  chief_complaint: [validators.required, validators.minLength(5)],
  diagnosis:       [validators.required, validators.minLength(3)],
  // the date is checked against the Indian date when saving (the shared "not in the future" rule goes by UTC and refuses today's date in the early morning)
  visit_date:      [validators.required],
};

// A fresh form each time, with today's INDIAN date (UTC would give yesterday between midnight and 5:30 am)
const emptyForm = (doctorId = '') => ({
  visit_type: 'New patient',
  visit_date: istToday(),
  chief_complaint: '', history: '', examination: '',
  diagnosis: '', doctor_id: doctorId, follow_up_date: '', follow_up_notes: '',
});

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

function ageText(dob) {
  if (!dob) return '';
  const b = String(dob).slice(0, 10), t = istToday();
  let years = Number(t.slice(0, 4)) - Number(b.slice(0, 4));
  if (t.slice(5) < b.slice(5)) years -= 1;
  return years >= 0 && years < 130 ? `${years} yrs` : '';
}

// The printed prescription: hidden on screen, shown only when printing (the hospital's heading comes from PrintHeader).
function PrescriptionPrint({ saved, doctor }) {
  const { patient, form, prescription } = saved;
  const dr = doctor?.users?.full_name;
  const visitDate = new Date(`${form.visit_date}T00:00:00`).toLocaleDateString('en-IN');
  const meta = [patient.patient_uid && `ID: ${patient.patient_uid}`, patient.gender, ageText(patient.dob)].filter(Boolean).join(' · ');
  return (
    <div className="rx-print-only" style={{ fontFamily: 'serif' }}>
      <h2 style={{ textAlign: 'center', fontSize: 15, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 2 }}>Prescription</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 10 }}>
        <div>Patient: <strong>{patient.full_name}</strong>{meta ? <div style={{ fontSize: 12 }}>{meta}</div> : null}</div>
        <div style={{ textAlign: 'right' }}>Date: <strong>{visitDate}</strong><div style={{ fontSize: 12 }}>{form.visit_type}</div></div>
      </div>
      {form.chief_complaint && <p style={{ fontSize: 13, margin: '0 0 4px' }}><strong>Complaint:</strong> {form.chief_complaint}</p>}
      {form.diagnosis && <p style={{ fontSize: 13, margin: '0 0 10px' }}><strong>Diagnosis:</strong> {form.diagnosis}</p>}
      <p style={{ fontSize: 20, fontWeight: 700, margin: '6px 0' }}>℞</p>
      {prescription.length > 0 ? (
        <table>
          <thead><tr><th>#</th><th>Medicine</th><th>Dosage</th><th>Duration</th><th>Instructions</th></tr></thead>
          <tbody>
            {prescription.map((m, i) => (
              <tr key={i}><td>{i + 1}</td><td><strong>{m.medicine}</strong></td><td>{m.dosage}</td><td>{m.duration}</td><td>{m.instructions}</td></tr>
            ))}
          </tbody>
        </table>
      ) : <p style={{ fontSize: 12 }}>No medicines prescribed.</p>}
      {(form.follow_up_date || form.follow_up_notes) && (
        <p style={{ fontSize: 13, margin: '12px 0 0' }}>
          <strong>Follow-up:</strong> {form.follow_up_date ? new Date(`${form.follow_up_date}T00:00:00`).toLocaleDateString('en-IN') : ''}{form.follow_up_notes ? ` — ${form.follow_up_notes}` : ''}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 48 }}>
        <div style={{ textAlign: 'center', minWidth: 220 }}>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
            <strong>{dr ? `Dr. ${String(dr).replace(/^dr\.?\s+/i, '')}` : 'Doctor'}</strong>
            {doctor?.designation ? <div style={{ fontSize: 12 }}>{doctor.designation}</div> : null}
            {doctor?.registration_no ? <div style={{ fontSize: 12 }}>Reg. No: {doctor.registration_no}</div> : null}
          </div>
        </div>
      </div>
      <p style={{ fontSize: 10, color: '#555', textAlign: 'center', margin: '16px 0 0' }}>Computer generated prescription. Not valid without the doctor's signature.</p>
    </div>
  );
}

export default function OpdVisit() {
  const { tenant }                                       = useTenant();
  const { activePatient, setActivePatient, clearPatient } = useVisit();
  const [selectedPatient, setSelectedPatient]            = useState(activePatient);
  const [doctors, setDoctors]                            = useState([]);
  const [form, setForm]                                  = useState(emptyForm);
  const [prescription, setPrescription]                  = useState([{ medicine: '', dosage: '', duration: '', instructions: '' }]);
  const [medErrors, setMedErrors]                        = useState([{}]);
  const [saving, setSaving]                              = useState(false);
  const [saved, setSaved]                                = useState(null);
  const [submitError, setSubmitError]                    = useState('');

  const { errors, touched, validate, touch, onChange: onValidate, reset } =
    useFormValidation(RULES);

  const { hasDraft, lastSaved, isDirty, clearDraft, dismissDraft, restoreDraft } =
    useAutoSave('opd_visit', form);

  useEffect(() => {
    if (tenant?.appId) loadDoctors();
  }, [tenant?.appId]);

  useEffect(() => { setSelectedPatient(activePatient); }, [activePatient]);

  async function loadDoctors() {
    let { data, error } = await supabase.from('doctors')
      .select('id, designation, registration_no, users(full_name)')
      .eq('app_id', tenant.appId);
    // 42703 = no registration number column in this database: read without it (the prescription then prints without one)
    if (error && error.code === '42703') {
      ({ data } = await supabase.from('doctors').select('id, designation, users(full_name)').eq('app_id', tenant.appId));
    }
    setDoctors(data || []);
    if (data?.length) setForm((f) => ({ ...f, doctor_id: f.doctor_id || data[0].id }));
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    onValidate(field, value);
  }

  // Pull forward the reason from today's appointment booking, if this
  // patient checked in via one — otherwise that stated reason for
  // visit is captured at booking and then just disappears.
  async function pullAppointmentReason(patient) {
    const today = istToday();
    const { data } = await supabase
      .from('opd_appointment_slots')
      .select('reason, opd_appointment_days(appointment_date)')
      .eq('patient_id', patient.id)
      .eq('status', 'completed')
      .order('slot_time', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.reason && data.opd_appointment_days?.appointment_date === today && !form.chief_complaint) {
      update('chief_complaint', data.reason);
    }
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
    if (form.visit_date > istToday()) { setSubmitError('The visit date cannot be in the future.'); return; }

    // Follow-up date must be after today (Indian date)
    if (form.follow_up_date && form.follow_up_date <= istToday()) {
      setSubmitError('Follow-up date must be a future date.');
      return;
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
      visit_type: form.visit_type,
      symptoms:   form.chief_complaint.trim(),
      diagnosis:  form.diagnosis.trim(),
      history:         form.history.trim() || null,
      examination:     form.examination.trim() || null,
      follow_up_date:  form.follow_up_date || null,
      follow_up_notes: form.follow_up_notes.trim() || null,
    }).select().single();

    if (visitErr) { setSubmitError('Failed to save visit. Please try again.'); setSaving(false); return; }

    if (validMeds.length > 0) {
      // Previously unchecked — the visit would save and show success
      // while the prescription silently failed, so the patient's
      // medicines simply wouldn't exist on their record.
      const { error: rxErr } = await supabase.from('prescriptions').insert({
        patient_id:   selectedPatient.id,
        opd_visit_id: visitRow.id,
        doctor_id:    form.doctor_id || null,
        medicines:    validMeds,
      });
      if (rxErr) {
        console.error('Saving prescription failed:', rxErr);
        setSubmitError(`Visit was saved, but the prescription failed to save: ${rxErr.message}. Please re-enter the medicines.`);
        setSaving(false);
        return;
      }
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
    setForm(emptyForm(doctors[0]?.id || ''));
    setPrescription([{ medicine: '', dosage: '', duration: '', instructions: '' }]);
    setMedErrors([{}]);
    setSubmitError('');
    reset();
  }

  return (
    <div className="opd-page" style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        .rx-print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .rx-print-only { display: block !important; color: #000; background: #fff; }
          html, body { background: #fff !important; }
          .opd-page { background: #fff !important; min-height: 0 !important; padding-bottom: 0 !important; color: #000 !important; }
          .opd-page table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .opd-page th, .opd-page td { border-bottom: 1px solid #bbb; padding: 5px 6px; text-align: left; vertical-align: top; }
          .opd-page tr { break-inside: avoid; page-break-inside: avoid; }
        }
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
            {hasDraft && <DraftBanner lastSaved={lastSaved} onRestore={() => setForm(restoreDraft())} onDiscard={dismissDraft} />}

            <div style={{ ...S.card, marginBottom: 16 }}>
              <PatientSelector
                selectedPatient={selectedPatient}
                onSelect={(p) => { setSelectedPatient(p); setActivePatient(p); pullAppointmentReason(p); }}
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
                      <label htmlFor="opd-visit-type" style={S.label}>Visit type</label>
                      <select id="opd-visit-type" name="opd-visit-type" value={form.visit_type} onChange={(e) => update('visit_type', e.target.value)}
                        style={{ ...S.input(false), cursor: 'pointer' }}>
                        {VISIT_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="opd-visit-date" style={S.label}>Visit date <span style={{ color: '#E05A5A' }}>*</span></label>
                      <input id="opd-visit-date" name="opd-visit-date" type="date" value={form.visit_date}
                        max={istToday()}
                        onChange={(e) => update('visit_date', e.target.value)}
                        onBlur={() => touch('visit_date', form.visit_date)}
                        style={S.input(touched.visit_date && errors.visit_date)} />
                      {touched.visit_date && errors.visit_date && <p style={S.fieldErr}>⚠ {errors.visit_date}</p>}
                    </div>
                  </div>

                  {doctors.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <label htmlFor="opd-doctor" style={S.label}>Doctor</label>
                      <select id="opd-doctor" name="opd-doctor" value={form.doctor_id} onChange={(e) => update('doctor_id', e.target.value)}
                        style={{ ...S.input(false), cursor: 'pointer' }}>
                        {doctors.map((d) => <option key={d.id} value={d.id}>{d.users?.full_name || 'Unnamed'}{d.designation ? ` — ${d.designation}` : ''}</option>)}
                      </select>
                    </div>
                  )}

                  <div style={{ marginBottom: 14 }}>
                    <label style={S.label}>Chief complaint <span style={{ color: '#E05A5A' }}>*</span></label>
                    {form.chief_complaint && !touched.chief_complaint && (
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: -4, marginBottom: 6 }}>
                        Pulled forward from their appointment booking today — edit if needed
                      </p>
                    )}
                    <textarea id="opd-chief-complaint" name="opd-chief-complaint" value={form.chief_complaint}
                      onChange={(e) => update('chief_complaint', e.target.value)}
                      onBlur={() => touch('chief_complaint', form.chief_complaint)}
                      placeholder="Main symptoms and complaints..."
                      style={S.textarea(touched.chief_complaint && errors.chief_complaint)} rows={2} />
                    {touched.chief_complaint && errors.chief_complaint && <p style={S.fieldErr}>⚠ {errors.chief_complaint}</p>}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label htmlFor="opd-history" style={S.label}>History</label>
                    <textarea id="opd-history" name="opd-history" value={form.history} onChange={(e) => update('history', e.target.value)}
                      placeholder="Patient history..."
                      style={S.textarea(false)} rows={3} />
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label htmlFor="opd-examination" style={S.label}>Examination</label>
                    <textarea id="opd-examination" name="opd-examination" value={form.examination} onChange={(e) => update('examination', e.target.value)}
                      placeholder="Examination findings..."
                      style={S.textarea(false)} rows={3} />
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label htmlFor="opd-diagnosis" style={S.label}>Diagnosis <span style={{ color: '#E05A5A' }}>*</span></label>
                    <input id="opd-diagnosis" name="opd-diagnosis" value={form.diagnosis}
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
                        <input id={`opd-med-name-${idx}`} name={`opd-med-name-${idx}`} aria-label={`Medicine ${idx + 1} name`} value={med.medicine} onChange={(e) => updateMedicine(idx, 'medicine', e.target.value)}
                          placeholder="Medicine name" style={S.input(medErrors[idx]?.medicine)} />
                        {medErrors[idx]?.medicine && <p style={S.fieldErr}>⚠ {medErrors[idx].medicine}</p>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <div>
                          <input id={`opd-med-dosage-${idx}`} name={`opd-med-dosage-${idx}`} aria-label={`Medicine ${idx + 1} dosage`} value={med.dosage} onChange={(e) => updateMedicine(idx, 'dosage', e.target.value)}
                            placeholder="Dosage (1-0-1)" style={S.input(medErrors[idx]?.dosage)} />
                          {medErrors[idx]?.dosage && <p style={S.fieldErr}>⚠ {medErrors[idx].dosage}</p>}
                        </div>
                        <input id={`opd-med-duration-${idx}`} name={`opd-med-duration-${idx}`} aria-label={`Medicine ${idx + 1} duration`} value={med.duration} onChange={(e) => updateMedicine(idx, 'duration', e.target.value)}
                          placeholder="Duration (5 days)" style={S.input(false)} />
                        <input id={`opd-med-instructions-${idx}`} name={`opd-med-instructions-${idx}`} aria-label={`Medicine ${idx + 1} instructions`} value={med.instructions} onChange={(e) => updateMedicine(idx, 'instructions', e.target.value)}
                          placeholder="After food" style={S.input(false)} />
                      </div>
                    </div>
                  ))}

                  <div style={S.row2}>
                    <div>
                      <label htmlFor="opd-followup-date" style={S.label}>Follow-up date</label>
                      <input id="opd-followup-date" name="opd-followup-date" type="date" value={form.follow_up_date}
                        min={addDays(istToday(), 1)}
                        onChange={(e) => update('follow_up_date', e.target.value)}
                        style={S.input(false)} />
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Must be a future date</p>
                    </div>
                    <div>
                      <label htmlFor="opd-followup-notes" style={S.label}>Follow-up notes</label>
                      <input id="opd-followup-notes" name="opd-followup-notes" value={form.follow_up_notes} onChange={(e) => update('follow_up_notes', e.target.value)}
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
          <>
            <div className="no-print">
            <VitalsEntry patientId={saved.patient.id} contextType="opd" contextId={saved.visitRow.id} />
            <NextActions
              title="OPD visit saved — what next?"
              actions={[
                { icon: '🔬', label: 'Order lab tests', href: '/hospital/lab', color: '#5A9ADF' },
                { icon: '💳', label: 'Generate bill', href: '/hospital/billing', color: '#6AAA90' },
              ]}
              secondaryActions={[
                { icon: '🖨️', label: 'Print prescription', onClick: () => window.print() },
                { icon: '🛏️', label: 'Admit to IPD', href: '/hospital/ipd' },
                { icon: '👤', label: 'New OPD visit', onClick: startNewVisit },
                { icon: '🏠', label: 'Dashboard', href: '/hospital/dashboard' },
              ]}
            />
            </div>
            <PrescriptionPrint saved={saved} doctor={doctors.find((d) => d.id === saved.form.doctor_id)} />
          </>
        )}
      </div>

      <div className="no-print">
        <HospitalNav />
        <BugReporter screenName="opd_visit" />
      </div>
    </div>
  );
}