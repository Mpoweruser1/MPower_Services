// src/pages/grievance/ReportsDashboard.jsx
//
// Village/mandal/constituency/district/state/category rollups, backed by
// the views from migration 9. No charting library dependency — simple CSS
// bar visualizations instead, since I don't know what's already installed
// in your project and didn't want to silently add one.
//
// Available to representative/authority/grievance_admin — RLS on the
// underlying views means each role automatically sees only their own
// scope (a rep sees their constituency's villages; an authority sees
// their whole state), same as every other screen in this module.

import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';
import { fetchReportRollup, logReportView } from './grievanceApi';
import GrievanceNav from './GrievanceNav';

const LEVELS = [
  { key: 'village', label: 'Village' },
  { key: 'mandal', label: 'Mandal' },
  { key: 'constituency', label: 'Constituency' },
  { key: 'district', label: 'District' },
  { key: 'state', label: 'State' },
  { key: 'category', label: 'Category' },
];

const NAME_COLUMN = {
  village: 'village_name',
  mandal: 'mandal_name',
  constituency: 'constituency_name',
  district: 'district_name',
  state: 'state_name',
  category: 'category',
};

export default function ReportsDashboard() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [level, setLevel] = useState('constituency');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('open_count');

  const load = useCallback(() => {
    setLoading(true);
    fetchReportRollup(level)
      .then((data) => {
        setRows(data);
        if (tenant) logReportView({ appId: tenant.appId, generatedByUserId: tenant.userRowId, recordCount: data.length });
      })
      .finally(() => setLoading(false));
  }, [level, tenant]);

  useEffect(() => {
    if (tenant) load();
  }, [tenant, load]);

  if (tenantLoading || !tenant) return <CenteredNote>Loading…</CenteredNote>;
  if (!['representative', 'authority', 'grievance_admin', 'developer', 'support'].includes(tenant.role)) {
    return <CenteredNote>Reports are available to representatives, authorities, and admins.</CenteredNote>;
  }

  const nameCol = NAME_COLUMN[level];
  const sorted = [...rows].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
  const maxValue = Math.max(1, ...sorted.map((r) => r[sortBy] || 0));
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + (r.total || 0),
      open: acc.open + (r.open_count || 0),
      resolved: acc.resolved + (r.resolved_count || 0),
      urgent: acc.urgent + (r.urgent_count || 0),
    }),
    { total: 0, open: 0, resolved: 0, urgent: 0 }
  );

  return (
    // FIX 2: div now properly wraps all content — closing tag moved to end
    <div style={{ background: '#1C1C1E', minHeight: '100vh', fontFamily: "'Inter', sans-serif", color: '#333' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>

        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Grievance Reports</h1>
        <p style={{ fontSize: 12.5, color: '#5B6473', marginBottom: 18 }}>
          {tenant.fullName} — showing only what you're scoped to see.
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          {LEVELS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLevel(l.key)}
              style={{
                fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 20,
                border: `1px solid ${level === l.key ? '#15213A' : '#D9D5C8'}`,
                background: level === l.key ? '#15213A' : '#fff',
                color: level === l.key ? '#fff' : '#3A4250',
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <Stat label="Total" value={totals.total} color="#15213A" />
          <Stat label="Open" value={totals.open} color="#9B3C2E" />
          <Stat label="Resolved" value={totals.resolved} color="#3E5C45" />
          <Stat label="Urgent" value={totals.urgent} color="#A8762C" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#5B6473' }}>
            Sort by:{' '}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ fontSize: 12.5, padding: '4px 6px' }}>
              <option value="open_count">Open count</option>
              <option value="total">Total complaints</option>
              <option value="urgent_count">Urgent count</option>
              <option value="avg_resolution_hours">Avg resolution time</option>
            </select>
          </label>
        </div>

        {loading ? (
          <CenteredNote>Loading…</CenteredNote>
        ) : sorted.length === 0 ? (
          <CenteredNote>No data at this level yet.</CenteredNote>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {sorted.map((row, i) => (
              <RollupRow key={i} row={row} nameCol={nameCol} sortBy={sortBy} maxValue={maxValue} />
            ))}
          </div>
        )}

      </div>
      {/* FIX 1: GrievanceNav moved outside RollupRow — renders once at bottom */}
      <GrievanceNav />
    </div>
  );
}

function RollupRow({ row, nameCol, sortBy, maxValue }) {
  const value = row[sortBy] || 0;
  const widthPct = Math.max(2, (value / maxValue) * 100);
  return (
    <div style={{ border: '1px solid #D9D5C8', borderRadius: 8, padding: '10px 14px', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{row[nameCol] || '—'}</span>
        <span style={{ fontSize: 12, color: '#5B6473' }}>
          {row.total} total · {row.open_count} open
          {row.urgent_count > 0 && <span style={{ color: '#9B3C2E', fontWeight: 700 }}> · {row.urgent_count} urgent</span>}
          {row.avg_resolution_hours != null && <span> · avg {row.avg_resolution_hours}h to resolve</span>}
        </span>
      </div>
      <div style={{ height: 6, background: '#EFEDE6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${widthPct}%`, background: '#15213A', borderRadius: 3 }} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#5B6473', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function CenteredNote({ children }) {
  return <div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>{children}</div>;
}