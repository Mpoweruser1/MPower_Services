// grievance/ReportsDashboard.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { fetchReportRollup, fetchEnrichedComplaints, detectPatterns } from './grievanceApi';
import { ComplaintDetailDrawer } from './StaffDashboard';
import GrievanceNav from './GrievanceNav';

const LEVELS = [
  { key: 'village', label: 'By Village', icon: '🏘️' },
  { key: 'mandal', label: 'By Mandal', icon: '🗺️' },
  { key: 'category', label: 'By Category', icon: '📋' },
  { key: 'constituency', label: 'By Constituency', icon: '🏛️' },
];

const STAGE_COLORS = {
  Submitted:    '#f59e0b',
  Acknowledged: '#3b82f6',
  'In Progress':'#7c3aed',
  Escalated:    '#dc2626',
  Resolved:     '#16a34a',
  Declined:     '#64748b',
  Sanctioned:   '#e8a020',
};

function daysPending(complaint) {
  const filed = new Date(complaint.created_at);
  const isResolved = complaint.stage === 'Resolved' || complaint.stage === 'Declined';
  const end = isResolved ? new Date(complaint.updated_at || complaint.created_at) : new Date();
  return Math.max(0, Math.floor((end - filed) / (1000 * 60 * 60 * 24)));
}

