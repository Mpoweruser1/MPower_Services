// hospital/BillingAnalytics.jsx — NEW
// Scoped to what's genuinely computable: billing_invoices only ever
// has status='paid' (confirmed real — invoices are created at the
// point of collection, never in a pending state), so this is revenue
// and payment-mode analysis, NOT overdue-bill detection like School's
// Fee Analytics — that pattern genuinely doesn't exist in this data.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import TierGate from '../shared/TierGate';
import BugReporter from '../shared/BugReporter';

function currency(n) { return `\u20b9${Number(n || 0).toLocaleString('en-IN')}`; }

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

function BillingAnalyticsContent() {
  const { tenant } = useTenant();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const { data } = await supabase
      .from('billing_invoices')
      .select('total_amount, payment_mode, created_at')
      .eq('app_id', tenant.appId)
      .gte('created_at', cutoff.toISOString());
    setInvoices(data || []);
    setLoading(false);
  }

  const totalRevenue = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const avgInvoice = invoices.length > 0 ? Math.round(totalRevenue / invoices.length) : 0;

  const byMode = {};
  invoices.forEach((i) => {
    const mode = i.payment_mode || 'Unknown';
    if (!byMode[mode]) byMode[mode] = { count: 0, total: 0 };
    byMode[mode].count++;
    byMode[mode].total += Number(i.total_amount);
  });

  const schemeModes = ['Aarogyasri', 'PMJAY', 'Insurance'];
  const schemeRevenue = Object.entries(byMode)
    .filter(([mode]) => schemeModes.includes(mode))
    .reduce((s, [, v]) => s + v.total, 0);
  const schemePct = totalRevenue > 0 ? Math.round((schemeRevenue / totalRevenue) * 100) : 0;

  function exportCsv() {
    const rows = [
      ['Amount', 'Payment mode', 'Date'],
      ...invoices.map((i) => [i.total_amount, i.payment_mode || 'Unknown', new Date(i.created_at).toISOString().slice(0, 10)]),
    ].map((r) => r.join(',')).join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (loading) return <div style={{ ...S.page, textAlign: 'center', paddingTop: 60 }}><p style={{ color: 'rgba(255,255,255,0.3)' }}>Loading...</p><HospitalNav /></div>;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 6 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Analytics</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Billing Analytics</h1>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>Last 30 days &middot; revenue and payment mode breakdown</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#6AAA90' }}>{currency(totalRevenue)}</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Total revenue</p>
          </div>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#5A9ADF' }}>{currency(avgInvoice)}</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Avg invoice</p>
          </div>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#9A8AE0' }}>{schemePct}%</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Scheme-funded</p>
          </div>
        </div>

        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Revenue by payment mode</p>
          {Object.entries(byMode).sort((a, b) => b[1].total - a[1].total).map(([mode, data]) => {
            const pct = totalRevenue > 0 ? Math.round((data.total / totalRevenue) * 100) : 0;
            return (
              <div key={mode} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: '#fff' }}>{mode}</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{currency(data.total)} &middot; {data.count} invoices</span>
                </div>
                <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: schemeModes.includes(mode) ? '#9A8AE0' : '#6AAA90', width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {invoices.length === 0 && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>No billing activity in the last 30 days.</p>}
        </div>

        <button onClick={exportCsv}
          style={{ width: '100%', marginTop: 12, padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          &#128229; Export as CSV
        </button>

      </div>
      <HospitalNav />
      <BugReporter screenName="billing_analytics" />
    </div>
  );
}

export default function BillingAnalytics() {
  return (
    <TierGate requiredTier="advanced" featureName="Billing Analytics" NavComponent={HospitalNav}>
      <BillingAnalyticsContent />
    </TierGate>
  );
}
