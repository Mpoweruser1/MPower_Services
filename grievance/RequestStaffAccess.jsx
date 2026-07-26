// src/pages/grievance/RequestStaffAccess.jsx
//
// Where someone who's already created a normal Supabase Auth account
// (email/password, elsewhere in your app) requests representative or
// authority access. Submitting this does NOT grant access by itself —
// see AdminVerificationQueue.jsx for the approval step. This screen
// exists so there's a legitimate, auditable on-ramp at all — before
// migration 11, nobody could even submit a request.

import { useState, useEffect } from 'react';
import { fetchAppIdBySlug, fetchConstituencies, fetchExpectedAuthorities } from './grievanceApi';
import { submitVerificationRequest, fetchMyVerificationRequest } from './verificationApi';

export default function RequestStaffAccess({ stateSlug }) {
  const [appId, setAppId] = useState(undefined);
  const [existingRequest, setExistingRequest] = useState(undefined); // undefined = loading
  const [requestedRole, setRequestedRole] = useState('representative');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [constituencies, setConstituencies] = useState([]);
  const [constituencyId, setConstituencyId] = useState('');
  const [expectedAuthorities, setExpectedAuthorities] = useState([]);
  const [authorityTitle, setAuthorityTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAppIdBySlug(stateSlug).then(setAppId);
  }, [stateSlug]);

  useEffect(() => {
    if (!appId) return;
    fetchMyVerificationRequest().then(setExistingRequest);
    fetchConstituencies(appId).then((list) => {
      setConstituencies(list);
      if (list.length) setConstituencyId(list[0].id);
    });
    fetchExpectedAuthorities(appId).then((list) => {
      setExpectedAuthorities(list);
      if (list.length) setAuthorityTitle(list[0].authority_title);
    });
  }, [appId]);

  const selectedConstituency = constituencies.find((c) => c.id === constituencyId);
  const selectedAuthority = expectedAuthorities.find((a) => a.authority_title === authorityTitle);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await submitVerificationRequest({
        appId,
        requestedRole,
        fullName,
        phone,
        claimedConstituencyId: requestedRole === 'representative' ? constituencyId : null,
        claimedAuthorityTitle: requestedRole === 'authority' ? authorityTitle : null,
      });
      setExistingRequest(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (appId === undefined) return <CenteredNote>Loading…</CenteredNote>;
  if (appId === null) {
    return <CenteredNote>This state isn't set up on this platform yet. Check the link you were given.</CenteredNote>;
  }
  if (existingRequest === undefined) return <CenteredNote>Loading…</CenteredNote>;

  if (existingRequest) {
    return (
      <div style={{ maxWidth: 420, margin: '60px auto', padding: 24, textAlign: 'center' }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Request submitted</h2>
        <StatusPill status={existingRequest.status} />
        <p style={{ fontSize: 13, color: '#5B6473', marginTop: 14 }}>
          {existingRequest.status === 'pending' &&
            "An admin will verify your identity before this is approved — you'll be able to sign in with full access once that's done."}
          {existingRequest.status === 'approved' && 'Approved — sign out and back in to pick up your new access.'}
          {existingRequest.status === 'rejected' && "This request wasn't approved. Contact your party's Mpower administrator."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: 24 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Request representative access</h2>
      <p style={{ fontSize: 12.5, color: '#5B6473', marginBottom: 18 }}>
        This doesn't grant access on its own — an admin verifies your identity first.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <Field label="I am requesting access as">
          <select value={requestedRole} onChange={(e) => setRequestedRole(e.target.value)} style={inputStyle}>
            <option value="representative">Representative (MLA / MP / MLC)</option>
            <option value="authority">Authority (Minister / Dy.CM / CM)</option>
          </select>
        </Field>
        <Field label="Full name">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required style={inputStyle} />
        </Field>
        <Field label="Contact number">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} required style={inputStyle} />
        </Field>

        {requestedRole === 'representative' && (
          <>
            <Field label="Constituency you represent">
              <select value={constituencyId} onChange={(e) => setConstituencyId(e.target.value)} style={inputStyle}>
                {constituencies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.tier})</option>)}
              </select>
            </Field>
            {selectedConstituency?.rep_name && (
              <p style={{ fontSize: 12, color: '#5B6473', background: '#F7F6F2', padding: '8px 11px', borderRadius: 6 }}>
                📋 On record, this seat's expected representative is <strong>{selectedConstituency.rep_name}</strong> — the admin will confirm this matches you.
              </p>
            )}
          </>
        )}

        {requestedRole === 'authority' && (
          <>
            <Field label="Your title">
              {expectedAuthorities.length > 0 ? (
                <select value={authorityTitle} onChange={(e) => setAuthorityTitle(e.target.value)} style={inputStyle}>
                  {expectedAuthorities.map((a) => (
                    <option key={a.id} value={a.authority_title}>
                      {a.authority_title}{a.claimed_by_user_id ? ' (already claimed)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={authorityTitle}
                  onChange={(e) => setAuthorityTitle(e.target.value)}
                  placeholder="e.g. Minister — Rural Development"
                  required
                  style={inputStyle}
                />
              )}
            </Field>
            {selectedAuthority?.expected_name && (
              <p style={{ fontSize: 12, color: '#5B6473', background: '#F7F6F2', padding: '8px 11px', borderRadius: 6 }}>
                📋 On record, this position is expected to be <strong>{selectedAuthority.expected_name}</strong> — the admin will confirm this matches you.
              </p>
            )}
            {selectedAuthority?.claimed_by_user_id && (
              <p style={{ fontSize: 12, color: '#9B3C2E' }}>
                ⚠️ This position already has an approved holder — your request may need extra review.
              </p>
            )}
          </>
        )}

        {error && <p style={{ fontSize: 12, color: '#9B3C2E' }}>{error}</p>}

        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? 'Submitting…' : 'Submit for verification'}
        </button>
      </form>
    </div>
  );
}

function CenteredNote({ children }) {
  return <div style={{ padding: 40, textAlign: 'center', color: '#5B6473', fontSize: 14 }}>{children}</div>;
}

function StatusPill({ status }) {
  const colors = { pending: '#5B6473', approved: '#3E5C45', rejected: '#9B3C2E' };
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: colors[status], border: `1px solid ${colors[status]}`, borderRadius: 20, padding: '4px 12px' }}>
      {status.toUpperCase()}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6473' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = { border: '1px solid #D9D5C8', borderRadius: 6, padding: '9px 11px', fontSize: 13.5, width: '100%' };
const buttonStyle = { background: '#15213A', color: '#fff', border: 'none', borderRadius: 7, padding: '11px 16px', fontSize: 14, fontWeight: 600 };
