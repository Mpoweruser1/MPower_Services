// website/pages/ResetPassword.jsx
//
// The page a "Forgot password" email link opens. PortalLogin.jsx sends
// the reset email with redirectTo = `${origin}/portal/reset-password`.
//
// REWRITTEN 26-9-2026 — the first version had two real bugs:
//
// 1. Timing race. It called getSession() the instant the page mounted,
//    but supabase-js processes the token in the link slightly AFTER the
//    app loads. Whenever the check won that race, a perfectly valid
//    link showed "Link expired". Worse, supabase-js strips the token
//    out of the address bar once it processes it, and fires its
//    PASSWORD_RECOVERY signal — often BEFORE this component has even
//    mounted, so a listener set up inside the component would miss it.
//    Fix: the original URL and the recovery signal are both captured
//    at MODULE level below, which runs when the app first loads —
//    before supabase-js touches the URL — so nothing is ever missed.
//
// 2. Wrong-account risk. If someone was already logged in on the same
//    browser (e.g. the admin), getSession() returned THEIR session and
//    the form would have changed the ADMIN's password, not the person
//    who clicked the link. Fix: a session is only accepted when this
//    page load actually carried a recovery token AND Supabase signalled
//    it processed that token. A pre-existing login is never used. The
//    account email is also shown on the form, so it's visible whose
//    password is being changed.
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

// ── Captured once, when the app first loads ─────────────────────────
// Must be read here, not inside the component: by the time React
// renders this page, supabase-js may already have removed the token
// from the address bar.
const INITIAL = (() => {
  if (typeof window === 'undefined') return { hadToken: false, errorCode: null, errorDescription: null };
  const onThisPage = window.location.pathname.startsWith('/portal/reset-password');
  if (!onThisPage) return { hadToken: false, errorCode: null, errorDescription: null };
  const hash  = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return {
    // access_token + type=recovery in the hash = implicit flow;
    // ?code= = PKCE flow. Either means this load came from an email link.
    hadToken: hash.has('access_token') || hash.get('type') === 'recovery' || query.has('code'),
    // Supabase puts its own verdict here when the link is already used
    // or expired, e.g. error_code=otp_expired.
    errorCode: hash.get('error_code') || query.get('error_code'),
    errorDescription: hash.get('error_description') || query.get('error_description'),
  };
})();

// Registered at load time so the signal can't fire before we listen.
let recoverySignalled = false;
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') recoverySignalled = true;
  // Some supabase-js versions report the PKCE (?code=) recovery exchange
  // as SIGNED_IN rather than PASSWORD_RECOVERY. Accepted ONLY when this
  // page load actually carried a token — a plain existing login never
  // counts (see bug 2 above).
  if (event === 'SIGNED_IN' && INITIAL.hadToken) recoverySignalled = true;
});

const VERIFY_TIMEOUT_MS = 8000;

const INVALID_MESSAGES = {
  expired: {
    title: 'Link already used or expired',
    body: 'This reset link has already been used or has expired. This can also happen when an email app opens the link automatically to scan it. Please request a new link.',
  },
  verify_failed: {
    title: "Couldn't verify this link",
    body: 'This usually happens when the link is opened on a different phone or browser than the one used to request it, or when an older email is used after requesting a newer one. Please request a new link and open the newest email on the same device.',
  },
  no_token: {
    title: 'Open the link from your email',
    body: 'This page only works from the password reset link sent to your email. Please request a reset from the login page.',
  },
};

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '36px 32px', width: '100%', maxWidth: 400 },
  input: { width: '100%', padding: '12px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  error: { background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#E05A5A', marginBottom: 14 },
  success: { background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#6AAA90', marginBottom: 14 },
  button: { display: 'block', textAlign: 'center', padding: 12, background: '#E8A020', color: '#111113', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' },
};

export default function ResetPassword() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking'); // checking | ready | invalid | done
  const [invalidReason, setInvalidReason] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Supabase already said the link is dead — no point waiting.
    if (INITIAL.errorCode) {
      setInvalidReason(INITIAL.errorCode === 'otp_expired' ? 'expired' : 'verify_failed');
      setStatus('invalid');
      return undefined;
    }
    // Opened without a link (typed in, bookmarked, or reloaded after
    // the token was already consumed) — never fall back to whatever
    // session happens to exist in this browser.
    if (!INITIAL.hadToken) {
      setInvalidReason('no_token');
      setStatus('invalid');
      return undefined;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (cancelled) return;
      if (recoverySignalled) {
        clearInterval(timer);
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data?.session) {
          setAccountEmail(data.session.user?.email || '');
          setStatus('ready');
        } else {
          setInvalidReason('verify_failed');
          setStatus('invalid');
        }
      } else if (Date.now() - startedAt > VERIFY_TIMEOUT_MS) {
        clearInterval(timer);
        setInvalidReason('verify_failed');
        setStatus('invalid');
      }
    }, 250);

    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  async function handleSetPassword() {
    if (status !== 'ready') return;
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateErr) {
      console.error('Setting new password failed:', updateErr);
      setError(updateErr.message || 'Could not set your new password. Please try again.');
      return;
    }
    setStatus('done');
    // End the temporary recovery session and send them to the real
    // login with their new password.
    await supabase.auth.signOut();
    setTimeout(() => navigate('/portal/login'), 2500);
  }

  if (status === 'checking') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>Checking your reset link...</p>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    const msg = INVALID_MESSAGES[invalidReason] || INVALID_MESSAGES.verify_failed;
    return (
      <div style={S.page}>
        <div style={S.card}>
          <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600 }}>{msg.title}</p>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{msg.body}</p>
          <Link to="/portal/login" style={S.button}>Back to login to request a new link</Link>
        </div>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={{ ...S.success, marginBottom: 0 }}>✓ Password updated. Taking you to login...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600 }}>Set a new password</p>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          {accountEmail
            ? <>For account <strong style={{ color: '#fff' }}>{accountEmail}</strong></>
            : 'Choose a new password for your account.'}
        </p>

        {error && <div style={S.error}>⚠ {error}</div>}

        <label htmlFor="reset-new-password" style={S.label}>New password</label>
        <input
          id="reset-new-password" name="reset-new-password" type="password" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
          style={S.input}
        />

        <label htmlFor="reset-confirm-password" style={S.label}>Confirm new password</label>
        <input
          id="reset-confirm-password" name="reset-confirm-password" type="password" autoComplete="new-password"
          value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
          style={S.input}
        />

        <button
          onClick={handleSetPassword} disabled={saving}
          style={{ width: '100%', padding: 12, marginTop: 8, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          {saving ? 'Saving...' : 'Set new password →'}
        </button>
      </div>
    </div>
  );
}
