// shared/CorrectionApprovalQueue.jsx — FINAL
// Admin screen — shows pending correction/deletion requests
// Approve → applies the change automatically + logs audit trail
// Reject → closes request with reason
// Full history tab shows all past decisions
// Add to Control Panel nav or School/Hospital dashboard for principal/doctor

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 60 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: { width: '100%', padding: '9px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
};

const STATUS_CONFIG = {
  pending:  { color: '#E8A020', bg: 'rgba(232,160,32,0.12)',  label: 'Pending' },
  approved: { color: '#6AAA90', bg: 'rgba(106,170,144,0.12)', label: 'Approved' },
  rejected: { color: '#E05A5A', bg: 'rgba(224,90,90,0.12)',   label: 'Rejected' },
};

const MODULE_CONFIG = {
  student:   { icon: '👤', label: 'Student',   table: 'students' },
  patient:   { icon: '🏥', label: 'Patient',   table: 'patients' },
  complaint: { icon: '📋', label: 'Complaint', table: 'complaints' },
  fee:       { icon: '💰', label: 'Fee',       table: 'fee_dues' },
  attendance:{ icon: '✅', label: 'Attendance',table: 'attendance' },
};

// Apply the actual database change after approval
async function applyCorrection(request) {
  const moduleConfig = MODULE_CONFIG[request.module];
  if (!moduleConfig) return { error: 'Unknown module' };

  if (request.request_type === 'deletion') {
    const { error } = await supabase
      .from(moduleConfig.table)
      .delete()
      .eq('id', request.record_id);
    return { error };
  }

  if (request.request_type === 'correction' && request.field_name) {
    const { error } = await supabase
      .from(moduleConfig.table)
      .update({ [request.field_name]: request.new_value })
      .eq('id', request.record_id);
    return { error };
  }

  return { error: 'Nothing to apply' };
}

