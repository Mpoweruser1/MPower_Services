// grievance/FeedbackViewer.jsx
// Admin-only screen to actually read citizen/staff feedback — this
// was write-only from the UI's perspective before; feedback saved
// correctly to app_feedback, but there was no screen anywhere to
// browse it.
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { fetchFeedback } from '../shared/feedbackApi';
import GrievanceNav from './GrievanceNav';

const CONTEXT_LABELS = {
  citizen_portal: 'Citizen Portal',
  staff_dashboard: 'Staff Dashboard',
};

export default function FeedbackViewer() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState('');

  useEffect(() => {
    if (!tenant?.appId) return;
    setLoading(true);
    fetchFeedback(tenant.appId)
      .then(setFeedback)
      .finally(() => setLoading(false));
  }, [tenant?.appId]);

  if (tenantLoading) return <CenteredNote>Loading…</CenteredNote>;

  if (!tenant || !['grievance_admin', 'developer', 'support'].includes(tenant.role)) {
    return <CenteredNote>This page is for grievance admins only.</CenteredNote>;
  }

  const filtered = ratingFilter
    ? feedback.filter((f) => String(f.rating) === ratingFilter)
    : feedback;

  const ratedCount = feedback.filter((f) => f.rating).length;
  const avgRating = ratedCount > 0
    ? (feedback.reduce((sum, f) => sum + (f.rating || 0), 0) / ratedCount).toFixed(1)
    : null;

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100vh', fontFamily: "'Inter', sans-serif", paddingBottom: 80 }}>
      <div style={{ background: '#1a1a2e', padding: '14px 20px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>App Feedback</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>What citizens and staff are saying about the app itself</div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 20px' }}>
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
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
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
        {loading ? (
          <CenteredNote>Loading feedback…</CenteredNote>
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
                      {f.from_type} · {CONTEXT_LABELS[f.context] || f.context || 'Unknown screen'} · {new Date(f.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
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

function CenteredNote({ children }) {
  return <div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>{children}</div>;
}
