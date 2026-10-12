// src/pages/grievance/TrackComplaint.jsx
//
// Public "Track your complaint" page -- no login. The citizen types the case
// number and the full mobile number the complaint was filed with. The check
// is done by the database (track_complaint), which answers with the status,
// category and dates only -- never the title, description, staff notes or
// history. A wrong case number and a wrong mobile number get the same reply,
// and five wrong tries on one case pause it for 15 minutes.
//
// The calm wording rules of the citizen portal apply here too: "Escalated" is
// already shown as "In Progress" by the database, and the words overdue,
// deadline and escalated never appear on this page.

import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { StageBadge, citizenTimeline, CATEGORY_EMOJI } from './CitizenPortal';
import { trackComplaint } from './grievanceApi';

const NOT_FOUND_MESSAGE = 'No complaint found with these details. Please check the case number and the mobile number you registered with, and try again.';
const BLOCKED_MESSAGE = 'Too many attempts for this case number. Please try again after 15 minutes.';
const ERROR_MESSAGE = 'We could not check right now. Please check your connection and try again.';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TrackComplaint({ stateSlug }) {
  const navigate = useNavigate();
  const [caseNo, setCaseNo] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  // A ref, not just state: two quick taps can arrive before the screen has
  // redrawn, and both would otherwise count as a try.
  const inFlight = useRef(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setMessage('');
    setResult(null);
    setBusy(true);
    try {
      const res = await trackComplaint({ caseNo, phone });
      if (res.status === 'ok') setResult(res.complaint);
      else if (res.status === 'blocked') setMessage(BLOCKED_MESSAGE);
      else setMessage(NOT_FOUND_MESSAGE);
    } catch {
      setMessage(ERROR_MESSAGE);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function checkAnother() {
    setResult(null);
    setMessage('');
    setCaseNo('');
    setPhone('');
  }

  const timeline = result ? citizenTimeline(result) : null;
  const finished = result && ['Resolved', 'Sanctioned', 'Declined'].includes(result.stage);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: '#f0f4f8', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: '#1a1a2e' }}>
        <button
          type="button"
          onClick={() => navigate(`/grievance/${stateSlug}?switch=1`)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}
        >
          <div style={{ width: 26, height: 26, borderRadius: 6, background: '#e8a020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#1a1a2e', fontSize: 13 }}>M</div>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>MPower CTS · Home</span>
        </button>
      </div>

      <main style={{ maxWidth: 420, margin: '0 auto', padding: '28px 16px 40px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', marginBottom: 2 }}>Track your complaint</h1>
        <p style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>మీ ఫిర్యాదు స్థితి తెలుసుకోండి</p>
        <p style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.6, marginBottom: 18 }}>
          No sign-in needed. Enter the case number you were given and the mobile number you registered with.
        </p>

        {!result && (
          <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: 20, display: 'grid', gap: 12 }}>
            <label htmlFor="track-case-no" style={{ fontSize: 12.5, fontWeight: 600, color: '#1a1a2e' }}>
              Case number
              <input
                id="track-case-no" name="track-case-no"
                value={caseNo}
                onChange={(e) => setCaseNo(e.target.value)}
                placeholder="e.g. EGMAN202600000084"
                autoCapitalize="characters" autoComplete="off" spellCheck={false}
                maxLength={40}
                required
                style={{ ...inputStyle, marginTop: 5 }}
              />
            </label>
            <label htmlFor="track-phone" style={{ fontSize: 12.5, fontWeight: 600, color: '#1a1a2e' }}>
              Mobile number
              <input
                id="track-phone" name="track-phone"
                type="tel" inputMode="tel" autoComplete="off"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                maxLength={20}
                required
                style={{ ...inputStyle, marginTop: 5 }}
              />
            </label>
            <button type="submit" disabled={busy} style={buttonStyle}>
              {busy ? 'Checking…' : 'Check status'}
            </button>
          </form>
        )}

        <div aria-live="polite">
          {message && (
            <p role="alert" style={{ marginTop: 14, fontSize: 13, color: '#9B3C2E', lineHeight: 1.6 }}>{message}</p>
          )}
        </div>

        {result && (
          <section aria-label="Complaint status" style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: 20 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Case number</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 }}>{result.case_no}</div>
            <div style={{ marginBottom: 14 }}><StageBadge stage={result.stage} /></div>

            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', fontSize: 13 }}>
              <dt style={{ color: '#64748b' }}>Category</dt>
              <dd style={{ margin: 0, color: '#1a1a2e', fontWeight: 600 }}>{CATEGORY_EMOJI[result.category] ? `${CATEGORY_EMOJI[result.category]} ` : ''}{result.category || '—'}</dd>
              <dt style={{ color: '#64748b' }}>Filed on</dt>
              <dd style={{ margin: 0, color: '#1a1a2e' }}>{formatDate(result.created_at)}</dd>
              <dt style={{ color: '#64748b' }}>Last update</dt>
              <dd style={{ margin: 0, color: '#1a1a2e' }}>{formatDate(result.updated_at)}</dd>
            </dl>

            {timeline && (
              <p style={{ marginTop: 14, fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>{timeline.text}</p>
            )}
            {finished && (
              <p style={{ marginTop: 14, fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>
                This complaint was marked <strong>{result.stage}</strong> on {formatDate(result.updated_at)}.
              </p>
            )}
            {result.reopen_count > 0 && (
              <p style={{ marginTop: 10, fontSize: 12.5, color: '#475569' }}>
                🔁 Reopened{result.reopen_count > 1 ? ` ${result.reopen_count} times` : ''}
                {result.reopened_at ? ` · last on ${formatDate(result.reopened_at)}` : ''}
              </p>
            )}
            {result.stage === 'Resolved' && (
              <p style={{ marginTop: 10, fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>
                {result.rated
                  ? '⭐ Your feedback has been received. Thank you.'
                  : 'Tell us if your problem was really solved: sign in to rate it or reopen it.'}
              </p>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 18, alignItems: 'center' }}>
              <button type="button" onClick={checkAnother} style={{ ...buttonStyle, padding: '9px 14px', fontSize: 13 }}>Check another</button>
              <Link to={`/grievance/${stateSlug}/citizen`} style={{ fontSize: 12.5, color: '#1a1a2e', fontWeight: 600, textDecoration: 'underline' }}>
                Sign in for full details
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

const inputStyle = {
  display: 'block',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '9px 11px',
  fontSize: 13.5,
  width: '100%',
  boxSizing: 'border-box',
  fontWeight: 400,
};

const buttonStyle = {
  background: '#1a1a2e',
  color: '#e8a020',
  border: 'none',
  borderRadius: 7,
  padding: '11px 16px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};
