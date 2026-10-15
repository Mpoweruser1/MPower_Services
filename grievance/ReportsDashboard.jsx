// grievance/ReportsDashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { signOutAndRelease } from '../lib/signOutAndRelease';
import { useTenant } from '../context/TenantContext';
import { fetchReportRollup, fetchOpenComplaintsEnriched, fetchRowComplaints, detectPatterns, fetchOverdueCount, fetchFeedbackStats, slaInfo } from './grievanceApi';
import { ComplaintDetailDrawer } from './StaffDashboard';
import GrievanceNav from './GrievanceNav';
import PrintHeader from '../shared/PrintHeader';
import ReportFooter from '../shared/ReportFooter';
import { istToday, fmtIstDateTime } from './istDates';

// Print rules for this page. On paper only the title block, the figures, the table and the
// notes/signatures are printed -- the buttons, patterns box, card list and menu are hidden, and the
// page background is dropped. (cr- = "complaint report"; kept local so nothing else is affected.)
const PRINT_CSS = `
  .cr-print-only { display: none; }
  @media print {
    .cr-print-only { display: block !important; }
    .cr-no-print { display: none !important; }
    body, .cr-page { background: #fff !important; }
    .cr-page { padding-bottom: 0 !important; }
    .cr-print-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .cr-print-table th, .cr-print-table td { border: 1px solid #000; padding: 4px 6px; }
    .cr-print-table th { background: #eee !important; text-align: left; }
    .cr-print-table td.n, .cr-print-table th.n { text-align: right; }
    .cr-print-table tr { page-break-inside: avoid; }
    .cr-print-table thead { display: table-header-group; }
  }
`;

const LEVELS = [
  { key: 'village', label: 'By Village', icon: '🏘️' },
  { key: 'mandal', label: 'By Mandal', icon: '🗺️' },
  { key: 'category', label: 'By Category', icon: '📋' },
  { key: 'constituency', label: 'By Constituency', icon: '🏛️' },
];

