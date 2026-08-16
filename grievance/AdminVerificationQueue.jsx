// grievance/AdminVerificationQueue.jsx
// Admin screen — verify staff access requests and manage constituency assignments
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import GrievanceNav from './GrievanceNav';

const VERIFICATION_METHODS = [
  { value: '', label: 'Select how this was verified...' },
  { value: 'eci_winners_list', label: 'ECI declared winners list' },
  { value: 'gazette_notification', label: 'Gazette notification' },
  { value: 'party_confirmation', label: "Party's state office confirmed" },
  { value: 'physical_document', label: 'Physical document checked' },
  { value: 'other', label: 'Other' },
];

const REP_TIERS = ['MLA', 'MP', 'MLC'];
const REP_PHOTO_BUCKET = 'representative-photos';

export default function AdminVerificationQueue() {
  const { stateSlug } = useParams();
  const { tenant } = useTenant();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [processing, setProcessing] = useState(null);
  // FIXED: these four were previously single, shared variables — with
  // more than one pending request shown at once, filling in one card's
  // verification method (or photo) visually changed what every OTHER
  // pending card showed too, since they all read the exact same state.
  // Now keyed by request id, so each card's inputs are genuinely its own.
  const [note, setNote] = useState({});
  const [verificationMethod, setVerificationMethod] = useState({});
  const [approveError, setApproveError] = useState({});
  const [repPhotoFile, setRepPhotoFile] = useState({});

  useEffect(() => {
    if (tenant) loadRequests();
  }, [tenant, activeTab]);

  async function loadRequests() {
    setLoading(true);
    const { data, error } = await supabase
      .from('staff_access_requests')
      .select('*')
      .eq('status', activeTab)
      .order('created_at', { ascending: false });

    if (!error) setRequests(data || []);
    setLoading(false);
  }

  // Approving is the privileged step — it creates a real, working login
  // for this office, so it goes through the Edge Function rather than a
  // direct table write. Requires a verification method to be selected
  // first; the function itself also enforces this server-side.
  async function approveRequest(id, roleRequested) {
    if (!verificationMethod[id]) {
      setApproveError((e) => ({ ...e, [id]: 'Select how this was verified before approving.' }));
      return;
    }
    setApproveError((e) => ({ ...e, [id]: '' }));
    setProcessing(id);

    // Photo is uploaded first, client-side, same bucket staff photos
    // already use — the edge function then just records the resulting
    // path against whichever constituency it reliably resolves, rather
    // than this screen trying to resolve that link itself.
    let repPhotoPath = null;
    const file = repPhotoFile[id];
    if (file && REP_TIERS.includes(roleRequested)) {
      const ext = file.name.split('.').pop();
      const path = `rep-photos/${id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(REP_PHOTO_BUCKET).upload(path, file, { upsert: true });
      if (uploadError) {
        setApproveError((e) => ({ ...e, [id]: `Photo upload failed: ${uploadError.message}` }));
        setProcessing(null);
        return;
      }
      repPhotoPath = path;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('approve-staff-verification', {
      body: { requestId: id, verificationMethod: verificationMethod[id], note: note[id], repPhotoPath },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error || data?.error) {
      // When the function returns a non-2xx status, supabase-js wraps it
      // in a generic FunctionsHttpError whose .message is just "Edge
      // Function returned a non-2xx status code" — not the actual
      // reason. The real error message is in the response body itself,
      // reachable via error.context (the raw Response object).
      let message = data?.error;
      if (!message && error?.context) {
        try {
          const body = await error.context.json();
          message = body?.error;
        } catch {
          // Response body wasn't JSON — fall through to the generic message
        }
      }
      setApproveError((e) => ({ ...e, [id]: message || error?.message || 'Failed to approve this request.' }));
      setProcessing(null);
      return;
    }

    setNote((n) => ({ ...n, [id]: '' }));
    setVerificationMethod((v) => ({ ...v, [id]: '' }));
    setRepPhotoFile((f) => ({ ...f, [id]: null }));
    loadRequests();
    setProcessing(null);
  }

  // Rejecting doesn't create anything privileged — a plain status update
  // is enough, same as before.
  async function rejectRequest(id) {
    setProcessing(id);
    const { error } = await supabase
      .from('staff_access_requests')
      .update({
        status: 'rejected',
        notes: note[id] || null,
        processed_at: new Date().toISOString(),
        processed_by: tenant.userRowId,
      })
      .eq('id', id);

    if (!error) {
      setNote((n) => ({ ...n, [id]: '' }));
      loadRequests();
    }
    setProcessing(null);
  }

  if (!tenant || !['grievance_admin', 'developer', 'support'].includes(tenant.role)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
        Access restricted to grievance admins only.
      </div>
    );
  }

  const TABS = [
    { key: 'pending', label: 'Pending', color: '#f59e0b' },
    { key: 'approved', label: 'Approved', color: '#16a34a' },
    { key: 'rejected', label: 'Rejected', color: '#dc2626' },
  ];

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Verification Queue</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>MLA/MP office access requests</div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 20px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1, padding: '9px 8px', borderRadius: 8,
                border: `2px solid ${activeTab === t.key ? t.color : '#e2e8f0'}`,
                background: activeTab === t.key ? t.color : '#fff',
                color: activeTab === t.key ? '#fff' : '#64748b',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Requests list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading...</div>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
            No {activeTab} requests.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {requests.map(r => (
              <div key={r.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>

                {/* Request details */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
                      {r.office_name}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {r.role_requested} · {r.constituency_name} · {r.state_slug}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 10px',
                    borderRadius: 20, height: 'fit-content',
                    background: r.status === 'pending' ? '#fef3c7' : r.status === 'approved' ? '#dcfce7' : '#fee2e2',
                    color: r.status === 'pending' ? '#92400e' : r.status === 'approved' ? '#166534' : '#991b1b',
                  }}>
                    {r.status.toUpperCase()}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Contact Person</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{r.contact_person}</div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Phone</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{r.phone}</div>
                  </div>
                  {r.email && (
                    <div style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 10px', gridColumn: '1/-1' }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Email</div>
                      <div style={{ fontSize: 13, color: '#1e293b' }}>{r.email}</div>
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
                  Requested: {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>

                {r.notes && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#166534', marginBottom: 12 }}>
                    Note: {r.notes}
                  </div>
                )}

                {/* Action buttons — only for pending */}
                {activeTab === 'pending' && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <select
                      value={verificationMethod[r.id] || ''}
                      onChange={e => { setVerificationMethod(v => ({ ...v, [r.id]: e.target.value })); setApproveError(er => ({ ...er, [r.id]: '' })); }}
                      style={{
                        width: '100%', padding: '9px 12px',
                        border: `1px solid ${approveError[r.id] ? '#dc2626' : '#e2e8f0'}`, borderRadius: 8,
                        fontSize: 13, fontFamily: 'inherit', color: '#1e293b',
                        boxSizing: 'border-box', background: '#fff',
                      }}
                    >
                      {VERIFICATION_METHODS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <input
                      value={note[r.id] || ''}
                      onChange={e => setNote(n => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Add a note (optional)"
                      style={{
                        width: '100%', padding: '9px 12px',
                        border: '1px solid #e2e8f0', borderRadius: 8,
                        fontSize: 13, fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />
                    {REP_TIERS.includes(r.role_requested) && (
                      <div>
                        <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                          {r.role_requested} photo (optional) — shown on printed Batch Reports for this constituency
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => setRepPhotoFile(f => ({ ...f, [r.id]: e.target.files?.[0] || null }))}
                          style={{ width: '100%', fontSize: 12 }}
                        />
                      </div>
                    )}
                    {approveError[r.id] && (
                      <div style={{ fontSize: 12, color: '#dc2626' }}>{approveError[r.id]}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => approveRequest(r.id, r.role_requested)}
                        disabled={processing === r.id}
                        style={{
                          flex: 1, padding: '10px 8px', borderRadius: 8,
                          border: 'none', background: '#16a34a', color: '#fff',
                          fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          fontFamily: 'inherit',
                          opacity: processing === r.id ? 0.6 : 1,
                        }}
                      >
                        ✅ Approve
                      </button>
                      <button
                        onClick={() => rejectRequest(r.id)}
                        disabled={processing === r.id}
                        style={{
                          flex: 1, padding: '10px 8px', borderRadius: 8,
                          border: 'none', background: '#dc2626', color: '#fff',
                          fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          fontFamily: 'inherit',
                          opacity: processing === r.id ? 0.6 : 1,
                        }}
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <a href={`/grievance/${stateSlug || 'andhra-pradesh'}/feedback`}
          style={{ display: 'block', textAlign: 'center', marginTop: 20, padding: '12px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#1a1a2e', textDecoration: 'none' }}>
          💬 View App Feedback
        </a>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '20px 0 40px' }}>
          <button onClick={() => window.history.back()} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0 }}>
            ← Back
          </button>
          <a href="/portal/dashboard" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>🏠 Home</a>
          <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0 }}>
            Sign out
          </button>
        </div>
      </div>

      <GrievanceNav />
    </div>
  );
}