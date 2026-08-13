// controlpanel/CrmClientView.jsx — FINAL
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
  select: { padding: '8px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 12, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
  input: { padding: '9px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 13, color: '#fff', outline: 'none', fontFamily: 'inherit', flex: 1 },
};

const STATUS_CONFIG = {
  trial:    { color: '#E8A020', bg: 'rgba(232,160,32,0.12)',  label: 'Trial' },
  active:   { color: '#6AAA90', bg: 'rgba(106,170,144,0.12)', label: 'Active' },
  suspended:{ color: '#E05A5A', bg: 'rgba(224,90,90,0.12)',   label: 'Suspended' },
  churned:  { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.06)', label: 'Churned' },
};

const TIER_CONFIG = {
  basic:       { color: '#6AAA90', label: 'Basic' },
  standard:    { color: '#5A9ADF', label: 'Standard' },
  advanced:    { color: '#9A8AE0', label: 'Advanced' },
  specialised: { color: '#E8A020', label: 'Specialised' },
};

const APP_TYPES = {
  school:   { icon: '🏫', label: 'School' },
  hospital: { icon: '🏥', label: 'Hospital' },
  grievance:{ icon: '🏛️', label: 'CTS' },
};

export default function CrmClientView() {
  const { tenant } = useTenant();
  const [clients, setClients]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [selected, setSelected]     = useState(null);
  const [clientDetails, setClientDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    setLoading(true);
    const { data } = await supabase
      .from('crm_clients')
      .select('*, apps(app_type, subscription_tier, active_modules)')
      .order('created_at', { ascending: false });
    setClients(data || []);
    setLoading(false);
  }

  async function loadClientDetails(client) {
    setSelected(client);
    setLoadingDetails(true);

    const [ticketsRes, onboardRes, billingRes] = await Promise.allSettled([
      supabase.from('support_tickets').select('id, subject, status, created_at')
        .eq('client_id', client.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('client_onboarding').select('*').eq('client_id', client.id).single(),
      supabase.from('billing_invoices_platform').select('id, amount, status, due_date')
        .eq('client_id', client.id).order('due_date', { ascending: false }).limit(5),
    ]);

    setClientDetails({
      tickets:    ticketsRes.status === 'fulfilled' ? (ticketsRes.value.data || []) : [],
      onboarding: onboardRes.status === 'fulfilled' ? onboardRes.value.data : null,
      billing:    billingRes.status === 'fulfilled' ? (billingRes.value.data || []) : [],
    });
    setLoadingDetails(false);
  }

  async function updateStatus(clientId, newStatus) {
    await supabase.from('crm_clients').update({ status: newStatus }).eq('id', clientId);
    setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, status: newStatus } : c));
    if (selected?.id === clientId) setSelected((s) => ({ ...s, status: newStatus }));
  }

  async function sendWhatsApp(client, type) {
    await supabase.functions.invoke('send-whatsapp', { body: { clientId: client.id, type } });
    alert(`WhatsApp sent to ${client.org_name}`);
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
    mrr:       clients.filter((c) => c.status === 'active').reduce((sum, c) => {
      const tier = c.tier || c.apps?.subscription_tier || 'basic';
      const prices = { basic: 299, standard: 599, advanced: 999, specialised: 1999 };
      return sum + (prices[tier] || 0);
    }, 0),
  }), [clients]);

  // Trial expiry check
  const expiringTrials = clients.filter((c) => {
    if (c.status !== 'trial' || !c.trial_ended_at) return false;
    const daysLeft = Math.ceil((new Date(c.trial_ended_at) - Date.now()) / 86400000);
    return daysLeft <= 7 && daysLeft >= 0;
  });

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
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search org name, contact, district..." style={{ ...S.input, minWidth: 180 }} />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={S.select}>
            <option value="">All status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={S.select}>
            <option value="">All types</option>
            {Object.entries(APP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} style={S.select}>
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
            const appType   = client.apps?.app_type || 'school';
            const appInfo   = APP_TYPES[appType] || APP_TYPES.school;
            const daysLeft  = client.trial_ended_at && client.status === 'trial'
              ? Math.ceil((new Date(client.trial_ended_at) - Date.now()) / 86400000)
              : null;
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
                        {client.contact_person || '—'}
                        {client.phone ? ` · ${client.phone}` : ''}
                        {client.district ? ` · ${client.district}` : ''}
                      </p>
                      {daysLeft !== null && (
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: daysLeft <= 3 ? '#E05A5A' : '#E8A020' }}>
                          ⏰ Trial ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                        {new Date(client.created_at).toLocaleDateString('en-IN')}
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
                          <a href={`/control/onboarding/${client.id}`}
                            style={{ padding: '7px 14px', border: '1px solid rgba(232,160,32,0.3)', color: '#E8A020', background: 'rgba(232,160,32,0.06)', borderRadius: 7, fontSize: 12, textDecoration: 'none' }}>
                            🚀 Onboarding
                          </a>
                        </div>

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
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        <a href="/control/feedback"
          style={{ display: 'block', textAlign: 'center', marginTop: 16, padding: '12px 16px', background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
          💬 View App Feedback (all modules)
        </a>
      </div>

      <ControlPanelNav />
      <BugReporter screenName="crm_client_view" />
    </div>
  );
}