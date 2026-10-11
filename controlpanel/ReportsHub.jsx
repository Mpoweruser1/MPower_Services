// controlpanel/ReportsHub.jsx — Reports, phases 1-3 (finance, clients and plans, MRR and churn). Developer only.
// Every number comes from the database functions in fix_reporting_finance.sql
// (report_finance, report_invoice_list, report_outstanding, report_renewals),
// so the screen, the drill-down and the CSV files always agree.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import ControlPanelNav from '../shared/ControlPanelNav';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 960, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  select: { padding: '8px 10px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 12, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
  input: { padding: '7px 10px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 12, color: '#fff', outline: 'none', fontFamily: 'inherit', colorScheme: 'dark' },
  label: { fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 4px' },
  th: { textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 500, padding: '6px 8px', letterSpacing: 0.5, textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' },
  td: { fontSize: 12, padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' },
};
// Categorical slots 1 and 2 of the validated dark palette (blue, orange).
const BILLED = '#3987e5';
const COLLECTED = '#d95926';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Date presets. Financial year runs April to March.
function presetRange(key) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const fyStart = m >= 3 ? y : y - 1;
  switch (key) {
    case 'this_month': return [ymd(new Date(y, m, 1)), ymd(new Date(y, m + 1, 0))];
    case 'last_month': return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
    case 'this_quarter': { const qs = m - ((m + 9) % 12) % 3; const q0 = new Date(y, qs, 1); return [ymd(q0), ymd(new Date(q0.getFullYear(), q0.getMonth() + 3, 0))]; }
    case 'this_fy': return [`${fyStart}-04-01`, `${fyStart + 1}-03-31`];
    case 'last_fy': return [`${fyStart - 1}-04-01`, `${fyStart}-03-31`];
    case 'last_12': return [ymd(new Date(y, m - 11, 1)), ymd(new Date(y, m + 1, 0))];
    default: return null;
  }
}
const PRESETS = [
  ['this_month', 'This month'], ['last_month', 'Last month'], ['this_quarter', 'This quarter'],
  ['this_fy', 'This financial year'], ['last_fy', 'Last financial year'], ['last_12', 'Last 12 months'], ['custom', 'Custom dates'],
];
const GROUPS = [
  ['month', 'Month'], ['quarter', 'Quarter (FY)'], ['fy', 'Financial year'], ['module', 'Module'], ['plan', 'Plan'],
  ['period', 'Billing period'], ['district', 'District'], ['payment_mode', 'Payment mode'], ['status', 'Payment status'], ['client', 'Client'],
];
const TIME_GROUPS = ['month', 'quarter', 'fy'];
const TABS = [['revenue', 'Revenue'], ['ageing', 'Collections & ageing'], ['gst', 'GST summary'], ['renewals', 'Renewals & trials'],
  ['clients', 'Clients & plans'], ['trials', 'Trial funnel'], ['changes', 'Plan changes'], ['mrr', 'MRR & churn']];
const CGROUPS = [['plan', 'Plan'], ['module', 'Module'], ['status', 'Client status'], ['district', 'District'], ['manager', 'Account manager'], ['period', 'Billing period'], ['registered_month', 'Registration month']];

function csvDownload(filename, columns, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))].join('\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#111113', borderRadius: 10, padding: '12px 10px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
      <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: color || '#fff' }}>{value}</p>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{label}</p>
    </div>
  );
}

