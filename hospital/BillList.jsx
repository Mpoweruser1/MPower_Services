// hospital/BillList.jsx — NEW
// "Bills" tab of the billing screen: find a bill, reprint it, cancel it (owner
// only, with a reason) and record that a scheme / insurance claim was received.
// Bills can never be deleted or edited; this is the only way to change one.
// Printing is handed to the billing screen (onPrint), which owns the print layout.
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { istToday, addDays, istDayStart, istDayEnd } from './hospitalUtils';

const PAGE = 50;
const BILL_COLS = 'id, invoice_no, invoice_date, created_at, payment_mode, status, total_amount, gst_amount, covered_amount, deposit_applied, line_items, claim_status, claim_ref, claim_received_at, cancel_reason, cancelled_at, patient_id, patients(full_name, patient_uid)';
const OWNER_ROLES = ['principal', 'doctor'];
const CLAIM_ROLES = ['principal', 'doctor', 'billing_clerk'];

const FILTERS = [
  { k: 'all',       label: 'All' },
  { k: 'active',    label: 'Active' },
  { k: 'claims',    label: 'Claims pending' },
  { k: 'cancelled', label: 'Cancelled' },
];

const S = {
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, marginBottom: 10 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  input: { width: '100%', padding: '9px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  btn: { padding: '6px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' },
};

function money(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }
function round2(n) { return Math.round(n * 100) / 100; }
function fmtDate(d) { return d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN') : ''; }

// A saved bill → the shape the printed invoice expects. The database stores
// the patient's payable amount, the GST and the covered amount; the subtotal
// and discount follow from them and the lines.
export function toInvoice(row) {
  const items = row.line_items || [];
  const subtotal = round2(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0));
  const gross = round2(subtotal + (Number(row.gst_amount) || 0) - (Number(row.covered_amount) || 0));
  const discount = Math.max(0, round2(gross - (Number(row.total_amount) || 0)));
  return { ...row, patient: row.patients || null, subtotal, discount };
}

export default function BillList({ onPrint, initialFilter }) {
  const { tenant } = useTenant();
  const role = tenant?.role;
  const canCancel = OWNER_ROLES.includes(role);
  const canClaim = CLAIM_ROLES.includes(role);

  const today = istToday();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [filter, setFilter] = useState(FILTERS.some((f) => f.k === initialFilter) ? initialFilter : 'all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [notice, setNotice] = useState('');

  const [cancelFor, setCancelFor] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [claimFor, setClaimFor] = useState(null);
  const [claimRef, setClaimRef] = useState('');
  const [working, setWorking] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const loadToken = useRef(0);

  useEffect(() => { if (tenant?.appId) load(true); }, [tenant?.appId, filter, from, to]);

  async function load(reset) {
    const token = ++loadToken.current;
    setLoading(true);
    setError('');
    const offset = reset ? 0 : rows.length;
    let q = supabase.from('billing_invoices')
      .select(BILL_COLS)
      .eq('app_id', tenant.appId);
    if (from) q = q.gte('created_at', istDayStart(from));
    if (to)   q = q.lte('created_at', istDayEnd(to));
    if (filter === 'active')    q = q.neq('status', 'cancelled');
    if (filter === 'cancelled') q = q.eq('status', 'cancelled');
    if (filter === 'claims')    q = q.eq('claim_status', 'pending').neq('status', 'cancelled');
    let { data, error: err } = await q.order('created_at', { ascending: false }).order('id').range(offset, offset + PAGE - 1);
    // 42703 = deposit_applied does not exist yet (fix_hospital_deposits.sql not run): read the bills without it
    if (err?.code === '42703') {
      let q2 = supabase.from('billing_invoices').select(BILL_COLS.replace(', deposit_applied', '')).eq('app_id', tenant.appId);
      if (from) q2 = q2.gte('created_at', istDayStart(from));
      if (to)   q2 = q2.lte('created_at', istDayEnd(to));
      if (filter === 'active')    q2 = q2.neq('status', 'cancelled');
      if (filter === 'cancelled') q2 = q2.eq('status', 'cancelled');
      if (filter === 'claims')    q2 = q2.eq('claim_status', 'pending').neq('status', 'cancelled');
      ({ data, error: err } = await q2.order('created_at', { ascending: false }).order('id').range(offset, offset + PAGE - 1));
    }
    if (token !== loadToken.current) return;
    if (err) {
      console.error('Loading bills failed:', err);
      setError(err.message || 'Could not load the bills.');
      if (reset) setRows([]);
      setLoading(false);
      return;
    }
    const list = data || [];
    setRows(reset ? list : [...rows, ...list]);
    setHasMore(list.length === PAGE);
    setLoading(false);
  }

  const term = search.trim().toLowerCase();
  const shown = term
    ? rows.filter((r) => `${r.invoice_no} ${r.patients?.full_name || ''} ${r.patients?.patient_uid || ''}`.toLowerCase().includes(term))
    : rows;

  function flash(msg) { setNotice(msg); setTimeout(() => setNotice(''), 6000); }

  async function confirmCancel() {
    setDialogError('');
    if (cancelReason.trim().length < 5) { setDialogError('Enter the reason for cancelling (at least 5 characters).'); return; }
    setWorking(true);
    const { error: err } = await supabase.rpc('cancel_hospital_invoice', { p_invoice: cancelFor.id, p_reason: cancelReason.trim() });
    setWorking(false);
    if (err) { console.error('Cancelling bill failed:', err); setDialogError(err.message || 'Could not cancel the bill.'); return; }
    flash(`Bill ${cancelFor.invoice_no} cancelled.`);
    setCancelFor(null);
    setCancelReason('');
    load(true);
  }

  async function confirmClaim() {
    setDialogError('');
    if (claimRef.trim().length < 3) { setDialogError('Enter the payment reference (for example the UTR or cheque number).'); return; }
    setWorking(true);
    const { error: err } = await supabase.rpc('mark_claim_received', { p_invoice: claimFor.id, p_ref: claimRef.trim() });
    setWorking(false);
    if (err) { console.error('Recording claim failed:', err); setDialogError(err.message || 'Could not record the claim.'); return; }
    flash(`Claim for ${claimFor.invoice_no} marked as received.`);
    setClaimFor(null);
    setClaimRef('');
    load(true);
  }

  function badge(r) {
    if (r.status === 'cancelled') return { text: 'Cancelled', color: '#E05A5A' };
    if (r.claim_status === 'pending') return { text: `Claim pending · ${money(r.covered_amount)}`, color: '#E8A020' };
    if (r.claim_status === 'received') return { text: 'Claim received', color: '#6AAA90' };
    return null;
  }

  return (
    <>
      <div className="no-print">
        {notice && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#6AAA90' }}>{notice}</div>
        )}

        <div style={S.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label htmlFor="bills-from" style={S.label}>From</label>
              <input id="bills-from" name="bills-from" type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} style={S.input} />
            </div>
            <div>
              <label htmlFor="bills-to" style={S.label}>To</label>
              <input id="bills-to" name="bills-to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} style={S.input} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {FILTERS.map((f) => (
              <button key={f.k} onClick={() => setFilter(f.k)}
                style={{ padding: '6px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', border: filter === f.k ? 'none' : '1px solid rgba(255,255,255,0.12)', background: filter === f.k ? '#E8A020' : 'transparent', color: filter === f.k ? '#111113' : 'rgba(255,255,255,0.55)', fontWeight: filter === f.k ? 600 : 400 }}>
                {f.label}
              </button>
            ))}
          </div>
          <input aria-label="Search the bills shown by invoice number, patient name or patient ID" name="bills-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice no., patient name or ID" style={S.input} />
        </div>

        {error && (
          <div role="alert" style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#E05A5A' }}>⚠️ {error}</div>
        )}

        {shown.map((r) => {
          const b = badge(r);
          const cancelled = r.status === 'cancelled';
          return (
            <div key={r.id} style={{ ...S.card, opacity: cancelled ? 0.7 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{r.invoice_no}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{fmtDate(r.invoice_date)}</span>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                {r.patients?.full_name || '—'}{r.patients?.patient_uid ? ` · ${r.patients.patient_uid}` : ''}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{r.payment_mode}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: cancelled ? 'line-through' : 'none' }}>{money(r.total_amount)}</span>
              </div>
              {b && <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: b.color }}>{b.text}</p>}
              {Number(r.deposit_applied) > 0 && <p style={{ margin: '0 0 8px', fontSize: 12, color: cancelled ? 'rgba(255,255,255,0.45)' : '#6AAA90' }}>Deposit used {money(r.deposit_applied)} · paid at billing {money(Number(r.total_amount) - Number(r.deposit_applied))}{cancelled ? ' · returned to the patient\'s deposit' : ''}</p>}
              {cancelled && r.cancel_reason && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Reason: {r.cancel_reason}</p>}
              {r.claim_status === 'received' && r.claim_ref && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Reference: {r.claim_ref}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => onPrint(toInvoice(r))} style={S.btn}>🖨️ Print</button>
                {canClaim && !cancelled && r.claim_status === 'pending' && (
                  <button onClick={() => { setClaimFor(r); setClaimRef(''); setDialogError(''); }} style={{ ...S.btn, color: '#6AAA90', borderColor: 'rgba(106,170,144,0.4)' }}>✓ Mark claim received</button>
                )}
                {canCancel && !cancelled && (
                  <button onClick={() => { setCancelFor(r); setCancelReason(''); setDialogError(''); }} style={{ ...S.btn, color: '#E05A5A', borderColor: 'rgba(224,90,90,0.4)' }}>Cancel bill</button>
                )}
              </div>
            </div>
          );
        })}

        {!loading && shown.length === 0 && !error && (
          <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>No bills found for this selection.</p>
        )}
        {loading && <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: '12px 0' }}>Loading...</p>}
        {!loading && hasMore && (
          <button onClick={() => load(false)} style={{ ...S.btn, width: '100%', padding: 10 }}>Load more bills</button>
        )}
        {!loading && rows.length > 0 && (
          <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '10px 0 0' }}>
            {term ? `${shown.length} of ${rows.length} loaded bills match` : `${rows.length} bill${rows.length === 1 ? '' : 's'} loaded`}
          </p>
        )}

        {cancelFor && (
          <div role="dialog" aria-modal="true" aria-label="Cancel bill" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
            <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 420 }}>
              <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Cancel bill {cancelFor.invoice_no}?</p>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {cancelFor.patients?.full_name} · {money(cancelFor.total_amount)}. The bill stays in the records marked cancelled, with your reason. This cannot be undone. Room charges on this bill can be billed again.{Number(cancelFor.deposit_applied) > 0 ? ` The ${money(cancelFor.deposit_applied)} deposit used on this bill goes back to the patient's deposit.` : ''}
              </p>
              <label htmlFor="cancel-reason" style={S.label}>Reason for cancelling</label>
              <textarea id="cancel-reason" name="cancel-reason" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                style={{ ...S.input, resize: 'none', marginBottom: 10 }} placeholder="For example: wrong patient / wrong amount" />
              {dialogError && <p role="alert" style={{ margin: '0 0 10px', fontSize: 12, color: '#E05A5A' }}>⚠ {dialogError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setCancelFor(null)} disabled={working} style={{ ...S.btn, flex: 1, padding: 10 }}>Keep the bill</button>
                <button onClick={confirmCancel} disabled={working}
                  style={{ flex: 1, padding: 10, border: 'none', borderRadius: 6, background: '#E05A5A', color: '#fff', fontWeight: 600, fontSize: 12, cursor: working ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {working ? 'Cancelling...' : 'Cancel this bill'}
                </button>
              </div>
            </div>
          </div>
        )}

        {claimFor && (
          <div role="dialog" aria-modal="true" aria-label="Mark claim received" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 }}>
            <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 420 }}>
              <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Claim received for {claimFor.invoice_no}</p>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {claimFor.payment_mode} · {money(claimFor.covered_amount)} covered by the scheme / insurer.
              </p>
              <label htmlFor="claim-ref" style={S.label}>Payment reference (UTR / cheque no.)</label>
              <input id="claim-ref" name="claim-ref" value={claimRef} onChange={(e) => setClaimRef(e.target.value)} style={{ ...S.input, marginBottom: 10 }} />
              {dialogError && <p role="alert" style={{ margin: '0 0 10px', fontSize: 12, color: '#E05A5A' }}>⚠ {dialogError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setClaimFor(null)} disabled={working} style={{ ...S.btn, flex: 1, padding: 10 }}>Close</button>
                <button onClick={confirmClaim} disabled={working}
                  style={{ flex: 1, padding: 10, border: 'none', borderRadius: 6, background: '#6AAA90', color: '#111113', fontWeight: 600, fontSize: 12, cursor: working ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {working ? 'Saving...' : 'Mark as received'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
