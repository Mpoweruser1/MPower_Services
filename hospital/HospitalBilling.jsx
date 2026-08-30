// hospital/HospitalBilling.jsx — FINAL
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { useVisit } from '../context/VisitContext';
import { sanitize } from '../shared/useFormValidation';
import PatientSelector from '../shared/PatientSelector';
import PrintHeader from '../shared/PrintHeader';
import HospitalNav from '../shared/HospitalNav';
import NextActions from '../shared/NextActions';
import BugReporter from '../shared/BugReporter';
import { useRazorpay } from '../shared/useRazorpay';

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Insurance', 'Aarogyasri', 'PMJAY', 'Online'];
const SERVICE_TYPES = ['Consultation', 'Lab test', 'Medicines', 'Procedure', 'Bed charges', 'Nursing', 'X-Ray / Scan', 'Other'];
const GST_RATES     = [0, 5, 12, 18];

function generateInvoiceNo(orgName) {
  const prefix = (orgName || 'HOS').slice(0, 3).toUpperCase();
  const year   = new Date().getFullYear();
  const seq    = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}/INV/${year}/${seq}`;
}

function validateItem(item) {
  const errors = {};
  if (!item.description.trim()) errors.description = 'Description required';
  if (!item.unit_price || Number(item.unit_price) <= 0) errors.unit_price = 'Enter a valid price';
  if (!item.quantity || Number(item.quantity) <= 0)    errors.quantity   = 'Quantity must be at least 1';
  if (Number(item.unit_price) > 500000) errors.unit_price = 'Price seems too high — please check';
  return errors;
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  select: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function HospitalBilling() {
  const { tenant }                                 = useTenant();
  const { activePatient, setActivePatient, clearPatient } = useVisit();

  const [selectedPatient, setSelectedPatient] = useState(activePatient);
  const [items, setItems]       = useState([{ description: '', service_type: 'Consultation', quantity: '1', unit_price: '', gst_rate: '0' }]);
  const [itemErrors, setItemErrors] = useState([{}]);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const { initiatePayment, paying } = useRazorpay();
  const [discountAmt, setDiscountAmt] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving]     = useState(false);
  const [invoice, setInvoice]   = useState(null);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => { setSelectedPatient(activePatient); }, [activePatient]);

  function addItem() {
    setItems((prev) => [...prev, { description: '', service_type: 'Consultation', quantity: '1', unit_price: '', gst_rate: '0' }]);
    setItemErrors((prev) => [...prev, {}]);
  }

  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setItemErrors((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx, field, value) {
    let v = value;
    if (field === 'quantity')   v = sanitize.integer(value);
    if (field === 'unit_price') v = sanitize.amount(value);
    if (field === 'gst_rate')   v = sanitize.integer(value);

    setItems((prev) => {
      const copy = [...prev];
      copy[idx]  = { ...copy[idx], [field]: v };
      return copy;
    });

    // Clear error for this field
    setItemErrors((prev) => {
      const copy = [...prev];
      copy[idx]  = { ...copy[idx], [field]: null };
      return copy;
    });
  }

  // Calculations
  const subtotal = items.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
  }, 0);

  const totalGst = items.reduce((sum, item) => {
    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
    return sum + (lineTotal * (Number(item.gst_rate) || 0) / 100);
  }, 0);

  const discount     = Math.max(0, Number(discountAmt) || 0);
  const totalAmount  = Math.max(0, subtotal + totalGst - discount);

  async function generateBill() {
    setSubmitError('');

    if (!selectedPatient) { setSubmitError('Please select a patient first.'); return; }

    // Validate all items
    const allItemErrors = items.map((item) => validateItem(item));
    setItemErrors(allItemErrors);

    const hasItemErrors = allItemErrors.some((e) => Object.keys(e).length > 0);
    if (hasItemErrors) { setSubmitError('Please fix the errors in billing items.'); return; }

    if (totalAmount <= 0) { setSubmitError('Total amount must be greater than zero.'); return; }

    // Discount cannot exceed subtotal
    if (discount > subtotal + totalGst) {
      setSubmitError('Discount cannot be more than the total amount.');
      return;
    }

    if (paymentMode === 'Online') {
      // Real checkout first — the invoice is only ever created after
      // the payment is actually verified server-side, never before.
      // Everything else (Cash/UPI/Card/Insurance/Aarogyasri/PMJAY)
      // keeps its existing immediate-creation behavior untouched,
      // since those really were already collected in person.
      initiatePayment({
        amount: totalAmount,
        purpose: 'hospital_billing',
        clientId: tenant.appId,
        invoiceId: null, // no invoice exists yet — created only after verification
        customerName: selectedPatient.full_name,
        customerPhone: selectedPatient.phone,
        description: `Hospital bill \u2014 ${selectedPatient.full_name}`,
        onSuccess: (paymentId) => createInvoiceRecord(paymentId),
        onFailure: (reason) => setSubmitError(`Online payment ${reason === 'payment_dismissed' ? 'was cancelled' : 'failed'}. No invoice was created \u2014 try again or choose a different payment mode.`),
      });
      return;
    }

    await createInvoiceRecord(null);
  }

  async function createInvoiceRecord(razorpayPaymentId) {
    setSaving(true);
    const invoiceNo = generateInvoiceNo(tenant.orgName);

    const { data: inv, error: invErr } = await supabase
      .from('billing_invoices')
      .insert({
        app_id:       tenant.appId,
        branch_id:    tenant.branchId || null,
        patient_id:   selectedPatient.id,
        invoice_no:   invoiceNo,
        line_items:   items,
        gst_amount:   totalGst,
        total_amount: totalAmount,
        payment_mode: paymentMode,
        status:       'paid',
        razorpay_payment_id: razorpayPaymentId || null,
      })
      .select()
      .single();

    if (invErr) {
      console.error('Invoice generation failed:', invErr);
      setSubmitError(invErr.message || 'Failed to generate invoice. Please try again.');
      setSaving(false);
      return;
    }

    if (selectedPatient.phone) {
      await supabase.functions.invoke('send-whatsapp', {
        body: { type: 'hospital_receipt', patientId: selectedPatient.id, invoiceNo, amount: totalAmount },
      });
    }

    // billing_invoices has no subtotal/discount/invoice_date columns —
    // merging in the values already computed client-side so the
    // print view (built earlier) still shows them correctly right
    // after creating this invoice. A later re-fetch of an OLD invoice
    // from the database won't have these, only a freshly-created one.
    setInvoice({ ...inv, patient: selectedPatient, subtotal, discount, invoice_date: invoiceDate });
    setSaving(false);
  }

  function newBill() {
    setInvoice(null);
    setItems([{ description: '', service_type: 'Consultation', quantity: '1', unit_price: '', gst_rate: '0' }]);
    setItemErrors([{}]);
    setDiscountAmt('');
    setSubmitError('');
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          @page { size: A4 portrait; margin: 15mm 18mm; }
        }
        .print-only { display: none; }
      `}</style>
      <PrintHeader documentTitle="Hospital Invoice" />

      <div className="no-print" style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Billing · బిల్లింగ్</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Hospital Billing</h1>
        </div>

        {!invoice ? (
          <>
            <div style={{ ...S.card, marginBottom: 16 }}>
              <PatientSelector
                selectedPatient={selectedPatient}
                onSelect={(p) => { setSelectedPatient(p); setActivePatient(p); }}
                onClear={() => { setSelectedPatient(null); clearPatient(); }}
                label="Select patient for billing · రోగిని ఎంచుకోండి"
              />
            </div>

            {/* Billing items */}
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>Billing items</p>
                <button onClick={addItem}
                  style={{ padding: '6px 14px', border: 'none', borderRadius: 20, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                  + Add item
                </button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{ background: '#111113', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Item {idx + 1}</p>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#E05A5A', padding: 0 }}>✕</button>
                    )}
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <input value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      placeholder="Description (e.g. Consultation fee, CBC test)"
                      style={S.input(itemErrors[idx]?.description)} />
                    {itemErrors[idx]?.description && <p style={S.fieldErr}>⚠ {itemErrors[idx].description}</p>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8 }}>
                    <select value={item.service_type} onChange={(e) => updateItem(idx, 'service_type', e.target.value)} style={S.select}>
                      {SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>

                    <div>
                      <input value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        placeholder="Qty" inputMode="numeric"
                        style={S.input(itemErrors[idx]?.quantity)} />
                      {itemErrors[idx]?.quantity && <p style={S.fieldErr}>⚠ {itemErrors[idx].quantity}</p>}
                    </div>

                    <div>
                      <input value={item.unit_price}
                        onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                        placeholder="₹ Price" inputMode="numeric"
                        style={S.input(itemErrors[idx]?.unit_price)} />
                      {itemErrors[idx]?.unit_price && <p style={S.fieldErr}>⚠ {itemErrors[idx].unit_price}</p>}
                    </div>

                    <select value={item.gst_rate} onChange={(e) => updateItem(idx, 'gst_rate', e.target.value)} style={S.select}>
                      {GST_RATES.map((r) => <option key={r} value={r}>GST {r}%</option>)}
                    </select>
                  </div>

                  {Number(item.unit_price) > 0 && Number(item.quantity) > 0 && (
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>
                      Line total: ₹{((Number(item.quantity)) * (Number(item.unit_price))).toLocaleString('en-IN')}
                      {Number(item.gst_rate) > 0 ? ` + GST ₹${((Number(item.quantity)) * (Number(item.unit_price)) * Number(item.gst_rate) / 100).toFixed(2)}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Payment details */}
            <div style={S.card}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Payment details</p>

              <div style={S.row2}>
                <div>
                  <label style={S.label}>Payment mode</label>
                  <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} style={S.select}>
                    {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Discount (₹)</label>
                  <input
                    value={discountAmt}
                    onChange={(e) => {
                      const v = sanitize.amount(e.target.value);
                      setDiscountAmt(v);
                    }}
                    placeholder="0"
                    inputMode="numeric"
                    style={S.input(discount > subtotal + totalGst)}
                  />
                  {discount > subtotal + totalGst && (
                    <p style={S.fieldErr}>⚠ Discount cannot exceed total amount</p>
                  )}
                </div>
              </div>

              <div>
                <label style={S.label}>Invoice date</label>
                <input type="date" value={invoiceDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  style={{ ...S.input(false), width: 'auto' }} />
              </div>

              {/* Totals */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {[
                  { label: 'Subtotal', value: `₹${subtotal.toLocaleString('en-IN')}`, color: 'rgba(255,255,255,0.5)' },
                  totalGst > 0 && { label: 'GST', value: `₹${totalGst.toFixed(2)}`, color: 'rgba(255,255,255,0.5)' },
                  discount > 0 && { label: 'Discount', value: `−₹${discount.toLocaleString('en-IN')}`, color: '#6AAA90' },
                ].filter(Boolean).map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: row.color, marginBottom: 4 }}>
                    <span>{row.label}</span><span>{row.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, color: '#fff', marginTop: 8 }}>
                  <span>Total</span>
                  <span style={{ color: totalAmount <= 0 ? '#E05A5A' : '#fff' }}>
                    ₹{totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {submitError && (
              <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                ⚠️ {submitError}
              </div>
            )}

            <button onClick={generateBill} disabled={saving || paying || !selectedPatient}
              style={{ width: '100%', padding: 14, background: saving || paying || !selectedPatient ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving || paying || !selectedPatient ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving || paying || !selectedPatient ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {paying ? 'Waiting for payment...' : saving ? 'Generating...' : paymentMode === 'Online' ? `💳 Collect online — ₹${totalAmount.toLocaleString('en-IN')}` : `🧾 Generate invoice — ₹${totalAmount.toLocaleString('en-IN')}`}
            </button>
          </>
        ) : (
          <NextActions
            title="Invoice done — what next?"
            actions={[]}
            secondaryActions={[
              { icon: '🖨️', label: 'Print invoice', onClick: () => window.print() },
              { icon: '🧾', label: 'New bill', onClick: newBill },
              { icon: '🏠', label: 'Dashboard', href: '/hospital/dashboard' },
            ]}
          />
        )}
      </div>

      {/* Print-only invoice — hidden on screen, shown only when printing.
          This didn't exist at all before — the invoice's actual content
          (patient, line items, GST, total) was never displayed or
          printed anywhere; only a small "what's next" nav card was. */}
      {invoice && (
        <div className="print-only" style={{ background: '#fff', color: '#000', padding: '32px 40px', fontFamily: 'serif', maxWidth: 680, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24, borderBottom: '2px solid #000', paddingBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{tenant?.orgName || 'Hospital'}</h2>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 0', textTransform: 'uppercase', letterSpacing: 2 }}>Invoice</h3>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 20 }}>
            <span>Invoice No: <strong>{invoice.invoice_no}</strong></span>
            <span>Date: <strong>{new Date(invoice.invoice_date).toLocaleDateString('en-IN')}</strong></span>
          </div>

          <div style={{ marginBottom: 20, fontSize: 13, lineHeight: 1.8 }}>
            <div>Patient: <strong>{invoice.patient?.full_name}</strong></div>
            {invoice.patient?.patient_uid && <div>Patient ID: <strong>{invoice.patient.patient_uid}</strong></div>}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #000' }}>Description</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #000' }}>Type</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #000' }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #000' }}>Unit Price</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #000' }}>GST</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #000' }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.line_items || []).map((item, i) => {
                const lineBase = Number(item.quantity) * Number(item.unit_price);
                const lineGst = lineBase * Number(item.gst_rate) / 100;
                return (
                  <tr key={i}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{item.description}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{item.service_type}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #eee' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #eee' }}>₹{Number(item.unit_price).toLocaleString('en-IN')}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #eee' }}>{item.gst_rate}%</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #eee' }}>₹{(lineBase + lineGst).toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 13, marginBottom: 30, gap: 4 }}>
            <div>Subtotal: ₹{Number(invoice.subtotal).toLocaleString('en-IN')}</div>
            <div>GST: ₹{Number(invoice.gst_amount).toLocaleString('en-IN')}</div>
            {Number(invoice.discount) > 0 && <div>Discount: -₹{Number(invoice.discount).toLocaleString('en-IN')}</div>}
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>Total: ₹{Number(invoice.total_amount).toLocaleString('en-IN')}</div>
          </div>

          <div style={{ fontSize: 13, marginBottom: 40 }}>
            Payment mode: <strong>{invoice.payment_mode}</strong> · Status: <strong>{invoice.status}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: 8, width: 180 }}>
                Authorised Signatory<br />
                <span style={{ fontSize: 11, color: '#555' }}>{tenant?.orgName || 'Hospital'}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, padding: '6px 10px', background: '#f5f5f5', borderRadius: 4, fontSize: 10, color: '#888', fontFamily: 'monospace' }}>
            Invoice No: {invoice.invoice_no} · Generated: {new Date().toLocaleString('en-IN')} · MPower
          </div>
        </div>
      )}

      <HospitalNav />
      <BugReporter screenName="hospital_billing" />
    </div>
  );
}