// One CSV cell: wrapped in quotes when it holds a comma, quote or line break
// (a village called "Pedana, East" used to spill into the next column), and a
// leading = + - @ is defused so a spreadsheet can't read a name as a formula.
function csvCell(value) {
  let v = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const STAGE_COLORS = {
  Submitted:    '#f59e0b',
  Acknowledged: '#3b82f6',
  'In Progress':'#7c3aed',
  Escalated:    '#B91C1C',
  Resolved:     '#16a34a',
  Declined:     '#64748b',
  Sanctioned:   '#e8a020',
};

// Days since filing (or, once closed, days it took) now comes from the one
// shared deadline rule in grievanceApi.js (slaInfo). The old local version
// only treated Resolved and Declined as finished, so a Sanctioned complaint
// kept ageing and was flagged overdue after 14 days even though it was done.
function daysPending(complaint) {
  return slaInfo(complaint)?.ageDays ?? 0;
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
  // Loaded only when needed (15-10-2026): a row's complaints when it is opened, the open complaints
  // for Patterns when that box is first opened. Reading every complaint on page load is gone.
  const [rowDetail, setRowDetail] = useState({ key: null, loading: false, error: null, rows: [] });
  const [patternData, setPatternData] = useState({ loaded: false, loading: false, error: null, rows: [] });
  const [expandedRow, setExpandedRow] = useState(null);
  const [activeComplaint, setActiveComplaint] = useState(null);
  const [showPatterns, setShowPatterns] = useState(false);
  // Exact count of open complaints past their deadline (same number as the
  // Queue's Overdue button), straight from the database rather than counted
  // from the loaded list.
  const [overdueTotal, setOverdueTotal] = useState(null);
  // Citizen feedback numbers (ratings, confirmed solved, reopened). Left null,
  // and the cards simply not shown, if they can't be loaded.
  const [feedbackStats, setFeedbackStats] = useState(null);

  const [snapshotAt, setSnapshotAt] = useState('');
  useEffect(() => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    fetchReportRollup(level)
      .then((rows) => { setData(rows); setSnapshotAt(fmtIstDateTime(new Date())); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [level, tenant]);

  useEffect(() => {
    if (!tenant?.appId) return;
    fetchOverdueCount().then(setOverdueTotal).catch(() => setOverdueTotal(null));
    fetchFeedbackStats(tenant.appId).then(setFeedbackStats).catch(() => setFeedbackStats(null));
  }, [tenant?.appId]);

  // The complaints behind one opened row. Failures are kept and shown (they used to be swallowed, so
  // an opened row said "No individual complaints matched" as if there were none). `key` stops a slow
  // answer for a row that has since been closed or replaced from landing on the wrong row.
  function loadRow(row, key) {
    if (!tenant?.appId) return;
    setRowDetail({ key, loading: true, error: null, rows: [] });
    fetchRowComplaints(tenant.appId, level, row)
      .then((rows) => setRowDetail((cur) => (cur.key === key ? { key, loading: false, error: null, rows } : cur)))
      .catch((e) => setRowDetail((cur) => (cur.key === key ? { key, loading: false, error: e?.message || 'could not load', rows: [] } : cur)));
  }

  // Patterns (hotspots, household groups) need only the complaints still open.
  function loadPatterns() {
    if (!tenant?.appId) return;
    setPatternData((cur) => ({ ...cur, loading: true, error: null }));
    fetchOpenComplaintsEnriched(tenant.appId)
      .then((rows) => setPatternData({ loaded: true, loading: false, error: null, rows }))
      .catch((e) => setPatternData((cur) => ({ ...cur, loading: false, error: e?.message || 'could not load' })));
  }
  function togglePatterns() {
    const next = !showPatterns;
    setShowPatterns(next);
    if (next && !patternData.loaded && !patternData.loading) loadPatterns();
  }

  const sortedRowComplaints = [...rowDetail.rows].sort((a, b) => daysPending(b) - daysPending(a));
  const { hotspots, familyPatterns } = detectPatterns(patternData.rows);
  const patternCount = hotspots.length + familyPatterns.length;

  if (tenantLoading) {
    return <><div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>Loading…</div><GrievanceNav /></>;
  }

  // Was completely missing before — any authenticated visitor, including
  // a citizen, could reach this page and its data. Same allowed-roles
  // list as StaffDashboard.jsx, which correctly already has this check.
  if (!tenant || !['representative', 'authority', 'grievance_admin', 'grievance_staff'].includes(tenant.role)) {
    return (
      <>
        <div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>
          This page is for representatives, authorities, or grievance admins.
        </div>
        <GrievanceNav />
      </>
    );
  }

  const total = data.reduce((sum, row) => sum + (row.total || 0), 0);
  const resolved = data.reduce((sum, row) => sum + (row.resolved_count || 0), 0);
  const pending = data.reduce((sum, row) => sum + (row.open_count || 0), 0);
  const escalated = data.reduce((sum, row) => sum + (row.currently_escalated_count || 0), 0);
  // Declined and Sanctioned both count toward Total (it's every
  // complaint, unfiltered) but neither had its own visible number
  // anywhere — Total minus Resolved/Pending/Escalated left an
  // unexplained gap whenever either existed, with nothing on screen
  // to say why. Both fields already existed correctly in the database
  // view; they just weren't being displayed.
  const declined = data.reduce((sum, row) => sum + (row.declined_count || 0), 0);
  const sanctioned = data.reduce((sum, row) => sum + (row.sanctioned_count || 0), 0);
  const urgentOpen = data.reduce((sum, row) => sum + (row.urgent_open_count || 0), 0);
  const levelLabel = LEVELS.find((l) => l.key === level)?.label || '';
  // Total should equal Resolved + Pending + Declined + Sanctioned. If it does not, say so on the
  // report itself rather than print figures that quietly disagree.
  const parts = resolved + pending + declined + sanctioned;
  const reconciles = parts === total;
  const scopeNote = {
    representative: 'This report covers the complaints of your constituency.',
    authority: 'This report covers the complaints assigned to your office.',
    grievance_admin: 'This report covers all complaints of this office.',
    grievance_staff: 'This report covers all complaints of this office.',
  }[tenant.role] || '';
  const reportNotes = [
    scopeNote,
    'Total = Resolved + Pending + Declined + Sanctioned. Resolved, Declined and Sanctioned are the finished outcomes and are never added together as "resolved".',
    'Pending is every complaint not yet finished. Escalated is a part of Pending, not an extra group.',
    'Urgent (still open) counts only Urgent complaints that are not yet finished.',
    'Overdue is counted separately: an open complaint is overdue after 15 days (Normal) or 7 days (Urgent), counted from the date it was filed or last reopened.',
    `Rows are grouped by the place of the problem (${levelLabel.toLowerCase()}). Figures are a snapshot${snapshotAt ? ` as at ${snapshotAt} (IST)` : ''}.`,
    ...(feedbackStats ? ['Citizen feedback: "Confirmed solved" is out of complaints marked Resolved.'] : []),
    ...(!reconciles ? [`CHECK: Resolved + Pending + Declined + Sanctioned = ${parts}, but Total = ${total}. Do not rely on these figures until this is looked into.`] : []),
  ].filter(Boolean);

  return (
    <div className="cr-page" style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>
      <style>{PRINT_CSS}</style>
      <PrintHeader documentTitle={`Complaint Report — ${levelLabel}`} />

      {/* Header */}
      <div className="cr-no-print" style={{ background: '#1a1a2e', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Reports</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Complaint analytics</div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 20px' }}>

        <div className="cr-no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button onClick={() => window.print()} disabled={loading || !!error || data.length === 0}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, fontWeight: 600, color: '#1a1a2e', cursor: 'pointer', fontFamily: 'inherit' }}>
            🖨️ Print
          </button>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total', value: total, color: '#1a1a2e' },
            { label: 'Resolved', value: resolved, color: '#16a34a' },
            { label: 'Pending', value: pending, color: '#f59e0b' },
            { label: 'Escalated', value: escalated, color: '#B91C1C' },
            { label: 'Declined', value: declined, color: '#64748b' },
            { label: 'Sanctioned', value: sanctioned, color: '#A8762C' },
            { label: 'Urgent open', value: urgentOpen, color: '#ea580c' },
            ...(overdueTotal === null ? [] : [{ label: 'Overdue', value: overdueTotal, color: '#B91C1C' }]),
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Citizen feedback -- what citizens say after a complaint is resolved */}
        {feedbackStats && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>CITIZEN FEEDBACK</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#A8762C' }}>
                  {feedbackStats.avgRating === null ? '—' : `${feedbackStats.avgRating.toFixed(1)}/5`}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Average rating ({feedbackStats.ratingCount} {feedbackStats.ratingCount === 1 ? 'rating' : 'ratings'})</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>
                  {feedbackStats.confirmedPct === null ? '—' : `${feedbackStats.confirmedPct}%`}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Confirmed solved by citizen ({feedbackStats.confirmedCount} of {feedbackStats.resolvedCount} resolved)</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#B91C1C' }}>{feedbackStats.reopenedCount}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Reopened by citizen</div>
              </div>
            </div>
          </div>
        )}

        {/* Patterns & Duplicates — real intelligence from data already
            being collected at registration (Ward No., Sachivalayam,
            Father's/Husband's Name) but never used anywhere until now.
            Collapsed by default since this can be a lot of content;
            the count alone tells you if it's worth opening. */}
        <div className="cr-no-print" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
          <button onClick={togglePatterns}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>
              🔥 Patterns {patternData.loaded && patternCount > 0 && <span style={{ color: '#B91C1C' }}>({patternCount})</span>}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>{showPatterns ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showPatterns && (
            <div style={{ padding: '0 16px 16px', display: 'grid', gap: 18 }}>
              {patternData.error && (
                <p style={{ fontSize: 12.5, color: '#B91C1C', margin: 0 }}>
                  The complaint details could not be loaded ({patternData.error}), so patterns cannot be shown.{' '}
                  <button onClick={loadPatterns} style={{ background: 'none', border: 'none', color: '#B91C1C', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5, padding: 0, fontFamily: 'inherit' }}>Try again</button>
                </p>
              )}
              {!patternData.error && patternData.loading && (
                <p style={{ fontSize: 12.5, color: '#64748b', margin: 0 }}>Loading…</p>
              )}
              {!patternData.error && patternData.loaded && !patternData.loading && patternCount === 0 && (
                <p style={{ fontSize: 12.5, color: '#64748b', margin: 0 }}>Nothing detected yet — this fills in as complaints come in.</p>
              )}

              {hotspots.length > 0 && (
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: '#9B3C2E', marginBottom: 8 }}>
                    🔥 Hotspots — same village, same issue, 3 or more complaints still open
                  </p>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {hotspots.map((group, i) => (
                      <div key={i} style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                          {group.length} complaints · {group[0].category} · {group[0].place_village_name || group[0].villages?.name || group[0].place_mandal_name || group[0].mandals?.name || 'Unknown village'}
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
                    👨‍👩‍👧 Family patterns — same household, 2 or more complaints still open
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

            </div>
          )}
        </div>

        {/* Level selector */}
        <div className="cr-no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {LEVELS.map(l => (
            <button
              key={l.key}
              onClick={() => { setLevel(l.key); setExpandedRow(null); }}
              aria-pressed={level === l.key}
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

        {/* Printed table: one plain row per name, with every figure (the card list below is screen only) */}
        {!loading && !error && data.length > 0 && (
          <div className="cr-print-only" style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, margin: '0 0 6px' }}>{levelLabel}</p>
            <table className="cr-print-table">
              <thead>
                <tr>
                  <th>{level === 'category' ? 'Category' : level === 'village' ? 'Village (Mandal)' : level === 'mandal' ? 'Mandal' : 'Constituency'}</th>
                  <th className="n">Total</th><th className="n">Resolved</th><th className="n">Pending</th>
                  <th className="n">Urgent open</th><th className="n">Escalated</th><th className="n">Declined</th><th className="n">Sanctioned</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => {
                  const nm = r.village_name || r.mandal_name || r.category || r.constituency_name || '—';
                  return (
                    <tr key={i}>
                      <td>{nm}{level === 'village' && r.mandal_name ? ` (${r.mandal_name})` : ''}</td>
                      <td className="n">{r.total || 0}</td><td className="n">{r.resolved_count || 0}</td><td className="n">{r.open_count || 0}</td>
                      <td className="n">{r.urgent_open_count || 0}</td><td className="n">{r.currently_escalated_count || 0}</td>
                      <td className="n">{r.declined_count || 0}</td><td className="n">{r.sanctioned_count || 0}</td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 700 }}>
                  <td>All</td><td className="n">{total}</td><td className="n">{resolved}</td><td className="n">{pending}</td>
                  <td className="n">{urgentOpen}</td><td className="n">{escalated}</td><td className="n">{declined}</td><td className="n">{sanctioned}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Data table */}
        <div className="cr-no-print">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 13 }}>Loading...</div>
        ) : error ? (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14, color: '#B91C1C', fontSize: 13 }}>{error}</div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 13 }}>No data yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10, maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
            {data.map((row, i) => {
              const rowName = row.village_name || row.mandal_name || row.category || row.constituency_name || '—';
              const rowKey = `${level}|${rowName}|${row.mandal_name || ''}`;
              const isExpanded = expandedRow === rowKey;
              const rowComplaints = isExpanded && rowDetail.key === rowKey ? sortedRowComplaints : [];
              const rowIsLoading = isExpanded && (rowDetail.key !== rowKey || rowDetail.loading);
              const rowError = isExpanded && rowDetail.key === rowKey ? rowDetail.error : null;
              return (
              <div key={i} style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid #e2e8f0' }}>
                <button onClick={() => { if (isExpanded) { setExpandedRow(null); } else { setExpandedRow(rowKey); loadRow(row, rowKey); } }} aria-expanded={isExpanded} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, cursor: 'pointer', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                      {isExpanded ? '▼' : '▶'} {rowName}
                    </div>
                    {row.mandal_name && level === 'village' && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{row.mandal_name}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e' }}>{row.total || 0}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>total</div>
                  </div>
                </button>

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
                    <span style={{ fontSize: 11, color: '#B91C1C', fontWeight: 600 }}>⬆️ {row.currently_escalated_count} escalated</span>
                  )}
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'grid', gap: 6 }}>
                    {rowError ? (
                      <p style={{ fontSize: 12, color: '#B91C1C', margin: 0 }}>
                        The complaint list could not be loaded ({rowError}).{' '}
                        <button onClick={() => loadRow(row, rowKey)} style={{ background: 'none', border: 'none', color: '#B91C1C', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: 'inherit' }}>Try again</button>
                      </p>
                    ) : rowIsLoading ? (
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Loading the complaints…</p>
                    ) : rowComplaints.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>No individual complaints could be matched to this row.</p>
                    ) : rowComplaints.map((c) => {
                      const sla = slaInfo(c);
                      const days = daysPending(c);
                      const overdue = sla?.status === 'overdue';
                      return (
                        <button key={c.id} onClick={() => setActiveComplaint(c)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8fafc', borderRadius: 6, cursor: 'pointer', width: '100%', textAlign: 'left', border: 'none', fontFamily: 'inherit' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b' }}>{c.title}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {c.citizens?.full_name || '—'}{c.citizens?.phone ? ` · ${c.citizens.phone}` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: overdue ? 700 : 500, color: overdue ? '#B91C1C' : '#64748b' }}>
                              {sla && !sla.closed ? sla.label : `${days}d`}
                            </div>
                            <div style={{ fontSize: 10, color: STAGE_COLORS[c.stage] || '#64748b', fontWeight: 600 }}>{c.stage}</div>
                          </div>
                        </button>
                      );
                    })}
                    {!rowError && !rowIsLoading && rowComplaints.length !== (row.total || 0) && (
                      <p style={{ fontSize: 11, color: '#92400e', margin: '4px 0 0' }}>
                        {rowComplaints.length} of {row.total || 0} complaints listed here — the summary counts and this list were matched differently, so treat the summary figure as the official one.
                      </p>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
        </div>

        <ReportFooter light notes={reportNotes} recordCount={data.length}
          generatedAt={`${fmtIstDateTime(new Date())} IST`} signatures />

        {/* Export button */}
        <button
          className="cr-no-print"
          onClick={() => {
            const csv = [
              ['Name', 'Total', 'Resolved', 'Pending', 'Urgent (still open)', 'Escalated', 'Declined', 'Sanctioned'],
              ...data.map(r => [
                r.village_name || r.mandal_name || r.category || r.constituency_name || '',
                r.total || 0,
                r.resolved_count || 0,
                r.open_count || 0,
                r.urgent_open_count || 0,
                r.currently_escalated_count || 0,
                r.declined_count || 0,
                r.sanctioned_count || 0,
              ])
            ].map(row => row.map(csvCell).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `complaints_report_${level}_${istToday()}.csv`;
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

        <div className="cr-no-print" style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '20px 0 40px' }}>
          <button onClick={() => window.history.back()} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0 }}>
            ← Back
          </button>
          <Link to="/portal/dashboard" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>🏠 Home</Link>
          <button onClick={() => signOutAndRelease()} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0 }}>
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
            if (patternData.loaded) loadPatterns();
            if (expandedRow && rowDetail.key === expandedRow) { const r = data.find((x) => `${level}|${x.village_name || x.mandal_name || x.category || x.constituency_name || '—'}|${x.mandal_name || ''}` === expandedRow); if (r) loadRow(r, expandedRow); }
            fetchOverdueCount().then(setOverdueTotal).catch(() => {});
            fetchFeedbackStats(tenant.appId).then(setFeedbackStats).catch(() => {});
          }}
        />
      )}

      <div className="cr-no-print"><GrievanceNav /></div>
    </div>
  );
}