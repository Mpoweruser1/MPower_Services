// website/pages/FirstTimeSetup.jsx — FINAL
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useTenant } from '../../context/TenantContext';
import { sanitize, validators } from '../../shared/useFormValidation';
import FormField from '../../shared/FormField';

const AP_DISTRICTS = [
  'Alluri Sitharama Raju', 'Anakapalli', 'Ananthapuramu', 'Annamayya',
  'Bapatla', 'Chittoor', 'Dr. B.R. Ambedkar Konaseema', 'East Godavari',
  'Eluru', 'Guntur', 'Kakinada', 'Krishna', 'Kurnool', 'Nandyal',
  'NTR', 'Palnadu', 'Parvathipuram Manyam', 'Prakasam', 'Srikakulam',
  'Sri Potti Sriramulu Nellore', 'Tirupati', 'Visakhapatnam',
  'Vizianagaram', 'West Godavari', 'YSR Kadapa', 'Other',
];

const SCHOOL_BOARDS  = ['AP State Board', 'CBSE', 'ICSE', 'Telangana State Board', 'Other'];
const MEDIUM_OPTIONS = ['Telugu Medium', 'English Medium', 'Hindi Medium', 'Both Telugu & English'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 560, margin: '0 auto', padding: '40px 24px 80px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function FirstTimeSetup() {
  const { tenant } = useTenant();
  const navigate   = useNavigate();
  const [step, setStep]   = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');

  const [orgInfo, setOrgInfo] = useState({
    orgName: tenant?.orgName || '',
    district: '',
    address: '',
    contact_phone: tenant?.phone || '',
    school_type: '',
    board_type: 'state_board',
  });

  const [schoolConfig, setSchoolConfig] = useState({
    board: 'AP State Board',
    medium: 'Telugu Medium',
    num_classes: '10',
    sections_per_class: '2',
    academic_year: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
  });

  const [hospitalConfig, setHospitalConfig] = useState({
    num_beds: '20',
    has_lab: true,
    has_pharmacy: false,
    departments: 'General Medicine, Paediatrics',
  });

  const isSchool   = tenant?.appType === 'school';
  const isHospital = tenant?.appType === 'hospital';

  const STEPS = isSchool
    ? ['Organisation', 'School setup', 'Done']
    : isHospital
    ? ['Organisation', 'Hospital setup', 'Done']
    : ['Organisation', 'Done'];

  function validateStep() {
    const newErrors = {};

    if (step === 1) {
      if (!orgInfo.orgName.trim()) newErrors.orgName = 'Organisation name is required';
      else if (orgInfo.orgName.trim().length < 3) newErrors.orgName = 'Name is too short';
      if (orgInfo.contact_phone && orgInfo.contact_phone.replace(/\D/g, '').length !== 10) {
        newErrors.contact_phone = 'Enter a valid 10-digit phone number';
      }
    }

    if (step === 2 && isSchool) {
      const classes = parseInt(schoolConfig.num_classes);
      if (isNaN(classes) || classes < 1) newErrors.num_classes = 'Enter at least 1 class';
      if (classes > 15) newErrors.num_classes = 'Cannot exceed 15 classes';

      const sections = parseInt(schoolConfig.sections_per_class);
      if (isNaN(sections) || sections < 1) newErrors.sections_per_class = 'Enter at least 1 section';
      if (sections > 10) newErrors.sections_per_class = 'Cannot exceed 10 sections per class';
    }

    if (step === 2 && isHospital) {
      const beds = parseInt(hospitalConfig.num_beds);
      if (isNaN(beds) || beds < 1) newErrors.num_beds = 'Enter at least 1 bed';
      if (beds > 10000) newErrors.num_beds = 'Number of beds seems too high — please check';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function saveAndNext() {
    if (!validateStep()) return;
    setSaving(true);
    setSubmitError('');

    if (step === 1) {
      const appUpdate = { org_name: orgInfo.orgName.trim() };
      if (isSchool) appUpdate.school_type = orgInfo.school_type || null;
      if (isSchool) appUpdate.board_type = orgInfo.board_type || 'state_board';
      const { error: appErr } = await supabase.from('apps').update(appUpdate).eq('id', tenant?.appId);
      if (appErr) { setSubmitError('Failed to save organisation name. Please try again.'); setSaving(false); return; }

      if (tenant?.branchId) {
        const { error: branchErr } = await supabase.from('branches').update({
          address:  orgInfo.address.trim(),
          district: orgInfo.district,
        }).eq('id', tenant.branchId);
        if (branchErr) { setSubmitError('Failed to save address/district. Please try again.'); setSaving(false); return; }
      } else {
        // No branch exists yet — this is the normal path for every
        // fresh signup, not an edge case, since Registration.jsx never
        // creates a branches row. Previously this whole block was
        // skipped whenever branchId was null, meaning District and
        // Address were silently discarded for every new account with
        // no error shown. Creating the branch here instead, and
        // pointing this user's own row at it so future logins pick it
        // up via TenantContext.
        const { data: newBranch, error: branchErr } = await supabase
          .from('branches')
          .insert({
            app_id:   tenant.appId,
            address:  orgInfo.address.trim(),
            district: orgInfo.district,
          })
          .select()
          .single();

        if (branchErr) {
          setSubmitError('Failed to save address/district. Please try again or contact support.');
          setSaving(false);
          return;
        }

        if (newBranch) {
          await supabase.from('users').update({ branch_id: newBranch.id }).eq('auth_id', tenant?.userId);
        }
      }

      if (orgInfo.contact_phone) {
        await supabase.from('users').update({ phone: orgInfo.contact_phone.trim() }).eq('auth_id', tenant?.userId);
      }
    }

    if (step === 2 && isSchool) {
      const classNames = Array.from({ length: parseInt(schoolConfig.num_classes) }, (_, i) => `Class ${i + 1}`);
      for (const [order, className] of classNames.entries()) {
        await supabase.from('classes').upsert({
          app_id:      tenant.appId,
          branch_id:   tenant.branchId,
          class_name:  className,
          class_order: order + 1,
          medium:      schoolConfig.medium,
        }, { onConflict: 'app_id,class_name' });
      }
    }

    if (step === 2 && isHospital) {
      await supabase.from('wards').upsert({
        app_id:     tenant.appId,
        ward_type:  'General',
        total_beds: parseInt(hospitalConfig.num_beds),
      }, { onConflict: 'app_id,ward_type' });
    }

    setSaving(false);

    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      navigate(tenant?.appType === 'hospital' ? '/hospital/dashboard' : '/school/dashboard');
    }
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <div style={S.inner}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 22, margin: '0 auto 14px' }}>M</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>Welcome to MPower!</h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Quick setup — 2 minutes</p>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: i < step - 1 ? 'rgba(106,170,144,0.2)' : i === step - 1 ? '#E8A020' : 'rgba(255,255,255,0.08)', color: i < step - 1 ? '#6AAA90' : i === step - 1 ? '#111113' : 'rgba(255,255,255,0.3)' }}>
                  {i < step - 1 ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 9, color: i === step - 1 ? '#fff' : 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>{s}</span>
              </div>
              {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: i < step - 1 ? '#6AAA90' : 'rgba(255,255,255,0.08)', margin: '0 6px 16px' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1 — Org info */}
        {step === 1 && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Organisation details</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Organisation name <span style={{ color: '#E05A5A' }}>*</span>
              </label>
              <input value={orgInfo.orgName}
                onChange={(e) => { setOrgInfo((o) => ({ ...o, orgName: e.target.value })); setErrors((er) => ({ ...er, orgName: null })); }}
                placeholder="Full name of school / hospital"
                style={S.input(!!errors.orgName)} />
              {errors.orgName && <p style={S.fieldErr}>⚠ {errors.orgName}</p>}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>District</label>
              <select value={orgInfo.district} onChange={(e) => setOrgInfo((o) => ({ ...o, district: e.target.value }))}
                style={{ ...S.input(false), cursor: 'pointer' }}>
                <option value="">-- Select district --</option>
                {AP_DISTRICTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Address</label>
              <input value={orgInfo.address} onChange={(e) => setOrgInfo((o) => ({ ...o, address: e.target.value }))}
                placeholder="Full address" style={S.input(false)} />
            </div>

            {isSchool && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>School type</label>
                <select value={orgInfo.school_type} onChange={(e) => setOrgInfo((o) => ({ ...o, school_type: e.target.value }))}
                  style={{ ...S.input(false), cursor: 'pointer' }}>
                  <option value="">-- Select --</option>
                  <option value="government">Government</option>
                  <option value="aided">Government-aided</option>
                  <option value="private">Private</option>
                </select>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                  Affects which welfare schemes show as eligible for your students
                </p>
              </div>
            )}

            {isSchool && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Board</label>
                <select value={orgInfo.board_type} onChange={(e) => setOrgInfo((o) => ({ ...o, board_type: e.target.value }))}
                  style={{ ...S.input(false), cursor: 'pointer' }}>
                  <option value="state_board">State Board (AP SSC / TS SSC)</option>
                  <option value="cbse">CBSE</option>
                </select>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                  Sets your pass mark and grading rules for report cards \u2014 State Board pass mark is 35%, CBSE is 33%
                </p>
              </div>
            )}

            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Contact phone</label>
              <input value={orgInfo.contact_phone}
                onChange={(e) => { setOrgInfo((o) => ({ ...o, contact_phone: sanitize.phone(e.target.value) })); setErrors((er) => ({ ...er, contact_phone: null })); }}
                placeholder="+91 XXXXX XXXXX" inputMode="numeric"
                style={S.input(!!errors.contact_phone)} />
              {errors.contact_phone && <p style={S.fieldErr}>⚠ {errors.contact_phone}</p>}
            </div>
          </div>
        )}

        {/* Step 2 — School config */}
        {step === 2 && isSchool && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>School configuration</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Board</label>
                <select value={schoolConfig.board} onChange={(e) => setSchoolConfig((s) => ({ ...s, board: e.target.value }))}
                  style={{ ...S.input(false), cursor: 'pointer' }}>
                  {SCHOOL_BOARDS.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Medium</label>
                <select value={schoolConfig.medium} onChange={(e) => setSchoolConfig((s) => ({ ...s, medium: e.target.value }))}
                  style={{ ...S.input(false), cursor: 'pointer' }}>
                  {MEDIUM_OPTIONS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  Number of classes <span style={{ color: '#E05A5A' }}>*</span>
                </label>
                <input
                  value={schoolConfig.num_classes}
                  onChange={(e) => { setSchoolConfig((s) => ({ ...s, num_classes: sanitize.integer(e.target.value) })); setErrors((er) => ({ ...er, num_classes: null })); }}
                  placeholder="10" inputMode="numeric"
                  style={S.input(!!errors.num_classes)} />
                {errors.num_classes && <p style={S.fieldErr}>⚠ {errors.num_classes}</p>}
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>1–15 classes</p>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  Sections per class <span style={{ color: '#E05A5A' }}>*</span>
                </label>
                <input
                  value={schoolConfig.sections_per_class}
                  onChange={(e) => { setSchoolConfig((s) => ({ ...s, sections_per_class: sanitize.integer(e.target.value) })); setErrors((er) => ({ ...er, sections_per_class: null })); }}
                  placeholder="2" inputMode="numeric"
                  style={S.input(!!errors.sections_per_class)} />
                {errors.sections_per_class && <p style={S.fieldErr}>⚠ {errors.sections_per_class}</p>}
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>1–10 sections</p>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Academic year</label>
              <input value={schoolConfig.academic_year} onChange={(e) => setSchoolConfig((s) => ({ ...s, academic_year: e.target.value }))}
                placeholder="2025-2026" style={S.input(false)} />
            </div>

            {schoolConfig.num_classes && !errors.num_classes && (
              <div style={{ background: '#111113', borderRadius: 8, padding: '10px 12px', marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
                ℹ️ Will create {schoolConfig.num_classes} classes (Class 1 to Class {schoolConfig.num_classes}) with {schoolConfig.sections_per_class} section{parseInt(schoolConfig.sections_per_class) > 1 ? 's' : ''} each.
              </div>
            )}
          </div>
        )}

        {/* Step 2 — Hospital config */}
        {step === 2 && isHospital && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Hospital configuration</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Total beds (General ward) <span style={{ color: '#E05A5A' }}>*</span>
              </label>
              <input
                value={hospitalConfig.num_beds}
                onChange={(e) => { setHospitalConfig((h) => ({ ...h, num_beds: sanitize.integer(e.target.value) })); setErrors((er) => ({ ...er, num_beds: null })); }}
                placeholder="20" inputMode="numeric"
                style={S.input(!!errors.num_beds)} />
              {errors.num_beds && <p style={S.fieldErr}>⚠ {errors.num_beds}</p>}
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Positive number only</p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Departments</label>
              <input value={hospitalConfig.departments} onChange={(e) => setHospitalConfig((h) => ({ ...h, departments: e.target.value }))}
                placeholder="General Medicine, Paediatrics, Surgery..." style={S.input(false)} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'has_lab',      label: 'Has laboratory',   sub: 'Enable lab test ordering and result entry' },
                { key: 'has_pharmacy', label: 'Has pharmacy',     sub: 'Enable dispensing and drug inventory' },
              ].map((item) => (
                <label key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, background: hospitalConfig[item.key] ? 'rgba(232,160,32,0.06)' : '#111113', border: `1px solid ${hospitalConfig[item.key] ? 'rgba(232,160,32,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                  <input type="checkbox" checked={hospitalConfig[item.key]} onChange={(e) => setHospitalConfig((h) => ({ ...h, [item.key]: e.target.checked }))} style={{ marginTop: 2, accentColor: '#E8A020', width: 16, height: 16 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: '#fff' }}>{item.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{item.sub}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Done step */}
        {step === STEPS.length && (
          <div style={{ ...S.card, textAlign: 'center', padding: '40px 24px' }}>
            <p style={{ fontSize: 48, marginBottom: 16 }}>🎉</p>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Setup complete!</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.7 }}>
              Your {tenant?.appType} is ready. Click below to open your dashboard.
            </p>
          </div>
        )}

        {/* Submit error */}
        {submitError && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {submitError}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10 }}>
          {step > 1 && step < STEPS.length && (
            <button onClick={() => { setStep((s) => s - 1); setErrors({}); }}
              style={{ padding: '12px 20px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
              ← Back
            </button>
          )}
          <button onClick={saveAndNext} disabled={saving}
            style={{ flex: 1, padding: 13, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving...' : step === STEPS.length ? `Open ${tenant?.appType || 'app'} dashboard →` : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  );
}