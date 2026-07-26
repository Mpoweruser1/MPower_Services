// controlpanel/BillingTracker.jsx — FINAL
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import ControlPanelNav from '../shared/ControlPanelNav';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 10 },
  stat: { background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' },
};

const PAYMENT_STATUS = {
  paid:    { color: '#6AAA90', bg: 'rgba(106,170,144,0.12)', label: 'Paid' },
  pending: { color: '#E8A020', bg: 'rgba(232,160,32,0.12)',  label: 'Pending' },
  overdue: { color: '#E05A5A', bg: 'rgba(224,90,90,0.12)',   label: 'Overdue' },
};

const TIER_PRICES = { basic: 299, standard: 599, advanced: 999, specialised: 1999 };

export default function BillingTracker() {
  const { tenant } = useTenant();
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [generating, setGenerating] = useState(false);
  const [sendingReminder, setSendingReminder] = useState({});

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [clientsRes, invoicesRes] = await Promise.allSettled([
      supabase.from('crm_clients').select('*, apps(subscription_tier, app_type)')
        .in('status', ['active', 'trial']).order('org_name'),
      supabase.from('billing_invoices_platform').select('*, crm_clients(org_name, phone)')
        .order('due_date', { ascending: false }).limit(100),
    ]);
    setClients(clientsRes.status === 'fulfilled' ? (clientsRes.value.data || []) : []);
    setInvoices(invoicesRes.status === 'fulfilled' ? (invoicesRes.value.data || []) : []);
    setLoading(false);
  }

  async function generateMonthlyInvoices() {
    setGenerating(true);
    const month = new Date().toISOString().slice(0, 7);
    const dueDate = new Date(new Date().setDate(new Date().getDate() + 15)).toISOString().slice(0, 10);
    let created = 0;

    for (const client of clients.filter((c) => c.status === 'active')) {
      const tier   = client.tier || client.apps?.subscription_tier || 'basic';
      const amount = TIER_PRICES[tier] || 299;
      const { error } = await supabase.from('billing_invoices_platform').insert({
        client_id:    client.id,
        month:        month,
        amount:       amount,
        tier:         tier,
        due_date:     dueDate,
        status:       'pending',
        invoice_no:   `MPOW/${month.replace('-', '/')}/${String(Math.floor(1000 + Math.random() * 9000))}`,
      });
      if (!error) created++;
    }

    alert(`Generated ${created} invoices for ${month}`);
    setGenerating(false);
    loadData();
  }

  async function markPaid(invoiceId) {
    await supabase.from('billing_invoices_platform')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', invoiceId);
    setInvoices((prev) => prev.map((inv) => inv.id === invoiceId ? { ...inv, status: 'paid' } : inv));
  }

  async function sendReminder(invoice) {
    setSendingReminder((r) => ({ ...r, [invoice.id]: true }));
    await supabase.functions.invoke('send-whatsapp', {
      body: {
        type:     'billing_reminder',
        clientId: invoice.client_id,
        amount:   invoice.amount,
        dueDate:  invoice.due_date,
        invoiceNo: invoice.invoice_no,
      },
    });
    setTimeout(() => setSendingReminder((r) => ({ ...r, [invoice.id]: false })), 2000);
  }

  const stats = useMemo(() => {
    const mrr         = clients.filter((c) => c.status === 'active').reduce((sum, c) => {
      const tier = c.tier || c.apps?.subscription_tier || 'basic';
      return sum + (TIER_PRICES[tier] || 0);
    }, 0);
    const collected   = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
    const pending     = invoices.filter((i) => i.status === 'pending').reduce((s, i) => s + Number(i.amount), 0);
    const overdue     = invoices.filter((i) => i.status === 'overdue' || (i.status === 'pending' && new Date(i.due_date) < new Date())).length;
    return { mrr, collected, pending, overdue };
  }, [clients, invoices]);

  const pendingInvoices = invoices.filter((i) => ['pending', 'overdue'].includes(i.status) || (i.status === 'pending' && new Date(i.due_date) < new Date()));

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>Billing Tracker</p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Platform subscription billing</p>
        </div>
        <button onClick={generateMonthlyInvoices} disabled={generating}
          style={{ padding: '7px 14px', border: 'none', borderRadius: 20, background: generating ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', cursor: generating ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
          {generating ? 'Generating...' : '+ Generate this month'}
        </button>
      </nav>

      <div style={S.inner}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { value: `₹${stats.mrr.toLocaleString('en-IN')}`, label: 'MRR',       color: '#6AAA90' },
            { value: `₹${stats.collected.toLocaleString('en-IN')}`, label: 'Collected this month', color: '#6AAA90' },
            { value: `₹${stats.pending.toLocaleString('en-IN')}`, label: 'Pending', color: '#E8A020', alert: stats.pending > 0 },
            { value: stats.overdue, label: 'Overdue', color: '#E05A5A', alert: stats.overdue > 0 },
          ].map((s) => (
            <div key={s.label} style={{ ...S.stat, border: `1px solid ${s.alert ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
              <p style={{ fontSize: s.label === 'MRR' || s.label.includes('₹') ? 13 : 22, fontWeight: 700, margin: 0, color: s.alert ? '#E05A5A' : s.color }}>{s.value}</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { k: 'overview', l: 'Client rates' },
            { k: 'invoices', l: `Pending (${pendingInvoices.length})` },
            { k: 'all',      l: `All invoices (${invoices.length})` },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        ) : (
          <>
            {/* Client rates */}
            {tab === 'overview' && (
              <div style={S.card}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, marginBottom: 8, padding: '0 0 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Client', 'Tier', 'Monthly'].map((h) => (
                    <p key={h} style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>{h}</p>
                  ))}
                </div>
                {clients.map((client) => {
                  const tier   = client.tier || client.apps?.subscription_tier || 'basic';
                  const amount = TIER_PRICES[tier] || 299;
                  const TIER_COLORS = { basic: '#6AAA90', standard: '#5A9ADF', advanced: '#9A8AE0', specialised: '#E8A020' };
                  return (
                    <div key={client.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, color: '#fff' }}>{client.org_name}</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{client.district || '—'}</p>
                      </div>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: `${TIER_COLORS[tier]}15`, color: TIER_COLORS[tier] || '#fff', fontWeight: 500 }}>{tier}</span>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#6AAA90' }}>₹{amount}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pending invoices */}
            {(tab === 'invoices' || tab === 'all') && (
              (tab === 'invoices' ? pendingInvoices : invoices).map((inv) => {
                const statusCfg = PAYMENT_STATUS[inv.status] || PAYMENT_STATUS.pending;
                const isOverdue = inv.status === 'pending' && new Date(inv.due_date) < new Date();
                const displayStatus = isOverdue ? 'overdue' : inv.status;
                const dispCfg = PAYMENT_STATUS[displayStatus] || statusCfg;

                return (
                  <div key={inv.id} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#E8A020' }}>{inv.invoice_no}</span>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: dispCfg.bg, color: dispCfg.color, fontWeight: 500 }}>{dispCfg.label}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{inv.crm_clients?.org_name || '—'}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                          Due: {inv.due_date}
                          {inv.month ? ` · Month: ${inv.month}` : ''}
                        </p>
                      </div>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: inv.status === 'paid' ? '#6AAA90' : '#fff' }}>
                        ₹{Number(inv.amount).toLocaleString('en-IN')}
                      </p>
                    </div>

                    {inv.status !== 'paid' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => markPaid(inv.id)}
                          style={{ flex: 1, padding: '8px 0', background: '#6AAA90', color: '#111113', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                          ✓ Mark paid
                        </button>
                        <button onClick={() => sendReminder(inv)} disabled={sendingReminder[inv.id]}
                          style={{ flex: 1, padding: '8px 0', background: 'rgba(37,211,102,0.08)', color: '#25D366', border: '1px solid rgba(37,211,102,0.25)', borderRadius: 7, cursor: sendingReminder[inv.id] ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                          {sendingReminder[inv.id] ? 'Sent ✓' : '📱 Remind'}
                        </button>
                      </div>
                    )}

                    {inv.status === 'paid' && inv.paid_at && (
                      <p style={{ margin: 0, fontSize: 12, color: '#6AAA90' }}>
                        ✓ Paid on {new Date(inv.paid_at).toLocaleDateString('en-IN')}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      <ControlPanelNav />
      <BugReporter screenName="billing_tracker" />
    </div>
  );
}