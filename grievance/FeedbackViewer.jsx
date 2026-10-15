// grievance/FeedbackViewer.jsx
// Admin-only screen to actually read citizen/staff feedback — this
// was write-only from the UI's perspective before; feedback saved
// correctly to app_feedback, but there was no screen anywhere to
// browse it.
// Round 15-10-2026: grievance admin ONLY (developer and support belong to the Control Panel, not to
// a tenant's screens); the "not allowed" page now keeps the menu; sign-out releases the session lock;
// dates are Indian time; and a failed load now says so instead of showing "No feedback yet".
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { signOutAndRelease } from '../lib/signOutAndRelease';
import { fmtIstDate, fmtIstDateTime, istToday } from './istDates';
import PrintHeader from '../shared/PrintHeader';
import ReportFooter from '../shared/ReportFooter';
import { useTenant } from '../context/TenantContext';
import { fetchFeedback } from '../shared/feedbackApi';
import GrievanceNav from './GrievanceNav';

const CONTEXT_LABELS = {
  citizen_portal: 'Citizen Portal',
  staff_dashboard: 'Staff Dashboard',
};

// One CSV cell: quoted when it holds a comma, quote or line break, and a leading = + - @ is
// defused so a spreadsheet can't read a comment as a formula.
function csvCell(value) {
  let v = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const PRINT_CSS = `
  .fv-print-only { display: none; }
  @media print {
    .fv-print-only { display: block !important; }
    .fv-no-print { display: none !important; }
    body, .fv-page { background: #fff !important; }
    .fv-page { padding-bottom: 0 !important; }
    .fv-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .fv-table th, .fv-table td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; text-align: left; }
    .fv-table th { background: #eee !important; }
    .fv-table tr { page-break-inside: avoid; }
    .fv-table thead { display: table-header-group; }
  }
`;

export default function FeedbackViewer() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [ratingFilter, setRatingFilter] = useState('');

  useEffect(() => {
    if (!tenant?.appId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchFeedback(tenant.appId)
      .then((rows) => { if (!cancelled) setFeedback(rows || []); })
      .catch((e) => { if (!cancelled) setLoadError(e?.message || 'could not load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenant?.appId, reloadKey]);

  if (tenantLoading) return <><CenteredNote>Loading…</CenteredNote><GrievanceNav /></>;

  if (!tenant || tenant.role !== 'grievance_admin') {
    return <><CenteredNote>This page is for grievance admins only.</CenteredNote><GrievanceNav /></>;
  }

  const filtered = ratingFilter
    ? feedback.filter((f) => String(f.rating) === ratingFilter)
    : feedback;

  const ratedCount = feedback.filter((f) => f.rating).length;
  const avgRating = ratedCount > 0
    ? (feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / ratedCount).toFixed(1)
    : null;

  function exportCsv() {
    const csv = [
      ['Date', 'From', 'Role', 'Screen', 'Rating', 'Comments'],
      ...filtered.map((f) => [fmtIstDate(f.created_at), f.from_name || '', f.from_type || '', CONTEXT_LABELS[f.context] || f.context || '', f.rating || '', f.comments || '']),
    ].map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `app_feedback_${ratingFilter ? `${ratingFilter}star_` : ''}${istToday()}.csv`;
    a.click();
  }
  const canExport = !loading && !loadError && filtered.length > 0;
  const footerNotes = [
    ratingFilter ? `Only responses rated ${ratingFilter} star${ratingFilter === '1' ? '' : 's'} are listed.` : 'All responses are listed.',
    'The average rating counts only responses that have a rating; responses without a rating are left out of it.',
    `Average rating of all responses: ${avgRating ? `${avgRating} out of 5 (${ratedCount} rated of ${feedback.length})` : 'no ratings yet'}.`,
  ];

  return (
    <div className="fv-page" style={{ background: '#f0f4f8', minHeight: '100vh', fontFamily: "'Inter', sans-serif", paddingBottom: 80 }}>
      <style>{PRINT_CSS}</style>
      <PrintHeader documentTitle="App Feedback" />
      <div className="fv-no-print" style={{ background: '#1a1a2e', padding: '14px 20px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>App Feedback</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>What citizens and staff are saying about the app itself</div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 20px' }}>
        <div className="fv-no-print" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 10 }}>
          <button onClick={() => window.print()} disabled={!canExport}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, fontWeight: 600, color: '#1a1a2e', cursor: canExport ? 'pointer' : 'default', opacity: canExport ? 1 : 0.5, fontFamily: 'inherit' }}>🖨️ Print</button>
          <button onClick={exportCsv} disabled={!canExport}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, fontWeight: 600, color: '#1a1a2e', cursor: canExport ? 'pointer' : 'default', opacity: canExport ? 1 : 0.5, fontFamily: 'inherit' }}>📥 Export as CSV</button>
        </div>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, background: '#fff', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>{feedback.length}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Total responses</div>
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#E8A020' }}>{avgRating ? `${avgRating} ⭐` : '—'}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Average rating</div>
          </div>
        </div>

        {/* Rating filter */}
        <div className="fv-no-print" style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={() => setRatingFilter('')}
            style={{ padding: '6px 12px', borderRadius: 16, border: ratingFilter === '' ? 'none' : '1px solid #e2e8f0', background: ratingFilter === '' ? '#1a1a2e' : '#fff', color: ratingFilter === '' ? '#fff' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            All
          </button>
          {[5, 4, 3, 2, 1].map((n) => (
            <button key={n} onClick={() => setRatingFilter(String(n))}
              style={{ padding: '6px 12px', borderRadius: 16, border: ratingFilter === String(n) ? 'none' : '1px solid #e2e8f0', background: ratingFilter === String(n) ? '#1a1a2e' : '#fff', color: ratingFilter === String(n) ? '#fff' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {n}⭐
            </button>
          ))}
        </div>

        {/* List */}
        {canExport && (
          <div className="fv-print-only">
            <table className="fv-table">
              <thead><tr><th>Date</th><th>From</th><th>Role</th><th>Screen</th><th>Rating</th><th>Comments</th></tr></thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id}>
                    <td>{fmtIstDate(f.created_at)}</td><td>{f.from_name || ''}</td><td>{f.from_type || ''}</td>
                    <td>{CONTEXT_LABELS[f.context] || f.context || ''}</td><td>{f.rating ? `${f.rating}/5` : '—'}</td><td>{f.comments || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="fv-no-print">
        {loading ? (
          <CenteredNote>Loading feedback…</CenteredNote>
        ) : loadError ? (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14, color: '#B91C1C', fontSize: 13 }}>
            Feedback could not be loaded ({loadError}).{' '}
            <button onClick={() => setReloadKey((k) => k + 1)} style={{ background: 'none', border: 'none', color: '#B91C1C', textDecoration: 'underline', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit' }}>Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <CenteredNote>No feedback yet.</CenteredNote>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filtered.map((f) => (
              <div key={f.id} style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                      {f.from_name || f.from_type}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
                      {f.from_type} · {CONTEXT_LABELS[f.context] || f.context || 'Unknown screen'} · {fmtIstDate(f.created_at)}
                    </div>
                  </div>
                  {f.rating && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#E8A020', flexShrink: 0 }}>
                      {'⭐'.repeat(f.rating)}
                    </div>
                  )}
                </div>
                {f.comments && (
                  <p style={{ fontSize: 13, color: '#374151', margin: '6px 0 0' }}>{f.comments}</p>
                )}
              </div>
            ))}
          </div>
        )}
        </div>

        {canExport && <ReportFooter light notes={footerNotes} recordCount={filtered.length} generatedAt={`${fmtIstDateTime(new Date())} IST`} />}

        <div className="fv-no-print" style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '20px 0 40px' }}>
          <button onClick={() => window.history.back()} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0 }}>
            ← Back
          </button>
          <Link to="/portal/dashboard" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>🏠 Home</Link>
          <button onClick={() => signOutAndRelease()} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0 }}>
            Sign out
          </button>
        </div>
      </div>

      <div className="fv-no-print"><GrievanceNav /></div>
    </div>
  );
}

function CenteredNote({ children }) {
  return <div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>{children}</div>;
}
