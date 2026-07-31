// grievance/ReportsDashboard.jsx
import { useState, useEffect } from 'react';
import { useTenant } from '../context/TenantContext';
import { fetchReportRollup } from './grievanceApi';
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

export default function ReportsDashboard() {
  const { tenant } = useTenant();
  const [level, setLevel] = useState('category');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchReportRollup(level)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [level]);

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

        {/* Level selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {LEVELS.map(l => (
            <button
              key={l.key}
              onClick={() => setLevel(l.key)}
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
          <div style={{ display: 'grid', gap: 10 }}>
            {data.map((row, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 10, padding: 14, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                      {row.village_name || row.mandal_name || row.category || row.constituency_name || '—'}
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
                  {row.urgent_count > 0 && (
                    <span style={{ fontSize: 11, color: '#ea580c', fontWeight: 600 }}>🚨 {row.urgent_count} urgent</span>
                  )}
                  {row.currently_escalated_count > 0 && (
                    <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>⬆️ {row.currently_escalated_count} escalated</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Export button */}
        <button
          onClick={() => {
            const csv = [
              ['Name', 'Total', 'Resolved', 'Pending', 'Urgent', 'Escalated'],
              ...data.map(r => [
                r.village_name || r.mandal_name || r.category || r.constituency_name || '',
                r.total || 0,
                r.resolved_count || 0,
                r.open_count || 0,
                r.urgent_count || 0,
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

      </div>

      <GrievanceNav />
    </div>
  );
}