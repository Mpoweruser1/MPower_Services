// src/pages/grievance/AdminVerificationQueue.jsx
//
// Where a grievance_admin reviews "I am S. Reddy, requesting MLA access
// for Kurnool" style requests before an account gets created. This is
// the human-verification step the schema comments kept pointing to —
// this screen is where that actually happens.

import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';
import {
  fetchPendingVerificationRequests, recordVerificationEvidence,
  approveVerificationRequest, rejectVerificationRequest,
} from './verificationApi';
import GrievanceNav from './GrievanceNav';

const VERIFICATION_METHODS = [
  { value: 'eci_winners_list', label: 'ECI declared winners list' },
  { value: 'gazette_notification', label: 'Gazette notification' },
  { value: 'party_confirmation', label: "Party's state office confirmed" },
  { value: 'physical_document', label: 'Physical document checked' },
  { value: 'other', label: 'Other' },
];

export default function AdminVerificationQueue() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    fetchPendingVerificationRequests()
      .then(setRequests)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tenant) reload();
  }, [tenant, reload]);

  if (tenantLoading || !tenant) return <CenteredNote>Loading…</CenteredNote>;
  if (!['grievance_admin', 'developer', 'support'].includes(tenant.role)) {
    return <CenteredNote>This screen is for grievance admins only.</CenteredNote>;
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Staff Verification Queue</h1>
      <p style={{ fontSize: 12.5, color: '#5B6473', marginBottom: 20 }}>
        Confirm each person's identity against an official source before approving — this creates a
        real, working login for whichever role they're requesting.
      </p>

      {loading ? (
        <CenteredNote>Loading requests…</CenteredNote>
      ) : requests.length === 0 ? (
        <CenteredNote>No pending requests.</CenteredNote>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} onDecided={reload} />
          ))}
        </div>
      )}
<GrievanceNav />
    </div>
  );
}

function CenteredNote({ children }) {
  return <div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>{children}</div>;
}

function RequestCard({ request, onDecided }) {
  const [method, setMethod] = useState(request.verification_method || '');
  const [note, setNote] = useState(request.evidence_note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleApprove() {
    if (!method) {
      setError('Select a verification method before approving.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await recordVerificationEvidence(request.id, { verificationMethod: method, evidenceNote: note });
      await approveVerificationRequest(request.id);
      onDecided();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      await rejectVerificationRequest(request.id);
      onDecided();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid #D9D5C8', borderRadius: 9, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{request.full_name}</div>
          <div style={{ fontSize: 12, color: '#5B6473' }}>
            Requesting: {roleLabel(request.requested_role)}
            {request.claimed_authority_title ? ` — ${request.claimed_authority_title}` : ''}
          </div>
          <div style={{ fontSize: 11.5, color: '#8B9099' }}>{request.phone}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid #EFEDE6' }}>
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={selectStyle}>
          <option value="">How was this verified?</option>
          {VERIFICATION_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Evidence note — e.g. 'ECI declared winner, Kurnool AC, 2024, cross-checked 1 Jul 2026'"
          rows={2}
          style={{ ...selectStyle, resize: 'vertical' }}
        />
        {error && <p style={{ fontSize: 11.5, color: '#9B3C2E' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleApprove} disabled={busy} style={{ ...btnStyle, background: '#15213A', color: '#fff' }}>
            {busy ? 'Working…' : 'Approve & create account'}
          </button>
          <button onClick={handleReject} disabled={busy} style={{ ...btnStyle, background: 'transparent', color: '#9B3C2E', border: '1px solid #9B3C2E' }}>
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function roleLabel(role) {
  if (role === 'representative') return 'Representative (MLA/MP/MLC)';
  if (role === 'authority') return 'Authority (Minister/Dy.CM/CM)';
  return 'Grievance Admin';
}

const selectStyle = {
  fontSize: 13, padding: '8px 10px', border: '1px solid #D9D5C8', borderRadius: 6, width: '100%',
};

const btnStyle = {
  fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 7, border: 'none', flex: 1,
};
