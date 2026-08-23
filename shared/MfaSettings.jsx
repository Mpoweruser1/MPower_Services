// shared/MfaSettings.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const S = {
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16 },
  button: { padding: '11px 20px', border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  secondaryButton: { padding: '11px 20px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' },
  input: { width: '100%', padding: '11px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 16, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', textAlign: 'center', letterSpacing: 4 },
};

export default function MfaSettings() {
  const [factors, setFactors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { loadFactors(); }, []);

  async function loadFactors() {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(data?.totp?.filter((f) => f.status === 'verified') || []);
    setLoading(false);
  }

  async function startEnroll() {
    setError('');
    const { data, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (enrollErr) { setError(enrollErr.message); return; }
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setFactorId(data.id);
    setEnrolling(true);
  }

  async function verifyEnroll() {
    if (code.trim().length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setError('');
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeErr) { setError(challengeErr.message); return; }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId, challengeId: challenge.id, code: code.trim(),
    });
    if (verifyErr) { setError('Incorrect code \u2014 please try again.'); return; }

    setEnrolling(false);
    setCode('');
    setMessage('\u2705 Two-factor authentication enabled.');
    loadFactors();
  }

  async function cancelEnroll() {
    await supabase.auth.mfa.unenroll({ factorId });
    setEnrolling(false);
    setQrCode('');
    setSecret('');
    setCode('');
    setError('');
  }

  async function removeFactor(id) {
    if (!window.confirm('Turn off two-factor authentication? Your account will only need a password to sign in.')) return;
    await supabase.auth.mfa.unenroll({ factorId: id });
    setMessage('Two-factor authentication turned off.');
    loadFactors();
  }

  if (loading) return <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading...</p>;

  return (
    <div style={S.card}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Security</p>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>Two-Factor Authentication</h3>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16, lineHeight: 1.6 }}>
        Adds a second step at login using an authenticator app (Google Authenticator, Authy, etc.) \u2014 so a password alone isn't enough to sign in.
      </p>

      {error && (
        <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>
          {message}
        </div>
      )}

      {!enrolling && factors.length === 0 && (
        <button onClick={startEnroll} style={S.button}>Turn on two-factor authentication</button>
      )}

      {enrolling && (
        <div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>
            1. Scan this QR code with your authenticator app:
          </p>
          <div style={{ background: '#fff', padding: 16, borderRadius: 10, display: 'inline-block', marginBottom: 14 }}>
            <img src={qrCode} alt="MFA QR code" style={{ width: 180, height: 180, display: 'block' }} />
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>
            Can't scan it? Enter this code manually: <span style={{ color: '#E8A020', fontFamily: 'monospace' }}>{secret}</span>
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
            2. Enter the 6-digit code it shows:
          </p>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000" style={{ ...S.input, marginBottom: 14 }} autoFocus />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={cancelEnroll} style={S.secondaryButton}>Cancel</button>
            <button onClick={verifyEnroll} style={S.button}>Confirm & Enable</button>
          </div>
        </div>
      )}

      {!enrolling && factors.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8 }}>
            <span style={{ fontSize: 13, color: '#6AAA90' }}>\u2713 Enabled \u2014 {factors[0].friendly_name || 'Authenticator app'}</span>
            <button onClick={() => removeFactor(factors[0].id)}
              style={{ background: 'none', border: '1px solid rgba(224,90,90,0.3)', borderRadius: 6, color: '#E05A5A', padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
              Turn off
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
