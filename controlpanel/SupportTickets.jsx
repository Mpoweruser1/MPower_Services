// controlpanel/SupportTickets.jsx — FINAL
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import ControlPanelNav from '../shared/ControlPanelNav';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 10 },
  input: { width: '100%', padding: '10px 14px', background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  select: { padding: '8px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 12, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
};

const TYPE_CONFIG = {
  bug:             { color: '#E05A5A', bg: 'rgba(224,90,90,0.12)',   label: '🐛 Bug', sla: 4 },
  feature_request: { color: '#9A8AE0', bg: 'rgba(154,138,224,0.12)', label: '💡 Feature', sla: 72 },
  training:        { color: '#5A9ADF', bg: 'rgba(90,154,223,0.12)',  label: '📚 Training', sla: 48 },
  billing:         { color: '#E8A020', bg: 'rgba(232,160,32,0.12)',  label: '💰 Billing', sla: 24 },
  other:           { color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.06)', label: '📌 Other', sla: 48 },
};

const STATUS_CONFIG = {
  open:        { color: '#E8A020', label: 'Open' },
  in_progress: { color: '#5A9ADF', label: 'In Progress' },
  resolved:    { color: '#6AAA90', label: 'Resolved' },
  closed:      { color: 'rgba(255,255,255,0.3)', label: 'Closed' },
};

export default function SupportTickets() {
  const { tenant } = useTenant();
  const [tickets, setTickets]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filterStatus, setFilterStatus] = useState('open');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch]         = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText]   = useState('');
  const [messages, setMessages]     = useState([]);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [sending, setSending]       = useState(false);

  useEffect(() => { loadTickets(); }, []);

  async function loadTickets() {
    setLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('*, crm_clients(org_name, phone, district)')
      .order('created_at', { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  async function openTicket(ticket) {
    setReplyingTo(ticket);
    setReplyText('');
    setLoadingMsg(true);
    const { data } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at');
    setMessages(data || []);
    setLoadingMsg(false);
  }

  async function sendReply() {
    if (!replyText.trim() || !replyingTo) return;
    setSending(true);
    const { data: msg } = await supabase.from('ticket_messages').insert({
      ticket_id:  replyingTo.id,
      sender_type: 'support',
      sender_id:   tenant.userRowId,
      message:     replyText.trim(),
    }).select().single();
    if (msg) setMessages((prev) => [...prev, msg]);
    setReplyText('');
    setSending(false);
  }

  async function resolveTicket(ticketId) {
    await supabase.from('support_tickets').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', ticketId);
    setTickets((prev) => prev.map((t) => t.id === ticketId ? { ...t, status: 'resolved' } : t));
    if (replyingTo?.id === ticketId) setReplyingTo((t) => ({ ...t, status: 'resolved' }));
  }

  const filtered = useMemo(() => {
    let list = [...tickets];
    if (filterStatus) list = list.filter((t) => t.status === filterStatus);
    if (filterType)   list = list.filter((t) => t.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.subject?.toLowerCase().includes(q) || t.crm_clients?.org_name?.toLowerCase().includes(q));
    }
    return list;
  }, [tickets, filterStatus, filterType, search]);

  const stats = useMemo(() => ({
    open:     tickets.filter((t) => t.status === 'open').length,
    progress: tickets.filter((t) => t.status === 'in_progress').length,
    sla:      tickets.filter((t) => {
      if (['resolved', 'closed'].includes(t.status)) return false;
      const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.other;
      const hoursOpen = (Date.now() - new Date(t.created_at)) / 3600000;
      return hoursOpen > cfg.sla;
    }).length,
  }), [tickets]);

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>Support Tickets</p>
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Client support queue</p>
        </div>
        <button onClick={loadTickets} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>↻</button>
      </nav>

      <div style={S.inner}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { value: stats.open,     label: 'Open',         color: '#E8A020', alert: stats.open > 10 },
            { value: stats.progress, label: 'In Progress',  color: '#5A9ADF', alert: false },
            { value: stats.sla,      label: 'SLA Breached', color: '#E05A5A', alert: stats.sla > 0 },
          ].map((s) => (
            <div key={s.label} style={{ background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: `1px solid ${s.alert ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
              <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: s.alert ? '#E05A5A' : s.color }}>{s.value}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {stats.sla > 0 && (
          <div style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
              ⚠️ {stats.sla} ticket{stats.sla > 1 ? 's' : ''} breached SLA — respond immediately
            </p>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search tickets..." style={{ ...S.select, flex: 1, minWidth: 160, padding: '9px 12px' }} />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={S.select}>
            <option value="">All status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={S.select}>
            <option value="">All types</option>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading tickets...</p>
        ) : (
          filtered.map((ticket) => {
            const typeCfg   = TYPE_CONFIG[ticket.type] || TYPE_CONFIG.other;
            const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const hoursOpen = (Date.now() - new Date(ticket.created_at)) / 3600000;
            const slaBreached = hoursOpen > typeCfg.sla && !['resolved', 'closed'].includes(ticket.status);
            const isOpen = replyingTo?.id === ticket.id;

            return (
              <div key={ticket.id} style={{ ...S.card, border: `1px solid ${slaBreached ? 'rgba(224,90,90,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                <div onClick={() => isOpen ? setReplyingTo(null) : openTicket(ticket)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: typeCfg.bg, color: typeCfg.color, fontWeight: 500 }}>{typeCfg.label}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: `${statusCfg.color}15`, color: statusCfg.color }}>{statusCfg.label}</span>
                        {slaBreached && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'rgba(224,90,90,0.12)', color: '#E05A5A', fontWeight: 600 }}>⚠️ SLA Breached</span>}
                      </div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{ticket.subject}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        {ticket.crm_clients?.org_name || 'Unknown client'}
                        {ticket.crm_clients?.district ? ` · ${ticket.crm_clients.district}` : ''}
                        {` · ${Math.round(hoursOpen)}h ago`}
                      </p>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Thread */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, marginTop: 4 }}>
                    {loadingMsg ? (
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading messages...</p>
                    ) : (
                      <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 12 }}>
                        {messages.length === 0 && (
                          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0 }}>No messages yet — reply below.</p>
                        )}
                        {messages.map((msg) => (
                          <div key={msg.id} style={{ marginBottom: 10, display: 'flex', flexDirection: msg.sender_type === 'support' ? 'row-reverse' : 'row', gap: 8 }}>
                            <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: 10, background: msg.sender_type === 'support' ? 'rgba(232,160,32,0.12)' : '#111113', border: `1px solid ${msg.sender_type === 'support' ? 'rgba(232,160,32,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                              <p style={{ margin: 0, fontSize: 13, color: '#fff', lineHeight: 1.5 }}>{msg.message}</p>
                              <p style={{ margin: '4px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                                {msg.sender_type === 'support' ? 'Support' : 'Client'} · {new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type reply..." rows={2}
                        style={{ ...S.input, flex: 1, resize: 'none', fontSize: 13 }}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendReply())}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button onClick={sendReply} disabled={sending || !replyText.trim()}
                          style={{ padding: '8px 16px', background: sending || !replyText.trim() ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 7, cursor: sending || !replyText.trim() ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                          {sending ? '...' : 'Send →'}
                        </button>
                        {!['resolved', 'closed'].includes(ticket.status) && (
                          <button onClick={() => resolveTicket(ticket.id)}
                            style={{ padding: '8px 16px', background: 'rgba(106,170,144,0.12)', color: '#6AAA90', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                            ✓ Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <ControlPanelNav />
      <BugReporter screenName="support_tickets" />
    </div>
  );
}