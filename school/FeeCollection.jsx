// school/FeeCollection.jsx — FINAL
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { sanitize, validators } from '../shared/useFormValidation';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'DD', 'Cheque', 'Online'];

function currency(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 640, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  select: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function FeeCollection() {
  const { tenant } = useTenant();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]   = useState(false);
  const [student, setStudent]       = useState(null);
  const [dues, setDues]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [selectedDueIds, setSelectedDueIds] = useState([]);
  const [customAmount, setCustomAmount]     = useState({});
  const [amountErrors, setAmountErrors]     = useState({});
  const [discountPct, setDiscountPct]       = useState('');
  const [discountError, setDiscountError]   = useState('');
  const [paymentMode, setPaymentMode]       = useState('Cash');
  const [transactionId, setTransactionId]   = useState('');
  const [txnError, setTxnError]             = useState('');
  const [saving, setSaving]                 = useState(false);
  const [receipt, setReceipt]               = useState(null);
  const [submitError, setSubmitError]       = useState('');

  async function searchStudents(q) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('students')
      .select('id, full_name, sid, parent_phone, class_id')
      .eq('app_id', tenant.appId)
      .eq('status', 'active')
      .or(`full_name.ilike.%${q}%,sid.ilike.%${q}%,parent_phone.ilike.%${q}%`)
      .limit(8);
    setSearchResults(data || []);
    setSearching(false);
  }

  async function selectStudent(s) {
    setStudent(s);
    setSearchResults([]);
    setSearchQuery('');
    setLoading(true);
    const { data: duesData } = await supabase
      .from('fee_dues')
      .select('*, fee_payments(amount)')
      .eq('student_id', s.id)
      .order('due_date');
    setDues(duesData || []);
    setLoading(false);
  }

  function balanceFor(due) {
    const paid = (due.fee_payments || []).reduce((s, p) => s + Number(p.amount), 0);
    return Math.max(0, Number(due.amount_due) - paid);
  }

  function toggleDue(dueId) {
    setSelectedDueIds((prev) =>
      prev.includes(dueId) ? prev.filter((id) => id !== dueId) : [...prev, dueId]
    );
  }

  function updateCustomAmount(dueId, value) {
    const sanitized = sanitize.amount(value);
    setCustomAmount((prev) => ({ ...prev, [dueId]: sanitized }));

    // Validate against balance
    const due     = dues.find((d) => d.id === dueId);
    const balance = due ? balanceFor(due) : 0;
    const entered = Number(sanitized);

    if (entered < 0) {
      setAmountErrors((prev) => ({ ...prev, [dueId]: 'Amount cannot be negative' }));
    } else if (entered > balance) {
      setAmountErrors((prev) => ({ ...prev, [dueId]: `Cannot exceed balance of ${currency(balance)}` }));
    } else if (entered === 0) {
      setAmountErrors((prev) => ({ ...prev, [dueId]: 'Amount must be greater than zero' }));
    } else {
      setAmountErrors((prev) => ({ ...prev, [dueId]: null }));
    }
  }

  function updateDiscount(value) {
    const sanitized = sanitize.percentage(value);
    setDiscountPct(sanitized);
    const num = Number(sanitized);
    if (num < 0 || num > 100) {
      setDiscountError('Discount must be between 0 and 100');
    } else {
      setDiscountError('');
    }
  }

  const subtotal = useMemo(() => {
    return selectedDueIds.reduce((sum, dueId) => {
      const due      = dues.find((d) => d.id === dueId);
      const balance  = due ? balanceFor(due) : 0;
      const custom   = customAmount[dueId];
      const amount   = custom !== undefined ? Number(custom) : balance;
      return sum + (amount > 0 ? amount : 0);
    }, 0);
  }, [selectedDueIds, customAmount, dues]);

  const discountAmount  = Math.min(subtotal, (subtotal * Number(discountPct || 0)) / 100);
  const totalToCollect  = Math.max(0, subtotal - discountAmount);

  async function handleCollect() {
    setSubmitError('');

    if (selectedDueIds.length === 0) { setSubmitError('Select at least one fee to collect.'); return; }
    if (totalToCollect <= 0) { setSubmitError('Total amount must be greater than zero.'); return; }

    // Check all amount errors
    const hasAmountErrors = Object.values(amountErrors).some(Boolean);
    if (hasAmountErrors) { setSubmitError('Please fix the amount errors above.'); return; }

    // UPI requires transaction ID
    if (['UPI', 'Card', 'Online'].includes(paymentMode) && !transactionId.trim()) {
      setTxnError('Transaction ID / reference number is required for this payment mode.');
      return;
    }

    setSaving(true);
    const receiptNo = 'RCPT-' + Date.now();

    const rows = selectedDueIds.map((dueId) => {
      const due     = dues.find((d) => d.id === dueId);
      const balance = due ? balanceFor(due) : 0;
      const custom  = customAmount[dueId];
      const amount  = custom !== undefined ? Number(custom) : balance;

      return {
        due_id:         dueId,
        amount:         amount,
        payment_mode:   paymentMode,
        transaction_id: transactionId.trim() || null,
        receipt_no:     receiptNo,
        collected_by:   tenant.userRowId,
        branch_id:      tenant.branchId,
      };
    });

    const { error } = await supabase.from('fee_payments').insert(rows);

    if (error) {
      setSubmitError('Failed to record payment. Please try again.');
      setSaving(false);
      return;
    }

    // WhatsApp receipt
    if (student?.parent_phone) {
      await supabase.functions.invoke('send-whatsapp', {
        body: { studentId: student.id, type: 'fee_receipt', receiptNo },
      });
    }

    setReceipt({
      receiptNo, amount: totalToCollect, student, paymentMode, transactionId: transactionId.trim() || null,
      date: new Date().toLocaleDateString('en-IN'),
      orgName: tenant?.orgName || 'School',
      items: rows.map((r) => {
        const due = dues.find((d) => d.id === r.due_id);
        return { label: due?.fee_type || due?.category || 'Fee', amount: r.amount };
      }),
      subtotal, discountPct: Number(discountPct || 0), discountAmount,
    });
    setSelectedDueIds([]);
    setCustomAmount({});
    setAmountErrors({});
    setDiscountPct('');
    setTransactionId('');
    setSaving(false);

    // Reload dues
    selectStudent(student);
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; }
          @page { size: A4 portrait; margin: 15mm 18mm; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="no-print">

      <div style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Fee Collection · ఫీజు వసూలు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Collect Fee</h1>
        </div>

        {/* Student search */}
        {!student ? (
          <div style={S.card}>
            <label style={S.label}>Search student · విద్యార్థిని వెతకండి</label>
            <input
              value={searchQuery}
              onChange={(e) => searchStudents(e.target.value)}
              placeholder="Name, SID or parent phone..."
              style={S.input(false)}
              autoFocus
            />
            {searching && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>Searching...</p>}
            {searchResults.length > 0 && (
              <div style={{ marginTop: 8, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
                {searchResults.map((s) => (
                  <div key={s.id} onClick={() => selectStudent(s)}
                    style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#111113' }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{s.full_name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{s.sid}{s.parent_phone ? ` · ${s.parent_phone}` : ''}</p>
                  </div>
                ))}
              </div>
            )}
            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>No students found</p>
            )}
          </div>
        ) : (
          <>
            {/* Student card */}
            <div style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{student.full_name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{student.sid}{student.parent_phone ? ` · ${student.parent_phone}` : ''}</p>
              </div>
              <button onClick={() => { setStudent(null); setDues([]); setSelectedDueIds([]); setReceipt(null); }}
                style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
                Change
              </button>
            </div>

            {/* Receipt */}
            {receipt && (
              <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.25)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#6AAA90' }}>✓ Payment recorded — {receipt.receiptNo}</p>
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                  {currency(receipt.amount)} via {receipt.paymentMode} · {receipt.date}
                  {student.parent_phone ? ' · WhatsApp receipt sent' : ''}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => window.print()}
                    style={{ padding: '7px 14px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                    🖨️ Print receipt
                  </button>
                  <button onClick={() => setReceipt(null)}
                    style={{ padding: '7px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
                    Collect more
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Loading dues...</p>
            ) : dues.length === 0 ? (
              <div style={{ ...S.card, textAlign: 'center', padding: '32px 20px' }}>
                <p style={{ fontSize: 32, marginBottom: 10 }}>✅</p>
                <p style={{ fontSize: 14, color: '#6AAA90', fontWeight: 500 }}>No pending fees</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>All fees cleared for this student</p>
              </div>
            ) : (
              <>
                {/* Fee dues */}
                <div style={S.card}>
                  <label style={S.label}>Select fees to collect · ఫీజులు ఎంచుకోండి</label>
                  {dues.map((due) => {
                    const balance  = balanceFor(due);
                    const isPaid   = balance <= 0;
                    const selected = selectedDueIds.includes(due.id);

                    return (
                      <div key={due.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: isPaid ? 0.4 : 1 }}>
                        <input type="checkbox" disabled={isPaid} checked={selected}
                          onChange={() => toggleDue(due.id)}
                          style={{ marginTop: 2, accentColor: '#E8A020', width: 16, height: 16, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 500, fontSize: 13, color: '#fff' }}>{due.fee_type || due.category || 'Fee'}</p>
                          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                            Due: {currency(due.amount_due)} · Paid: {currency(due.amount_due - balance)} · Balance: {currency(balance)}
                            {due.due_date ? ` · Due date: ${due.due_date}` : ''}
                            {isPaid ? ' — ✓ Cleared' : ''}
                          </p>
                          {/* Partial amount entry */}
                          {selected && !isPaid && (
                            <div style={{ marginTop: 8 }}>
                              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>
                                Amount to collect (max {currency(balance)})
                              </p>
                              <input
                                value={customAmount[due.id] ?? ''}
                                onChange={(e) => updateCustomAmount(due.id, e.target.value)}
                                placeholder={String(balance)}
                                inputMode="numeric"
                                style={{ ...S.input(amountErrors[due.id]), width: 140, padding: '7px 10px', fontSize: 13 }}
                              />
                              {amountErrors[due.id] && (
                                <p style={S.fieldErr}>⚠ {amountErrors[due.id]}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedDueIds.length > 0 && (
                  <div style={S.card}>
                    <label style={S.label}>Payment details · చెల్లింపు వివరాలు</label>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, display: 'block' }}>Payment mode</label>
                        <select value={paymentMode} onChange={(e) => { setPaymentMode(e.target.value); setTxnError(''); }}
                          style={S.select}>
                          {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, display: 'block' }}>Discount %</label>
                        <input
                          value={discountPct}
                          onChange={(e) => updateDiscount(e.target.value)}
                          placeholder="0"
                          inputMode="numeric"
                          style={S.input(!!discountError)}
                        />
                        {discountError && <p style={S.fieldErr}>⚠ {discountError}</p>}
                      </div>
                    </div>

                    {['UPI', 'Card', 'Online', 'DD', 'Cheque'].includes(paymentMode) && (
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, display: 'block' }}>
                          Transaction ID / Reference number <span style={{ color: '#E05A5A' }}>*</span>
                        </label>
                        <input
                          value={transactionId}
                          onChange={(e) => { setTransactionId(e.target.value); setTxnError(''); }}
                          placeholder="UPI ref / cheque no / DD no"
                          style={S.input(!!txnError)}
                        />
                        {txnError && <p style={S.fieldErr}>⚠ {txnError}</p>}
                      </div>
                    )}

                    {/* Totals */}
                    <div style={{ background: '#111113', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                        <span>Subtotal</span><span>{currency(subtotal)}</span>
                      </div>
                      {discountAmount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6AAA90', marginBottom: 4 }}>
                          <span>Discount ({discountPct}%)</span><span>−{currency(discountAmount)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, color: '#fff', marginTop: 8 }}>
                        <span>Total to collect</span><span style={{ color: '#E8A020' }}>{currency(totalToCollect)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {submitError && (
                  <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                    ⚠️ {submitError}
                  </div>
                )}

                {selectedDueIds.length > 0 && (
                  <button onClick={handleCollect} disabled={saving}
                    style={{ width: '100%', padding: 14, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {saving ? 'Recording payment...' : `✓ Collect ${currency(totalToCollect)}`}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
      </div>

      {/* Print-only receipt — hidden on screen, shown only when printing */}
      {receipt && (
        <div className="print-only" style={{ background: '#fff', color: '#000', padding: '32px 40px', fontFamily: 'serif', maxWidth: 640, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24, borderBottom: '2px solid #000', paddingBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{receipt.orgName}</h2>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 0', textTransform: 'uppercase', letterSpacing: 2 }}>Fee Receipt</h3>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 20 }}>
            <span>Receipt No: <strong>{receipt.receiptNo}</strong></span>
            <span>Date: <strong>{receipt.date}</strong></span>
          </div>

          <div style={{ marginBottom: 20, fontSize: 13, lineHeight: 1.8 }}>
            <div>Student: <strong>{receipt.student.full_name}</strong></div>
            <div>SID: <strong>{receipt.student.sid}</strong></div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #000' }}>Fee item</th>
                <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #000' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{item.label}</td>
                  <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #eee' }}>{currency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 13, marginBottom: 30, gap: 4 }}>
            <div>Subtotal: {currency(receipt.subtotal)}</div>
            {receipt.discountPct > 0 && (
              <div>Discount ({receipt.discountPct}%): -{currency(receipt.discountAmount)}</div>
            )}
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>Total paid: {currency(receipt.amount)}</div>
          </div>

          <div style={{ fontSize: 13, marginBottom: 40 }}>
            Payment mode: <strong>{receipt.paymentMode}</strong>
            {receipt.transactionId ? ` · Ref: ${receipt.transactionId}` : ''}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: 8, width: 180 }}>
                Authorised Signatory<br />
                <span style={{ fontSize: 11, color: '#555' }}>{receipt.orgName}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, padding: '6px 10px', background: '#f5f5f5', borderRadius: 4, fontSize: 10, color: '#888', fontFamily: 'monospace' }}>
            Receipt No: {receipt.receiptNo} · Generated: {new Date().toLocaleString('en-IN')} · MPower
          </div>
        </div>
      )}

      <SchoolNav />
      <BugReporter screenName="fee_collection" />
    </div>
  );
}