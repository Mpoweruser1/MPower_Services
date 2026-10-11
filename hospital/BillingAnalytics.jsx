// hospital/BillingAnalytics.jsx — UPDATED
// Revenue and payment-mode analysis from billing_invoices (invoices are only created at the point
// of collection, so there is no "overdue" here).
// A bill can now have part of it covered by a scheme (PMJAY / Aarogyasri / insurance):
//   gross billed = what the patient pays (total_amount) + what the scheme covers (covered_amount).
// "Covered by scheme" is money still to be claimed from the scheme, not cash taken at the counter.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import TierGate from '../shared/TierGate';
import BugReporter from '../shared/BugReporter';

function currency(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

const PERIODS = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']];
const SCHEME_MODES = ['Aarogyasri', 'PMJAY', 'Insurance'];

function BillingAnalyticsContent() {
  const { tenant } = useTenant();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId, days]);

  async function load() {
    setLoading(true);
    setLoadError('');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const { data, error } = await supabase
      .from('billing_invoices')
      .select('total_amount, covered_amount, payment_mode, created_at')
      .eq('app_id', tenant.appId)
      .gte('created_at', cutoff.toISOString());
    if (error) {
      console.error('Loading billing analytics failed:', error);
      setLoadError(error.message || 'Could not load billing data.');
      setInvoices([]);
    } else {
      setInvoices(data || []);
    }
    setLoading(false);
  }

  const payable = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const covered = invoices.reduce((s, i) => s + Number(i.covered_amount || 0), 0);
  const gross = payable + covered;
  const avgInvoice = invoices.length > 0 ? Math.round(gross / invoices.length) : 0;

  const byMode = {};
  invoices.forEach((i) => {
    const mode = i.payment_mode || 'Unknown';
    if (!byMode[mode]) byMode[mode] = { count: 0, total: 0 };
    byMode[mode].count++;
    byMode[mode].total += Number(i.total_amount || 0);
  });

  // Scheme-funded = the part covered on the bill + whole bills paid under a scheme payment mode (older way of billing).
  const schemeModePaid = Object.entries(byMode).filter(([mode]) => SCHEME_MODES.includes(mode)).reduce((s, [, v]) => s + v.total, 0);
  const schemePct = gross > 0 ? Math.round(((covered + schemeModePaid) / gross) * 100) : 0;
  const coveredBills = invoices.filter((i) => Number(i.covered_amount) > 0).length;

  const label = (PERIODS.find(([d]) => d === days) || PERIODS[1])[1];

  function exportCsv() {
    const rows = [
      ['Patient pays', 'Covered by scheme', 'Gross billed', 'Payment mode', 'Date'],
      ...invoices.map((i) => [Number(i.total_amount || 0), Number(i.covered_amount || 0), Number(i.total_amount || 0) + Number(i.covered_amount || 0), i.payment_mode || 'Unknown', new Date(i.created_at).toISOString().slice(0, 10)]),
    ].map((r) => r.join(',')).join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 6 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Analytics</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Billing Analytics</h1>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>{label} &middot; what was billed, what patients paid, and what schemes cover</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {PERIODS.map(([d, l]) => (
            <button key={d} onClick={() => setDays(d)}
              style={{ padding: '6px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: days === d ? 'none' : '1px solid rgba(255,255,255,0.12)', background: days === d ? '#5A9ADF' : 'transparent', color: days === d ? '#111113' : 'rgba(255,255,255,0.55)', fontWeight: days === d ? 600 : 400, fontFamily: 'inherit' }}>
              {l}
            </button>
          ))}
        </div>

        {loadError && (
          <div role="alert" style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>⚠️ {loadError}</div>
        )}

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingTop: 30 }}>Loading...</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                ['Billed (total)', currency(gross), '#fff'],
                ['Paid by patients', currency(payable), '#6AAA90'],
                ['Covered by scheme', currency(covered), '#9A8AE0'],
                ['Scheme-funded', `${schemePct}%`, '#9A8AE0'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: c }}>{v}</p>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{l}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '-6px 0 16px', textAlign: 'center' }}>
              {invoices.length} invoice{invoices.length === 1 ? '' : 's'} &middot; average {currency(avgInvoice)}{coveredBills > 0 ? ` · ${coveredBills} with a scheme or insurance cover` : ''}
            </p>

            <div style={S.card}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Billed by payment mode</p>
              {Object.entries(byMode).sort((a, b) => b[1].total - a[1].total).map(([mode, data]) => {
                const pct = gross > 0 ? Math.round((data.total / gross) * 100) : 0;
                return (
                  <div key={mode} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ color: '#fff' }}>{mode}</span>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>{currency(data.total)} &middot; {data.count} invoices</span>
                    </div>
                    <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: SCHEME_MODES.includes(mode) ? '#9A8AE0' : '#6AAA90', width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {covered > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: '#9A8AE0' }}>Covered by scheme / insurance</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>{currency(covered)} &middot; {coveredBills} invoices</span>
                  </div>
                  <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#9A8AE0', width: `${gross > 0 ? Math.round((covered / gross) * 100) : 0}%` }} />
                  </div>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '6px 0 0' }}>This part is claimed from the scheme or insurer — it was not collected at the counter.</p>
                </div>
              )}
              {invoices.length === 0 && !loadError && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>No billing activity in this period.</p>}
            </div>

            <button onClick={exportCsv}
              style={{ width: '100%', marginTop: 12, padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              &#128229; Export as CSV
            </button>
          </>
        )}

      </div>
      <HospitalNav />
      <BugReporter screenName="billing_analytics" />
    </div>
  );
}

export default function BillingAnalytics() {
  return (
    <TierGate requiredTier="standard" requiredLabel="Nursing Home" featureName="Billing Analytics" NavComponent={HospitalNav}>
      <BillingAnalyticsContent />
    </TierGate>
  );
}
