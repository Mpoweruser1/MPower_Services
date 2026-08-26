// website/pages/ParentPortal.jsx — NEW
// Public, no-login page — phone + WhatsApp OTP. Not tied to Supabase
// Auth sessions at all; the session token from parent-verify-otp is
// held in memory only (not localStorage — this app is explicitly
// forbidden from using browser storage APIs).
import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 480, margin: '0 auto', padding: '32px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16 },
  input: { width: '100%', padding: '12px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 15, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 10 },
};

export default function ParentPortal() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [token, setToken] = useState(null);
  const [children, setChildren] = useState(null);
  const [selectedChild, setSelectedChild] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function sendOtp() {
    if (!phone.trim()) { setError('Enter your phone number.'); return; }
    setLoading(true);
    setError('');
    const { data, error: fnErr } = await supabase.functions.invoke('parent-send-otp', { body: { phone: phone.trim() } });
    setLoading(false);
    if (fnErr || data?.error) { setError(data?.error || 'Failed to send code.'); return; }
    setOtpSent(true);
  }

  async function verifyOtp() {
    if (otp.trim().length !== 6) { setError('Enter the 6-digit code.'); return; }
    setLoading(true);
    setError('');
    const { data, error: fnErr } = await supabase.functions.invoke('parent-verify-otp', { body: { phone: phone.trim(), otp: otp.trim() } });
    if (fnErr || !data?.verified) { setError(data?.error || 'Incorrect code.'); setLoading(false); return; }
    setToken(data.token);
    await loadChildren(data.token);
  }

  async function loadChildren(sessionToken) {
    const { data, error: fnErr } = await supabase.functions.invoke('parent-get-data', { body: { token: sessionToken } });
    setLoading(false);
    if (fnErr || data?.error) { setError(data?.error || 'Failed to load your data.'); return; }
    setChildren(data.children || []);
    if (data.children?.length > 0) setSelectedChild(data.children[0]);
  }

  if (children) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase' }}>Parent Portal</p>
            <h1 style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 600 }}>Welcome</h1>
          </div>

          {children.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>No students found for this phone number.</p>
          ) : (
            <>
              {children.length > 1 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {children.map((c) => (
                    <button key={c.id} onClick={() => setSelectedChild(c)}
                      style={{ padding: '8px 16px', borderRadius: 20, border: selectedChild?.id === c.id ? 'none' : '1px solid rgba(255,255,255,0.15)', background: selectedChild?.id === c.id ? '#E8A020' : 'transparent', color: selectedChild?.id === c.id ? '#111113' : 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}

              {selectedChild && (
                <>
                  <div style={S.card}>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{selectedChild.name}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{selectedChild.sid} · {selectedChild.className}</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    <div style={{ ...S.card, textAlign: 'center', marginBottom: 0 }}>
                      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: selectedChild.attendanceRate >= 90 ? '#6AAA90' : '#E8A020' }}>
                        {selectedChild.attendanceRate !== null ? `${selectedChild.attendanceRate}%` : '—'}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Attendance (30 days)</p>
                    </div>
                    <div style={{ ...S.card, textAlign: 'center', marginBottom: 0 }}>
                      <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: selectedChild.feeOutstanding > 0 ? '#E05A5A' : '#6AAA90' }}>
                        ₹{selectedChild.feeOutstanding.toLocaleString('en-IN')}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Fee outstanding</p>
                    </div>
                  </div>

                  <div style={S.card}>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Recent Homework</p>
                    {(!selectedChild.recentHomework || selectedChild.recentHomework.length === 0) ? (
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Nothing posted recently.</p>
                    ) : (
                      selectedChild.recentHomework.map((h, i) => (
                        <div key={i} style={{ padding: '8px 0', borderBottom: i < selectedChild.recentHomework.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                          <p style={{ margin: 0, fontSize: 13, color: '#E8A020', fontWeight: 600 }}>{h.subject}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{h.description}</p>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase' }}>Parent Portal</p>
          <h1 style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 600 }}>Check your child's progress</h1>
        </div>

        <div style={S.card}>
          {error && (
            <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
              {error}
            </div>
          )}

          {!otpSent ? (
            <>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Registered phone number" autoFocus style={S.input} />
              <button onClick={sendOtp} disabled={loading}
                style={{ width: '100%', padding: 13, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                {loading ? 'Sending...' : 'Send code via WhatsApp'}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>Code sent to {phone}</p>
              <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" autoFocus
                style={{ ...S.input, textAlign: 'center', fontSize: 18, letterSpacing: 4 }} />
              <button onClick={verifyOtp} disabled={loading}
                style={{ width: '100%', padding: 13, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
