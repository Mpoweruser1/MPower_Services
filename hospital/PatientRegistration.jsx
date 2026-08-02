// hospital/PatientRegistration.jsx — FINAL
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { useFormValidation, validators, sanitize } from '../shared/useFormValidation';
import { useAutoSave } from '../shared/useAutoSave';
import FormField from '../shared/FormField';
import DraftBanner from '../shared/DraftBanner';
import UnsavedChangesGuard from '../shared/UnsavedChangesGuard';
import NextActions from '../shared/NextActions';
import WelfareSchemesPanel from '../shared/WelfareSchemesPanel';
import HospitalNav from '../shared/HospitalNav';
import BugReporter from '../shared/BugReporter';

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'];

const RULES = {
  full_name: [validators.required, validators.nameField, validators.minLength(2)],
  phone:     [validators.required, validators.phone],
  gender:    [validators.required],
  dob:       [validators.pastDate],
};

const EMPTY = {
  full_name: '', dob: '', gender: 'Male',
  phone: '', address: '', blood_group: '',
  allergies: '', abha_id: '', abha_consent: false,
};

function generatePatientUid() {
  return `PT-${Date.now().toString().slice(-8)}`;
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 640, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16 },
  sectionLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
};

export default function PatientRegistration() {
  const { tenant } = useTenant();
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [registered, setRegistered] = useState(null);
  const [submitError, setSubmitError] = useState('');

  const { errors, touched, validate, touch, onChange: onValidate, reset } =
    useFormValidation(RULES);

  const { hasDraft, draftData, lastSaved, isDirty, clearDraft, dismissDraft, restoreDraft } =
    useAutoSave(`patient_registration_${tenant?.userRowId}`, form);

  function update(field, value) {
    let v = value;
    if (field === 'phone')   v = sanitize.phone(value);
    if (field === 'abha_id') v = sanitize.integer(value).slice(0, 14);
    setForm((f) => ({ ...f, [field]: v }));
    onValidate(field, v);
  }

  async function register() {
    setSubmitError('');
    if (!validate(form)) {
      setSubmitError('Please fix the errors below before registering.');
      return;
    }

    // Extra check — phone 10 digits
    const phoneClean = form.phone.replace(/\D/g, '');
    if (phoneClean.length !== 10 && phoneClean.length !== 12) {
      setSubmitError('Enter a valid 10-digit phone number.');
      return;
    }

    setSaving(true);
    const patient_uid = generatePatientUid();

    const { data: newPatient, error: insertErr } = await supabase
      .from('patients')
      .insert({
        app_id:      tenant.appId,
        branch_id:   tenant.branchId || null,
        patient_uid,
        full_name:   form.full_name.trim(),
        dob:         form.dob || null,
        gender:      form.gender,
        phone:       form.phone.trim(),
        address:     form.address.trim() || null,
        blood_group: form.blood_group || null,
        allergies:   form.allergies.trim() || null,
        abha_id:     form.abha_id.trim() || null,
        abha_linked: false,
        abha_consent_signed: form.abha_consent,
        abha_consent_date:   form.abha_consent ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (insertErr) {
      setSubmitError('Failed to register patient. Please try again.');
      setSaving(false);
      return;
    }

    if (form.abha_consent) {
      await supabase.from('abha_consent_log').insert({
        patient_id:   newPatient.id,
        consent_type: 'creation',
        otp_verified: false,
      });
    }

    clearDraft();
    reset();
    setRegistered(newPatient);
    setSaving(false);
  }

  function registerAnother() {
    setRegistered(null);
    setForm(EMPTY);
    setSubmitError('');
    reset();
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <UnsavedChangesGuard isDirty={isDirty} message="Patient registration form has unsaved data. Leave anyway?" />

      <div style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Patient Registration · రోగి నమోదు
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0, letterSpacing: -0.5 }}>New Patient</h1>
        </div>

        {!registered ? (
          <>
            {hasDraft && <DraftBanner lastSaved={lastSaved} onRestore={() => setForm(restoreDraft())} onDiscard={dismissDraft} />}

            {submitError && (
              <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                ⚠️ {submitError}
              </div>
            )}

            <div style={S.card}>
              <p style={S.sectionLabel}>Patient details · రోగి వివరాలు</p>

              <FormField
                label="Full name"
                name="full_name"
                value={form.full_name}
                onChange={update}
                onBlur={touch}
                error={errors.full_name}
                touched={touched.full_name}
                required
                placeholder="Patient full name"
                hint="Letters only — no numbers or symbols"
              />

              <div style={S.row2}>
                <FormField
                  label="Date of birth"
                  name="dob"
                  type="date"
                  value={form.dob}
                  onChange={update}
                  onBlur={touch}
                  error={errors.dob}
                  touched={touched.dob}
                  max={new Date().toISOString().slice(0, 10)}
                  hint="Cannot be future date"
                />
                <FormField
                  label="Gender"
                  name="gender"
                  type="select"
                  value={form.gender}
                  onChange={update}
                  onBlur={touch}
                  error={errors.gender}
                  touched={touched.gender}
                  required
                  options={['Male','Female','Other'].map((g) => ({ value: g, label: g }))}
                />
              </div>

              <div style={S.row2}>
                <FormField
                  label="Blood group"
                  name="blood_group"
                  type="select"
                  value={form.blood_group}
                  onChange={update}
                  onBlur={touch}
                  error={errors.blood_group}
                  touched={touched.blood_group}
                  options={BLOOD_GROUPS.map((g) => ({ value: g, label: g }))}
                />
                <FormField
                  label="Phone (WhatsApp)"
                  name="phone"
                  type="phone"
                  value={form.phone}
                  onChange={update}
                  onBlur={touch}
                  error={errors.phone}
                  touched={touched.phone}
                  required
                  placeholder="+91 XXXXX XXXXX"
                  hint="Lab results & receipts sent here"
                />
              </div>

              <FormField
                label="Address"
                name="address"
                value={form.address}
                onChange={update}
                onBlur={touch}
                error={errors.address}
                touched={touched.address}
                placeholder="Village / Town, District"
              />

              <FormField
                label="Allergies (if any)"
                name="allergies"
                value={form.allergies}
                onChange={update}
                onBlur={touch}
                error={errors.allergies}
                touched={touched.allergies}
                placeholder="e.g. Penicillin, Sulpha drugs"
              />
            </div>

            <div style={S.card}>
              <p style={S.sectionLabel}>ABHA Health ID</p>
              <FormField
                label="ABHA ID (14 digits)"
                name="abha_id"
                value={form.abha_id}
                onChange={update}
                onBlur={touch}
                error={errors.abha_id}
                touched={touched.abha_id}
                placeholder="14-digit ABHA number"
                maxLength={14}
                hint="Optional — leave blank if patient does not have one"
              />

              {form.abha_id && form.abha_id.length !== 14 && (
                <p style={{ fontSize: 12, color: '#E8A020', marginTop: -10, marginBottom: 12 }}>
                  ⚠ ABHA ID must be exactly 14 digits
                </p>
              )}

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '12px 14px', borderRadius: 8, background: form.abha_consent ? 'rgba(106,170,144,0.08)' : '#111113', border: `1px solid ${form.abha_consent ? 'rgba(106,170,144,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                <input type="checkbox" checked={form.abha_consent} onChange={(e) => update('abha_consent', e.target.checked)} style={{ marginTop: 2, accentColor: '#6AAA90', width: 16, height: 16 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>Patient consent for ABHA Health ID obtained</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>ABHA Health ID కోసం రోగి అనుమతి తీసుకోబడింది</p>
                </div>
              </label>
            </div>

            <WelfareSchemesPanel mode="patient" appId={tenant?.appId} compact={false} />

            {isDirty && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 12 }}>
                📝 Draft auto-saved — data safe even if you close this page
              </p>
            )}

            <button onClick={register} disabled={saving}
              style={{ width: '100%', padding: 14, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Registering...' : '✓ Register patient →'}
            </button>
          </>
        ) : (
          <>
            <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.25)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>PATIENT REGISTERED · రోగి నమోదైంది</p>
              <p style={{ margin: '6px 0 4px', fontSize: 20, fontWeight: 700, color: '#fff' }}>{registered.full_name}</p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#6AAA90' }}>{registered.patient_uid}</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                {registered.gender}{registered.dob ? ` · DOB: ${registered.dob}` : ''}{registered.phone ? ` · ${registered.phone}` : ''}
              </p>
            </div>
            <NextActions
              title="Patient registered — what next?"
              actions={[
                { icon: '🩺', label: 'Start OPD visit', href: '/hospital/opd', color: '#5A9ADF' },
                { icon: '🛏️', label: 'Admit to IPD', href: '/hospital/ipd', color: '#E8A020' },
              ]}
              secondaryActions={[
                { icon: '🔬', label: 'Order lab test', href: '/hospital/lab' },
                { icon: '💳', label: 'Generate bill', href: '/hospital/billing' },
                { icon: '👤', label: 'Register another', onClick: registerAnother },
              ]}
            />
          </>
        )}
      </div>

      <HospitalNav />
      <BugReporter screenName="patient_registration" />
    </div>
  );
}