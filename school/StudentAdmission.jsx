// school/StudentAdmission.jsx — FINAL
// Full validation + auto-save + unsaved changes guard
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { useFormValidation, validators } from '../shared/useFormValidation';
import { useAutoSave } from '../shared/useAutoSave';
import FormField from '../shared/FormField';
import DraftBanner from '../shared/DraftBanner';
import UnsavedChangesGuard from '../shared/UnsavedChangesGuard';
import NextActions from '../shared/NextActions';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

// ─────────────────────────────────────────────────────────────
// Validation rules
// ─────────────────────────────────────────────────────────────
const RULES = {
  full_name:    [validators.required, validators.nameField, validators.minLength(2)],
  dob:          [validators.required, validators.pastDate, validators.maxAge(25)],
  gender:       [validators.required],
  parent_name:  [validators.required, validators.nameField],
  parent_phone: [validators.required, validators.phone],
  admission_no: [validators.required, validators.admissionNo],
  class_id:     [validators.required],
};

const GENDERS    = ['Male', 'Female', 'Other'];
const CATEGORIES = ['OC', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'SC', 'ST', 'EWS', 'Other'];
const MEDIUMS    = ['Telugu Medium', 'English Medium', 'Hindi Medium', 'Urdu Medium'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

const EMPTY_FORM = {
  full_name: '', full_name_telugu: '', dob: '', gender: '',
  admission_no: '', admission_date: new Date().toISOString().slice(0, 10),
  class_id: '', section: '', medium: 'Telugu Medium',
  caste_category: '', blood_group: '',
  parent_name: '', parent_phone: '',
  address: '', apaar_id: '',
  student_type: 'day_scholar',
};

export default function StudentAdmission() {
  const { tenant } = useTenant();
  const [form, setForm]         = useState(EMPTY_FORM);
  const [classes, setClasses]   = useState([]);
  const [saving, setSaving]     = useState(false);
  const [admitted, setAdmitted] = useState(null);
  const [error, setError]       = useState('');

  // ── Validation ──────────────────────────────────────────────
  const {
    errors, touched, validate, touch, onChange: onValidate, reset: resetValidation,
  } = useFormValidation(RULES);

  // ── Auto-save draft ─────────────────────────────────────────
  const { hasDraft, draftData, lastSaved, isDirty, clearDraft, dismissDraft, restoreDraft } =
    useAutoSave(`student_admission_${tenant?.userRowId}`, form);

  useEffect(() => {
    if (tenant?.appId) loadClasses();
  }, [tenant?.appId]);

  async function loadClasses() {
    const { data } = await supabase
      .from('classes')
      .select('id, class_name, class_order')
      .eq('app_id', tenant.appId)
      .order('class_order');
    setClasses(data || []);
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    onValidate(field, value);
  }

  function generateSid() {
    const year   = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `STU${year}${random}`;
  }

  async function save() {
    setError('');

    // Validate all fields
    if (!validate(form)) {
      setError('Please fix the errors below before saving.');
      // Scroll to first error
      setTimeout(() => {
        const el = document.querySelector('[data-has-error="true"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    setSaving(true);

    const sid = generateSid();

    const { data: newStudent, error: insertErr } = await supabase
      .from('students')
      .insert({
        app_id:         tenant.appId,
        branch_id:      tenant.branchId || null,
        sid,
        full_name:      form.full_name.trim(),
        full_name_telugu: form.full_name_telugu.trim() || null,
        dob:            form.dob,
        gender:         form.gender,
        admission_no:   form.admission_no.trim(),
        admission_date: form.admission_date,
        class_id:       form.class_id || null,
        section:        form.section.trim() || null,
        medium:         form.medium,
        caste_category: form.caste_category || null,
        blood_group:    form.blood_group || null,
        parent_name:    form.parent_name.trim(),
        parent_phone:   form.parent_phone.trim(),
        student_type:   form.student_type,
        apaar_id:       form.apaar_id.trim() || null,
        status:         'active',
      })
      .select()
      .single();

    if (insertErr) {
      if (insertErr.message?.includes('unique') || insertErr.code === '23505') {
        setError('Admission number already exists. Please use a different one.');
      } else {
        setError('Failed to save student. Please try again.');
      }
      setSaving(false);
      return;
    }

    // WhatsApp welcome to parent
    if (form.parent_phone) {
      await supabase.functions.invoke('send-whatsapp', {
        body: {
          type:      'student_admitted',
          studentId: newStudent.id,
          sid,
          name:      form.full_name,
          class:     classes.find((c) => c.id === form.class_id)?.class_name || '',
        },
      });
    }

    clearDraft();
    resetValidation();
    setSaving(false);
    setAdmitted(newStudent);
  }

  function admitAnother() {
    setForm(EMPTY_FORM);
    setAdmitted(null);
    setError('');
    resetValidation();
  }

  const S = {
    page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
    inner: { maxWidth: 640, margin: '0 auto', padding: '24px 20px' },
    card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16 },
    sectionLabel: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 },
    row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  };

  // ── Success screen ───────────────────────────────────────────
  if (admitted) {
    return (
      <div style={S.page}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
        <div style={S.inner}>
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.25)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>
              STUDENT ADMITTED · విద్యార్థి చేర్పబడ్డారు
            </p>
            <p style={{ margin: '6px 0 4px', fontSize: 20, fontWeight: 700, color: '#fff' }}>{admitted.full_name}</p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#6AAA90' }}>{admitted.sid}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              {admitted.gender}
              {admitted.dob ? ` · DOB: ${admitted.dob}` : ''}
              {admitted.admission_no ? ` · Adm: ${admitted.admission_no}` : ''}
            </p>
          </div>

          <NextActions
            title="Student admitted — what next?"
            actions={[
              { icon: '✅', label: 'Mark attendance', href: '/school/attendance', color: '#6AAA90' },
              { icon: '💰', label: 'Collect fee', href: '/school/fee-collection', color: '#E8A020' },
            ]}
            secondaryActions={[
              { icon: '👤', label: 'Admit another student', onClick: admitAnother },
              { icon: '🏠', label: 'Dashboard', href: '/school/dashboard' },
            ]}
          />
        </div>
        <SchoolNav />
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      {/* Unsaved changes guard */}
      <UnsavedChangesGuard
        isDirty={isDirty}
        message="Student admission form has unsaved data. Leave anyway?"
      />

      <div style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Student Admission · విద్యార్థి చేర్పు
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0, letterSpacing: -0.5 }}>
            New Student
          </h1>
        </div>

        {/* Draft restore banner */}
        {hasDraft && (
          <DraftBanner
            lastSaved={lastSaved}
            onRestore={() => setForm(restoreDraft())}
            onDiscard={dismissDraft}
          />
        )}

        {/* Error banner */}
        {error && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Section 1 — Student details */}
        <div style={S.card}>
          <p style={S.sectionLabel}>Student details · విద్యార్థి వివరాలు</p>

          <FormField
            label="Full name (English)"
            name="full_name"
            value={form.full_name}
            onChange={update}
            onBlur={touch}
            error={errors.full_name}
            touched={touched.full_name}
            required
            placeholder="As per Aadhaar card"
            hint="Exactly as it appears on Aadhaar / school records"
          />

          <FormField
            label="Full name (Telugu)"
            name="full_name_telugu"
            value={form.full_name_telugu}
            onChange={update}
            onBlur={touch}
            error={errors.full_name_telugu}
            touched={touched.full_name_telugu}
            placeholder="తెలుగులో పేరు (optional)"
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
              required
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
              options={GENDERS.map((g) => ({ value: g, label: g }))}
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
              options={BLOOD_GROUPS.map((b) => ({ value: b, label: b }))}
            />
            <FormField
              label="Caste category"
              name="caste_category"
              type="select"
              value={form.caste_category}
              onChange={update}
              onBlur={touch}
              error={errors.caste_category}
              touched={touched.caste_category}
              options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              hint="Affects welfare scheme eligibility"
            />
          </div>

          <FormField
            label="APAAR ID"
            name="apaar_id"
            value={form.apaar_id}
            onChange={update}
            onBlur={touch}
            error={errors.apaar_id}
            touched={touched.apaar_id}
            placeholder="12-digit APAAR number"
            maxLength={12}
            hint="Academic Bank of Credits ID — optional"
          />
        </div>

        {/* Section 2 — Admission details */}
        <div style={S.card}>
          <p style={S.sectionLabel}>Admission details · చేర్పు వివరాలు</p>

          <div style={S.row2}>
            <FormField
              label="Admission number"
              name="admission_no"
              value={form.admission_no}
              onChange={update}
              onBlur={touch}
              error={errors.admission_no}
              touched={touched.admission_no}
              required
              placeholder="e.g. 2025-001"
              hint="Must be unique"
            />
            <FormField
              label="Admission date"
              name="admission_date"
              type="date"
              value={form.admission_date}
              onChange={update}
              onBlur={touch}
              error={errors.admission_date}
              touched={touched.admission_date}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>

          <div style={S.row2}>
            <FormField
              label="Class"
              name="class_id"
              type="select"
              value={form.class_id}
              onChange={update}
              onBlur={touch}
              error={errors.class_id}
              touched={touched.class_id}
              required
              options={classes.map((c) => ({ value: c.id, label: c.class_name }))}
            />
            <FormField
              label="Section"
              name="section"
              value={form.section}
              onChange={update}
              onBlur={touch}
              error={errors.section}
              touched={touched.section}
              placeholder="A / B / C"
              maxLength={3}
            />
          </div>

          <div style={S.row2}>
            <FormField
              label="Medium"
              name="medium"
              type="select"
              value={form.medium}
              onChange={update}
              onBlur={touch}
              error={errors.medium}
              touched={touched.medium}
              options={MEDIUMS.map((m) => ({ value: m, label: m }))}
            />
            <FormField
              label="Student type"
              name="student_type"
              type="select"
              value={form.student_type}
              onChange={update}
              onBlur={touch}
              error={errors.student_type}
              touched={touched.student_type}
              options={[
                { value: 'day_scholar', label: 'Day Scholar' },
                { value: 'hostel',      label: 'Hostel' },
              ]}
            />
          </div>
        </div>

        {/* Section 3 — Parent details */}
        <div style={S.card}>
          <p style={S.sectionLabel}>Parent details · తల్లిదండ్రుల వివరాలు</p>

          <FormField
            label="Parent / Guardian name"
            name="parent_name"
            value={form.parent_name}
            onChange={update}
            onBlur={touch}
            error={errors.parent_name}
            touched={touched.parent_name}
            required
            placeholder="Father or mother name"
          />

          <FormField
            label="WhatsApp phone number"
            name="parent_phone"
            type="phone"
            value={form.parent_phone}
            onChange={update}
            onBlur={touch}
            error={errors.parent_phone}
            touched={touched.parent_phone}
            required
            placeholder="+91 XXXXX XXXXX"
            hint="Attendance alerts and fee receipts sent here"
          />

          <FormField
            label="Address"
            name="address"
            type="textarea"
            value={form.address}
            onChange={update}
            onBlur={touch}
            error={errors.address}
            touched={touched.address}
            placeholder="Village / Town, Mandal, District"
            rows={2}
          />
        </div>

        {/* Auto-save indicator */}
        {isDirty && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginBottom: 12 }}>
            📝 Draft auto-saved — your data is safe even if you close this page
          </p>
        )}

        {/* Submit */}
        <button
          onClick={save}
          disabled={saving}
          style={{
            width: '100%', padding: 14,
            background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020',
            color: saving ? 'rgba(255,255,255,0.3)' : '#111113',
            border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving...' : '✓ Admit student →'}
        </button>

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 10 }}>
          Fields marked <span style={{ color: '#E05A5A' }}>*</span> are required
        </p>
      </div>

      <SchoolNav />
      <BugReporter screenName="student_admission" />
    </div>
  );
}