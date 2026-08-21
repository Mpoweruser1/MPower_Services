// grievance/FeedbackDashboard.jsx
// Admin screen — read app feedback (about the app itself, not a specific
// complaint). Scoped to this app for a grievance_admin; cross-app for
// developer/support (MPower's own Control Panel isn't tied to one tenant).
import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { fetchFeedback, fetchAllFeedback } from '../shared/feedbackApi';
import GrievanceNav from './GrievanceNav';

const RATING_TABS = [
  { key: 'all',      label: 'All' },
  { key: 'positive',  label: '⭐ 4–5' },
  { key: 'negative',  label: '⭐ 1–3' },
  { key: 'unrated',   label: 'No rating' },
];

function matchesTab(entry, tab) {
  if (tab === 'all') return true;
  if (tab === 'unrated') return !entry.rating;
  if (tab === 'positive') return entry.rating >= 4;
  if (tab === 'negative') return entry.rating >= 1 && entry.rating <= 3;
  return true;
}

function Stars({ rating }) {
  if (!rating) return <span style={{ fontSize: 12, color: '#94a3b8' }}>No rating given</span>;
  return (
    <span style={{ fontSize: 14, letterSpacing: 1 }}>
      {'⭐'.repeat(rating)}
      <span style={{ opacity: 0.2 }}>{'⭐'.repeat(5 - rating)}</span>
    </span>
  );
}

export default function FeedbackDashboard() {
  const { stateSlug } = useParams();
  const { tenant, loading: tenantLoading } = useTenant();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');

  // developer/support are MPower's own owner-level roles (see Control
  // Panel access rules in App.jsx) — they see feedback across every
  // tenant app, not just one. A grievance_admin only ever sees their
  // own app's feedback, same scoping as everywhere else in this module.
  const isOwnerLevel = tenant?.role === 'developer' || tenant?.role === 'support';

  useEffect(() => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    const load = isOwnerLevel ? fetchAllFeedback() : fetchFeedback(tenant.appId);
    load
      .then(setEntries)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tenant, isOwnerLevel]);

  const filtered = useMemo(() => entries.filter((e) => matchesTab(e, tab)), [entries, tab]);

  const stats = useMemo(() => {
    const rated = entries.filter((e) => e.rating);
    const avg = rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : null;
    return { total: entries.length, avg, rated: rated.length };
  }, [entries]);

  if (tenantLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>Loading…</div>;
  }

  if (!tenant || !['grievance_admin', 'developer', 'support'].includes(tenant.role)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontFamily: 'Inter, sans-serif' }}>
        Access restricted to grievance admins only.
      </div>
    );
  }

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>App Feedback</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          {isOwnerLevel ? 'Across all MPower apps' : 'For this app'}
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 20px' }}>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
          <SummaryCard label="Total entries" value={stats.total} />
          <SummaryCard label="Average rating" value={stats.avg ? stats.avg.toFixed(1) : '—'} />
          <SummaryCard label="Rated" value={stats.rated} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {RATING_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '9px 8px', borderRadius: 8,
                border: `2px solid ${tab === t.key ? '#1a1a2e' : '#e2e8f0'}`,
                background: tab === t.key ? '#1a1a2e' : '#fff',
                color: tab === t.key ? '#e8a020' : '#64748b',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Entries */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#dc2626', fontSize: 13 }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
            No feedback in this category yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filtered.map((entry) => (
              <div key={entry.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <Stars rating={entry.rating} />
                  <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>
                    {new Date(entry.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>

                {entry.comments && (
                  <p style={{ fontSize: 13.5, color: '#1e293b', margin: '0 0 10px', lineHeight: 1.5 }}>{entry.comments}</p>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <Tag>{entry.from_type}{entry.from_name ? ` · ${entry.from_name}` : ''}{entry.from_village ? ` · ${entry.from_village}` : ''}</Tag>
                  {entry.context && <Tag>{entry.context}</Tag>}
                  {isOwnerLevel && entry.app_org_name && (
                    <Tag accent>{entry.app_org_name}{entry.app_type ? ` (${entry.app_type})` : ''}</Tag>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '20px 0 40px' }}>
          <button onClick={() => window.history.back()} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0 }}>
            ← Back
          </button>
          <a href={`/grievance/${stateSlug || 'andhra-pradesh'}/admin`} style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>
            Verification queue
          </a>
          <a href="/portal/dashboard" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>🏠 Home</a>
        </div>
      </div>

      <GrievanceNav />
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Tag({ children, accent }) {
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
      background: accent ? '#e8a02020' : '#f8fafc',
      color: accent ? '#a8762c' : '#64748b',
      border: `1px solid ${accent ? '#e8a02040' : '#e2e8f0'}`,
    }}>
      {children}
    </span>
  );
}
