// website/pages/Registration.jsx — FINAL
// Full validation + sanitization + dark theme + double-submit prevention
// Phone: 10-digit check, Email: format check, Password: strength check
// No alert() — all inline errors


import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useFormValidation, validators, sanitize } from '../../shared/useFormValidation';
import { useAutoSave } from '../../shared/useAutoSave';
import DraftBanner from '../../shared/DraftBanner';
import FormField from '../../shared/FormField';

const AP_DISTRICTS = [
  'Alluri Sitharama Raju', 'Anakapalli', 'Ananthapuramu', 'Annamayya',
  'Bapatla', 'Chittoor', 'Dr. B.R. Ambedkar Konaseema', 'East Godavari',
  'Eluru', 'Guntur', 'Kakinada', 'Krishna', 'Kurnool', 'Nandyal',
  'NTR', 'Palnadu', 'Parvathipuram Manyam', 'Prakasam', 'Srikakulam',
  'Sri Potti Sriramulu Nellore', 'Tirupati', 'Visakhapatnam',
  'Vizianagaram', 'West Godavari', 'YSR Kadapa', 'Other',
];

const EMPTY_FORM = {
  appType: 'school', orgName: '', district: '',
  contactPerson: '', phone: '', email: '',
  password: '', confirmPwd: '',
};

// Validation rules
const RULES = {
  orgName:       [validators.required, validators.minLength(3), validators.noSpecialChars],
  contactPerson: [validators.required, validators.nameField],
  phone:         [validators.required, validators.phone],
  email:         [validators.required, validators.email],
  password: [(v) => {
    if (!v) return 'Password is required';
    if (v.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(v)) return 'Password must have at least one uppercase letter';
    if (!/[0-9]/.test(v)) return 'Password must have at least one number';
    return null;
  }],
  confirmPwd: [(v, form) => {
    if (!v) return 'Please confirm your password';
    return null;
  }],
};

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '36px 32px', width: '100%', maxWidth: 480 },
};

