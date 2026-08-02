// controlpanel/ModificationRequestPortal.jsx — FINAL
// Supabase wired — no mock data
// Full workflow: Submit → Reviewed → Quote sent → Pay → In development → Delivered
// Razorpay payment via PayButton component
// WhatsApp notification on submit
// Dark theme

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import PayButton from '../shared/PayButton';
import ControlPanelNav from '../shared/ControlPanelNav';
import BugReporter from '../shared/BugReporter';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const REQUEST_TYPES = [
  'Add Telugu to report card',
  'New fee type / category',
  'Custom certificate format',
  'New report (custom filters)',
  'Extra module / feature',
  'WhatsApp template customisation',
  'Integration with another system',
  'Something else',
];

const STEP_LABELS = ['Submitted', 'Reviewed', 'Quote sent', 'In development', 'Delivered'];
const STEP_INDEX  = {
  submitted:      0,
  reviewed:       1,
  quote_sent:     2,
  in_development: 3,
  delivered:      4,
  closed:         4,
};

const STATUS_CONFIG = {
  submitted:      { color: '#9A8AE0', bg: 'rgba(154,138,224,0.12)', label: 'Submitted' },
  reviewed:       { color: '#5A9ADF', bg: 'rgba(90,154,223,0.12)',  label: 'Reviewed' },
  quote_sent:     { color: '#E8A020', bg: 'rgba(232,160,32,0.12)',  label: 'Quote sent' },
  in_development: { color: '#E8A020', bg: 'rgba(232,160,32,0.12)',  label: 'In development' },
  delivered:      { color: '#6AAA90', bg: 'rgba(106,170,144,0.12)', label: 'Delivered' },
  closed:         { color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.06)', label: 'Closed' },
};

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 14 },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  select: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer' },
  textarea: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 },
};