export default function ReportsDashboard() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [level, setLevel] = useState('category');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Real, actionable detail behind each summary row — previously this
  // page only ever showed counts, with no way to see who was actually
  // affected or act on anything without leaving the screen.
  const [enriched, setEnriched] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [activeComplaint, setActiveComplaint] = useState(null);
  const [showPatterns, setShowPatterns] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    fetchReportRollup(level)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [level, tenant]);

  useEffect(() => {
    if (!tenant?.appId) return;
    fetchEnrichedComplaints(tenant.appId).then(setEnriched).catch(() => {});
  }, [tenant?.appId]);

  // Matches a summary row (whichever level it belongs to) back to its
  // real underlying complaints, using the same display name already
  // shown on the card — village/mandal/category/constituency.
  function getRowComplaints(row) {
    const rowName = row.village_name || row.mandal_name || row.category || row.constituency_name;
    return enriched.filter((c) => {
      if (level === 'village') return c.villages?.name === rowName;
      if (level === 'mandal') return c.mandals?.name === rowName;
      if (level === 'category') return c.category === rowName;
      if (level === 'constituency') return c.constituencies?.name === rowName;
      return false;
    }).sort((a, b) => daysPending(b) - daysPending(a));
  }

  const { hotspots, familyPatterns, exactDuplicates } = detectPatterns(enriched);
  const patternCount = hotspots.length + familyPatterns.length + exactDuplicates.length;

  if (tenantLoading) {
    return <div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>Loading…</div>;
  }

  // Was completely missing before — any authenticated visitor, including
  // a citizen, could reach this page and its data. Same allowed-roles
  // list as StaffDashboard.jsx, which correctly already has this check.
  if (!tenant || !['representative', 'authority', 'grievance_admin', 'grievance_staff'].includes(tenant.role)) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>
        This page is for representatives, authorities, or grievance admins.
      </div>
    );
  }

  const total = data.reduce((sum, row) => sum + (row.total || 0), 0);
  const resolved = data.reduce((sum, row) => sum + (row.resolved_count || 0), 0);
  const pending = data.reduce((sum, row) => sum + (row.open_count || 0), 0);
  const escalated = data.reduce((sum, row) => sum + (row.currently_escalated_count || 0), 0);

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Reports</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Complaint analytics</div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 20px' }}>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total', value: total, color: '#1a1a2e' },
            { label: 'Resolved', value: resolved, color: '#16a34a' },
            { label: 'Pending', value: pending, color: '#f59e0b' },
            { label: 'Escalated', value: escalated, color: '#dc2626' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Patterns & Duplicates — real intelligence from data already
            being collected at registration (Ward No., Sachivalayam,
            Father's/Husband's Name) but never used anywhere until now.
            Collapsed by default since this can be a lot of content;
            the count alone tells you if it's worth opening. */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
          <button onClick={() => setShowPatterns(!showPatterns)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>
              🔥 Patterns & Duplicates {patternCount > 0 && <span style={{ color: '#dc2626' }}>({patternCount})</span>}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>{showPatterns ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showPatterns && (
            <div style={{ padding: '0 16px 16px', display: 'grid', gap: 18 }}>
              {patternCount === 0 && (
                <p style={{ fontSize: 12.5, color: '#94a3b8', margin: 0 }}>Nothing detected yet — this fills in as complaints come in.</p>
              )}

              {hotspots.length > 0 && (
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: '#9B3C2E', marginBottom: 8 }}>
                    🔥 Hotspots — same village, same issue, filed by multiple people
                  </p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {hotspots.map((group, i) => (
                      <div key={i} style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                          {group.length} complaints · {group[0].category} · {group[0].villages?.name || group[0].mandals?.name || 'Unknown village'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {group.map((c) => (
                            <button key={c.id} onClick={() => setActiveComplaint(c)}
                              style={{ fontSize: 11, padding: '4px 10px', background: '#fff', border: '1px solid #FECACA', borderRadius: 12, cursor: 'pointer', color: '#9B3C2E' }}>
                              {c.citizens?.full_name || c.case_no}
                            </button>
                          ))}
                        </div>
                        <p style={{ fontSize: 11, color: '#7f1d1d', margin: '6px 0 0' }}>
                          Worth escalating as one group — a stronger case than {group.length} separate low-priority tickets.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {familyPatterns.length > 0 && (
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: '#A8762C', marginBottom: 8 }}>
                    👨‍👩‍👧 Family patterns — same household, multiple complaints
                  </p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {familyPatterns.map((group, i) => (
                      <div key={i} style={{ background: '#FFF8E8', border: '1px solid #F5DEB3', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                          {group.length} complaints · {group[0].citizens?.father_husband_name}'s household · {group[0].villages?.name || group[0].mandals?.name || ''}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {group.map((c) => (
                            <button key={c.id} onClick={() => setActiveComplaint(c)}
                              style={{ fontSize: 11, padding: '4px 10px', background: '#fff', border: '1px solid #F5DEB3', borderRadius: 12, cursor: 'pointer', color: '#A8762C' }}>
                              {c.category}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {exactDuplicates.length > 0 && (
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                    ⚠️ Possible accidental duplicates — same person, same issue, filed twice within a day
                  </p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {exactDuplicates.map((group, i) => (
                      <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                          {group[0].citizens?.full_name || 'Citizen'} · {group[0].category} · {group.length} submissions
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {group.map((c) => (
                            <button key={c.id} onClick={() => setActiveComplaint(c)}
                              style={{ fontSize: 11, padding: '4px 10px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, cursor: 'pointer', color: '#64748b' }}>
                              {c.case_no} · {new Date(c.created_at).toLocaleDateString('en-IN')}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Level selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {LEVELS.map(l => (
            <button
              key={l.key}
              onClick={() => { setLevel(l.key); setExpandedRow(null); }}
              style={{
                padding: '7px 14px', borderRadius: 20,
                border: level === l.key ? 'none' : '1px solid #e2e8f0',
                background: level === l.key ? '#1a1a2e' : '#fff',
                color: level === l.key ? '#e8a020' : '#64748b',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
              }}
            >
              {l.icon} {l.label}
            </button>
          ))}
        </div>

        {/* Data table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading...</div>
        ) : error ? (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14, color: '#dc2626', fontSize: 13 }}>{error}</div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>No data yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10, maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
            {data.map((row, i) => {
              const rowName = row.village_name || row.mandal_name || row.category || row.constituency_name || '—';
              const isExpanded = expandedRow === rowName;
              const rowComplaints = isExpanded ? getRowComplaints(row) : [];
              return (
              <div key={i} style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid #e2e8f0' }}>
                <div onClick={() => setExpandedRow(isExpanded ? null : rowName)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                      {isExpanded ? '▼' : '▶'} {rowName}
                    </div>
                    {row.mandal_name && level === 'village' && (
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{row.mandal_name}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e' }}>{row.total || 0}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>total</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6, marginBottom: 8, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, background: '#16a34a',
                    width: row.total > 0 ? `${Math.round((row.resolved_count || 0) / row.total * 100)}%` : '0%',
                    transition: 'width 0.3s',
                  }} />
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✅ {row.resolved_count || 0} resolved</span>
                  <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⏳ {row.open_count || 0} pending</span>
                  {row.urgent_open_count > 0 && (
                    <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 600 }}>🚨 {row.urgent_open_count} urgent (still open)</span>
                  )}
                  {row.currently_escalated_count > 0 && (
                    <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>⬆️ {row.currently_escalated_count} escalated</span>
                  )}
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'grid', gap: 6 }}>
                    {rowComplaints.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>No individual complaints matched (data may still be loading).</p>
                    ) : rowComplaints.map((c) => {
                      const days = daysPending(c);
                      const overdue = days >= 14 && c.stage !== 'Resolved' && c.stage !== 'Declined';
                      return (
                        <div key={c.id} onClick={() => setActiveComplaint(c)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8fafc', borderRadius: 6, cursor: 'pointer' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b' }}>{c.title}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {c.citizens?.full_name || '—'}{c.citizens?.phone ? ` · ${c.citizens.phone}` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: overdue ? 700 : 500, color: overdue ? '#dc2626' : '#64748b' }}>
                              {days}d
                            </div>
                            <div style={{ fontSize: 10, color: STAGE_COLORS[c.stage] || '#64748b', fontWeight: 600 }}>{c.stage}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* Export button */}
        <button
          onClick={() => {
            const csv = [
              ['Name', 'Total', 'Resolved', 'Pending', 'Urgent (still open)', 'Escalated'],
              ...data.map(r => [
                r.village_name || r.mandal_name || r.category || r.constituency_name || '',
                r.total || 0,
                r.resolved_count || 0,
                r.open_count || 0,
                r.urgent_open_count || 0,
                r.currently_escalated_count || 0,
              ])
            ].map(row => row.join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `complaints_report_${level}_${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
          }}
          style={{
            width: '100%', marginTop: 16, padding: '12px 16px',
            background: '#fff', border: '1px solid #e2e8f0',
            borderRadius: 10, fontSize: 13, fontWeight: 600,
            color: '#1a1a2e', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          📥 Export as CSV
        </button>

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

      {activeComplaint && (
        <ComplaintDetailDrawer
          complaint={activeComplaint}
          role={tenant.role}
          staffUserId={tenant.userRowId}
          actorName={tenant.fullName}
          onClose={() => setActiveComplaint(null)}
          onAction={() => {
            fetchReportRollup(level).then(setData).catch(e => setError(e.message));
            fetchEnrichedComplaints(tenant.appId).then(setEnriched).catch(() => {});
          }}
        />
      )}

      <GrievanceNav />
    </div>
  );
}