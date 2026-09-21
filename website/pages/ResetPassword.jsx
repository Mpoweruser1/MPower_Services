// website/pages/ResetPassword.jsx — NEW
// The missing half of "Forgot password". PortalLogin.jsx has always
// correctly sent a reset email with redirectTo set to
// `${origin}/portal/reset-password` — but no route or page existed
// there, so every recovery link, for every user, silently fell
// through to the public site with no way to actually set a new
// password. Found via live testing before launch.
//
// Supabase's recovery link lands here carrying a session in the URL
// itself (a hash fragment, or already exchanged into a session by the
// client library before this component even mounts, depending on SDK
// version) — either way, by the time this renders, supabase.auth
// should already have a valid, temporary session for the user who
// clicked the link. We don't re-verify the token ourselves; we just
// check whether a session exists and let updateUser() do the real
// work, matching Supabase's own documented pattern for this flow.
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '36px 32px', width: '100%', maxWidth: 400 },
  input: { width: '100%', padding: '12px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 },
  error: { background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#E05A5A', marginBottom: 14 },
  success: { background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#6AAA90', marginBottom: 14 },
};

export default function ResetPassword() {
  const navigate = useNavigate();
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkValid, setLinkValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    checkRecoverySession();
  }, []);

  async function checkRecoverySession() {
    // The recovery link, when clicked, causes supabase-js to establish
    // a temporary session automatically (it parses the token from the
    // URL on load). If that succeeded, getSession() returns it here.
    // If the link was expired, already used, or malformed, there's no
    // session — and we tell the person plainly rather than showing a
    // password form that can never actually work.
    const { data, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !data?.session) {
      console.error('No recovery session found:', sessionErr);
      setLinkValid(false);
    } else {
      setLinkValid(true);
    }
    setCheckingLink(false);
  }

  async function handleSetPassword() {
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
    setDone(true);
    // Sign out the temporary recovery session and send them to the
    // real login with their new password — safer than silently
    // treating the recovery session as a normal logged-in session.
    await supabase.auth.signOut();
    setTimeout(() => navigate('/portal/login'), 2500);
  }

  if (checkingLink) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Checking your reset link...</p>
        </div>
      </div>
    );
  }

  if (!linkValid) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600 }}>Link expired</p>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            This password reset link is invalid or has already been used. Reset links only work once and expire after a short time.
          </p>
          <Link to="/portal/login" style={{ display: 'block', textAlign: 'center', padding: 12, background: '#E8A020', color: '#111113', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.success}>✓ Password updated. Taking you to login...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600 }}>Set a new password</p>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          Choose a new password for your account.
        </p>

        {error && <div style={S.error}>⚠ {error}</div>}

        <label htmlFor="reset-new-password" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
          New password
        </label>
        <input
          id="reset-new-password" name="reset-new-password" type="password" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
          style={S.input}
        />

        <label htmlFor="reset-confirm-password" style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
          Confirm new password
        </label>
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
