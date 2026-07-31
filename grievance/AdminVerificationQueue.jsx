// grievance/AdminVerificationQueue.jsx
// Admin screen — verify staff access requests and manage constituency assignments
import { useState, useEffect } from 'react';
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

export default function AdminVerificationQueue() {
  const { tenant } = useTenant();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [processing, setProcessing] = useState(null);
  const [note, setNote] = useState('');
  const [verificationMethod, setVerificationMethod] = useState('');
  const [approveError, setApproveError] = useState('');

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
  async function approveRequest(id) {
    if (!verificationMethod) {
      setApproveError('Select how this was verified before approving.');
      return;
    }
    setApproveError('');
    setProcessing(id);

    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('approve-staff-verification', {
      body: { requestId: id, verificationMethod, note },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error || data?.error) {
      setApproveError(data?.error || error.message || 'Failed to approve this request.');
      setProcessing(null);
      return;
    }

    setNote('');
    setVerificationMethod('');
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
        notes: note || null,
        processed_at: new Date().toISOString(),
        processed_by: tenant.userRowId,
      })
      .eq('id', id);

    if (!error) {
      setNote('');
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
                      value={verificationMethod}
                      onChange={e => { setVerificationMethod(e.target.value); setApproveError(''); }}
                      style={{
                        width: '100%', padding: '9px 12px',
                        border: `1px solid ${approveError ? '#dc2626' : '#e2e8f0'}`, borderRadius: 8,
                        fontSize: 13, fontFamily: 'inherit', color: '#1e293b',
                        boxSizing: 'border-box', background: '#fff',
                      }}
                    >
                      {VERIFICATION_METHODS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Add a note (optional)"
                      style={{
                        width: '100%', padding: '9px 12px',
                        border: '1px solid #e2e8f0', borderRadius: 8,
                        fontSize: 13, fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />
                    {approveError && (
                      <div style={{ fontSize: 12, color: '#dc2626' }}>{approveError}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => approveRequest(r.id)}
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
      </div>

      <GrievanceNav />
    </div>
  );
}