export default function Registration() {

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Products.jsx passes ?type=school|hospital carrying forward whichever
  // product tab was active when "Start free trial" was clicked. CTS is
  // deliberately not one of these — an MLA/MP office joins an EXISTING
  // state's CTS deployment via RequestStaffAccess.jsx (real constituency
  // data + admin approval), not by creating a brand-new isolated tenant
  // the way a school or hospital genuinely is one.
  const VALID_APP_TYPES = ['school', 'hospital'];
  const requestedType = searchParams.get('type');
  const hasExplicitType = VALID_APP_TYPES.includes(requestedType);
  const initialAppType = hasExplicitType ? requestedType : 'school';

  const [form, setForm]       = useState({ ...EMPTY_FORM, appType: initialAppType });
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState(false);
  const [submitError, setSubmitError] = useState('');
  // Auto-redirect to login after successful registration


  useEffect(() => {
  if (!done) return;
  const timer = setTimeout(async () => {
    // Sign out first to clear old tenant cache
    await supabase.auth.signOut();
    navigate('/portal/login');
  }, 3000);
  return () => clearTimeout(timer);
}, [done]);

  // Validation
  const { errors, touched, validate, touch, onChange: onValidate, reset } =
    useFormValidation(RULES);

  // Auto-save draft — public form, no logged-in user to scope the key
  // by, so a shorter expiry (6 hours) limits the window where a
  // different visitor on the same shared/public device could see a
  // leftover draft, compared to the 1-day default used elsewhere.
  const { hasDraft, draftData, lastSaved, isDirty, clearDraft, dismissDraft, restoreDraft } =
    useAutoSave('registration_form', form, { maxAgeDays: 0.25 });

  // The active product tab should always reflect the URL — an explicit
  // ?type= from Products.jsx, or School as the neutral default from a
  // generic entry point like the Home page button. A restored draft's
  // own appType must never override this, even though the rest of its
  // typed-in fields (name, phone, etc.) are still worth restoring.
  function applyRestoredDraft() {
    setForm({ ...restoreDraft(), appType: initialAppType });
  }

  function update(field, value) {
    // Sanitize specific fields
    let sanitized = value;
    if (field === 'phone') sanitized = sanitize.phone(value);
    setForm((f) => ({ ...f, [field]: sanitized }));
    onValidate(field, sanitized);
  }

  // Cross-field confirm password validation
  function validateConfirmPwd(val) {
    if (!val) return 'Please confirm your password';
    if (val !== form.password) return 'Passwords do not match';
    return null;
  }

  async function register() {
    setSubmitError('');

    // Validate all fields
    const allValid = validate(form);

    // Extra check — password match
    if (form.password !== form.confirmPwd) {
      setSubmitError('Passwords do not match. Please check and try again.');
      return;
    }

    if (!allValid) {
      setSubmitError('Please fix the errors below before continuing.');
      return;
    }

    setSaving(true);

    // 2 — Create auth user
    let { data: authData, error: authErr } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
    });

    // signUp() can succeed (create the account, authData.user is
    // truthy) but return NO active session — this happens when
    // "Confirm email" is enabled in Supabase Auth, since the person
    // hasn't clicked the confirmation link yet. If that's the case,
    // every subsequent step (creating apps/users/crm_clients rows)
    // would fail on RLS, since auth.uid() reads from the session,
    // and there isn't one — exactly the "new row violates RLS" error
    // this was causing, with no clear explanation of why.
    if (!authErr && authData?.user && !authData?.session) {
      setSubmitError('Account created! Please check your email and click the confirmation link, then come back and register again to finish setting up your school/hospital.');
      setSaving(false);
      return;
    }

    if (authErr || !authData.user) {
      if (authErr?.message?.includes('already registered')) {
        // This can genuinely mean "you already have a working account,
        // please sign in" — OR it can mean this exact email is a ghost
        // left behind by an earlier registration attempt that created
        // the login successfully but then failed on a later step
        // (creating the actual school/hospital record), since there's
        // no way for a public signup page to safely delete a login it
        // already created. Before dead-ending the person, check which
        // situation this actually is by trying to sign in with what
        // they just typed — if it works AND they have no completed
        // registration yet, resume it instead of blocking them.
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: form.email.trim(), password: form.password,
        });

        if (signInErr || !signInData?.user) {
          setSubmitError('This email is already registered. Please sign in instead — if you\u2019ve forgotten your password, use "Forgot password" on the sign-in page.');
          setSaving(false);
          return;
        }

        const { data: existingUserRow } = await supabase
          .from('users').select('id').eq('auth_id', signInData.user.id).maybeSingle();

        if (existingUserRow) {
          // A real, completed registration already exists for this
          // email — this is a genuine "please sign in" case, not a
          // ghost account.
          await supabase.auth.signOut();
          setSubmitError('This email is already registered and set up. Please sign in instead.');
          setSaving(false);
          return;
        }

        // Genuine ghost account confirmed — the login exists but
        // nothing was ever actually built for it. Reuse this session
        // and continue the rest of registration below exactly as if
        // signUp had just succeeded.
        authData = signInData;
      } else {
        setSubmitError(authErr?.message || 'Failed to create account. Please try again.');
        setSaving(false);
        return;
      }
    }

    // 3 — Create app
    const { data: appRow, error: appErr } = await supabase
      .from('apps')
      .insert({
        app_type:          form.appType,
        org_name:          form.orgName.trim(),
        subscription_tier: 'basic',
      })
      .select()
      .single();

    if (appErr) {
      console.error('App creation failed:', appErr);
      setSubmitError(appErr.message || 'Failed to set up your account. Please contact support.');
      setSaving(false);
      return;
    }

    // 4 — Create user row
    const ownerRole = form.appType === 'hospital'  ? 'doctor'
                    : 'principal';

    // Previously: no error captured at all. If this failed after the
    // app row above already succeeded, the person would be told
    // "account created" but have no actual users row linking them to
    // it — meaning they could never log in again, with zero
    // indication anything went wrong.
    const { error: userErr } = await supabase.from('users').insert({
      auth_id:   authData.user.id,
      app_id:    appRow.id,
      full_name: form.contactPerson.trim(),
      role:      ownerRole,
      phone:     form.phone.trim(),
    });

    if (userErr) {
      console.error('User row creation failed:', userErr, { appId: appRow.id });
      setSubmitError(`Account partially created but failed at a critical step: ${userErr.message}. Please contact support with this reference: ${appRow.id}`);
      setSaving(false);
      return;
    }

    // 5 — Create CRM client
    // Previously: error not captured — a failure here wouldn't block
    // the person from logging in (their app + user rows already
    // exist), but would leave them with no CRM/onboarding/trial
    // record at all, invisible to your own team.
    const { data: client, error: clientErr } = await supabase
      .from('crm_clients')
      .insert({
        app_id:         appRow.id,
        org_name:       form.orgName.trim(),
        app_type:       form.appType,
        tier:           'basic',
        status:         'trial',
        contact_person: form.contactPerson.trim(),
        phone:          form.phone.trim(),
        district:       form.district,
        trial_ended_at: new Date(
          Date.now() + 180 * 24 * 60 * 60 * 1000
        ).toISOString(),
      })
      .select()
      .single();

    if (clientErr) {
      console.error('CRM client creation failed (non-blocking, but real):', clientErr, { appId: appRow.id });
      // Deliberately does not block the person's signup — their
      // account genuinely works at this point — but this needs to be
      // visible to your team, not just to the browser console of
      // whoever happened to sign up.
    }

    if (client) {
      const { error: onboardingErr } = await supabase.from('client_onboarding').insert({ client_id: client.id });
      if (onboardingErr) console.error('client_onboarding insert failed (non-blocking):', onboardingErr);

      const { error: waErr } = await supabase.functions.invoke('send-whatsapp', {
        body: { clientId: client.id, type: 'golive_welcome' },
      });
      if (waErr) console.error('Welcome WhatsApp message failed (non-blocking):', waErr);
    }

    clearDraft();
    setSaving(false);
    setDone(true);
  }

  // Password strength indicator
  function passwordStrength(pwd) {
    if (!pwd) return null;
    let score = 0;
    if (pwd.length >= 8)           score++;
    if (/[A-Z]/.test(pwd))         score++;
    if (/[0-9]/.test(pwd))         score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  }

  const pwdStrength = passwordStrength(form.password);
  const pwdColors   = ['#E05A5A', '#E8A020', '#E8A020', '#6AAA90', '#6AAA90'];
  const pwdLabels   = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  if (done) {
    return (
      <div style={S.page}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
        <div style={{ ...S.card, textAlign: 'center' }}>
          <p style={{ fontSize: 52, marginBottom: 16 }}>🎉</p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#6AAA90', margin: '0 0 10px' }}>
            Welcome to MPower!
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 6px', lineHeight: 1.7 }}>
            Your account is ready. Check your WhatsApp for a welcome message.
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 28px' }}>
            6 months free on Basic tier has started · ఉచిత ట్రయల్ ప్రారంభమైంది
          </p>
          <Link to="/portal/login"
            style={{ display: 'inline-block', padding: '13px 32px', background: '#E8A020', color: '#111113', borderRadius: 8, textDecoration: 'none', fontSize: 15, fontWeight: 700 }}>
            Sign in to your account →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.page, alignItems: 'flex-start' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <div style={S.card}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Link to="/" style={{ display: 'inline-block' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 20, margin: '0 auto 12px' }}>M</div>
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: -0.5 }}>
            Start your free trial
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            6 months free · No credit card · Cancel anytime
          </p>
        </div>

        {/* Draft banner */}
        {hasDraft && (
          <DraftBanner
            lastSaved={lastSaved}
            onRestore={applyRestoredDraft}
            onDiscard={dismissDraft}
          />
        )}

        {/* Submit error */}
        {submitError && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {submitError}
          </div>
        )}

        {/* App type selector */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 8 }}>
            I am registering for
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { value: 'school',    icon: '🏫', label: 'School' },
              { value: 'hospital',  icon: '🏥', label: 'Hospital' },
            ].map((t) => (
              <label key={t.value} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${form.appType === t.value ? 'rgba(232,160,32,0.5)' : 'rgba(255,255,255,0.08)'}`, background: form.appType === t.value ? 'rgba(232,160,32,0.06)' : '#111113', transition: 'all 0.15s' }}>
                <input type="radio" name="appType" value={t.value} checked={form.appType === t.value} onChange={() => update('appType', t.value)} style={{ display: 'none' }} />
                <span style={{ fontSize: 22 }}>{t.icon}</span>
                <span style={{ fontSize: 12, fontWeight: form.appType === t.value ? 600 : 400, color: form.appType === t.value ? '#E8A020' : 'rgba(255,255,255,0.5)' }}>
                  {t.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Organisation name */}
        <FormField
          label="Organisation name"
          name="orgName"
          value={form.orgName}
          onChange={update}
          onBlur={touch}
          error={errors.orgName}
          touched={touched.orgName}
          required
          placeholder={
            form.appType === 'school' ? 'Sri Vidya School, Machilipatnam' : 'City Care Hospital, Tenali'
          }
          maxLength={100}
        />

        {/* District */}
        <FormField
          label="District"
          name="district"
          type="select"
          value={form.district}
          onChange={update}
          onBlur={touch}
          error={errors.district}
          touched={touched.district}
          options={AP_DISTRICTS.map((d) => ({ value: d, label: d }))}
        />

        {/* Contact person */}
        <FormField
          label={form.appType === 'hospital' ? 'Doctor / Owner name' : 'Principal / Owner name'}
          name="contactPerson"
          value={form.contactPerson}
          onChange={update}
          onBlur={touch}
          error={errors.contactPerson}
          touched={touched.contactPerson}
          required
          placeholder="Your full name"
          hint="As per official records"
        />

        {/* Phone */}
        <FormField
          label="WhatsApp phone"
          name="phone"
          type="phone"
          value={form.phone}
          onChange={update}
          onBlur={touch}
          error={errors.phone}
          touched={touched.phone}
          required
          placeholder="+91 XXXXX XXXXX"
          hint="WhatsApp number — welcome message will be sent here"
        />

        {/* Email */}
        <FormField
          label="Email address"
          name="email"
          type="email"
          value={form.email}
          onChange={update}
          onBlur={touch}
          error={errors.email}
          touched={touched.email}
          required
          placeholder="your@email.com"
          hint="Used for login"
        />

        {/* Password */}
        <FormField
          label="Create password"
          name="password"
          type="password"
          value={form.password}
          onChange={update}
          onBlur={touch}
          error={errors.password}
          touched={touched.password}
          required
          placeholder="Min 8 characters"
          hint="Must have uppercase letter and number"
        />

        {/* Password strength bar */}
        {form.password && (
          <div style={{ marginTop: -10, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: pwdStrength >= i ? pwdColors[pwdStrength] : 'rgba(255,255,255,0.1)', transition: 'background 0.3s' }} />
              ))}
            </div>
            <p style={{ fontSize: 12, color: pwdColors[pwdStrength || 0], margin: 0 }}>
              {pwdLabels[pwdStrength || 0]}
            </p>
          </div>
        )}

        {/* Confirm password */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6 }}>
            Confirm password <span style={{ color: '#E05A5A' }}>*</span>
          </p>
          <input
            type="password"
            value={form.confirmPwd}
            onChange={(e) => update('confirmPwd', e.target.value)}
            onBlur={() => touch('confirmPwd', form.confirmPwd)}
            placeholder="Repeat password"
            style={{
              width: '100%', padding: '10px 14px',
              background: '#111113',
              border: `1px solid ${touched.confirmPwd && form.confirmPwd !== form.password ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 8, fontSize: 14, color: '#fff',
              outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
          {touched.confirmPwd && form.confirmPwd && form.confirmPwd !== form.password && (
            <p style={{ fontSize: 12, color: '#E05A5A', marginTop: 5 }}>⚠ Passwords do not match</p>
          )}
          {touched.confirmPwd && form.confirmPwd && form.confirmPwd === form.password && (
            <p style={{ fontSize: 12, color: '#6AAA90', marginTop: 5 }}>✓ Passwords match</p>
          )}
        </div>

        {/* Terms */}
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 16, lineHeight: 1.6 }}>
          By creating an account you agree to our{' '}
          <Link to="/terms" style={{ color: '#E8A020' }}>Terms</Link> and{' '}
          <Link to="/privacy" style={{ color: '#E8A020' }}>Privacy Policy</Link>.
        </p>

        {/* Submit */}
        <button
          onClick={register}
          disabled={saving}
          style={{
            width: '100%', padding: 14,
            background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020',
            color: saving ? 'rgba(255,255,255,0.3)' : '#111113',
            border: 'none', borderRadius: 8,
            fontSize: 15, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', marginBottom: 16,
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'Creating your account...' : 'Create account & start free trial →'}
        </button>

        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', margin: 0 }}>
          Already have an account?{' '}
          <Link to="/portal/login" style={{ color: '#E8A020', textDecoration: 'none', fontWeight: 500 }}>
            Sign in →
          </Link>
        </p>
      </div>
    </div>
  );
}