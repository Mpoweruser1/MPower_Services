// website/pages/PortalLogin.jsx — FINAL
// Dark theme, Supabase wired, Enter key support, forgot password
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useTenant } from '../../context/TenantContext';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '36px 32px', width: '100%', maxWidth: 400 },
  input: { width: '100%', padding: '12px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 },
  error: { background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#E05A5A', marginBottom: 14 },
  success: { background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#6AAA90', marginBottom: 14 },
};

export default function PortalLogin() {
  const navigate = useNavigate();
  const { session, loading } = useTenant();
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent]   = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Check URL params for messages
  const idleReason = new URLSearchParams(window.location.search).get('reason') === 'idle';

  // If already logged in redirect
  useEffect(() => {
    if (!loading && session) navigate('/portal/dashboard', { replace: true });
  }, [session, loading, navigate]);

  async function login() {
    setError('');
    if (!email.trim())    { setError('Please enter your email address.'); return; }
    if (!password.trim()) { setError('Please enter your password.'); return; }
    setLoggingIn(true);

    const { error: loginErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoggingIn(false);

    if (loginErr) {
      if (loginErr.message?.includes('Invalid login')) {
        setError('Incorrect email or password. Please try again.');
      } else if (loginErr.message?.includes('Email not confirmed')) {
        setError('Please confirm your email address first. Check your inbox.');
      } else {
        setError(loginErr.message || 'Login failed. Please try again.');
      }
      return;
    }

    navigate('/portal/dashboard', { replace: true });
  }

  async function sendReset() {
    if (!resetEmail.trim()) { setError('Enter your email address.'); return; }
    setSendingReset(true);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/portal/reset-password`,
    });
    setSendingReset(false);
    if (resetErr) { setError('Failed to send reset email. Please try again.'); return; }
    setResetSent(true);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      if (showForgot) sendReset();
      else login();
    }
  }

  if (loading) return (
    <div style={S.page}>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Loading...</p>
    </div>
  );

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <div style={S.card}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 22, margin: '0 auto 14px' }}>M</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: -0.5 }}>
            {showForgot ? 'Reset password' : 'Welcome back'}
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            {showForgot ? 'Enter your email to get a reset link' : 'MPower Client Portal'}
          </p>
        </div>

        {/* Idle timeout message */}
        {idleReason && !error && (
          <div style={S.error}>
            You were signed out after 30 minutes of inactivity.
          </div>
        )}

        {/* Error */}
        {error && <div style={S.error}>{error}</div>}

        {/* Reset sent success */}
        {resetSent && (
          <div style={S.success}>
            ✓ Reset link sent to {resetEmail}. Check your email inbox.
          </div>
        )}

        {!showForgot ? (
          <>
            {/* Login form */}
            <div>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="your@email.com"
                type="email"
                autoComplete="email"
                autoFocus
                style={S.input}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Password</label>
                <button onClick={() => { setShowForgot(true); setError(''); setResetEmail(email); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#E8A020', fontFamily: 'inherit', padding: 0 }}>
                  Forgot password?
                </button>
              </div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="••••••••"
                type="password"
                autoComplete="current-password"
                style={S.input}
              />
            </div>

            <button onClick={login} disabled={loggingIn}
              style={{ width: '100%', padding: 13, background: loggingIn ? 'rgba(255,255,255,0.08)' : '#E8A020', color: loggingIn ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loggingIn ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
              {loggingIn ? 'Signing in...' : 'Sign in →'}
            </button>

            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', margin: 0 }}>
              New to MPower?{' '}
              <Link to="/registration" style={{ color: '#E8A020', textDecoration: 'none', fontWeight: 500 }}>
                Start your free trial →
              </Link>
            </p>
          </>
        ) : (
          <>
            {/* Forgot password form */}
            {!resetSent && (
              <>
                <div>
                  <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Email address</label>
                  <input
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="your@email.com"
                    type="email"
                    autoFocus
                    style={S.input}
                  />
                </div>
                <button onClick={sendReset} disabled={sendingReset}
                  style={{ width: '100%', padding: 13, background: sendingReset ? 'rgba(255,255,255,0.08)' : '#E8A020', color: sendingReset ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: sendingReset ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginBottom: 14 }}>
                  {sendingReset ? 'Sending...' : 'Send reset link →'}
                </button>
              </>
            )}
            <button onClick={() => { setShowForgot(false); setError(''); setResetSent(false); }}
              style={{ width: '100%', padding: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
              ← Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}