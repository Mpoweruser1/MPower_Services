// shared/FeedbackWidget.jsx
//
// Was previously defined inside grievance/CitizenPortal.jsx — moved
// here since it's genuinely generic (works the same for a citizen, a
// CTS staff member, a school, or a hospital) and School/Hospital had
// no clean way to reuse it while it lived inside a grievance-specific
// file. Renders as its own modal overlay with a self-contained white
// card, so it looks correct regardless of whether the page behind it
// is CTS's light theme or School/Hospital's dark theme.

import { useState } from 'react';
import { submitFeedback } from './feedbackApi';

export function FeedbackWidget({ appId, citizenId, userId, context, onClose }) {
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      await submitFeedback({ appId, citizenId, userId, rating: rating || null, comments: comments.trim() || null, context });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const buttonStyle = {
    background: '#1a1a2e',
    color: '#e8a020',
    border: 'none',
    borderRadius: 7,
    padding: '11px 16px',
    fontSize: 14,
    fontWeight: 600,
  };
  const inputStyle = {
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    padding: '9px 11px',
    fontSize: 13.5,
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 200 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 22, maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>🙏 Thank you</p>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Your feedback helps improve this system for everyone.</p>
            <button onClick={onClose} style={buttonStyle}>Close</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>💬 How is this app working for you?</p>
            <p style={{ fontSize: 12.5, color: '#64748b', marginBottom: 14 }}>This is feedback about the app itself — not a complaint.</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  style={{ fontSize: 28, background: 'none', border: 'none', opacity: n <= rating ? 1 : 0.3, cursor: 'pointer' }}
                >
                  ⭐
                </button>
              ))}
            </div>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="What could be better? (optional)"
              rows={3}
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            {error && <p style={{ fontSize: 12, color: '#9B3C2E', marginBottom: 8 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSubmit} disabled={busy} style={{ ...buttonStyle, flex: 1 }}>
                {busy ? 'Sending…' : 'Send feedback'}
              </button>
              <button onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 14, fontWeight: 600, color: '#64748b' }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
