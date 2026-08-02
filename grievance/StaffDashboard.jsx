// src/pages/grievance/StaffDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';
import EvidenceGallery from './EvidenceGallery';
import { CATEGORY_EMOJI, StageBadge, FeedbackWidget } from './CitizenPortal';
import { fetchStaffQueue, fetchComplaintHistory, advanceComplaint, uploadStaffPhoto, updateStaffProfile } from './grievanceApi';
import GrievanceNav from './GrievanceNav';

const TERMINAL_STAGES = ['Resolved', 'Sanctioned', 'Declined'];

export default function StaffDashboard() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeComplaint, setActiveComplaint] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    fetchStaffQueue()
      .then(setComplaints)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tenant) reload();
  }, [tenant, reload]);

  if (tenantLoading || !tenant) return <CenteredNote>Loading…</CenteredNote>;

  // FIX 1: Single role check — duplicate removed
  if (!['representative', 'authority', 'grievance_admin', 'grievance_staff'].includes(tenant.role)) {
    return <CenteredNote>This dashboard is for representatives, authorities, or grievance admins.</CenteredNote>;
  }

  const profileIncomplete = !tenant.phone || !tenant.alternatePhone;
  const pending = complaints.filter((c) => !TERMINAL_STAGES.includes(c.stage));
  const handled = complaints.filter((c) => TERMINAL_STAGES.includes(c.stage));

  return (
    // FIX 2: paddingBottom 80px so content clears fixed GrievanceNav
    <div style={{ background: '#1C1C1E', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 80px' }}>

        {profileIncomplete && !bannerDismissed && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            background: '#FFF8E8', border: '1px solid #A8762C40', borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          }}>
            <span style={{ fontSize: 12.5, color: '#5B4A2A' }}>
              📋 Complete your profile — contact number &amp; emergency contact on file for {tenant.fullName}.
            </span>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setShowProfileSetup(true)} style={{ fontSize: 12, fontWeight: 700, color: '#A8762C', background: 'none', border: 'none' }}>
                Complete now
              </button>
              <button onClick={() => setBannerDismissed(true)} style={{ fontSize: 12, color: '#5B6473', background: 'none', border: 'none' }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              {roleLabel(tenant.role)} — {tenant.fullName}
            </h1>
            <p style={{ fontSize: 12.5, color: '#5B6473', marginBottom: 20 }}>
              {pending.length} pending · {handled.length} handled
            </p>
          </div>
          <button onClick={() => setShowFeedback(true)} style={{ fontSize: 12, color: '#15213A', background: 'none', border: 'none', fontWeight: 600 }}>
            💬 Feedback
          </button>
        </div>

        {loading ? (
          <CenteredNote>Loading complaints…</CenteredNote>
        ) : (
          <>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Pending action</h3>
            {pending.length === 0 ? (
              <CenteredNote>Queue clear.</CenteredNote>
            ) : (
              <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
                {pending.map((c) => (
                  <ComplaintCard
                    key={c.id}
                    complaint={c}
                    role={tenant.role}
                    actorName={tenant.fullName}
                    onOpen={() => setActiveComplaint(c)}
                    onAction={reload}
                  />
                ))}
              </div>
            )}

            {handled.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Handled</h3>
                <div style={{ display: 'grid', gap: 10 }}>
                  {handled.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveComplaint(c)}
                      style={{ textAlign: 'left', padding: 12, border: '1px solid #D9D5C8', borderRadius: 8, background: '#fff', display: 'flex', gap: 10, alignItems: 'center' }}
                    >
                      <span style={{ fontSize: 20 }}>{CATEGORY_EMOJI[c.category] || '📄'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</div>
                        <div style={{ marginTop: 4 }}><StageBadge stage={c.stage} /></div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {activeComplaint && (
          <ComplaintDetailDrawer
            complaint={activeComplaint}
            role={tenant.role}
            staffUserId={tenant.userRowId}
            onClose={() => setActiveComplaint(null)}
          />
        )}

        {showFeedback && (
          <FeedbackWidget
            appId={tenant.appId}
            userId={tenant.userRowId}
            context="staff_dashboard"
            onClose={() => setShowFeedback(false)}
          />
        )}

        {showProfileSetup && (
          <StaffProfileSetup tenant={tenant} onClose={() => setShowProfileSetup(false)} />
        )}
      </div>

      {/* FIX 2: GrievanceNav at correct level — outside content div, inside outer div */}
      <GrievanceNav />
    </div>
  );
}

function StaffProfileSetup({ tenant, onClose }) {
  const [phone, setPhone] = useState(tenant.phone || '');
  const [alternatePhone, setAlternatePhone] = useState(tenant.alternatePhone || '');
  const [photoFile, setPhotoFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phone.trim() || !alternatePhone.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let photoPath;
      if (photoFile) {
        photoPath = await uploadStaffPhoto({ userId: tenant.userRowId, file: photoFile });
      }
      await updateStaffProfile({
        userId: tenant.userRowId,
        phone: phone.trim(),
        alternatePhone: alternatePhone.trim(),
        photoUrl: photoPath,
      });
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Complete your profile</h2>
        <p style={{ fontSize: 12.5, color: '#5B6473', marginBottom: 18 }}>
          A contact number and emergency contact, kept on file for {tenant.fullName}.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6473' }}>📱 Contact number</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6473' }}>🚨 Emergency/alternate contact number</span>
            <input value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#8B9099' }}>📷 Photo (entirely optional)</span>
            <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
          </label>
          {error && <p style={{ fontSize: 12, color: '#9B3C2E' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy} style={{ flex: 1, background: '#15213A', color: '#fff', border: 'none', borderRadius: 7, padding: '11px 16px', fontSize: 14, fontWeight: 600 }}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid #D9D5C8', borderRadius: 7, fontSize: 14, fontWeight: 600, color: '#5B6473' }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const fieldStyle = { border: '1px solid #D9D5C8', borderRadius: 6, padding: '9px 11px', fontSize: 13.5, width: '100%' };

function roleLabel(role) {
  if (role === 'representative') return 'Representative Queue';
  if (role === 'authority') return 'Authority Decisions';
  return 'Grievance Admin';
}

function CenteredNote({ children }) {
  return <div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>{children}</div>;
}

function ComplaintCard({ complaint, role, actorName, onOpen, onAction }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(false);

  async function act(stage, visibility = 'public') {
    if (stage === 'Declined' && !note.trim()) { setWarn(true); return; }
    setWarn(false);
    setBusy(true);
    await advanceComplaint({ complaintId: complaint.id, stage, byName: actorName, note, visibility });
    setNote('');
    setBusy(false);
    onAction();
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #D9D5C8', borderRadius: 9, padding: 14 }}>
      <div onClick={onOpen} style={{ cursor: 'pointer', marginBottom: 10, display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 28, flexShrink: 0 }}>{CATEGORY_EMOJI[complaint.category] || '📄'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#8B9099', fontFamily: 'monospace' }}>{complaint.case_no}</div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{complaint.title}</div>
          <div style={{ fontSize: 12, color: '#5B6473', marginTop: 3 }}>{complaint.description}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <StageBadge stage={complaint.stage} />
            {complaint.priority === 'Urgent' && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#9B3C2E', background: '#9B3C2E20', borderRadius: 20, padding: '3px 10px' }}>
                🚨 Urgent
              </span>
            )}
          </div>
        </div>
      </div>

      <input
        value={note}
        onChange={(e) => { setNote(e.target.value); if (warn) setWarn(false); }}
        placeholder="Add a note — required if declining"
        style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, border: '1px solid #D9D5C8', borderRadius: 6, marginBottom: 8 }}
      />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(role === 'representative' || role === 'grievance_staff') && (
          <>
            {complaint.stage === 'Submitted' && <ActionBtn onClick={() => act('Acknowledged')} disabled={busy}>👀 Acknowledge</ActionBtn>}
            {complaint.stage === 'Acknowledged' && <ActionBtn onClick={() => act('In Progress')} disabled={busy}>🔧 Start work</ActionBtn>}
            {['Acknowledged', 'In Progress'].includes(complaint.stage) && (
              <>
                <ActionBtn onClick={() => act('Resolved')} disabled={busy} color="#3E5C45">✅ Mark resolved</ActionBtn>
                <ActionBtn onClick={() => act('Escalated', 'internal')} disabled={busy} color="#9B3C2E">⬆️ Escalate</ActionBtn>
              </>
            )}
            {['Submitted', 'Acknowledged', 'In Progress'].includes(complaint.stage) && (
              <ActionBtn onClick={() => act('Declined')} disabled={busy} color="#6B5B73">💬 Decline, with reason</ActionBtn>
            )}
          </>
        )}
        {role === 'authority' && complaint.stage === 'Escalated' && (
          <>
            <ActionBtn onClick={() => act('Sanctioned')} disabled={busy} color="#A8762C">💰 Approve &amp; sanction</ActionBtn>
            <ActionBtn onClick={() => act('In Progress', 'internal')} disabled={busy}>↩️ Send back</ActionBtn>
            <ActionBtn onClick={() => act('Declined')} disabled={busy} color="#6B5B73">💬 Decline, with reason</ActionBtn>
          </>
        )}
        {role === 'grievance_admin' && (
          <>
            <ActionBtn onClick={() => act('Acknowledged')} disabled={busy}>👀 Acknowledge</ActionBtn>
            <ActionBtn onClick={() => act('Resolved')} disabled={busy} color="#3E5C45">✅ Mark resolved</ActionBtn>
            <ActionBtn onClick={() => act('Declined')} disabled={busy} color="#6B5B73">💬 Decline, with reason</ActionBtn>
          </>
        )}
      </div>
      {warn && <p style={{ fontSize: 12, color: '#9B3C2E', marginTop: 6 }}>Add a reason before declining — the citizen will see it.</p>}
    </div>
  );
}

function ActionBtn({ onClick, disabled, color = '#15213A', children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 6,
        border: `1px solid ${color}`, background: 'transparent', color,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function ComplaintDetailDrawer({ complaint, role, staffUserId, onClose }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    fetchComplaintHistory(complaint.id).then(setHistory);
  }, [complaint.id]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 400, background: '#fff', height: '100%', padding: 20, overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ float: 'right', border: 'none', background: 'none' }}>✕</button>
        <div style={{ fontSize: 12, color: '#8B9099', fontFamily: 'monospace' }}>{complaint.case_no}</div>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>{complaint.title}</h3>
        <p style={{ fontSize: 13, color: '#3A4250', margin: '10px 0' }}>{complaint.description}</p>
        {complaint.suggested_solution && (
          <p style={{ fontSize: 12.5, color: '#5B6473', background: '#F7F6F2', padding: 8, borderRadius: 6 }}>
            <strong>Citizen's suggested solution:</strong> {complaint.suggested_solution}
          </p>
        )}

        {/* FIX 3: Print button */}
        <button
          onClick={() => window.open(`/grievance/print?case=${complaint.case_no}`, '_blank')}
          style={{
            width: '100%', padding: '10px 14px', margin: '12px 0',
            background: '#fff', border: '1px solid #D9D5C8', borderRadius: 8,
            fontSize: 13, fontWeight: 600, color: '#15213A', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          🖨️ Print Representation Letter
        </button>

        <h4 style={{ fontSize: 13, fontWeight: 600, marginTop: 20 }}>Full history (including internal notes)</h4>
        {history.map((h) => (
          <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid #EFEDE6' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{h.stage}</span>
              {h.visibility === 'internal' && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#9B3C2E', border: '1px solid #9B3C2E', borderRadius: 10, padding: '1px 6px' }}>
                  INTERNAL
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#8B9099' }}>{h.by_name} · {new Date(h.created_at).toLocaleString()}</div>
            {h.note && <div style={{ fontSize: 12.5, marginTop: 3 }}>{h.note}</div>}
          </div>
        ))}
        <EvidenceGallery complaintId={complaint.id} uploaderUserId={staffUserId} canUpload />
        {/* FIX 3: GrievanceNav removed from here — it is in main return */}
      </div>
    </div>
  );
}