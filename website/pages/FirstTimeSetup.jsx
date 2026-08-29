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

  useEffect(() => {
    if (step !== 2 || classList !== null || wardList !== null) return;
    setLoadingDefaults(true);
    supabase.functions.invoke('get-setup-defaults', { body: {} }).then(({ data, error }) => {
      setLoadingDefaults(false);
      if (error || data?.error) return; // Step 2 still renders; list just starts empty
      if (data.appType === 'school') setClassList(data.classes || []);
      if (data.appType === 'hospital') setWardList(data.wards || []);
    });
  }, [step]);
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
    academic_year: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
  });

  const [hospitalConfig, setHospitalConfig] = useState({
    has_lab: true,
    has_pharmacy: false,
    departments: 'General Medicine, Paediatrics',
  });

  // Classes/wards are already created by the seed_default_client_data
  // trigger the moment the account was registered — these lists are
  // fetched fresh and edited in place, not created from scratch.
  const [classList, setClassList] = useState(null);
  const [removedClassIds, setRemovedClassIds] = useState([]);
  const [wardList, setWardList] = useState(null);
  const [removedWardIds, setRemovedWardIds] = useState([]);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

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

    if (step === 2 && isSchool && classList) {
      if (classList.length === 0) newErrors.classList = 'At least one class is required';
      if (classList.some((c) => !c.class_name?.trim())) newErrors.classList = 'Every class needs a name';
    }

    if (step === 2 && isHospital && wardList) {
      if (wardList.length === 0) newErrors.wardList = 'At least one ward is required';
      if (wardList.some((w) => !w.ward_type?.trim())) newErrors.wardList = 'Every ward needs a name';
      if (wardList.some((w) => !w.total_beds || parseInt(w.total_beds) < 1)) newErrors.wardList = 'Every ward needs at least 1 bed';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function saveAndNext() {
    if (!validateStep()) return;
    setSaving(true);
    setSubmitError('');

    if (step === 1) {
      // Moved off a direct client-side update after finding it had no
      // .select().single() chained — meaning a stale tenant.appId
      // right after fresh registration could match zero rows
      // silently, with no error shown, while the code proceeded as if
      // organisation details were saved. See save-org-details.ts.
      const { data: orgResult, error: orgInvokeError } = await supabase.functions.invoke('save-org-details', {
        body: {
          orgName: orgInfo.orgName.trim(),
          schoolType: isSchool ? (orgInfo.school_type || null) : undefined,
          boardType: isSchool ? (orgInfo.board_type || 'state_board') : undefined,
        },
      });
      if (orgInvokeError || orgResult?.error) {
        setSubmitError(orgResult?.error || 'Failed to save organisation name. Please try again.');
        setSaving(false);
        return;
      }

      // Moved off a direct client-side insert/update after a real,
      // reported failure right after fresh registration — see
      // save-branch-details.ts for the full explanation. The server
      // now determines the correct app_id itself, rather than relying
      // on tenant.appId or an RLS helper being fully settled at this
      // exact moment.
      const { data: branchResult, error: branchInvokeError } = await supabase.functions.invoke('save-branch-details', {
        body: {
          // branches.branch_name is NOT NULL — this was never being sent,
          // which is exactly what caused the 500 ("null value in column
          // branch_name"). Defaulting to the org name since most schools/
          // hospitals start with a single branch and there's no dedicated
          // branch-naming step in this setup flow.
          branchName: orgInfo.orgName.trim() || 'Main Branch',
          address: orgInfo.address.trim(),
          district: orgInfo.district,
        },
      });
      if (branchInvokeError || branchResult?.error) {
        setSubmitError(branchResult?.error || 'Failed to save address/district. Please try again or contact support.');
        setSaving(false);
        return;
      }

      if (orgInfo.contact_phone) {
        await supabase.from('users').update({ phone: orgInfo.contact_phone.trim() }).eq('auth_id', tenant?.userId);
      }
    }

    if (step === 2 && isSchool && classList) {
      const { data: classResult, error: classInvokeError } = await supabase.functions.invoke('customize-classes', {
        body: { classes: classList, removedIds: removedClassIds },
      });
      if (classInvokeError || classResult?.error) {
        setSubmitError(classResult?.error || 'Failed to save your classes. Please try again or contact support.');
        setSaving(false);
        return;
      }
    }

    if (step === 2 && isHospital && wardList) {
      const { data: wardResult, error: wardInvokeError } = await supabase.functions.invoke('customize-wards', {
        body: { wards: wardList, removedIds: removedWardIds },
      });
      if (wardInvokeError || wardResult?.error) {
        setSubmitError(wardResult?.error || 'Failed to save your wards. Please try again or contact support.');
        setSaving(false);
        return;
      }
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

            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Academic year</label>
              <input value={schoolConfig.academic_year} onChange={(e) => setSchoolConfig((s) => ({ ...s, academic_year: e.target.value }))}
                placeholder="2025-2026" style={S.input(false)} />
            </div>

            <div style={{ marginTop: 18 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Your classes <span style={{ color: '#E05A5A' }}>*</span>
              </label>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>
                Already set up for you — rename, remove, or add classes below.
              </p>
              {loadingDefaults && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading...</p>}
              {classList && classList.map((cls, i) => (
                <div key={cls.id || `new-${i}`} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={cls.class_name} onChange={(e) => {
                    const updated = [...classList]; updated[i] = { ...cls, class_name: e.target.value }; setClassList(updated);
                  }} style={{ ...S.input(false), flex: 2 }} />
                  <select value={cls.medium} onChange={(e) => {
                    const updated = [...classList]; updated[i] = { ...cls, medium: e.target.value }; setClassList(updated);
                  }} style={{ ...S.input(false), flex: 1, cursor: 'pointer' }}>
                    {MEDIUM_OPTIONS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <button type="button" onClick={() => {
                    if (cls.id) setRemovedClassIds((ids) => [...ids, cls.id]);
                    setClassList(classList.filter((_, idx) => idx !== i));
                  }} style={{ background: 'none', border: 'none', color: 'rgba(224,90,90,0.5)', fontSize: 16, cursor: 'pointer', padding: '0 8px' }}>✕</button>
                </div>
              ))}
              {errors.classList && <p style={S.fieldErr}>⚠ {errors.classList}</p>}
              {classList && (
                <button type="button" onClick={() => setClassList([...classList, { class_name: '', medium: schoolConfig.medium }])}
                  style={{ marginTop: 6, padding: '8px 14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  + Add a class
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 2 — Hospital config */}
        {step === 2 && isHospital && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Hospital configuration</p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                Your wards <span style={{ color: '#E05A5A' }}>*</span>
              </label>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>
                Already set up for you — rename, adjust bed counts, remove, or add wards below.
              </p>
              {loadingDefaults && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading...</p>}
              {wardList && wardList.map((ward, i) => (
                <div key={ward.id || `new-${i}`} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={ward.ward_type} onChange={(e) => {
                    const updated = [...wardList]; updated[i] = { ...ward, ward_type: e.target.value }; setWardList(updated);
                  }} style={{ ...S.input(false), flex: 2 }} placeholder="Ward name" />
                  <input value={ward.total_beds} inputMode="numeric" onChange={(e) => {
                    const updated = [...wardList]; updated[i] = { ...ward, total_beds: sanitize.integer(e.target.value) }; setWardList(updated);
                  }} style={{ ...S.input(false), flex: 1 }} placeholder="Beds" />
                  <button type="button" onClick={() => {
                    if (ward.id) setRemovedWardIds((ids) => [...ids, ward.id]);
                    setWardList(wardList.filter((_, idx) => idx !== i));
                  }} style={{ background: 'none', border: 'none', color: 'rgba(224,90,90,0.5)', fontSize: 16, cursor: 'pointer', padding: '0 8px' }}>✕</button>
                </div>
              ))}
              {errors.wardList && <p style={S.fieldErr}>⚠ {errors.wardList}</p>}
              {wardList && (
                <button type="button" onClick={() => setWardList([...wardList, { ward_type: '', total_beds: '' }])}
                  style={{ marginTop: 6, padding: '8px 14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                  + Add a ward
                </button>
              )}
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