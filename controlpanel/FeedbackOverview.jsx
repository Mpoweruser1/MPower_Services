// controlpanel/FeedbackOverview.jsx
//
// Unified feedback across every module (School, Hospital, CTS) in one
// place — owner-level, not scoped to any single tenant, matching how
// the rest of the Control Panel already works. Previously each module
// had no way to view its own feedback at all; this is the single
// screen that replaces needing 3 separate near-duplicate viewers.
import React, { useState, useEffect } from 'react';
import { useTenant } from '../context/TenantContext';
import ControlPanelNav from '../shared/ControlPanelNav';
import { fetchAllFeedback } from '../shared/feedbackApi';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 10 },
  stat: { background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' },
  select: { padding: '8px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 12, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
};

const APP_TYPES = {
  school:   { icon: '🏫', label: 'School' },
  hospital: { icon: '🏥', label: 'Hospital' },
  grievance:{ icon: '🏛️', label: 'CTS' },
};

export default function FeedbackOverview() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState('');
  const [filterRating, setFilterRating] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchAllFeedback()
      .then(setFeedback)
      .finally(() => setLoading(false));
  }, []);

  if (tenantLoading) return <div style={S.page}><div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</p></div><ControlPanelNav /></div>;

  if (!tenant || !['developer', 'support'].includes(tenant.role)) {
    return <div style={S.page}><div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Control Panel access only.</p></div><ControlPanelNav /></div>;
  }

  const filtered = feedback.filter((f) => {
    if (filterModule && f.app_type !== filterModule) return false;
    if (filterRating && String(f.rating) !== filterRating) return false;
    return true;
  });

  const ratedCount = feedback.filter((f) => f.rating).length;
  const avgRating = ratedCount > 0
    ? (feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / ratedCount).toFixed(1)
    : null;

  // Per-module breakdown — the whole point of a unified view is
  // seeing at a glance which module is doing well and which isn't,
  // not just a combined average that hides that.
  const byModule = ['school', 'hospital', 'grievance'].map((type) => {
    const rows = feedback.filter((f) => f.app_type === type);
    const rated = rows.filter((f) => f.rating);
    const avg = rated.length > 0 ? (rated.reduce((s, f) => s + f.rating, 0) / rated.length).toFixed(1) : null;
    return { type, count: rows.length, avg };
  });

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Control Panel</p>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px', letterSpacing: -0.5 }}>App Feedback</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>Across every module — School, Hospital, and CTS together</p>

        {/* Overall summary */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ ...S.stat, flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{feedback.length}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)' }}>Total responses</div>
          </div>
          <div style={{ ...S.stat, flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#E8A020' }}>{avgRating ? `${avgRating} ⭐` : '—'}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)' }}>Overall average</div>
          </div>
        </div>

        {/* Per-module breakdown */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {byModule.map((m) => (
            <div key={m.type} style={{ ...S.card, flex: 1, textAlign: 'center', margin: 0 }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{APP_TYPES[m.type].icon}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>{APP_TYPES[m.type].label}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{m.count}</div>
              <div style={{ fontSize: 10.5, color: '#E8A020' }}>{m.avg ? `${m.avg} ⭐` : '—'}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)} style={S.select}>
            <option value="">All modules</option>
            <option value="school">🏫 School</option>
            <option value="hospital">🏥 Hospital</option>
            <option value="grievance">🏛️ CTS</option>
          </select>
          <select value={filterRating} onChange={(e) => setFilterRating(e.target.value)} style={S.select}>
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}⭐</option>)}
          </select>
        </div>

        {/* List */}
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No feedback matches this filter.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filtered.map((f) => (
              <div key={f.id} style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {APP_TYPES[f.app_type]?.icon || '📱'} {f.app_org_name || 'Unknown org'}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)' }}>
                      {f.from_type}{f.from_name ? ` · ${f.from_name}` : ''}{f.from_village ? ` · ${f.from_village}` : ''} · {new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  {f.rating && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#E8A020', flexShrink: 0 }}>
                      {'⭐'.repeat(f.rating)}
                    </div>
                  )}
                </div>
                {f.comments && (
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '6px 0 0' }}>{f.comments}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ControlPanelNav />
    </div>
  );
}
