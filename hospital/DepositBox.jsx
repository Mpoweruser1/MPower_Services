// hospital/DepositBox.jsx — NEW
// The deposit (advance) of one admission: what was paid, refunded, used on bills and what is in hand;
// take a deposit while the patient is admitted; give a refund (principal / doctor only); history.
// Used on the IPD screen and on the billing screen. Needs fix_hospital_deposits.sql — without it the
// box says nothing at all (it hides itself) and tells its parent (onChanged(null)).
// The database is the real safeguard (amount checks, who may refund, never more than is in hand);
// the checks here only give a friendly message first.
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

const MODES = ['Cash', 'UPI', 'Card'];
const MAX_AMOUNT = 10000000;

export function money(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }
function cleanMoney(v) {
  const s = String(v).replace(/[^\d.]/g, '');
  const parts = s.split('.');
  return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}` : s;
}
function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// The printed receipt of one deposit or refund, as a small stand-alone page (opened in its own window so it
// never depends on the screen it was started from). Pure function: text in, HTML out.
export function buildDepositReceiptHtml({ entry, orgName, patientName, generatedAt }) {
  const refund = entry.kind === 'refund';
  const no = `${refund ? 'REF' : 'DEP'}-${String(entry.id || '').replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const when = entry.created_at ? new Date(entry.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const rows = [
    ['Receipt no.', no], ['Date & time', when], ['Patient', patientName || '—'],
    [refund ? 'Refunded by' : 'Paid by', entry.payment_mode || '—'],
    ...(entry.reference ? [['Reference', entry.reference]] : []),
    ...(entry.note ? [[refund ? 'Reason' : 'Note', entry.note]] : []),
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(refund ? 'Deposit refund receipt' : 'Deposit receipt')} ${esc(no)}</title>
<style>@page{size:A5;margin:12mm}body{font-family:serif;color:#000;margin:0;padding:8px}h1{font-size:18px;margin:0;text-align:center}h2{font-size:14px;margin:6px 0 14px;text-align:center;text-transform:uppercase;letter-spacing:2px}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:6px 4px;border-bottom:1px solid #ddd}td:first-child{color:#444;width:34%}
.amt{font-size:20px;font-weight:700;text-align:right;margin:16px 0 4px}.note{font-size:11px;color:#444;margin-top:10px}.sig{margin-top:44px;text-align:right;font-size:12px}.sig span{display:inline-block;border-top:1px solid #000;padding-top:4px;min-width:160px;text-align:center}
.foot{margin-top:18px;font-size:10px;color:#666;text-align:center}</style></head><body>
<h1>${esc(orgName || 'Hospital')}</h1><h2>${refund ? 'Deposit refund receipt' : 'Deposit (advance) receipt'}</h2>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</table>
<div class="amt">${refund ? 'Amount refunded' : 'Amount received'}: ${esc(money(entry.amount))}</div>
<p class="note">${refund ? 'This amount was returned to the patient from the advance deposit.' : 'This is an advance deposit. It will be adjusted against the final bill; any balance left is refunded.'}</p>
<div class="sig"><span>Authorised signatory</span></div>
<div class="foot">${esc(no)} · Printed ${esc(generatedAt || new Date().toLocaleString('en-IN'))} · MPower</div>
</body></html>`;
}

function fmtWhen(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// The message for a typed amount, or '' when it is fine. `limit` = the most allowed (refund: what is in hand).
export function validateDepositAmount(value, limit) {
  const n = Number(value);
  if (value === '' || value === '.' || isNaN(n) || n <= 0) return 'Enter the amount.';
  if (n > MAX_AMOUNT) return 'The amount looks too high — please check.';
  if (Math.round(n * 100) / 100 !== n) return 'The amount can have at most 2 decimals.';
  if (limit !== undefined && n > limit) return `Only ${money(limit)} is in hand.`;
  return '';
}

const S = {
  box: { background: '#111113', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 12, marginBottom: 10 },
  input: { width: '100%', padding: '9px 12px', background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 5, display: 'block' },
  btn: { padding: '7px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7, background: 'transparent', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600 },
};

export default function DepositBox({ admissionId, admissionOpen, required, canRefund, onChanged, patientName }) {
  const { tenant } = useTenant();
  const [justSaved, setJustSaved] = useState(null);   // the entry just recorded: offers its receipt
  const [summary, setSummary] = useState(null);   // { paid, refunded, applied, in_hand }
  const [entries, setEntries] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);          // null | 'add' | 'refund'
  const [fields, setFields] = useState({ amount: '', mode: 'Cash', reference: '', note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const token = useRef(0);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => { setSummary(null); setEntries([]); setForm(null); setError(''); setMessage(''); setHistoryOpen(false); setJustSaved(null); load(); }, [admissionId]);

  async function load() {
    const mine = ++token.current;
    if (!admissionId) { setLoading(false); return []; }
    setLoading(true);
    setLoadError('');
    const { data, error: err } = await supabase.rpc('ipd_deposit_summary', { p_admissions: [admissionId] });
    if (mine !== token.current) return [];
    if (err) {
      // 42883 / PGRST202 = the function does not exist yet: the database script has not been run
      if (err.code === '42883' || err.code === 'PGRST202') {
        setUnavailable(true); setLoading(false); setSummary(null);
        if (onChangedRef.current) onChangedRef.current(null);
        return [];
      }
      console.error('Loading the deposit failed:', err);
      setLoadError(err.message || 'Could not load the deposit.');
      setLoading(false);
      return [];
    }
    setUnavailable(false);
    const r = (data || [])[0] || {};
    const s = { paid: Number(r.paid || 0), refunded: Number(r.refunded || 0), applied: Number(r.applied || 0), in_hand: Number(r.in_hand || 0) };
    setSummary(s);
    const { data: rows, error: hErr } = await supabase.from('ipd_deposits')
      .select('id, kind, amount, payment_mode, reference, note, created_at, billing_invoices(invoice_no, status)')
      .eq('admission_id', admissionId).order('created_at', { ascending: false }).limit(30);
    if (mine !== token.current) return [];
    if (hErr) console.error('Loading the deposit history failed:', hErr);
    setEntries(rows || []);
    setLoading(false);
    if (onChangedRef.current) onChangedRef.current(s);
    return rows || [];
  }

  function openForm(kind) {
    setError(''); setMessage(''); setJustSaved(null);
    setForm(kind);
    setFields({
      amount: kind === 'refund' && summary ? String(summary.in_hand) : (kind === 'add' && required > 0 && summary ? String(Math.max(0, required - (summary.paid - summary.refunded)) || '') : ''),
      mode: 'Cash', reference: '', note: '',
    });
  }

  async function submit() {
    setError('');
    const limit = form === 'refund' ? summary.in_hand : undefined;
    const msg = validateDepositAmount(fields.amount, limit);
    if (msg) { setError(msg); return; }
    if (form === 'refund' && fields.note.trim().length < 5) { setError('Enter the reason or reference for the refund (at least 5 characters).'); return; }
    setBusy(true);
    const amount = Number(fields.amount);
    const { error: err } = form === 'add'
      ? await supabase.rpc('add_ipd_deposit', { p_admission: admissionId, p_amount: amount, p_mode: fields.mode, p_reference: fields.reference.trim() || null, p_note: null })
      : await supabase.rpc('refund_ipd_deposit', { p_admission: admissionId, p_amount: amount, p_mode: fields.mode, p_note: fields.note.trim() });
    setBusy(false);
    if (err) { console.error('Saving the deposit failed:', err); setError(err.message || 'Could not save.'); return; }
    setMessage(form === 'add' ? `✅ ${money(amount)} deposit recorded` : `✅ ${money(amount)} refund recorded`);
    setForm(null);
    const rows = await load();
    setJustSaved((rows || []).find((r) => r.kind === (form === 'add' ? 'payment' : 'refund')) || null);
  }

  function printReceipt(entry) {
    const w = window.open('', '_blank', 'width=640,height=820');
    if (!w) { setMessage('Allow pop-ups for this site to print the receipt.'); return; }
    w.document.open();
    w.document.write(buildDepositReceiptHtml({ entry, orgName: tenant?.orgName, patientName }));
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* the window stays open: print from it */ } }, 300);
  }

  if (unavailable) return null;
  if (loading && !summary) return <div style={S.box}><p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Loading deposit…</p></div>;
  if (!summary) {
    return loadError ? <div role="alert" style={{ ...S.box, color: '#E05A5A', fontSize: 12 }}>⚠ {loadError}</div> : null;
  }

  const net = summary.paid - summary.refunded;
  const short = admissionOpen && required > 0 && net < required;
  const idp = `dep-${admissionId}`;

  return (
    <div style={S.box} aria-label="Deposit">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', textTransform: 'uppercase' }}>Deposit · అడ్వాన్స్</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: summary.in_hand > 0 ? '#6AAA90' : 'rgba(255,255,255,0.5)' }}>{money(summary.in_hand)} in hand</span>
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
        Paid {money(summary.paid)}
        {summary.applied > 0 && ` · used on bills ${money(summary.applied)}`}
        {summary.refunded > 0 && ` · refunded ${money(summary.refunded)}`}
      </p>
      {short && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#E8A020' }}>
          {net <= 0 ? 'No deposit taken yet' : `${money(net)} taken`} — the usual deposit for this ward is {money(required)}.
        </p>
      )}
      {message && (
        <p role="status" style={{ margin: '0 0 8px', fontSize: 12, color: '#6AAA90' }}>
          {message}
          {justSaved && <button type="button" onClick={() => printReceipt(justSaved)} style={{ ...S.btn, marginLeft: 8, padding: '3px 9px' }}>🖨 Print receipt</button>}
        </p>
      )}

      {!form && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {admissionOpen && <button type="button" onClick={() => openForm('add')} style={{ ...S.btn, color: '#6AAA90', borderColor: 'rgba(106,170,144,0.4)' }}>+ Take deposit</button>}
          {canRefund && summary.in_hand > 0 && <button type="button" onClick={() => openForm('refund')} style={{ ...S.btn, color: '#E8A020', borderColor: 'rgba(232,160,32,0.4)' }}>Refund…</button>}
          {entries.length > 0 && <button type="button" onClick={() => setHistoryOpen((v) => !v)} style={S.btn}>{historyOpen ? 'Hide history' : 'History'}</button>}
        </div>
      )}

      {form && (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: form === 'add' ? '#6AAA90' : '#E8A020' }}>{form === 'add' ? 'Take a deposit' : `Refund (up to ${money(summary.in_hand)})`}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label htmlFor={`${idp}-amount`} style={S.label}>Amount (₹)</label>
              <input id={`${idp}-amount`} name={`${idp}-amount`} inputMode="decimal" value={fields.amount}
                onChange={(e) => { setFields((f) => ({ ...f, amount: cleanMoney(e.target.value) })); setError(''); }} style={S.input} />
            </div>
            <div>
              <label htmlFor={`${idp}-mode`} style={S.label}>{form === 'add' ? 'Paid by' : 'Refunded by'}</label>
              <select id={`${idp}-mode`} name={`${idp}-mode`} value={fields.mode} onChange={(e) => setFields((f) => ({ ...f, mode: e.target.value }))} style={{ ...S.input, cursor: 'pointer' }}>
                {MODES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {form === 'add' ? (
            <div style={{ marginBottom: 8 }}>
              <label htmlFor={`${idp}-ref`} style={S.label}>Receipt / reference (optional)</label>
              <input id={`${idp}-ref`} name={`${idp}-ref`} maxLength={60} value={fields.reference} onChange={(e) => setFields((f) => ({ ...f, reference: e.target.value }))} style={S.input} />
            </div>
          ) : (
            <div style={{ marginBottom: 8 }}>
              <label htmlFor={`${idp}-note`} style={S.label}>Reason / reference *</label>
              <input id={`${idp}-note`} name={`${idp}-note`} maxLength={200} value={fields.note} placeholder="e.g. Settled at discharge"
                onChange={(e) => { setFields((f) => ({ ...f, note: e.target.value })); setError(''); }} style={S.input} />
            </div>
          )}
          {error && <p role="alert" style={{ margin: '0 0 8px', fontSize: 12, color: '#E05A5A' }}>⚠ {error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => { setForm(null); setError(''); }} disabled={busy} style={{ ...S.btn, flex: 1 }}>Cancel</button>
            <button type="button" onClick={submit} disabled={busy}
              style={{ flex: 2, padding: 9, border: 'none', borderRadius: 7, background: busy ? 'rgba(255,255,255,0.08)' : (form === 'add' ? '#6AAA90' : '#E8A020'), color: '#111113', fontWeight: 700, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {busy ? 'Saving…' : (form === 'add' ? 'Save deposit' : 'Save refund')}
            </button>
          </div>
        </div>
      )}

      {historyOpen && entries.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
          {entries.map((e) => {
            const cancelled = e.kind === 'applied' && e.billing_invoices?.status === 'cancelled';
            const label = e.kind === 'payment' ? `Deposit · ${e.payment_mode}` : e.kind === 'refund' ? `Refund · ${e.payment_mode}` : `Used on bill ${e.billing_invoices?.invoice_no || ''}${cancelled ? ' (bill cancelled — returned)' : ''}`;
            const sign = e.kind === 'payment' ? '+' : '−';
            return (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '4px 0', color: 'rgba(255,255,255,0.6)', textDecoration: cancelled ? 'line-through' : 'none' }}>
                <span>{label}<br /><span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{fmtWhen(e.created_at)}{e.reference ? ` · ${e.reference}` : ''}{e.note ? ` · ${e.note}` : ''}</span></span>
                <span style={{ color: e.kind === 'payment' ? '#6AAA90' : '#E8A020', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' }}>{sign}{money(e.amount)}{e.kind !== 'applied' && <><br /><button type="button" onClick={() => printReceipt(e)} style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', textDecoration: 'underline' }}>🖨 Receipt</button></>}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
