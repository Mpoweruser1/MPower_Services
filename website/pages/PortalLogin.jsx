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
  const [sessionBlocked, setSessionBlocked] = useState(false);
  const [forceReleasing, setForceReleasing] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [verifyingMfa, setVerifyingMfa] = useState(false);

  // Check URL params for messages
  const reasonParam = new URLSearchParams(window.location.search).get('reason');
  const idleReason = reasonParam === 'idle';
  const replacedReason = reasonParam === 'session_replaced';

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

    if (loginErr) {
      setLoggingIn(false);
      if (loginErr.message?.includes('Invalid login')) {
        setError('Incorrect email or password. Please try again.');
      } else if (loginErr.message?.includes('Email not confirmed')) {
        setError('Please confirm your email address first. Check your inbox.');
      } else {
        setError(loginErr.message || 'Login failed. Please try again.');
      }
      return;
    }

    // Two-factor check — password alone isn't enough for an account
    // that has TOTP enabled. Stop here and prompt for the code rather
    // than proceeding straight to session-claim.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const factor = factorsData?.totp?.find((f) => f.status === 'verified');
      if (factor) {
        setLoggingIn(false);
        setMfaFactorId(factor.id);
        setMfaRequired(true);
        return;
      }
    }

    await claimSessionAndContinue();
  }

  async function claimSessionAndContinue() {
    setLoggingIn(true);
    // Single-session enforcement — Supabase's own login just succeeded,
    // but that alone doesn't mean this login should be allowed to
    // proceed. Claim the session now; if another device already has a
    // genuinely active one (used within the last 30 minutes), sign
    // this just-created session back out immediately rather than
    // letting the user into the app. Supabase can't be intercepted
    // before it issues a session, so this is the same "authenticate
    // first, then enforce" pattern used everywhere real systems
    // implement this.
    //
    // resumeToken: fixes a real, confirmed bug — persistSession:false
    // means a mobile browser reloading a backgrounded tab (routine
    // behavior, happens constantly just from switching apps) wipes
    // the session client-side. Without this, the app would then see
    // its OWN still-fresh session from moments ago and wrongly
    // conclude a different device claimed it. sessionStorage survives
    // a tab reload but genuinely disappears if the browser is closed
    // or a new tab is opened, so real shared-device protection is
    // untouched — this only recognizes the same tab resuming.
    const resumeToken = sessionStorage.getItem('mpower_session_token');
    const { data: claimResult, error: claimError } = await supabase.functions.invoke('check-and-claim-session', {
      body: { action: 'claim', resumeToken },
    });

    if (claimError || !claimResult?.claimed) {
      // Deliberately NOT signing out here — the force-release option
      // below needs this still-valid session to identify who's
      // asking. If the person picks "wait instead," we sign out then.
      setLoggingIn(false);
      setSessionBlocked(true);
      setError('This account is already signed in on another device or browser.');
      return;
    }

    if (claimResult.sessionToken) {
      sessionStorage.setItem('mpower_session_token', claimResult.sessionToken);
    }

    setLoggingIn(false);
    navigate('/portal/dashboard', { replace: true });
  }

  async function verifyMfaCode() {
    if (mfaCode.trim().length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setVerifyingMfa(true);
    setError('');

    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challengeErr) { setError(challengeErr.message); setVerifyingMfa(false); return; }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId, challengeId: challenge.id, code: mfaCode.trim(),
    });
    if (verifyErr) {
      setError('Incorrect code — please try again.');
      setVerifyingMfa(false);
      return;
    }

    setVerifyingMfa(false);
    setMfaRequired(false);
    await claimSessionAndContinue();
  }

  async function forceReleaseAndContinue() {
    setForceReleasing(true);
    setError('');
    try {
      await supabase.functions.invoke('check-and-claim-session', { body: { action: 'release' } });
      const { data: claimResult, error: claimError } = await supabase.functions.invoke('check-and-claim-session', {
        body: { action: 'claim' },
      });
      if (claimError || !claimResult?.claimed) {
        setError('Could not claim the session — please try signing in again.');
        setForceReleasing(false);
        return;
      }
      if (claimResult.sessionToken) {
        sessionStorage.setItem('mpower_session_token', claimResult.sessionToken);
      }
      setForceReleasing(false);
      setSessionBlocked(false);
      navigate('/portal/dashboard', { replace: true });
    } catch {
      setError('Something went wrong — please try again.');
      setForceReleasing(false);
    }
  }

  async function waitInstead() {
    await supabase.auth.signOut();
    setSessionBlocked(false);
    setError('');
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
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading...</p>
    </div>
  );

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <div style={S.card}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Link to="/" style={{ display: 'inline-block' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 22, margin: '0 auto 14px' }}>M</div>
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: -0.5 }}>
            {showForgot ? 'Reset password' : 'Welcome back'}
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
            {showForgot ? 'Enter your email to get a reset link' : 'MPower Client Portal'}
          </p>
        </div>

        {/* Idle timeout message */}
        {idleReason && !error && (
          <div style={S.error}>
            You were signed out after 30 minutes of inactivity.
          </div>
        )}

        {/* Session claimed elsewhere */}
        {replacedReason && !error && (
          <div style={S.error}>
            You were signed out because this account signed in on another device or browser.
          </div>
        )}

        {/* Error */}
        {error && <div style={S.error}>{error}</div>}

        {/* Session blocked — offer a real choice instead of a dead end */}
        {/* Two-factor code prompt */}
        {mfaRequired && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
              Enter the 6-digit code from your authenticator app.
            </p>
            <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" autoFocus
              style={{ width: '100%', padding: '11px 14px', marginBottom: 12, background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 18, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', textAlign: 'center', letterSpacing: 6 }} />
            <button onClick={verifyMfaCode} disabled={verifyingMfa}
              style={{ width: '100%', padding: 12, border: 'none', borderRadius: 8, background: verifyingMfa ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', fontWeight: 700, cursor: verifyingMfa ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
              {verifyingMfa ? 'Verifying...' : 'Verify & Sign In'}
            </button>
          </div>
        )}

        {sessionBlocked && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
              If that's you on another device and you'd like to continue here instead, you can end that session now.
            </p>
            <button onClick={forceReleaseAndContinue} disabled={forceReleasing}
              style={{ width: '100%', padding: 11, marginBottom: 8, border: 'none', borderRadius: 8, background: forceReleasing ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', fontWeight: 700, cursor: forceReleasing ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
              {forceReleasing ? 'Ending other session...' : "It's me — sign in here instead"}
            </button>
            <button onClick={waitInstead}
              style={{ width: '100%', padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
              Not me — I'll wait or sign out there first
            </button>
          </div>
        )}

        {/* Reset sent success */}
        {resetSent && (
          <div style={S.success}>
            ✓ Reset link sent to {resetEmail}. Check your email inbox.
          </div>
        )}

        {!showForgot && !mfaRequired ? (
          <>
            {/* Login form */}
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Email</label>
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
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Password</label>
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

            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: 0 }}>
              New to MPower?{' '}
              <Link to="/registration" style={{ color: '#E8A020', textDecoration: 'none', fontWeight: 500 }}>
                Start your free trial →
              </Link>
            </p>
          </>
        ) : showForgot ? (
          <>
            {/* Forgot password form */}
            {!resetSent && (
              <>
                <div>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Email address</label>
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
        ) : null}
      </div>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <Link to="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>🏠 Home</Link>
      </div>
    </div>
  );
}