function Table({ columns, rows, onRowClick, activeKey, rowKey, totals }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{columns.map((c) => <th key={c.label} style={{ ...S.th, textAlign: c.num ? 'right' : 'left' }}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const k = rowKey ? rowKey(r) : i;
            return (
              <tr key={k} onClick={onRowClick ? () => onRowClick(r) : undefined}
                style={{ cursor: onRowClick ? 'pointer' : 'default', background: activeKey != null && activeKey === k ? 'rgba(90,154,223,0.12)' : 'transparent' }}>
                {columns.map((c) => <td key={c.label} style={{ ...S.td, textAlign: c.num ? 'right' : 'left', color: c.color ? c.color(r) : S.td.color }}>{c.show ? c.show(r) : c.value(r)}</td>)}
              </tr>
            );
          })}
          {totals && (
            <tr>{columns.map((c, idx) => <td key={c.label} style={{ ...S.td, textAlign: c.num ? 'right' : 'left', fontWeight: 700, color: '#fff', borderTop: '1px solid rgba(255,255,255,0.15)' }}>{idx === 0 ? 'Total' : (totals[c.label] ?? '')}</td>)}</tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Paired bars: billed vs collected. Bars start at zero, 2px gap, hover shows the exact numbers;
// the table below is the text view of the same data.
function PairedBars({ rows }) {
  const [hover, setHover] = useState(null);
  const data = rows.slice(0, 24);
  const max = Math.max(1, ...data.flatMap((r) => [Number(r.total), Number(r.collected)]));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: BILLED, marginRight: 6 }} />Billed</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: COLLECTED, marginRight: 6 }} />Collected</span>
        <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.35)' }}>Scale up to {inr(max)}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div role="img" aria-label="Billed and collected amounts by group; the table below has the same figures"
          style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150, borderBottom: '1px solid rgba(255,255,255,0.15)', overflowX: 'auto' }}>
          {data.map((r) => (
            <div key={r.bucket} onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(r)} tabIndex={0}
              style={{ flex: '1 0 28px', maxWidth: 70, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, cursor: 'default', outline: 'none', background: hover?.bucket === r.bucket ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
              <div style={{ width: '40%', height: `${(Number(r.total) / max) * 100}%`, minHeight: Number(r.total) > 0 ? 2 : 0, background: BILLED, borderRadius: '3px 3px 0 0' }} />
              <div style={{ width: '40%', height: `${(Number(r.collected) / max) * 100}%`, minHeight: Number(r.collected) > 0 ? 2 : 0, background: COLLECTED, borderRadius: '3px 3px 0 0' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {data.map((r) => (
            <p key={r.bucket} style={{ flex: '1 0 28px', maxWidth: 70, margin: '4px 0 0', fontSize: 9, color: 'rgba(255,255,255,0.4)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.bucket}>{r.bucket}</p>
          ))}
        </div>
        {hover && (
          <div style={{ position: 'absolute', top: 0, right: 0, background: '#0d0d0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#fff', pointerEvents: 'none' }}>
            <strong>{hover.bucket}</strong><br />
            Billed {inr(hover.total)} · Collected {inr(hover.collected)}<br />
            Outstanding {inr(hover.outstanding)} · {hover.invoices} invoice{hover.invoices === 1 ? '' : 's'}
          </div>
        )}
      </div>
      {rows.length > 24 && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '6px 0 0' }}>Chart shows the first 24 groups; the table has all {rows.length}.</p>}
    </div>
  );
}

// Closing MRR per month: one series, so no legend box; the title names it. Bars start at zero.
function MrrBars({ rows }) {
  const [hover, setHover] = useState(null);
  const data = rows.slice(-24);
  const max = Math.max(1, ...data.map((r) => Number(r.closing)));
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: BILLED, marginRight: 6 }} />Closing MRR by month · scale up to {inr(max)}
      </p>
      <div style={{ position: 'relative' }}>
        <div role="img" aria-label="Closing MRR by month; the table below has the same figures"
          style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 130, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          {data.map((r) => (
            <div key={r.bucket} onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(r)} tabIndex={0}
              style={{ flex: '1 0 28px', maxWidth: 70, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', outline: 'none', background: hover?.bucket === r.bucket ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
              <div style={{ width: '55%', height: `${(Number(r.closing) / max) * 100}%`, minHeight: Number(r.closing) > 0 ? 2 : 0, background: BILLED, borderRadius: '3px 3px 0 0' }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {data.map((r) => <p key={r.bucket} style={{ flex: '1 0 28px', maxWidth: 70, margin: '4px 0 0', fontSize: 9, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>{r.bucket}</p>)}
        </div>
        {hover && (
          <div style={{ position: 'absolute', top: 0, right: 0, background: '#0d0d0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#fff', pointerEvents: 'none' }}>
            <strong>{hover.bucket}</strong><br />Closing MRR {inr(hover.closing)}<br />{hover.clients_close} paying client{hover.clients_close === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportsHub() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [tab, setTab] = useState('revenue');
  const [f, setF] = useState(() => {
    const [from, to] = presetRange('this_fy');
    return { preset: 'this_fy', from, to, basis: 'billed', group: 'month', module: '', tier: '', status: '', period: '', district: '', includeTest: false };
  });
  const [districts, setDistricts] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drill, setDrill] = useState(null);       // { bucket, rows }
  const [days, setDays] = useState(30);
  const [ageModule, setAgeModule] = useState('');
  const [cGroup, setCGroup] = useState('plan');
  const [cStatus, setCStatus] = useState('');
  const [mrrExtra, setMrrExtra] = useState({ churn: [], hist: [] });

  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  function setPreset(key) {
    if (key === 'custom') { set({ preset: key }); return; }
    const [from, to] = presetRange(key);
    set({ preset: key, from, to });
  }

  // Takes today's MRR snapshot (one row per client) once per visit; safe to repeat.
  useEffect(() => { if (tenant?.role === 'developer') supabase.rpc('take_mrr_snapshot').then(() => {}, () => {}); }, [tenant?.role]);

  useEffect(() => {
    supabase.from('crm_clients').select('district').not('district', 'is', null).then(({ data }) => {
      setDistricts([...new Set((data || []).map((r) => r.district).filter(Boolean))].sort());
    });
  }, []);

  const filterArgs = useCallback((group) => ({
    p_from: f.from, p_to: f.to, p_group: group, p_basis: f.basis,
    p_module: f.module || null, p_tier: f.tier || null, p_status: f.status || null,
    p_period: f.period ? Number(f.period) : null, p_district: f.district || null, p_include_test: f.includeTest,
  }), [f]);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setDrill(null);
    let res;
    if (tab === 'revenue') res = await supabase.rpc('report_finance', filterArgs(f.group));
    else if (tab === 'gst') res = await supabase.rpc('report_finance', { ...filterArgs(TIME_GROUPS.includes(f.group) ? f.group : 'month'), p_basis: 'billed' });
    else if (tab === 'ageing') res = await supabase.rpc('report_outstanding', { p_include_test: f.includeTest, p_module: ageModule || null });
    else if (tab === 'clients') res = await supabase.rpc('report_clients', { p_group: cGroup, p_module: f.module || null, p_tier: f.tier || null, p_status: cStatus || null, p_period: f.period ? Number(f.period) : null, p_district: f.district || null, p_include_test: f.includeTest });
    else if (tab === 'trials') res = await supabase.rpc('report_trials', { p_from: f.from, p_to: f.to, p_include_test: f.includeTest });
    else if (tab === 'mrr') {
      const a = { p_from: f.from, p_to: f.to, p_include_test: f.includeTest };
      const [mv, ch, hi] = await Promise.all([
        supabase.rpc('report_mrr_movement', a),
        supabase.rpc('report_churn', a),
        supabase.rpc('report_mrr_history', { ...a, p_group: 'module' }),
      ]);
      res = mv;
      if (!mv.error) setMrrExtra({ churn: ch.data || [], hist: hi.data || [] });
    }
    else if (tab === 'changes') res = await supabase.rpc('report_plan_changes', { p_from: f.from, p_to: f.to, p_include_test: f.includeTest });
    else res = await supabase.rpc('report_renewals', { p_days: days, p_include_test: f.includeTest });
    setLoading(false);
    if (res.error) { setError(res.error.message || 'The report could not be loaded.'); setRows([]); return; }
    setRows(res.data || []);
  }, [tab, f, days, ageModule, cGroup, cStatus, filterArgs]);

  useEffect(() => { if (tenant?.role === 'developer') load(); }, [load, tenant?.role]);

  async function openClientDrill(r) {
    if (drill?.bucket === r.bucket) { setDrill(null); return; }
    const { data, error: e } = await supabase.rpc('report_client_list', { p_group: cGroup, p_module: f.module || null, p_tier: f.tier || null, p_status: cStatus || null, p_period: f.period ? Number(f.period) : null, p_district: f.district || null, p_include_test: f.includeTest, p_bucket: r.bucket, p_limit: 1000 });
    if (e) { setError(e.message); return; }
    setDrill({ kind: 'clients', bucket: r.bucket, rows: data || [] });
  }
  async function openDrill(r) {
    if (drill?.bucket === r.bucket) { setDrill(null); return; }
    const group = tab === 'gst' ? (TIME_GROUPS.includes(f.group) ? f.group : 'month') : f.group;
    const { data, error: e } = await supabase.rpc('report_invoice_list', { ...filterArgs(group), p_bucket: r.bucket, p_limit: 2000 });
    if (e) { setError(e.message); return; }
    setDrill({ kind: 'invoices', bucket: r.bucket, rows: data || [] });
  }

  const sum = (key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  const revenueCols = useMemo(() => [
    { label: GROUPS.find((g) => g[0] === f.group)?.[1] || 'Group', value: (r) => r.bucket },
    { label: 'Invoices', num: true, value: (r) => r.invoices },
    { label: 'Before GST', num: true, value: (r) => r.base, show: (r) => inr(r.base) },
    { label: 'GST', num: true, value: (r) => r.gst, show: (r) => inr(r.gst) },
    { label: 'Billed', num: true, value: (r) => r.total, show: (r) => inr(r.total) },
    { label: 'Collected', num: true, value: (r) => r.collected, show: (r) => inr(r.collected), color: () => '#6AAA90' },
    { label: 'Outstanding', num: true, value: (r) => r.outstanding, show: (r) => inr(r.outstanding) },
    { label: 'Overdue', num: true, value: (r) => r.overdue, show: (r) => inr(r.overdue), color: (r) => (Number(r.overdue) > 0 ? '#E05A5A' : undefined) },
    { label: 'Advance discount*', num: true, value: (r) => r.discount, show: (r) => inr(r.discount) },
  ], [f.group]);
  const invoiceCols = [
    { label: 'Invoice', value: (r) => r.invoice_no },
    { label: 'Client', value: (r) => r.org_name },
    { label: 'Module', value: (r) => r.module },
    { label: 'Plan', value: (r) => r.tier },
    { label: 'Month', value: (r) => r.inv_month },
    { label: 'Months covered', num: true, value: (r) => r.period_months },
    { label: 'Before GST', num: true, value: (r) => r.base, show: (r) => inr(r.base) },
    { label: 'GST', num: true, value: (r) => r.gst, show: (r) => inr(r.gst) },
    { label: 'Total', num: true, value: (r) => r.total, show: (r) => inr(r.total) },
    { label: 'Status', value: (r) => r.status },
    { label: 'Due', value: (r) => r.due_date },
    { label: 'Paid on', value: (r) => r.paid_date || '' },
    { label: 'Mode', value: (r) => r.payment_mode || '' },
  ];
  const gstCols = [
    { label: 'Period', value: (r) => r.bucket },
    { label: 'Invoices', num: true, value: (r) => r.invoices },
    { label: 'Taxable value', num: true, value: (r) => r.base, show: (r) => inr(r.base) },
    { label: 'GST', num: true, value: (r) => r.gst, show: (r) => inr(r.gst) },
    { label: 'Invoice total', num: true, value: (r) => r.total, show: (r) => inr(r.total) },
  ];
  const ageCols = [
    { label: 'Client', value: (r) => r.org_name },
    { label: 'Invoice', value: (r) => r.invoice_no },
    { label: 'Module', value: (r) => r.module },
    { label: 'Plan', value: (r) => r.tier },
    { label: 'Amount', num: true, value: (r) => r.total, show: (r) => inr(r.total) },
    { label: 'Due', value: (r) => r.due_date },
    { label: 'Days overdue', num: true, value: (r) => Math.max(r.days_overdue, 0), color: (r) => (r.days_overdue > 30 ? '#E05A5A' : r.days_overdue > 0 ? '#E8A020' : undefined) },
    { label: 'Age', value: (r) => r.bucket },
    { label: 'Phone', value: (r) => r.phone || '' },
  ];
  const renewCols = [
    { label: 'Client', value: (r) => r.org_name },
    { label: 'Module', value: (r) => r.module },
    { label: 'Plan', value: (r) => r.tier },
    { label: 'What', value: (r) => r.kind },
    { label: 'Date', value: (r) => r.on_date },
    { label: 'Days left', num: true, value: (r) => r.days_left },
    { label: 'Billing', value: (r) => (r.period_months === 6 ? '6 months' : r.period_months === 12 ? '12 months' : 'Monthly') },
    { label: 'Expected (before GST)', num: true, value: (r) => r.expected_base, show: (r) => inr(r.expected_base) },
    { label: 'Phone', value: (r) => r.phone || '' },
  ];

  const clientCols = [
    { label: CGROUPS.find((g) => g[0] === cGroup)?.[1] || 'Group', value: (r) => r.bucket },
    { label: 'Clients', num: true, value: (r) => r.clients },
    { label: 'Active', num: true, value: (r) => r.active, color: () => '#6AAA90' },
    { label: 'Trial', num: true, value: (r) => r.trial, color: () => '#E8A020' },
    { label: 'Suspended', num: true, value: (r) => r.suspended },
    { label: 'Churned', num: true, value: (r) => r.churned },
    { label: 'MRR (before GST)', num: true, value: (r) => r.mrr, show: (r) => inr(r.mrr) },
  ];
  const clientListCols = [
    { label: 'Client', value: (r) => r.org_name },
    { label: 'Module', value: (r) => r.module },
    { label: 'Plan', value: (r) => r.tier },
    { label: 'Status', value: (r) => r.status },
    { label: 'Billing', value: (r) => (r.period_months === 6 ? '6 months' : r.period_months === 12 ? '12 months' : 'Monthly') },
    { label: 'District', value: (r) => r.district || '' },
    { label: 'Manager', value: (r) => r.manager || '' },
    { label: 'Registered', value: (r) => r.registered || '' },
    { label: 'Trial ends', value: (r) => r.trial_ends || '' },
    { label: 'Renewal', value: (r) => r.renewal || '' },
    { label: 'MRR', num: true, value: (r) => r.mrr, show: (r) => inr(r.mrr) },
  ];
  const trialCols = [
    { label: 'Registered in', value: (r) => r.bucket },
    { label: 'Started', num: true, value: (r) => r.started },
    { label: 'Converted (Active now)', num: true, value: (r) => r.converted, color: () => '#6AAA90' },
    { label: 'Conversion', num: true, value: (r) => (Number(r.started) ? Math.round((Number(r.converted) / Number(r.started)) * 100) + '%' : '—') },
    { label: 'Still in trial', num: true, value: (r) => r.in_trial, color: () => '#E8A020' },
    { label: 'Trial lapsed', num: true, value: (r) => r.lapsed, color: (r) => (Number(r.lapsed) > 0 ? '#E05A5A' : undefined) },
    { label: 'Suspended / churned', num: true, value: (r) => r.ended },
  ];
  const changeCols = [
    { label: 'Date', value: (r) => new Date(r.changed_at).toLocaleDateString('en-IN') },
    { label: 'Client', value: (r) => r.org_name },
    { label: 'Module', value: (r) => r.module },
    { label: 'Change', value: (r) => r.direction, color: (r) => (r.direction === 'Upgrade' ? '#6AAA90' : r.direction === 'Downgrade' ? '#E05A5A' : undefined) },
    { label: 'From', value: (r) => `${r.old_tier || '—'} · ${r.old_months === 6 ? '6 mo' : r.old_months === 12 ? '12 mo' : 'monthly'}` },
    { label: 'To', value: (r) => `${r.new_tier} · ${r.new_months === 6 ? '6 mo' : r.new_months === 12 ? '12 mo' : 'monthly'}` },
    { label: 'Invoice', num: true, value: (r) => r.invoice_total || '', show: (r) => (r.invoice_total ? inr(r.invoice_total) : '—') },
    { label: 'Note', value: (r) => r.note || '' },
  ];

  const mvCols = [
    { label: 'Month', value: (r) => r.bucket },
    { label: 'Opening MRR', num: true, value: (r) => (r.has_opening ? r.opening : ''), show: (r) => (r.has_opening ? inr(r.opening) : 'History starts here') },
    { label: 'New', num: true, value: (r) => r.new_mrr ?? '', show: (r) => (r.has_opening ? inr(r.new_mrr) : '—'), color: () => '#6AAA90' },
    { label: 'Expansion', num: true, value: (r) => r.expansion ?? '', show: (r) => (r.has_opening ? inr(r.expansion) : '—'), color: () => '#6AAA90' },
    { label: 'Contraction', num: true, value: (r) => r.contraction ?? '', show: (r) => (r.has_opening ? inr(r.contraction) : '—') },
    { label: 'Churn', num: true, value: (r) => r.churn ?? '', show: (r) => (r.has_opening ? inr(r.churn) : '—'), color: (r) => (Number(r.churn) > 0 ? '#E05A5A' : undefined) },
    { label: 'Closing MRR', num: true, value: (r) => r.closing, show: (r) => inr(r.closing) },
    { label: 'Paying clients', num: true, value: (r) => (r.has_opening ? `${r.clients_open} → ${r.clients_close}` : String(r.clients_close)) },
  ];
  const churnCols = [
    { label: 'Client', value: (r) => r.org_name },
    { label: 'Module', value: (r) => r.module },
    { label: 'Plan', value: (r) => r.tier },
    { label: 'Became', value: (r) => r.status },
    { label: 'When', value: (r) => (r.date_known ? new Date(r.since).toLocaleDateString('en-IN') : 'Before tracking began') },
    { label: 'Monthly revenue lost', num: true, value: (r) => r.mrr_lost ?? '', show: (r) => (r.mrr_lost != null ? inr(r.mrr_lost) : '—') },
    { label: 'Status now', value: (r) => r.current_status },
  ];

  if (tenantLoading) return <div style={S.page}><div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</p></div><ControlPanelNav /></div>;
  if (!tenant || tenant.role !== 'developer') {
    return <div style={S.page}><div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Finance reports are for the developer account only.</p></div><ControlPanelNav /></div>;
  }

  const showFilters = tab === 'revenue' || tab === 'gst';
  const ageBuckets = ['Not yet due', '1-7 days', '8-30 days', '31+ days'];
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Reports</p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>MPower Control Panel · developer only</p>
        </div>
        <button onClick={load} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>↻ Refresh</button>
      </nav>

      <div style={S.inner}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); setRows([]); }}
              style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid ' + (tab === k ? '#E8A020' : 'rgba(255,255,255,0.1)'), background: tab === k ? 'rgba(232,160,32,0.12)' : 'transparent', color: tab === k ? '#E8A020' : 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: tab === k ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
          ))}
        </div>

        {/* Filters */}
        <div style={S.card}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {showFilters && (
              <>
                <div><p style={S.label}>Period</p>
                  <select id="rp-preset" name="rp-preset" value={f.preset} onChange={(e) => setPreset(e.target.value)} style={S.select}>
                    {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select></div>
                {f.preset === 'custom' && (
                  <>
                    <div><p style={S.label}>From</p><input id="rp-from" name="rp-from" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} style={S.input} /></div>
                    <div><p style={S.label}>To</p><input id="rp-to" name="rp-to" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} style={S.input} /></div>
                  </>
                )}
                {tab === 'revenue' && (
                  <div><p style={S.label}>Date means</p>
                    <select id="rp-basis" name="rp-basis" value={f.basis} onChange={(e) => set({ basis: e.target.value })} style={S.select}>
                      <option value="billed">Invoice month (billed)</option>
                      <option value="collected">Day paid (collected)</option>
                    </select></div>
                )}
                <div><p style={S.label}>{tab === 'gst' ? 'Show by' : 'Group by'}</p>
                  <select id="rp-group" name="rp-group" value={tab === 'gst' && !TIME_GROUPS.includes(f.group) ? 'month' : f.group} onChange={(e) => set({ group: e.target.value })} style={S.select}>
                    {GROUPS.filter(([k]) => tab === 'revenue' || TIME_GROUPS.includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select></div>
                <div><p style={S.label}>Module</p>
                  <select id="rp-module" name="rp-module" value={f.module} onChange={(e) => set({ module: e.target.value })} style={S.select}>
                    <option value="">All</option><option value="school">School</option><option value="hospital">Hospital</option><option value="cts">CTS</option>
                  </select></div>
                <div><p style={S.label}>Plan</p>
                  <select id="rp-tier" name="rp-tier" value={f.tier} onChange={(e) => set({ tier: e.target.value })} style={S.select}>
                    <option value="">All</option>
                    {['basic', 'standard', 'advanced', 'enterprise', 'specialised', 'free', 'starter', 'active', 'pro', 'unlimited'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select></div>
                <div><p style={S.label}>Billing period</p>
                  <select id="rp-period" name="rp-period" value={f.period} onChange={(e) => set({ period: e.target.value })} style={S.select}>
                    <option value="">All</option><option value="1">Monthly</option><option value="6">6 months</option><option value="12">12 months</option>
                  </select></div>
                <div><p style={S.label}>Payment</p>
                  <select id="rp-status" name="rp-status" value={f.status} onChange={(e) => set({ status: e.target.value })} style={S.select}>
                    <option value="">All</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option>
                  </select></div>
                <div><p style={S.label}>District</p>
                  <select id="rp-district" name="rp-district" value={f.district} onChange={(e) => set({ district: e.target.value })} style={S.select}>
                    <option value="">All</option>{districts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select></div>
              </>
            )}
            {(tab === 'trials' || tab === 'changes' || tab === 'mrr') && (
              <>
                <div><p style={S.label}>Period</p>
                  <select id="rp-preset2" name="rp-preset2" value={f.preset} onChange={(e) => setPreset(e.target.value)} style={S.select}>
                    {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select></div>
                {f.preset === 'custom' && (
                  <>
                    <div><p style={S.label}>From</p><input id="rp-from2" name="rp-from2" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} style={S.input} /></div>
                    <div><p style={S.label}>To</p><input id="rp-to2" name="rp-to2" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} style={S.input} /></div>
                  </>
                )}
              </>
            )}
            {tab === 'clients' && (
              <>
                <div><p style={S.label}>Group by</p>
                  <select id="rp-cgroup" name="rp-cgroup" value={cGroup} onChange={(e) => setCGroup(e.target.value)} style={S.select}>
                    {CGROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select></div>
                <div><p style={S.label}>Module</p>
                  <select id="rp-cmodule" name="rp-cmodule" value={f.module} onChange={(e) => set({ module: e.target.value })} style={S.select}>
                    <option value="">All</option><option value="school">School</option><option value="hospital">Hospital</option><option value="cts">CTS</option>
                  </select></div>
                <div><p style={S.label}>Plan</p>
                  <select id="rp-ctier" name="rp-ctier" value={f.tier} onChange={(e) => set({ tier: e.target.value })} style={S.select}>
                    <option value="">All</option>
                    {['basic', 'standard', 'advanced', 'enterprise', 'specialised', 'free', 'starter', 'active', 'pro', 'unlimited'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select></div>
                <div><p style={S.label}>Client status</p>
                  <select id="rp-cstatus" name="rp-cstatus" value={cStatus} onChange={(e) => setCStatus(e.target.value)} style={S.select}>
                    <option value="">All</option><option value="active">Active</option><option value="trial">Trial</option><option value="suspended">Suspended</option><option value="churned">Churned</option>
                  </select></div>
                <div><p style={S.label}>Billing period</p>
                  <select id="rp-cperiod" name="rp-cperiod" value={f.period} onChange={(e) => set({ period: e.target.value })} style={S.select}>
                    <option value="">All</option><option value="1">Monthly</option><option value="6">6 months</option><option value="12">12 months</option>
                  </select></div>
                <div><p style={S.label}>District</p>
                  <select id="rp-cdistrict" name="rp-cdistrict" value={f.district} onChange={(e) => set({ district: e.target.value })} style={S.select}>
                    <option value="">All</option>{districts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select></div>
              </>
            )}
            {tab === 'ageing' && (
              <div><p style={S.label}>Module</p>
                <select id="rp-age-module" name="rp-age-module" value={ageModule} onChange={(e) => setAgeModule(e.target.value)} style={S.select}>
                  <option value="">All</option><option value="school">School</option><option value="hospital">Hospital</option><option value="cts">CTS</option>
                </select></div>
            )}
            {tab === 'renewals' && (
              <div><p style={S.label}>Look ahead</p>
                <select id="rp-days" name="rp-days" value={days} onChange={(e) => setDays(Number(e.target.value))} style={S.select}>
                  {[7, 30, 60, 90].map((d) => <option key={d} value={d}>Next {d} days</option>)}
                </select></div>
            )}
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', paddingBottom: 8 }}>
              <input type="checkbox" checked={f.includeTest} onChange={(e) => set({ includeTest: e.target.checked })} /> Include test accounts
            </label>
          </div>
        </div>

        {error && <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#E05A5A' }}>⚠ {error}</div>}
        {loading && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Loading…</p>}

        {/* Revenue */}
        {tab === 'revenue' && !loading && !error && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
              <Stat label="Billed" value={inr(sum('total'))} />
              <Stat label="Collected" value={inr(sum('collected'))} color="#6AAA90" />
              <Stat label="Outstanding" value={inr(sum('outstanding'))} color="#E8A020" />
              <Stat label="Overdue" value={inr(sum('overdue'))} color={sum('overdue') > 0 ? '#E05A5A' : '#fff'} />
              <Stat label="Collection rate" value={sum('total') > 0 ? `${Math.round((sum('collected') / sum('total')) * 100)}%` : '—'} />
              <Stat label="Invoices" value={sum('invoices')} />
            </div>
            <div style={S.card}>
              {rows.length === 0 ? (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No invoices match these filters. {!f.includeTest && 'Test accounts are hidden — tick “Include test accounts” to see them.'}</p>
              ) : (
                <>
                  <PairedBars rows={rows} />
                  <Table columns={revenueCols} rows={rows} rowKey={(r) => r.bucket} activeKey={drill?.bucket} onRowClick={openDrill}
                    totals={{ Invoices: sum('invoices'), 'Before GST': inr(sum('base')), GST: inr(sum('gst')), Billed: inr(sum('total')), Collected: inr(sum('collected')), Outstanding: inr(sum('outstanding')), Overdue: inr(sum('overdue')), 'Advance discount*': inr(sum('discount')) }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Click a row to see its invoices. *Estimated against today’s list prices.</p>
                    <button onClick={() => csvDownload(`revenue_${f.group}_${stamp}.csv`, revenueCols, rows)} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export CSV</button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* GST */}
        {tab === 'gst' && !loading && !error && (
          <div style={S.card}>
            {rows.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No invoices in this period.</p> : (
              <>
                <Table columns={gstCols} rows={rows} rowKey={(r) => r.bucket} activeKey={drill?.bucket} onRowClick={openDrill}
                  totals={{ Invoices: sum('invoices'), 'Taxable value': inr(sum('base')), GST: inr(sum('gst')), 'Invoice total': inr(sum('total')) }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: 0 }}>By invoice month. GST shows zero until GST is switched on in Billing settings. Click a row for the invoice list (use it with your CA).</p>
                  <button onClick={() => csvDownload(`gst_summary_${stamp}.csv`, gstCols, rows)} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export CSV</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Drill-down */}
        {drill && drill.kind === 'invoices' && (tab === 'revenue' || tab === 'gst') && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Invoices in “{drill.bucket}” ({drill.rows.length})</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => csvDownload(`invoices_${drill.bucket.replace(/[^A-Za-z0-9-]+/g, '_')}_${stamp}.csv`, invoiceCols, drill.rows)} style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 CSV</button>
                <button onClick={() => setDrill(null)} style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
              </div>
            </div>
            <Table columns={invoiceCols} rows={drill.rows} rowKey={(r) => r.invoice_id} />
          </div>
        )}

        {/* Ageing */}
        {tab === 'ageing' && !loading && !error && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
              {ageBuckets.map((b) => {
                const part = rows.filter((r) => r.bucket === b);
                return <Stat key={b} label={`${b} · ${part.length} invoice${part.length === 1 ? '' : 's'}`} value={inr(part.reduce((s, r) => s + Number(r.total), 0))} color={b === '31+ days' ? '#E05A5A' : b === '8-30 days' ? '#E8A020' : '#fff'} />;
              })}
            </div>
            <div style={S.card}>
              {rows.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No unpaid invoices. {!f.includeTest && 'Test accounts are hidden.'}</p> : (
                <>
                  <Table columns={ageCols} rows={rows} rowKey={(r) => r.invoice_id} totals={{ Amount: inr(sum('total')) }} />
                  <div style={{ textAlign: 'right', marginTop: 10 }}>
                    <button onClick={() => csvDownload(`unpaid_invoices_${stamp}.csv`, ageCols, rows)} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export CSV</button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Renewals */}
        {tab === 'renewals' && !loading && !error && (
          <div style={S.card}>
            {rows.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Nothing due in the next {days} days. {!f.includeTest && 'Test accounts are hidden.'}</p> : (
              <>
                <Table columns={renewCols} rows={rows} rowKey={(r) => r.client_id + r.kind} totals={{ 'Expected (before GST)': inr(sum('expected_base')) }} />
                <div style={{ textAlign: 'right', marginTop: 10 }}>
                  <button onClick={() => csvDownload(`renewals_${days}d_${stamp}.csv`, renewCols, rows)} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export CSV</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Clients & plans */}
        {tab === 'clients' && !loading && !error && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
              <Stat label="Clients" value={sum('clients')} />
              <Stat label="Active" value={sum('active')} color="#6AAA90" />
              <Stat label="On trial" value={sum('trial')} color="#E8A020" />
              <Stat label="MRR (before GST)" value={inr(sum('mrr'))} />
              <Stat label="ARR (MRR × 12)" value={inr(sum('mrr') * 12)} />
            </div>
            <div style={S.card}>
              {rows.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No clients match. {!f.includeTest && 'Test accounts are hidden — tick “Include test accounts” to see them.'}</p> : (
                <>
                  <Table columns={clientCols} rows={rows} rowKey={(r) => r.bucket} activeKey={drill?.bucket} onRowClick={openClientDrill}
                    totals={{ Clients: sum('clients'), Active: sum('active'), Trial: sum('trial'), Suspended: sum('suspended'), Churned: sum('churned'), 'MRR (before GST)': inr(sum('mrr')) }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: 0 }}>MRR = what Active clients pay per month at today’s prices after their advance discount, as of now. Click a row to list its clients.</p>
                    <button onClick={() => csvDownload(`clients_${cGroup}_${stamp}.csv`, clientCols, rows)} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export CSV</button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
        {drill && drill.kind === 'clients' && tab === 'clients' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Clients in “{drill.bucket}” ({drill.rows.length})</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => csvDownload(`clients_${drill.bucket.replace(/[^A-Za-z0-9-]+/g, '_')}_${stamp}.csv`, clientListCols, drill.rows)} style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 CSV</button>
                <button onClick={() => setDrill(null)} style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
              </div>
            </div>
            <Table columns={clientListCols} rows={drill.rows} rowKey={(r) => r.client_id} />
          </div>
        )}

        {/* Trial funnel */}
        {tab === 'trials' && !loading && !error && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
              <Stat label="Started" value={sum('started')} />
              <Stat label="Converted" value={sum('converted')} color="#6AAA90" />
              <Stat label="Conversion" value={sum('started') > 0 ? `${Math.round((sum('converted') / sum('started')) * 100)}%` : '—'} />
              <Stat label="Still in trial" value={sum('in_trial')} color="#E8A020" />
              <Stat label="Trial lapsed" value={sum('lapsed')} color={sum('lapsed') > 0 ? '#E05A5A' : '#fff'} />
            </div>
            <div style={S.card}>
              {rows.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No clients registered in this period. {!f.includeTest && 'Test accounts are hidden.'}</p> : (
                <>
                  <Table columns={trialCols} rows={rows} rowKey={(r) => r.bucket}
                    totals={{ Started: sum('started'), 'Converted (Active now)': sum('converted'), 'Still in trial': sum('in_trial'), 'Trial lapsed': sum('lapsed'), 'Suspended / churned': sum('ended') }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Grouped by the month the client registered. “Converted” means Active today. “Lapsed” = trial date passed and still on trial.</p>
                    <button onClick={() => csvDownload(`trial_funnel_${stamp}.csv`, trialCols, rows)} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export CSV</button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Plan changes */}
        {tab === 'changes' && !loading && !error && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
              <Stat label="Upgrades" value={rows.filter((r) => r.direction === 'Upgrade').length} color="#6AAA90" />
              <Stat label="Downgrades" value={rows.filter((r) => r.direction === 'Downgrade').length} color={rows.some((r) => r.direction === 'Downgrade') ? '#E05A5A' : '#fff'} />
              <Stat label="Billing period changes" value={rows.filter((r) => r.direction === 'Billing period change').length} />
              <Stat label="Invoiced by changes" value={inr(sum('invoice_total'))} />
            </div>
            <div style={S.card}>
              {rows.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No plan changes in this period. Changes made with “Change plan” on the Clients screen appear here. {!f.includeTest && 'Test accounts are hidden.'}</p> : (
                <>
                  <Table columns={changeCols} rows={rows} rowKey={(r) => r.changed_at + r.org_name} />
                  <div style={{ textAlign: 'right', marginTop: 10 }}>
                    <button onClick={() => csvDownload(`plan_changes_${stamp}.csv`, changeCols, rows)} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export CSV</button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* MRR & churn */}
        {tab === 'mrr' && !loading && !error && (
          <>
            {(() => {
              const withOpen = rows.filter((r) => r.has_opening);
              const tot = (k) => withOpen.reduce((a, r) => a + Number(r[k] || 0), 0);
              const net = tot('new_mrr') + tot('expansion') - tot('contraction') - tot('churn');
              const latest = rows.length ? rows[rows.length - 1] : null;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
                  <Stat label="MRR now (latest month)" value={latest ? inr(latest.closing) : '—'} />
                  <Stat label="Net new MRR" value={withOpen.length ? inr(net) : '—'} color={net < 0 ? '#E05A5A' : '#6AAA90'} />
                  <Stat label="New" value={inr(tot('new_mrr'))} color="#6AAA90" />
                  <Stat label="Expansion" value={inr(tot('expansion'))} color="#6AAA90" />
                  <Stat label="Contraction" value={inr(tot('contraction'))} />
                  <Stat label="Churn" value={inr(tot('churn'))} color={tot('churn') > 0 ? '#E05A5A' : '#fff'} />
                </div>
              );
            })()}
            <div style={S.card}>
              {rows.length === 0 ? (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No MRR history in this period yet. History is recorded daily from the day this was switched on, so earlier months stay empty. {!f.includeTest && 'Test accounts are hidden — tick “Include test accounts” to see them.'}</p>
              ) : (
                <>
                  <MrrBars rows={rows} />
                  <Table columns={mvCols} rows={rows} rowKey={(r) => r.bucket} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Closing = Opening + New + Expansion − Contraction − Churn. MRR is before GST. A month marked “History starts here” has no earlier snapshot to compare with.</p>
                    <button onClick={() => csvDownload(`mrr_movement_${stamp}.csv`, mvCols, rows)} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export CSV</button>
                  </div>
                </>
              )}
            </div>

            {mrrExtra.hist.length > 0 && (() => {
              const mods = [...new Set(mrrExtra.hist.map((h) => h.bucket))].sort();
              const months = [...new Set(mrrExtra.hist.map((h) => h.month))].sort();
              const cell = (m, b) => mrrExtra.hist.find((h) => h.month === m && h.bucket === b);
              const cols = [{ label: 'Month', value: (r) => r.month }, ...mods.map((b) => ({ label: b, num: true, value: (r) => cell(r.month, b)?.mrr ?? 0, show: (r) => (cell(r.month, b) ? inr(cell(r.month, b).mrr) : '—') })),
                { label: 'Total', num: true, value: (r) => mods.reduce((a, b) => a + Number(cell(r.month, b)?.mrr || 0), 0), show: (r) => inr(mods.reduce((a, b) => a + Number(cell(r.month, b)?.mrr || 0), 0)) }];
              const hrows = months.map((m) => ({ month: m }));
              return (
                <div style={S.card}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>MRR by module, month end</p>
                  <Table columns={cols} rows={hrows} rowKey={(r) => r.month} />
                </div>
              );
            })()}

            <div style={S.card}>
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>Suspensions and churn</p>
              {mrrExtra.churn.length === 0 ? (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>No clients suspended or churned in this period.</p>
              ) : (
                <>
                  <Table columns={churnCols} rows={mrrExtra.churn} rowKey={(r) => r.client_id + r.since} />
                  <div style={{ textAlign: 'right', marginTop: 10 }}>
                    <button onClick={() => csvDownload(`churn_${stamp}.csv`, churnCols, mrrExtra.churn)} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, background: 'transparent', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>📥 Export CSV</button>
                  </div>
                </>
              )}
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '8px 0 0' }}>“Before tracking began” = the client was already suspended or churned when status tracking was switched on, so its real date was never recorded.</p>
            </div>
          </>
        )}
      </div>

      <ControlPanelNav />
      <BugReporter screenName="reports_hub" />
    </div>
  );
}