function RequestCard({ request, onDecision, tenant }) {
  const [rejectNote, setRejectNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError]           = useState('');

  const statusCfg  = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
  const moduleCfg  = MODULE_CONFIG[request.module] || { icon: '📄', label: request.module };
  const isCorrection = request.request_type === 'correction';
  const isDeletion   = request.request_type === 'deletion';

  async function approve() {
    setProcessing(true);
    setError('');

    // Apply the actual change
    const { error: applyErr } = await applyCorrection(request);
    if (applyErr) {
      setError(`Failed to apply change: ${applyErr.message}`);
      setProcessing(false);
      return;
    }

    // Mark as approved
    const { error: updateErr } = await supabase
      .from('correction_requests')
      .update({
        status:      'approved',
        reviewed_by: tenant.userRowId,
        reviewed_at: new Date().toISOString(),
        applied:     true,
        applied_at:  new Date().toISOString(),
      })
      .eq('id', request.id);

    if (updateErr) { setError('Approved but failed to log decision.'); setProcessing(false); return; }

    // Notify requester via WhatsApp
    await supabase.functions.invoke('send-whatsapp', {
      body: {
        type:        'correction_request_approved',
        appId:       tenant.appId,
        approvedBy:  tenant.fullName,
        module:      request.module,
        recordLabel: request.record_label,
        requestType: request.request_type,
        fieldName:   request.field_name,
        newValue:    request.new_value,
      },
    });

    setProcessing(false);
    onDecision();
  }

  async function reject() {
    if (!rejectNote.trim()) { setError('Please give a reason for rejection.'); return; }
    setProcessing(true);
    setError('');

    const { error: updateErr } = await supabase
      .from('correction_requests')
      .update({
        status:        'rejected',
        reviewed_by:   tenant.userRowId,
        reviewed_at:   new Date().toISOString(),
        reviewer_note: rejectNote.trim(),
        applied:       false,
      })
      .eq('id', request.id);

    if (updateErr) { setError('Failed to reject.'); setProcessing(false); return; }

    // Notify requester
    await supabase.functions.invoke('send-whatsapp', {
      body: {
        type:        'correction_request_rejected',
        appId:       tenant.appId,
        rejectedBy:  tenant.fullName,
        module:      request.module,
        recordLabel: request.record_label,
        reason:      rejectNote.trim(),
      },
    });

    setProcessing(false);
    onDecision();
  }

  return (
    <div style={{ ...S.card, border: `1px solid ${isDeletion ? 'rgba(224,90,90,0.25)' : request.status === 'pending' ? 'rgba(232,160,32,0.2)' : 'rgba(255,255,255,0.07)'}` }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16 }}>{moduleCfg.icon}</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: statusCfg.bg, color: statusCfg.color, fontWeight: 500 }}>
              {statusCfg.label}
            </span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: isDeletion ? 'rgba(224,90,90,0.12)' : 'rgba(255,255,255,0.06)', color: isDeletion ? '#E05A5A' : 'rgba(255,255,255,0.5)' }}>
              {isDeletion ? '🗑️ Deletion' : '✏️ Correction'}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{moduleCfg.label}</span>
          </div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{request.record_label}</p>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Requested by {request.users?.full_name || '—'} · {new Date(request.requested_at).toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Change details */}
      {isCorrection && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.15)', borderRadius: 8, padding: '10px 12px' }}>
            <p style={{ margin: '0 0 3px', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
              FIELD · {request.field_name}
            </p>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: '#E05A5A' }}>CURRENT (WRONG)</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{request.old_value || '—'}</p>
          </div>
          <div style={{ background: 'rgba(106,170,144,0.06)', border: '1px solid rgba(106,170,144,0.15)', borderRadius: 8, padding: '10px 12px' }}>
            <p style={{ margin: '0 0 3px', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
              CORRECT VALUE
            </p>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: '#6AAA90' }}>SHOULD BE</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{request.new_value || '—'}</p>
          </div>
        </div>
      )}

      {isDeletion && (
        <div style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
            ⚠️ Permanent deletion requested for this {request.module} record
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            This cannot be undone once approved
          </p>
        </div>
      )}

      {/* Reason */}
      <div style={{ background: '#111113', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
        <p style={{ margin: '0 0 4px', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>REASON GIVEN</p>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{request.reason}</p>
      </div>

      {/* Reviewer note (if already decided) */}
      {request.reviewer_note && (
        <div style={{ background: 'rgba(224,90,90,0.06)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
          <p style={{ margin: '0 0 4px', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>REJECTION REASON</p>
          <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', lineHeight: 1.6 }}>{request.reviewer_note}</p>
        </div>
      )}

      {/* Applied badge */}
      {request.applied && (
        <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 12, color: '#6AAA90' }}>
            ✓ Change applied on {new Date(request.applied_at).toLocaleString('en-IN')}
          </p>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#E05A5A' }}>
          {error}
        </div>
      )}

      {/* Actions — only show for pending requests */}
      {request.status === 'pending' && (
        <>
          {showReject ? (
            <div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  Reason for rejection *
                </label>
                <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Why is this request being rejected?" style={S.input} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowReject(false); setRejectNote(''); setError(''); }}
                  style={{ flex: 1, padding: '9px 0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={reject} disabled={processing}
                  style={{ flex: 2, padding: '9px 0', background: processing ? 'rgba(255,255,255,0.08)' : '#E05A5A', color: '#fff', border: 'none', borderRadius: 7, cursor: processing ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                  {processing ? 'Rejecting...' : 'Confirm rejection'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={approve} disabled={processing}
                style={{ flex: 2, padding: '10px 0', background: processing ? 'rgba(255,255,255,0.08)' : isDeletion ? '#E05A5A' : '#6AAA90', color: '#111113', border: 'none', borderRadius: 7, cursor: processing ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
                {processing ? 'Applying...' : isDeletion ? '🗑️ Approve deletion' : '✓ Approve & apply change'}
              </button>
              <button onClick={() => setShowReject(true)} disabled={processing}
                style={{ flex: 1, padding: '10px 0', border: '1px solid rgba(224,90,90,0.3)', color: '#E05A5A', background: 'rgba(224,90,90,0.06)', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Reject
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CorrectionApprovalQueue() {
  const { tenant } = useTenant();
  const [requests, setRequests]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState('pending');
  const [filterModule, setFilterModule] = useState('');

  useEffect(() => {
    if (tenant?.appId) loadRequests();
  }, [tenant?.appId]);

  async function loadRequests() {
    setLoading(true);
    const { data } = await supabase
      .from('correction_requests')
      .select('*, users!correction_requests_requested_by_fkey(full_name, role)')
      .eq('app_id', tenant.appId)
      .order('requested_at', { ascending: false });
    setRequests(data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = [...requests];
    if (tab === 'pending')  list = list.filter((r) => r.status === 'pending');
    if (tab === 'approved') list = list.filter((r) => r.status === 'approved');
    if (tab === 'rejected') list = list.filter((r) => r.status === 'rejected');
    if (filterModule) list = list.filter((r) => r.module === filterModule);
    return list;
  }, [requests, tab, filterModule]);

  const stats = useMemo(() => ({
    pending:  requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    deletions: requests.filter((r) => r.request_type === 'deletion' && r.status === 'pending').length,
  }), [requests]);

  // Only principal/doctor/admin can see this screen
  const canAccess = ['principal', 'doctor', 'grievance_admin', 'developer', 'support'].includes(tenant?.role);

  if (!canAccess) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
          This screen is for principals and administrators only.
        </p>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>Correction Requests</p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            Review and approve data corrections · {tenant?.orgName}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={loadRequests}
            style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
            ↻ Refresh
          </button>
          <Link to="/" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← Home</Link>
        </div>
      </nav>

      <div style={S.inner}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { value: stats.pending,   label: 'Pending',    color: '#E8A020', alert: stats.pending > 0 },
            { value: stats.approved,  label: 'Approved',   color: '#6AAA90', alert: false },
            { value: stats.rejected,  label: 'Rejected',   color: '#E05A5A', alert: false },
            { value: stats.deletions, label: 'Deletions',  color: '#E05A5A', alert: stats.deletions > 0 },
          ].map((s) => (
            <div key={s.label} style={{ background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: `1px solid ${s.alert ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
              <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: s.alert ? '#E05A5A' : s.color }}>{s.value}</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Pending alert */}
        {stats.pending > 0 && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#E8A020', fontWeight: 500 }}>
              ⏰ {stats.pending} request{stats.pending > 1 ? 's' : ''} waiting for your approval
              {stats.deletions > 0 && ` — including ${stats.deletions} deletion${stats.deletions > 1 ? 's' : ''}`}
            </p>
          </div>
        )}

        {/* Tabs + filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { k: 'pending',  l: `Pending (${stats.pending})` },
            { k: 'approved', l: `Approved (${stats.approved})` },
            { k: 'rejected', l: `Rejected (${stats.rejected})` },
            { k: 'all',      l: `All (${requests.length})` },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '7px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
          <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)}
            style={{ padding: '7px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, fontSize: 12, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="">All modules</option>
            {Object.entries(MODULE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading requests...</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 28, marginBottom: 12 }}>
              {tab === 'pending' ? '✅' : '📋'}
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
              {tab === 'pending' ? 'No pending requests — all clear!' : 'No requests found'}
            </p>
          </div>
        ) : (
          filtered.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              tenant={tenant}
              onDecision={loadRequests}
            />
          ))
        )}

        {/* How to use note */}
        {tab === 'pending' && requests.length > 0 && (
          <div style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginTop: 8 }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, margin: '0 0 10px' }}>HOW THIS WORKS</p>
            {[
              { icon: '✏️', text: 'Staff raise a correction request from any record screen' },
              { icon: '🔔', text: 'You get a WhatsApp alert immediately' },
              { icon: '✓',  text: 'Approve — change is applied to the database automatically' },
              { icon: '✕',  text: 'Reject — request is closed, staff is notified with your reason' },
              { icon: '📋', text: 'Full audit trail — who requested, who approved, when, old and new value' },
            ].map((item) => (
              <div key={item.text} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                <span style={{ flexShrink: 0, width: 16 }}>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
