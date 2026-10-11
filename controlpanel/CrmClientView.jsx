// controlpanel/CrmClientView.jsx — FINAL + Change plan
// Change plan calls the database function change_client_plan (fix_change_client_plan.sql),
// which does the staff check, both tier fields, the invoice and the log in one step.
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import ControlPanelNav from '../shared/ControlPanelNav';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 10 },
  stat: { background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' },
  select: { padding: '8px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 12, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
  input: { padding: '9px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit', flex: 1 },
};

const STATUS_CONFIG = {
  trial:    { color: '#E8A020', bg: 'rgba(232,160,32,0.12)',  label: 'Trial' },
  active:   { color: '#6AAA90', bg: 'rgba(106,170,144,0.12)', label: 'Active' },
  suspended:{ color: '#E05A5A', bg: 'rgba(224,90,90,0.12)',   label: 'Suspended' },
  churned:  { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.06)', label: 'Churned' },
};

// Extended to cover every real tier name across all three modules —
// the old list ('basic'/'standard'/'advanced'/'specialised') was
// missing 'enterprise' (School/Hospital's real top tier) and every
// CTS tier name, so those clients' badges would have silently fallen
// back to the plain "Basic" default below, regardless of their real tier.
const TIER_CONFIG = {
  basic:       { color: '#6AAA90', label: 'Basic' },
  specialised: { color: '#9A8AE0', label: 'Specialised' },
  standard:    { color: '#5A9ADF', label: 'Standard' },
  advanced:    { color: '#9A8AE0', label: 'Advanced' },
  enterprise:  { color: '#E8A020', label: 'Enterprise' },
  free:        { color: '#6AAA90', label: 'Free' },
  starter:     { color: '#5A9ADF', label: 'Starter' },
  active:      { color: '#5A9ADF', label: 'Active' },
  pro:         { color: '#9A8AE0', label: 'Pro' },
  unlimited:   { color: '#E8A020', label: 'Unlimited' },
};

function getMonthsLabel(m) { return Number(m) === 6 ? '6 months in advance' : Number(m) === 12 ? '12 months in advance' : 'monthly'; }

const APP_TYPES = {
  school:   { icon: '🏫', label: 'School' },
  hospital: { icon: '🏥', label: 'Hospital' },
  grievance:{ icon: '🏛️', label: 'CTS' },
};

export default function CrmClientView() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [clients, setClients]       = useState([]);
  const [pricingMap, setPricingMap] = useState({}); // `${module}_${tier}` -> price — same source pricing_plans everywhere now reads from
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected]     = useState(null);
  const [clientDetails, setClientDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [actionError, setActionError] = useState('');
  const [plans, setPlans]           = useState([]);   // pricing_plans rows, for the Change plan panel
  const [planForm, setPlanForm]     = useState(null); // { clientId, tier, months, note, activate, createInvoice }
  const [planPreview, setPlanPreview] = useState(null);
  const [planBusy, setPlanBusy]     = useState(false);
  const [planMsg, setPlanMsg]       = useState('');

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    setLoading(true);
    // admin_user_id is now joined to the real users row (full_name,
    // phone) rather than relying on crm_clients.contact_person, a
    // plain text field that had no guaranteed link to the account
    // that actually logs in — could be stale, or a different person
    // (e.g. a school office contact rather than the Principal).
    const [clientsRes, pricingRes] = await Promise.allSettled([
      supabase.from('crm_clients')
        .select('*, apps(app_type, subscription_tier, active_modules), admin_user:admin_user_id(full_name, phone)')
        .order('registered_at', { ascending: false }),   // crm_clients has registered_at, not created_at
      supabase.from('pricing_plans').select('module, tier, name, price, display_order'),
    ]);
    setClients(clientsRes.status === 'fulfilled' ? (clientsRes.value.data || []) : []);
    const priceRows = pricingRes.status === 'fulfilled' ? (pricingRes.value.data || []) : [];
    const map = {};
    priceRows.forEach((r) => { map[`${r.module}_${r.tier}`] = Number(r.price); });
    setPricingMap(map);
    setPlans(priceRows);
    setLoading(false);
  }

  function getPrice(client) {
    const module = client.app_type || client.apps?.app_type;
    const tier = client.tier || client.apps?.subscription_tier || 'basic';
    return pricingMap[`${module}_${tier}`] ?? 0;
  }

  async function loadClientDetails(client) {
    setSelected(client);
    setLoadingDetails(true);

    // FIXED: was billing_invoices_platform, a table that doesn't exist
    // — same wrong-table bug already found and fixed in
    // BillingTracker.jsx. client_invoices is the real table.
    //
    // allInvoicesRes fetches every invoice this client has ever had
    // (amount + status only, so it stays light even for a client with
    // years of history) to compute real lifetime totals — separate
    // from billingRes below, which stays limited to 5 for the
    // "recent activity" list, a different purpose.
    const [ticketsRes, onboardRes, billingRes, allInvoicesRes, historyRes] = await Promise.allSettled([
      supabase.from('support_tickets').select('id, subject, status, created_at')
        .eq('client_id', client.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('client_onboarding').select('*').eq('client_id', client.id).single(),
      supabase.from('client_invoices').select('id, amount, status, due_date')
        .eq('client_id', client.id).order('due_date', { ascending: false }).limit(5),
      supabase.from('client_invoices').select('amount, status').eq('client_id', client.id),
      supabase.from('plan_change_log').select('id, old_tier, new_tier, new_months, invoice_total, note, changed_at')
        .eq('client_id', client.id).order('changed_at', { ascending: false }).limit(3),
    ]);

    const allInvoices = allInvoicesRes.status === 'fulfilled' ? (allInvoicesRes.value.data || []) : [];
    const totalBilled  = allInvoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
    const totalReceived = allInvoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.amount), 0);

    setClientDetails({
      tickets:    ticketsRes.status === 'fulfilled' ? (ticketsRes.value.data || []) : [],
      onboarding: onboardRes.status === 'fulfilled' ? onboardRes.value.data : null,
      billing:    billingRes.status === 'fulfilled' ? (billingRes.value.data || []) : [],
      planHistory: historyRes.status === 'fulfilled' ? (historyRes.value.data || []) : [],
      lifetime: {
        totalBilled,
        totalReceived,
        balance: totalBilled - totalReceived,
        invoiceCount: allInvoices.length,
      },
    });
    setLoadingDetails(false);
  }

  async function updateStatus(clientId, newStatus) {
    if (newStatus === 'suspended') {
      const client = clients.find((c) => c.id === clientId);
      const ok = window.confirm(`Suspend ${client?.org_name || 'this client'}? They will lose access immediately.`);
      if (!ok) return;
    }
    setActionError('');
    // Previously: local UI state (clients list, selected client) was
    // updated unconditionally, even if this write actually failed —
    // meaning an admin could see "Suspended" in the UI for a client
    // who still had full, working access in reality.
    const { error } = await supabase.from('crm_clients').update({ status: newStatus }).eq('id', clientId);
    if (error) {
      console.error('Client status update failed:', error);
      setActionError(error.message || 'Failed to update client status. Please try again.');
      return;
    }
    setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, status: newStatus } : c));
    if (selected?.id === clientId) setSelected((s) => ({ ...s, status: newStatus }));
  }

  // ---- Change plan -------------------------------------------------------
  function moduleOf(client) {
    const t = client.app_type || client.apps?.app_type;
    return t === 'grievance' ? 'cts' : t;
  }
  // Hospital sells only Clinic and Nursing Home; the old Advanced/Enterprise rows are hidden.
  function plansFor(client) {
    const m = moduleOf(client);
    return plans.filter((p) => p.module === m && !(m === 'hospital' && ['advanced', 'enterprise'].includes(p.tier)))
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  }
  function openPlanForm(client) {
    const cur = client.tier || client.apps?.subscription_tier;
    const options = plansFor(client);
    setPlanMsg(''); setPlanPreview(null);
    const first = options.find((p) => p.tier !== cur) || options[0];
    const form = {
      clientId: client.id, tier: first?.tier || '', months: Number(client.billing_period_months) || 1,
      note: '', activate: client.status !== 'active', createInvoice: true,
    };
    setPlanForm(form);
    previewPlan(form);
  }
  async function previewPlan(form) {
    if (!form?.tier) { setPlanPreview(null); return; }
    const { data, error } = await supabase.rpc('change_client_plan', {
      p_client_id: form.clientId, p_new_tier: form.tier, p_months: form.months,
      p_activate: form.activate, p_create_invoice: form.createInvoice, p_dry_run: true,
    });
    setPlanPreview(error ? { error: error.message } : data);
  }
  function updatePlanForm(patch) {
    const next = { ...planForm, ...patch };
    setPlanForm(next);
    previewPlan(next);
  }
  async function confirmPlanChange(client) {
    if (!planForm || !planPreview || planPreview.error) return;
    const label = TIER_CONFIG[planForm.tier]?.label || planForm.tier;
    const money = planPreview.invoice_action === 'none' ? 'No invoice will be created.'
      : `Invoice: ₹${Number(planPreview.total).toLocaleString('en-IN')} for ${planForm.months} month${planForm.months > 1 ? 's' : ''}.`;
    if (!window.confirm(`Change ${client.org_name} to ${label}? ${money} The new plan unlocks immediately.`)) return;
    setPlanBusy(true); setActionError(''); setPlanMsg('');
    const { data, error } = await supabase.rpc('change_client_plan', {
      p_client_id: planForm.clientId, p_new_tier: planForm.tier, p_months: planForm.months,
      p_note: planForm.note, p_activate: planForm.activate, p_create_invoice: planForm.createInvoice, p_dry_run: false,
    });
    setPlanBusy(false);
    if (error) { setActionError(error.message || 'The plan could not be changed.'); return; }
    setPlanMsg(`Plan changed to ${label}.${data?.invoice_no ? ` Invoice ${data.invoice_no}, ₹${Number(data.total).toLocaleString('en-IN')}, due in 7 days.` : ''}`);
    setPlanForm(null); setPlanPreview(null);
    await loadClients();
    const fresh = (await supabase.from('crm_clients').select('*, apps(app_type, subscription_tier, active_modules), admin_user:admin_user_id(full_name, phone)').eq('id', client.id).single()).data;
    if (fresh) loadClientDetails(fresh);
  }

  async function sendWhatsApp(client, type) {
    // FIXED: previously alerted "sent" unconditionally — send-whatsapp
    // always returns HTTP 200 even when it silently skips sending
    // (no approved template for this type), so only the response
    // body's actual sent count tells you what really happened.
    const { data, error } = await supabase.functions.invoke('send-whatsapp', { body: { clientId: client.id, type } });
    const actuallySent = !error && data?.sent > 0;
    if (actuallySent) {
      alert(`WhatsApp sent to ${client.org_name}`);
    } else {
      const reason = data?.skipped
        ? 'No approved WhatsApp template exists for this yet.'
        : (error?.message || 'The message failed to send.');
      alert(`WhatsApp NOT sent to ${client.org_name}. ${reason}`);
    }
  }

  const filtered = useMemo(() => {
    let list = [...clients];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.org_name?.toLowerCase().includes(q) || c.contact_person?.toLowerCase().includes(q) || c.phone?.includes(q) || c.district?.toLowerCase().includes(q));
    }
    if (filterStatus) list = list.filter((c) => c.status === filterStatus);
    if (filterType)   list = list.filter((c) => c.apps?.app_type === filterType);
    if (filterTier)   list = list.filter((c) => c.tier === filterTier || c.apps?.subscription_tier === filterTier);
    return list;
  }, [clients, search, filterStatus, filterType, filterTier]);

  const stats = useMemo(() => ({
    total:     clients.length,
    trial:     clients.filter((c) => c.status === 'trial').length,
    active:    clients.filter((c) => c.status === 'active').length,
    suspended: clients.filter((c) => c.status === 'suspended').length,
    mrr:       clients.filter((c) => c.status === 'active').reduce((sum, c) => sum + getPrice(c), 0),
  }), [clients, pricingMap]);

  // Trial expiry check
  const expiringTrials = clients.filter((c) => {
    if (c.status !== 'trial' || !c.trial_ended_at) return false;
    const daysLeft = Math.ceil((new Date(c.trial_ended_at) - Date.now()) / 86400000);
    return daysLeft <= 7 && daysLeft >= 0;
  });

  // Was reachable by anyone at this URL with no check at all — same
  // gap already fixed in FeedbackOverview.jsx and HelpSystemAdmin.jsx.
  if (tenantLoading) return <div style={S.page}><div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</p></div><ControlPanelNav /></div>;

  if (!tenant || !['developer', 'support'].includes(tenant.role)) {
    return <div style={S.page}><div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Control Panel access only.</p></div><ControlPanelNav /></div>;
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>CRM — Client 360°</p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>MPower Control Panel</p>
        </div>
        <button onClick={loadClients} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>↻ Refresh</button>
      </nav>

      <div style={S.inner}>

        {actionError && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#E05A5A' }}>
            ⚠ {actionError}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { value: stats.total,     label: 'Total',     color: '#fff' },
            { value: stats.trial,     label: 'Trial',     color: '#E8A020' },
            { value: stats.active,    label: 'Active',    color: '#6AAA90' },
            { value: stats.suspended, label: 'Suspended', color: '#E05A5A', alert: stats.suspended > 0 },
            { value: `₹${stats.mrr.toLocaleString('en-IN')}`, label: 'MRR', color: '#6AAA90' },
          ].map((s) => (
            <div key={s.label} style={{ ...S.stat, border: `1px solid ${s.alert ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
              <p style={{ fontSize: s.label === 'MRR' ? 14 : 22, fontWeight: 700, margin: 0, color: s.alert ? '#E05A5A' : s.color }}>{s.value}</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Expiring trials alert */}
        {expiringTrials.length > 0 && (
          <div style={{ background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#E8A020', fontWeight: 500 }}>
              ⏰ {expiringTrials.length} trial{expiringTrials.length > 1 ? 's' : ''} expiring within 7 days
            </p>
            {expiringTrials.map((c) => {
              const daysLeft = Math.ceil((new Date(c.trial_ended_at) - Date.now()) / 86400000);
              return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                  <span>{c.org_name}</span>
                  <span style={{ color: daysLeft <= 3 ? '#E05A5A' : '#E8A020' }}>{daysLeft}d left</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input id="crm-search" name="crm-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search org name, contact, district..." style={{ ...S.input, minWidth: 180 }} />
          <select id="crm-filter-status" name="crm-filter-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={S.select}>
            <option value="">All status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select id="crm-filter-type" name="crm-filter-type" value={filterType} onChange={(e) => setFilterType(e.target.value)} style={S.select}>
            <option value="">All types</option>
            {Object.entries(APP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select id="crm-filter-tier" name="crm-filter-tier" value={filterTier} onChange={(e) => setFilterTier(e.target.value)} style={S.select}>
            <option value="">All tiers</option>
            {Object.entries(TIER_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {(search || filterStatus || filterType || filterTier) && (
            <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterType(''); setFilterTier(''); }}
              style={{ padding: '7px 12px', border: '1px solid rgba(224,90,90,0.3)', borderRadius: 7, background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#E05A5A', fontFamily: 'inherit' }}>
              ✕ Clear
            </button>
          )}
        </div>

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
          {filtered.length} client{filtered.length !== 1 ? 's' : ''} shown
        </p>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading clients...</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No clients found</p>
          </div>
        ) : (
          filtered.map((client) => {
            const statusCfg = STATUS_CONFIG[client.status] || STATUS_CONFIG.trial;
            const tier      = client.tier || client.apps?.subscription_tier || 'basic';
            const tierCfg   = TIER_CONFIG[tier] || TIER_CONFIG.basic;
            // FIXED: previously silently defaulted a client with a
            // missing/broken app link to displaying as "School" — no
            // error, no warning, just a wrong label with no sign
            // anything was off. Confirmed via direct query that no
            // real client is affected today, but this closes the gap
            // so a future broken link can never be silently mislabeled
            // again — it now shows an honest "Unknown module" instead.
            const appType   = client.apps?.app_type || null;
            const appInfo   = appType ? (APP_TYPES[appType] || { icon: '\u2753', label: appType }) : { icon: '\u26A0\uFE0F', label: 'Unknown module' };
            const daysLeft  = client.trial_ended_at && client.status === 'trial'
              ? Math.ceil((new Date(client.trial_ended_at) - Date.now()) / 86400000)
              : null;
            // next_renewal already existed as a real column — it was
            // just never shown anywhere. Only meaningful once a client
            // is past trial, so shown here alongside (never instead
            // of) the trial countdown above, whichever applies.
            const renewalDate = client.next_renewal && client.status !== 'trial'
              ? new Date(client.next_renewal).toLocaleDateString('en-IN')
              : null;
            // Prefer the real linked admin (per admin_user_id) over the
            // plain-text contact_person, which has no guaranteed link
            // to who actually logs in — fall back only if no admin is
            // linked yet.
            const adminName  = client.admin_user?.full_name || client.contact_person || '—';
            const adminPhone = client.admin_user?.phone || client.phone;
            const isExpanded = selected?.id === client.id;

            return (
              <div key={client.id} style={S.card}>
                <div onClick={() => isExpanded ? setSelected(null) : loadClientDetails(client)}
                  style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 16 }}>{appInfo.icon}</span>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{client.org_name}</p>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: statusCfg.bg, color: statusCfg.color, fontWeight: 500 }}>{statusCfg.label}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: `${tierCfg.color}15`, color: tierCfg.color }}>{tierCfg.label}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        {adminName}
                        {adminPhone ? ` · ${adminPhone}` : ''}
                        {client.district ? ` · ${client.district}` : ''}
                      </p>
                      {daysLeft !== null && (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: daysLeft <= 3 ? '#E05A5A' : '#E8A020' }}>
                          ⏰ Trial ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                        </p>
                      )}
                      {renewalDate && (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                          📅 Renews {renewalDate}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                        {client.registered_at ? new Date(client.registered_at).toLocaleDateString('en-IN') : ''}
                      </p>
                      <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, marginTop: 4 }}>
                    {loadingDetails ? (
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading details...</p>
                    ) : (
                      <>
                        {/* Quick actions */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                          {client.status !== 'active' && (
                            <button onClick={() => updateStatus(client.id, 'active')}
                              style={{ padding: '7px 14px', border: 'none', borderRadius: 7, background: '#6AAA90', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                              ✓ Activate
                            </button>
                          )}
                          {client.status !== 'suspended' && (
                            <button onClick={() => updateStatus(client.id, 'suspended')}
                              style={{ padding: '7px 14px', border: '1px solid rgba(224,90,90,0.3)', color: '#E05A5A', background: 'rgba(224,90,90,0.06)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                              Suspend
                            </button>
                          )}
                          <button onClick={() => sendWhatsApp(client, 'client_reminder')}
                            style={{ padding: '7px 14px', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', background: 'rgba(37,211,102,0.06)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                            📱 WhatsApp
                          </button>
                          {client.phone && (
                            <a href={`tel:${client.phone}`}
                              style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 7, fontSize: 12, textDecoration: 'none' }}>
                              📞 Call
                            </a>
                          )}
                          {['school', 'hospital'].includes(moduleOf(client)) && (
                            <button onClick={() => (planForm?.clientId === client.id ? setPlanForm(null) : openPlanForm(client))}
                              style={{ padding: '7px 14px', border: '1px solid rgba(90,154,223,0.35)', color: '#5A9ADF', background: 'rgba(90,154,223,0.08)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                              ⇄ Change plan
                            </button>
                          )}
                          <a href={`/control/onboarding/${client.id}`}
                            style={{ padding: '7px 14px', border: '1px solid rgba(232,160,32,0.3)', color: '#E8A020', background: 'rgba(232,160,32,0.06)', borderRadius: 7, fontSize: 12, textDecoration: 'none' }}>
                            🚀 Onboarding
                          </a>
                        </div>

                        {planMsg && selected?.id === client.id && (
                          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.25)', borderRadius: 8, padding: '9px 12px', marginBottom: 12, fontSize: 12, color: '#6AAA90' }}>✓ {planMsg}</div>
                        )}

                        {planForm?.clientId === client.id && (
                          <div style={{ background: '#111113', border: '1px solid rgba(90,154,223,0.25)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                            <p style={{ margin: '0 0 10px', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>CHANGE PLAN</p>
                            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                              Now: {TIER_CONFIG[tier]?.label || tier} · {getMonthsLabel(client.billing_period_months)}
                            </p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                              <select id={`plan-tier-${client.id}`} name="plan-tier" value={planForm.tier} onChange={(e) => updatePlanForm({ tier: e.target.value })} style={S.select}>
                                {plansFor(client).map((p) => (
                                  <option key={p.tier} value={p.tier}>{p.name || TIER_CONFIG[p.tier]?.label || p.tier} — ₹{Number(p.price).toLocaleString('en-IN')}/mo</option>
                                ))}
                              </select>
                              <select id={`plan-months-${client.id}`} name="plan-months" value={planForm.months} onChange={(e) => updatePlanForm({ months: Number(e.target.value) })} style={S.select}>
                                <option value={1}>Monthly</option>
                                <option value={6}>6 months in advance</option>
                                <option value={12}>12 months in advance</option>
                              </select>
                            </div>
                            <input id={`plan-note-${client.id}`} name="plan-note" value={planForm.note} onChange={(e) => setPlanForm({ ...planForm, note: e.target.value })}
                              placeholder="Note, e.g. requested by email 11 Oct" style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6, cursor: 'pointer' }}>
                              <input type="checkbox" checked={planForm.createInvoice} onChange={(e) => updatePlanForm({ createInvoice: e.target.checked })} /> Create invoice now
                            </label>
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 12, cursor: 'pointer' }}>
                              <input type="checkbox" checked={planForm.activate} onChange={(e) => updatePlanForm({ activate: e.target.checked })} /> Mark client Active
                            </label>

                            {planPreview?.error && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#E05A5A' }}>⚠ {planPreview.error}</p>}
                            {planPreview && !planPreview.error && (
                              <div style={{ background: '#161618', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
                                {planPreview.invoice_action !== 'none' && (
                                  <>
                                    List price ₹{Number(planPreview.list_price).toLocaleString('en-IN')} × {planPreview.months} month{planPreview.months > 1 ? 's' : ''}
                                    {planPreview.discount_pct > 0 ? ` − ${planPreview.discount_pct}% advance discount` : ''} = ₹{Number(planPreview.base).toLocaleString('en-IN')}<br />
                                    {planPreview.gst_rate > 0 && <>GST {planPreview.gst_rate}%: ₹{Number(planPreview.gst).toLocaleString('en-IN')}<br /></>}
                                    <strong style={{ color: '#fff' }}>Client pays ₹{Number(planPreview.total).toLocaleString('en-IN')}</strong><br />
                                  </>
                                )}
                                <span style={{ color: planPreview.invoice_action === 'blocked' ? '#E05A5A' : 'rgba(255,255,255,0.45)' }}>{planPreview.invoice_note}</span>
                              </div>
                            )}

                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => confirmPlanChange(client)}
                                disabled={planBusy || !planPreview || !!planPreview.error || planPreview.invoice_action === 'blocked'}
                                style={{ padding: '8px 16px', border: 'none', borderRadius: 7, background: '#5A9ADF', color: '#111113', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                                  opacity: (planBusy || !planPreview || planPreview.error || planPreview.invoice_action === 'blocked') ? 0.4 : 1 }}>
                                {planBusy ? 'Saving…' : 'Confirm change'}
                              </button>
                              <button onClick={() => { setPlanForm(null); setPlanPreview(null); }}
                                style={{ padding: '8px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Recent tickets */}
                        {clientDetails?.tickets?.length > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, margin: '0 0 8px' }}>RECENT TICKETS</p>
                            {clientDetails.tickets.map((t) => (
                              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
                                <span style={{ color: 'rgba(255,255,255,0.6)' }}>{t.subject}</span>
                                <span style={{ color: t.status === 'open' ? '#E8A020' : '#6AAA90' }}>{t.status}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Onboarding status */}
                        {clientDetails?.onboarding && (
                          <div style={{ background: '#111113', borderRadius: 8, padding: '10px 12px' }}>
                            <p style={{ margin: '0 0 6px', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>ONBOARDING</p>
                            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                              Go-live: {clientDetails.onboarding.ack_signed ? (
                                <span style={{ color: '#6AAA90' }}>✓ Acknowledged</span>
                              ) : (
                                <span style={{ color: '#E8A020' }}>Pending</span>
                              )}
                              {clientDetails.onboarding.golive_at ? ` · ${new Date(clientDetails.onboarding.golive_at).toLocaleDateString('en-IN')}` : ''}
                            </p>
                          </div>
                        )}

                        {/* Lifetime billing — was previously invisible
                            entirely; only the last 5 invoices were ever
                            fetched, with nothing summing the real total
                            billed/received/outstanding for this client. */}
                        {clientDetails?.lifetime && clientDetails.lifetime.invoiceCount > 0 && (
                          <div style={{ marginTop: 14, background: '#111113', borderRadius: 8, padding: '10px 12px' }}>
                            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
                              LIFETIME ({clientDetails.lifetime.invoiceCount} invoice{clientDetails.lifetime.invoiceCount !== 1 ? 's' : ''})
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                              <div>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff' }}>₹{clientDetails.lifetime.totalBilled.toLocaleString('en-IN')}</p>
                                <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Billed</p>
                              </div>
                              <div>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#6AAA90' }}>₹{clientDetails.lifetime.totalReceived.toLocaleString('en-IN')}</p>
                                <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Received</p>
                              </div>
                              <div>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: clientDetails.lifetime.balance > 0 ? '#E8A020' : '#6AAA90' }}>₹{clientDetails.lifetime.balance.toLocaleString('en-IN')}</p>
                                <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Balance</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {clientDetails?.planHistory?.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, margin: '0 0 8px' }}>PLAN CHANGES</p>
                            {clientDetails.planHistory.map((h) => (
                              <div key={h.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                                {new Date(h.changed_at).toLocaleDateString('en-IN')} · {TIER_CONFIG[h.old_tier]?.label || h.old_tier || '—'} → {TIER_CONFIG[h.new_tier]?.label || h.new_tier}
                                {h.new_months > 1 ? ` · ${h.new_months} months` : ''}
                                {h.invoice_total ? ` · ₹${Number(h.invoice_total).toLocaleString('en-IN')}` : ''}
                                {h.note ? ` · ${h.note}` : ''}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Recent billing — data was already being
                            fetched here but never actually shown */}
                        {clientDetails?.billing?.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, margin: '0 0 8px' }}>RECENT BILLING</p>
                            {clientDetails.billing.map((inv) => (
                              <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
                                <span style={{ color: 'rgba(255,255,255,0.6)' }}>₹{Number(inv.amount).toLocaleString('en-IN')} · Due {inv.due_date}</span>
                                <span style={{ color: inv.status === 'paid' ? '#6AAA90' : '#E8A020' }}>{inv.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        <Link to="/control/feedback"
          style={{ display: 'block', textAlign: 'center', marginTop: 16, padding: '12px 16px', background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
          💬 View App Feedback (all modules)
        </Link>
      </div>

      <ControlPanelNav />
      <BugReporter screenName="crm_client_view" />
    </div>
  );
}