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
  other:           { color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.06)', label: '📌 Other', sla: 48 },
};

const STATUS_CONFIG = {
  open:        { color: '#E8A020', label: 'Open' },
  in_progress: { color: '#5A9ADF', label: 'In Progress' },
  resolved:    { color: '#6AAA90', label: 'Resolved' },
  closed:      { color: 'rgba(255,255,255,0.6)', label: 'Closed' },
};

// ─────────────────────────────────────────────────────────────
// Modification requests — team review screen
// The database enforces the rules (allowed status changes, quote needs
// amount + days + scope, paid fields cannot be edited here). This screen
// only offers the buttons that are valid for each status.
// ─────────────────────────────────────────────────────────────
const MOD_STATUS = {
  submitted:      { color: '#9A8AE0', label: 'Submitted' },
  reviewed:       { color: '#5A9ADF', label: 'Reviewed' },
  quote_sent:     { color: '#E8A020', label: 'Quote sent — waiting for payment' },
  in_development: { color: '#E8A020', label: 'Paid — in development' },
  delivered:      { color: '#6AAA90', label: 'Delivered' },
  closed:         { color: 'rgba(255,255,255,0.6)', label: 'Closed' },
};

function ModRequestsAdmin() {
  const [rows, setRows]         = useState([]);
  const [issues, setIssues]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('active');
  const [openId, setOpenId]     = useState(null);
  const [err, setErr]           = useState('');
  const [busy, setBusy]         = useState(false);
  const [quote, setQuote]       = useState({ amount: '', days: '', scope: '' });
  const [quoteFor, setQuoteFor] = useState(null);
  const [notes, setNotes]       = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setErr('');
    const { data, error } = await supabase
      .from('modification_requests')
      .select('*, crm_clients(org_name, phone, district)')
      .order('created_at', { ascending: false });
    if (error) setErr(`Could not load requests: ${error.message}`);
    setRows(data || []);
    const { data: iss } = await supabase
      .from('payment_issues').select('*').eq('resolved', false).order('created_at', { ascending: false });
    setIssues(iss || []);
    setLoading(false);
  }

  async function change(id, patch) {
    setBusy(true);
    setErr('');
    const { data, error } = await supabase
      .from('modification_requests').update(patch).eq('id', id)
      .select('*, crm_clients(org_name, phone, district)');
    setBusy(false);
    if (error) { setErr(error.message || 'Could not save. Please try again.'); return false; }
    if (!data || data.length === 0) { setErr('Nothing was changed — you may not have permission.'); return false; }
    setRows((prev) => prev.map((r) => (r.id === id ? data[0] : r)));
    return true;
  }

  async function sendQuote(id) {
    const amount = Number(quote.amount);
    const days = parseInt(quote.days, 10);
    if (!amount || amount <= 0) { setErr('Enter the quote amount in rupees.'); return; }
    if (!days || days <= 0)     { setErr('Enter the number of working days.'); return; }
    if (!quote.scope.trim())    { setErr('Describe the scope of work.'); return; }
    const ok = await change(id, { status: 'quote_sent', quote_amount: amount, quote_days: days, quote_scope: quote.scope.trim() });
    if (ok) { setQuoteFor(null); setQuote({ amount: '', days: '', scope: '' }); }
  }

  async function deliver(id) {
    const ok = await change(id, { status: 'delivered', delivery_notes: notes.trim() || null });
    if (ok) setNotes('');
  }

  async function resolveIssue(id) {
    const { error } = await supabase.from('payment_issues').update({ resolved: true }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setIssues((prev) => prev.filter((i) => i.id !== id));
  }

  const shown = rows.filter((r) => filter === 'all' ? true : filter === 'active' ? r.status !== 'closed' : r.status === filter);
  const btn = (bg, color, border) => ({ padding: '8px 14px', background: bg, color, border: `1px solid ${border}`, borderRadius: 7, cursor: busy ? 'not-allowed' : 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600 });

  return (
    <div style={S.inner}>
      {err && (
        <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#E05A5A' }}>⚠ {err}</div>
      )}

      {issues.length > 0 && (
        <div style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#E05A5A', fontWeight: 600 }}>
            ⚠ {issues.length} payment{issues.length > 1 ? 's' : ''} need your attention — money may have been received but was NOT marked paid
          </p>
          {issues.map((i) => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                Payment <span style={{ fontFamily: 'monospace' }}>{i.razorpay_payment_id || '—'}</span> · {i.reason.replace(/_/g, ' ')}
                {i.request_id ? ` · request MOD-${String(i.request_id).slice(0, 6).toUpperCase()}` : ''}
              </p>
              <button onClick={() => resolveIssue(i.id)} style={btn('rgba(106,170,144,0.12)', '#6AAA90', 'rgba(106,170,144,0.2)')}>Mark handled</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select id="mod-filter-status" name="mod-filter-status" value={filter} onChange={(e) => setFilter(e.target.value)} style={S.select}>
          <option value="active">Not closed</option>
          <option value="all">All</option>
          {Object.entries(MOD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={load} style={{ ...S.select, color: 'rgba(255,255,255,0.6)' }}>↻ Refresh</button>
      </div>

      {loading ? (
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading requests...</p>
      ) : shown.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>No requests match this filter.</p>
      ) : shown.map((r) => {
        const cfg = MOD_STATUS[r.status] || MOD_STATUS.submitted;
        const isOpen = openId === r.id;
        return (
          <div key={r.id} style={{ ...S.card, border: `1px solid ${r.status === 'submitted' ? 'rgba(154,138,224,0.35)' : 'rgba(255,255,255,0.07)'}` }}>
            <div onClick={() => { setOpenId(isOpen ? null : r.id); setQuoteFor(null); setNotes(''); setErr(''); }} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#E8A020' }}>MOD-{String(r.id).slice(0, 6).toUpperCase()}</span>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: `${cfg.color}20`, color: cfg.color }}>{cfg.label}</span>
                  {r.urgency && r.urgency !== 'Normal' && (
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: 'rgba(224,90,90,0.12)', color: '#E05A5A' }}>{r.urgency}</span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{r.request_type || 'Request'}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  {r.crm_clients?.org_name || 'Unknown client'}{r.crm_clients?.district ? ` · ${r.crm_clients.district}` : ''} · {new Date(r.created_at).toLocaleDateString('en-IN')}
                </p>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 12, paddingTop: 12 }}>
                {r.screen_name && <p style={{ margin: '0 0 6px', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Screen: {r.screen_name}</p>}
                <div style={{ background: '#111113', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>CLIENT'S REQUEST</p>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.description}</p>
                  {r.crm_clients?.phone && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Contact: {r.crm_clients.phone}</p>}
                </div>

                {r.quote_amount && (
                  <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7 }}>
                    <strong style={{ color: '#E8A020' }}>Quote:</strong> ₹{Number(r.quote_amount).toLocaleString('en-IN')} · {r.quote_days} working day{r.quote_days === 1 ? '' : 's'}
                    {r.quote_scope && <><br /><span style={{ color: 'rgba(255,255,255,0.6)' }}>{r.quote_scope}</span></>}
                  </div>
                )}

                {r.paid_at && (
                  <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7 }}>
                    <strong style={{ color: '#6AAA90' }}>Paid</strong> ₹{Number(r.paid_amount ?? r.quote_amount).toLocaleString('en-IN')} on {new Date(r.paid_at).toLocaleString('en-IN')}
                    <br />Razorpay payment ID: <span style={{ fontFamily: 'monospace' }}>{r.payment_id}</span> (confirmed with Razorpay by the server)
                  </div>
                )}

                {r.delivery_notes && (
                  <p style={{ margin: '0 0 12px', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Delivery notes: {r.delivery_notes}</p>
                )}

                {/* Actions valid for this status */}
                {quoteFor === r.id ? (
                  <div style={{ background: '#111113', borderRadius: 8, padding: 14 }}>
                    <p style={{ margin: '0 0 10px', fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>SEND QUOTE</p>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input id="mod-quote-amount" name="mod-quote-amount" type="number" min="1" value={quote.amount} onChange={(e) => setQuote({ ...quote, amount: e.target.value })} placeholder="Amount ₹" style={{ ...S.input, flex: 1 }} />
                      <input id="mod-quote-days" name="mod-quote-days" type="number" min="1" value={quote.days} onChange={(e) => setQuote({ ...quote, days: e.target.value })} placeholder="Working days" style={{ ...S.input, flex: 1 }} />
                    </div>
                    <textarea id="mod-quote-scope" name="mod-quote-scope" rows={3} value={quote.scope} onChange={(e) => setQuote({ ...quote, scope: e.target.value })} placeholder="Scope of work — exactly what will be delivered" style={{ ...S.input, resize: 'vertical', marginBottom: 10 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={busy} onClick={() => sendQuote(r.id)} style={btn('#E8A020', '#111113', '#E8A020')}>{busy ? '...' : 'Send quote →'}</button>
                      <button onClick={() => setQuoteFor(null)} style={btn('transparent', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.12)')}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {r.status === 'submitted' && (
                      <button disabled={busy} onClick={() => change(r.id, { status: 'reviewed' })} style={btn('rgba(90,154,223,0.12)', '#5A9ADF', 'rgba(90,154,223,0.25)')}>Mark reviewed</button>
                    )}
                    {['submitted', 'reviewed', 'quote_sent'].includes(r.status) && (
                      <button disabled={busy} onClick={() => { setQuoteFor(r.id); setQuote({ amount: r.quote_amount || '', days: r.quote_days || '', scope: r.quote_scope || '' }); setErr(''); }} style={btn('#E8A020', '#111113', '#E8A020')}>
                        {r.status === 'quote_sent' ? 'Change quote' : 'Send quote'}
                      </button>
                    )}
                    {r.status === 'quote_sent' && (
                      <button disabled={busy} onClick={() => change(r.id, { status: 'reviewed' })} style={btn('transparent', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.12)')}>Withdraw quote</button>
                    )}
                    {r.status === 'in_development' && (
                      <div style={{ width: '100%' }}>
                        <textarea id="mod-delivery-notes" name="mod-delivery-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery notes for the client (what changed, where to find it)" style={{ ...S.input, resize: 'vertical', marginBottom: 8 }} />
                        <button disabled={busy} onClick={() => deliver(r.id)} style={btn('rgba(106,170,144,0.15)', '#6AAA90', 'rgba(106,170,144,0.3)')}>{busy ? '...' : '✓ Mark delivered'}</button>
                      </div>
                    )}
                    {['submitted', 'reviewed', 'quote_sent', 'delivered'].includes(r.status) && (
                      <button disabled={busy} onClick={() => { if (window.confirm('Close this request?')) change(r.id, { status: 'closed' }); }} style={btn('transparent', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.12)')}>Close</button>
                    )}
                    {r.status === 'quote_sent' && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)', width: '100%' }}>Waiting for the client to pay. Payment is recorded automatically after Razorpay confirms it.</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SupportTickets() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [tickets, setTickets]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filterStatus, setFilterStatus] = useState('open');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch]         = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText]   = useState('');
  const [messages, setMessages]     = useState([]);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [actionError, setActionError] = useState('');
  const [sending, setSending]       = useState(false);
  const [tab, setTab]               = useState('tickets');

  useEffect(() => { loadTickets(); }, []);

  async function loadTickets() {
    setLoading(true);
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*, crm_clients(org_name, phone, district)')
      .order('raised_at', { ascending: false });
    if (error) {
      console.error('Loading tickets failed:', error);
      setActionError(`Could not load tickets: ${error.message || 'please try again.'}`);
    }
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
      .order('sent_at');
    setMessages(data || []);
    setLoadingMsg(false);
  }

  async function sendReply() {
    if (!replyText.trim() || !replyingTo) return;
    setSending(true);
    setActionError('');
    const { data: msg, error } = await supabase.from('ticket_messages').insert({
      ticket_id:  replyingTo.id,
      sender_type: 'support',
      message:     replyText.trim(),
    }).select().single();
    // Previously: error wasn't even captured, and replyText cleared
    // regardless of outcome — a failed reply looked identical to a
    // sent one, and the agent lost what they'd typed with no way to
    // know it never reached the client.
    if (error) {
      console.error('Sending reply failed:', error);
      setActionError(error.message || 'Failed to send reply. Please try again.');
      setSending(false);
      return;
    }
    setMessages((prev) => [...prev, msg]);
    setReplyText('');
    setSending(false);
    // First reply on a fresh ticket means someone is working on it.
    if (replyingTo.status === 'open') await setStatus(replyingTo.id, 'in_progress');
  }

  async function setStatus(ticketId, status) {
    setActionError('');
    const { error } = await supabase.from('support_tickets').update({ status }).eq('id', ticketId);
    if (error) {
      console.error('Changing ticket status failed:', error);
      setActionError(error.message || 'Failed to change ticket status. Please try again.');
      return;
    }
    setTickets((prev) => prev.map((t) => t.id === ticketId ? { ...t, status } : t));
    setReplyingTo((t) => (t && t.id === ticketId ? { ...t, status } : t));
  }

  async function resolveTicket(ticketId) {
    setActionError('');
    const { error } = await supabase.from('support_tickets').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', ticketId);
    if (error) {
      console.error('Resolving ticket failed:', error);
      setActionError(error.message || 'Failed to resolve ticket. Please try again.');
      return;
    }
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
      const hoursOpen = (Date.now() - new Date(t.raised_at)) / 3600000;
      return hoursOpen > cfg.sla;
    }).length,
  }), [tickets]);

  if (tenantLoading) return <div style={S.page}><div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Loading…</p></div><ControlPanelNav /></div>;
  if (!tenant || !['developer', 'support'].includes(tenant.role)) {
    return <div style={S.page}><div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Control Panel access only.</p></div><ControlPanelNav /></div>;
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>Support Tickets</p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Client support queue</p>
        </div>
        <button onClick={loadTickets} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>↻</button>
      </nav>

      <div style={{ ...S.inner, paddingBottom: 0, paddingTop: 16, display: 'flex', gap: 8 }}>
        {[{ k: 'tickets', l: 'Support tickets' }, { k: 'mods', l: 'Modification requests' }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{ padding: '8px 18px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'mods' && <ModRequestsAdmin />}

      {tab === 'tickets' && (
      <div style={S.inner}>

        {actionError && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#E05A5A' }}>
            ⚠ {actionError}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { value: stats.open,     label: 'Open',         color: '#E8A020', alert: stats.open > 10 },
            { value: stats.progress, label: 'In Progress',  color: '#5A9ADF', alert: false },
            { value: stats.sla,      label: 'SLA Breached', color: '#E05A5A', alert: stats.sla > 0 },
          ].map((s) => (
            <div key={s.label} style={{ background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: `1px solid ${s.alert ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
              <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: s.alert ? '#E05A5A' : s.color }}>{s.value}</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '3px 0 0' }}>{s.label}</p>
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
          <input id="ticket-search" name="ticket-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search tickets..." style={{ ...S.select, flex: 1, minWidth: 160, padding: '9px 12px' }} />
          <select id="ticket-filter-status" name="ticket-filter-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={S.select}>
            <option value="">All status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select id="ticket-filter-type" name="ticket-filter-type" value={filterType} onChange={(e) => setFilterType(e.target.value)} style={S.select}>
            <option value="">All types</option>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading tickets...</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>No tickets match this filter.</p>
        ) : (
          filtered.map((ticket) => {
            const typeCfg   = TYPE_CONFIG[ticket.type] || TYPE_CONFIG.other;
            const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const hoursOpen = (Date.now() - new Date(ticket.raised_at)) / 3600000;
            const slaBreached = hoursOpen > typeCfg.sla && !['resolved', 'closed'].includes(ticket.status);
            const isOpen = replyingTo?.id === ticket.id;

            return (
              <div key={ticket.id} style={{ ...S.card, border: `1px solid ${slaBreached ? 'rgba(224,90,90,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                <div onClick={() => isOpen ? setReplyingTo(null) : openTicket(ticket)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ flex: 1, marginRight: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: typeCfg.bg, color: typeCfg.color, fontWeight: 500 }}>{typeCfg.label}</span>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: `${statusCfg.color}15`, color: statusCfg.color }}>{statusCfg.label}</span>
                        {slaBreached && <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: 'rgba(224,90,90,0.12)', color: '#E05A5A', fontWeight: 600 }}>⚠️ SLA Breached</span>}
                      </div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{ticket.subject}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                        {ticket.crm_clients?.org_name || 'Unknown client'}
                        {ticket.crm_clients?.district ? ` · ${ticket.crm_clients.district}` : ''}
                        {` · ${Math.round(hoursOpen)}h ago`}
                      </p>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Thread */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, marginTop: 4 }}>
                    {loadingMsg ? (
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Loading messages...</p>
                    ) : (
                      <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 12 }}>
                        {messages.length === 0 && (
                          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0 }}>No messages yet — reply below.</p>
                        )}
                        {messages.map((msg) => (
                          <div key={msg.id} style={{ marginBottom: 10, display: 'flex', flexDirection: msg.sender_type === 'support' ? 'row-reverse' : 'row', gap: 8 }}>
                            <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: 10, background: msg.sender_type === 'support' ? 'rgba(232,160,32,0.12)' : '#111113', border: `1px solid ${msg.sender_type === 'support' ? 'rgba(232,160,32,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                              <p style={{ margin: 0, fontSize: 13, color: '#fff', lineHeight: 1.5 }}>{msg.message}</p>
                              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                                {msg.sender_type === 'support' ? 'Support' : 'Client'} · {new Date(msg.sent_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <textarea id="ticket-reply-text" name="ticket-reply-text" value={replyText} onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type reply..." rows={2}
                        style={{ ...S.input, flex: 1, resize: 'none', fontSize: 13 }}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendReply())}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button onClick={sendReply} disabled={sending || !replyText.trim()}
                          style={{ padding: '8px 16px', background: sending || !replyText.trim() ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 7, cursor: sending || !replyText.trim() ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                          {sending ? '...' : 'Send →'}
                        </button>
                        {ticket.status === 'open' && (
                          <button onClick={() => setStatus(ticket.id, 'in_progress')}
                            style={{ padding: '8px 16px', background: 'rgba(90,154,223,0.12)', color: '#5A9ADF', border: '1px solid rgba(90,154,223,0.2)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                            ▶ Start
                          </button>
                        )}
                        {!['resolved', 'closed'].includes(ticket.status) && (
                          <button onClick={() => resolveTicket(ticket.id)}
                            style={{ padding: '8px 16px', background: 'rgba(106,170,144,0.12)', color: '#6AAA90', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
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
      )}

      <ControlPanelNav />
      <BugReporter screenName="support_tickets" />
    </div>
  );
}