// ─────────────────────────────────────────────────────────────
// Step tracker
// ─────────────────────────────────────────────────────────────
function StepTracker({ status }) {
  const current = STEP_INDEX[status] ?? 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '14px 0' }}>
      {STEP_LABELS.map((label, i) => (
        <React.Fragment key={label}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: i < current ? 'rgba(106,170,144,0.2)' : i === current ? '#E8A020' : 'rgba(255,255,255,0.08)',
              color:      i < current ? '#6AAA90'               : i === current ? '#111113' : 'rgba(255,255,255,0.3)',
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 12, color: i === current ? '#E8A020' : i < current ? '#6AAA90' : 'rgba(255,255,255,0.3)', textAlign: 'center', maxWidth: 58, lineHeight: 1.3 }}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div style={{ flex: 1, height: 1, background: i < current ? '#6AAA90' : 'rgba(255,255,255,0.08)', margin: '0 4px 18px' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Raise request form
// ─────────────────────────────────────────────────────────────
function RaiseRequestForm({ onSubmit, submitting }) {
  const [type, setType]           = useState(REQUEST_TYPES[0]);
  const [description, setDescription] = useState('');
  const [urgency, setUrgency]     = useState('Normal');
  const [screen, setScreen]       = useState('');

  function submit() {
    if (!description.trim()) { alert('Describe what you need.'); return; }
    onSubmit({ type, description: description.trim(), urgency, screen: screen.trim() });
  }

  return (
    <div style={S.card}>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>
        New modification request
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>What do you need? *</label>
        <select value={type} onChange={(e) => setType(e.target.value)} style={S.select}>
          {REQUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>Which screen or module? (optional)</label>
        <input value={screen} onChange={(e) => setScreen(e.target.value)}
          placeholder="e.g. Fee collection, TC printout, OPD visit"
          style={S.input} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>Describe what you need *</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Be specific — what field, what format, what data should appear, any sample or reference document..."
          style={S.textarea}
        />
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 5 }}>
          {description.length} characters — the more detail, the faster we can quote.
        </p>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={S.label}>Urgency</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { value: 'Normal', label: 'Normal', sub: 'Within usual SLA' },
            { value: 'High',   label: 'High',   sub: 'Needed this week' },
            { value: 'Urgent', label: 'Urgent', sub: 'Needed urgently' },
          ].map((u) => (
            <label key={u.value} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${urgency === u.value ? 'rgba(232,160,32,0.4)' : 'rgba(255,255,255,0.07)'}`, background: urgency === u.value ? 'rgba(232,160,32,0.06)' : '#111113' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="urgency" value={u.value} checked={urgency === u.value} onChange={() => setUrgency(u.value)} style={{ accentColor: '#E8A020' }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: urgency === u.value ? '#E8A020' : '#fff' }}>{u.label}</span>
              </div>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 20 }}>{u.sub}</span>
            </label>
          ))}
        </div>
      </div>

      {/* T&C note */}
      <div style={{ background: '#111113', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
        📋 No charge for the quote. Work begins <strong style={{ color: 'rgba(255,255,255,0.6)' }}>only after you accept and pay</strong> (per Terms §6A).
        <br />We review and send a quote within <strong style={{ color: 'rgba(255,255,255,0.6)' }}>2 working days</strong>.
      </div>

      <button onClick={submit} disabled={submitting || !description.trim()}
        style={{ width: '100%', padding: 13, background: submitting || !description.trim() ? 'rgba(255,255,255,0.08)' : '#E8A020', color: submitting || !description.trim() ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: submitting || !description.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
        {submitting ? 'Submitting...' : 'Submit modification request →'}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Request card
// ─────────────────────────────────────────────────────────────
function RequestCard({ req, tenant, onPaySuccess }) {
  const [expanded, setExpanded] = useState(req.status === 'quote_sent'); // auto-open when quote arrived
  const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.submitted;
  const hasQuote  = req.quote_amount && req.status === 'quote_sent' && !req.paid_at;

  return (
    <div style={{ ...S.card, border: `1px solid ${hasQuote ? 'rgba(232,160,32,0.3)' : 'rgba(255,255,255,0.07)'}` }}>

      {/* Card header */}
      <div onClick={() => setExpanded((e) => !e)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#E8A020' }}>
                MOD-{req.id?.slice(0, 6).toUpperCase()}
              </span>
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: statusCfg.bg, color: statusCfg.color, fontWeight: 500 }}>
                {statusCfg.label}
              </span>
              {req.urgency && req.urgency !== 'Normal' && (
                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: 'rgba(224,90,90,0.12)', color: '#E05A5A' }}>
                  {req.urgency}
                </span>
              )}
              {hasQuote && (
                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: 'rgba(232,160,32,0.15)', color: '#E8A020', fontWeight: 600, animation: 'pulse 2s infinite' }}>
                  💡 Quote ready — action needed!
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{req.request_type}</p>
            {req.screen_name && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Screen: {req.screen_name}</p>
            )}
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              {new Date(req.created_at).toLocaleDateString('en-IN')}
            </p>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, flexShrink: 0 }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>

        {/* Step tracker always visible */}
        <StepTracker status={req.status} />
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>

          {/* Request description */}
          <div style={{ background: '#111113', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>YOUR REQUEST</p>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>{req.description}</p>
          </div>

          {/* Status-specific content */}

          {/* Submitted — waiting */}
          {req.status === 'submitted' && (
            <div style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'rgba(154,138,224,0.06)', border: '1px solid rgba(154,138,224,0.15)', borderRadius: 10 }}>
              <span style={{ fontSize: 22 }}>🕐</span>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 500, color: '#9A8AE0' }}>Request received — under review</p>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                  Our team will review your request and send a quote within <strong>2 working days</strong>.<br />
                  You will be notified via WhatsApp when the quote is ready.
                </p>
              </div>
            </div>
          )}

          {/* Reviewed — being assessed */}
          {req.status === 'reviewed' && (
            <div style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'rgba(90,154,223,0.06)', border: '1px solid rgba(90,154,223,0.15)', borderRadius: 10 }}>
              <span style={{ fontSize: 22 }}>🔍</span>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 500, color: '#5A9ADF' }}>Under technical review</p>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                  We are assessing feasibility and preparing your quote. Should be ready shortly.
                </p>
              </div>
            </div>
          )}

          {/* Quote sent — action needed */}
          {req.status === 'quote_sent' && req.quote_amount && !req.paid_at && (
            <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.25)', borderRadius: 12, padding: '16px' }}>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>QUOTE DETAILS · ఉల్లేఖన వివరాలు</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ background: '#111113', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                  <p style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#E8A020' }}>
                    ₹{Number(req.quote_amount).toLocaleString('en-IN')}
                  </p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' }}>One-time charge</p>
                </div>
                <div style={{ background: '#111113', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                  <p style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#9A8AE0' }}>
                    {req.quote_days} {req.quote_days === 1 ? 'day' : 'days'}
                  </p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' }}>Delivery after payment</p>
                </div>
              </div>

              {/* Quote scope */}
              {req.quote_scope && (
                <div style={{ background: '#111113', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>SCOPE OF WORK</p>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>{req.quote_scope}</p>
                </div>
              )}

              {/* Payment terms note */}
              <div style={{ background: 'rgba(154,138,224,0.06)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
                ✅ Accept this quote by making payment below.<br />
                Development starts immediately after payment confirmation.<br />
                Per Terms §6A — full payment required before development begins.
              </div>

              {/* Razorpay payment button */}
              <PayButton
                amount={req.quote_amount * 100}
                label={`Accept & Pay ₹${Number(req.quote_amount).toLocaleString('en-IN')} — Start development`}
                purpose="modification_request"
                modRequestId={req.id}
                clientId={tenant?.clientId}
                customerName={tenant?.fullName}
                customerPhone={tenant?.phone}
                description={`MPower Modification: ${req.request_type}`}
                onSuccess={(paymentId) => onPaySuccess(req.id, paymentId)}
              />

              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 10 }}>
                UPI · Cards · Net Banking · Wallets accepted
              </p>
            </div>
          )}

          {/* Already paid — in development */}
          {req.status === 'in_development' && (
            <div style={{ display: 'flex', gap: 12, padding: '12px 14px', background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10 }}>
              <span style={{ fontSize: 22 }}>⚙️</span>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 500, color: '#E8A020' }}>
                  In development · అభివృద్ధిలో ఉంది
                </p>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                  {req.quote_amount && <span>Payment received — ₹{Number(req.quote_amount).toLocaleString('en-IN')} · </span>}
                  {req.paid_at && <span>Paid {new Date(req.paid_at).toLocaleDateString('en-IN')} · </span>}
                  {req.quote_days && <span>Estimated {req.quote_days} working days from payment.</span>}
                  <br />You will be notified via WhatsApp when your modification is ready.
                </p>
              </div>
            </div>
          )}

          {/* Delivered */}
          {req.status === 'delivered' && (
            <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: req.delivery_notes ? 12 : 0 }}>
                <span style={{ fontSize: 26 }}>✅</span>
                <div>
                  <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#6AAA90' }}>
                    Delivered — live in your app!
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    {req.delivered_at ? `Delivered on ${new Date(req.delivered_at).toLocaleDateString('en-IN')}` : ''}
                    {req.quote_amount ? ` · ₹${Number(req.quote_amount).toLocaleString('en-IN')} paid` : ''}
                  </p>
                </div>
              </div>
              {req.delivery_notes && (
                <div style={{ background: '#111113', borderRadius: 8, padding: '10px 14px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>DELIVERY NOTES</p>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{req.delivery_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Closed */}
          {req.status === 'closed' && (
            <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
              🔒 This request has been closed.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function ModificationRequestPortal() {
  const { tenant } = useTenant();
  const [requests, setRequests]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState('status');
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    if (tenant?.clientId) loadRequests();
  }, [tenant?.clientId]);

  async function loadRequests() {
    setLoading(true);
    const { data, error } = await supabase
      .from('modification_requests')
      .select('*')
      .eq('client_id', tenant.clientId)
      .order('created_at', { ascending: false });
    if (!error) setRequests(data || []);
    setLoading(false);
  }

  async function handleSubmit({ type, description, urgency, screen }) {
    setSubmitting(true);

    const { data: newReq, error } = await supabase
      .from('modification_requests')
      .insert({
        client_id:    tenant.clientId,
        app_id:       tenant.appId,
        request_type: type,
        description,
        urgency,
        screen_name:  screen || null,
        status:       'submitted',
      })
      .select()
      .single();

    if (error) {
      alert('Failed to submit request. Please try again.');
      setSubmitting(false);
      return;
    }

    // WhatsApp notification to support team — uses clientId to resolve phone
    await supabase.functions.invoke('send-whatsapp', {
      body: {
        type:        'mod_request_received',
        clientId:    tenant.clientId,
        requestType: type,
        description: description.slice(0, 100),
        urgency,
      },
    });

    setRequests((prev) => [newReq, ...prev]);
    setSubmitting(false);
    setJustSubmitted(true);
    setTab('status');
    setTimeout(() => setJustSubmitted(false), 6000);
  }

  async function handlePaySuccess(reqId, paymentId) {
    // Update DB — mark as in_development + save payment id
    await supabase.from('modification_requests')
      .update({
        status:     'in_development',
        paid_at:    new Date().toISOString(),
        payment_id: paymentId,
      })
      .eq('id', reqId);

    // WhatsApp confirmation to client
    await supabase.functions.invoke('send-whatsapp', {
      body: {
        type:      'mod_payment_received',
        clientId:  tenant.clientId,
        paymentId,
      },
    });

    // Refresh
    loadRequests();
  }

  // Count pending-action items — quotes needing payment
  const actionNeeded = requests.filter((r) => r.status === 'quote_sent' && r.quote_amount && !r.paid_at).length;

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
      `}</style>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>Modification Requests</p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Custom changes · {tenant?.orgName}</p>
        </div>
        <button onClick={() => setTab('raise')}
          style={{ padding: '7px 16px', border: 'none', borderRadius: 20, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
          + New request
        </button>
      </nav>

      <div style={S.inner}>

        {/* Info banner */}
        <div style={{ background: 'rgba(154,138,224,0.06)', border: '1px solid rgba(154,138,224,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: '#9A8AE0' }}>💡 Need a custom change?</p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
            Custom reports · Extra fields · New modules · Integrations · Certificate formats<br />
            We review every request and send you a quote within <strong style={{ color: '#fff' }}>2 working days</strong>.
            No charge for the quote — pay only when you accept.
          </p>
        </div>

        {/* Just submitted success */}
        {justSubmitted && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.25)', borderRadius: 10, padding: '13px 16px', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#6AAA90', fontWeight: 500 }}>
              ✓ Request submitted! We will review and send a quote within 2 working days. You'll be notified via WhatsApp.
            </p>
          </div>
        )}

        {/* Action needed alert */}
        {actionNeeded > 0 && (
          <div style={{ background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.3)', borderRadius: 10, padding: '13px 16px', marginBottom: 16, cursor: 'pointer' }}
            onClick={() => setTab('status')}>
            <p style={{ margin: 0, fontSize: 13, color: '#E8A020', fontWeight: 500 }}>
              ⏰ {actionNeeded} quote{actionNeeded > 1 ? 's' : ''} waiting for your payment — scroll down to review and pay
            </p>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { k: 'status', l: `My requests (${requests.length})` },
            { k: 'raise',  l: '+ New request' },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 18px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Raise new request tab */}
        {tab === 'raise' && (
          <RaiseRequestForm onSubmit={handleSubmit} submitting={submitting} />
        )}

        {/* My requests tab */}
        {tab === 'status' && (
          loading ? (
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
              Loading requests...
            </p>
          ) : requests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <p style={{ fontSize: 36, marginBottom: 14 }}>🔧</p>
              <p style={{ fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                No modification requests yet
              </p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
                Need a custom change? Click "+ New request" to get started.
              </p>
              <button onClick={() => setTab('raise')}
                style={{ padding: '11px 28px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>
                Raise first request →
              </button>
            </div>
          ) : (
            requests.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                tenant={tenant}
                onPaySuccess={handlePaySuccess}
              />
            ))
          )
        )}

        {/* Workflow explanation */}
        {tab === 'status' && requests.length > 0 && (
          <div style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginTop: 8 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, margin: '0 0 12px' }}>
              HOW IT WORKS · ప్రక్రియ వివరణ
            </p>
            {[
              { step: '1', label: 'You submit a request',               sub: 'Describe what you need — any level of detail' },
              { step: '2', label: 'We review and send a quote',         sub: 'Scope, price and timeline within 2 working days' },
              { step: '3', label: 'You accept and pay',                 sub: 'Secure payment via UPI, card or net banking' },
              { step: '4', label: 'We build it',                        sub: 'Development starts immediately after payment' },
              { step: '5', label: 'Goes live in your app',              sub: 'You\'re notified via WhatsApp when ready' },
            ].map((item) => (
              <div key={item.step} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(232,160,32,0.12)', color: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {item.step}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{item.label}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ControlPanelNav />
      <BugReporter screenName="modification_requests" />
    </div>
  );
}