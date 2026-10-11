// hospital/HospitalBilling.jsx — FINAL
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { useVisit } from '../context/VisitContext';
import { sanitize } from '../shared/useFormValidation';
import PatientSelector from '../shared/PatientSelector';
import PrintHeader from '../shared/PrintHeader';
import HospitalNav from '../shared/HospitalNav';
import NextActions from '../shared/NextActions';
import BugReporter from '../shared/BugReporter';
import UpiQrCode from '../shared/UpiQrCode';

// 'Online' (Razorpay) is deliberately not offered: hospital online payments are
// switched off until the money destination is settled, and the database now
// refuses any bill marked Online or carrying a Razorpay payment id.
const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Insurance', 'Aarogyasri', 'PMJAY'];
const SERVICE_TYPES = ['Consultation', 'Lab test', 'Medicines', 'Procedure', 'Bed charges', 'Nursing', 'X-Ray / Scan', 'Other'];
const GST_RATES     = [0, 5, 12, 18];

// Price list (set up on the Price list screen) → the service type shown on a bill line.
const CATEGORY_TO_SERVICE = { room: 'Bed charges', daily_extra: 'Other', consultation: 'Consultation', lab: 'Lab test', procedure: 'Procedure', other: 'Other' };
const PICKER_GROUPS = [
  { k: 'consultation', label: 'Consultations' },
  { k: 'lab',          label: 'Lab tests' },
  { k: 'procedure',    label: 'Procedures' },
  { k: 'daily_extra',  label: 'Daily extras' },
  { k: 'other',        label: 'Other' },
];
const EMPTY_ITEM = { description: '', service_type: 'Consultation', quantity: '1', unit_price: '', gst_rate: '0', covered: false };

function money(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }
function fmtDate(d) { return d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN') : ''; }
function lineBase(item) { return (Number(item.quantity) || 0) * (Number(item.unit_price) || 0); }
function lineGst(item)  { return lineBase(item) * (Number(item.gst_rate) || 0) / 100; }
function round2(n) { return Math.round(n * 100) / 100; }

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

  const location = useLocation();

  const [selectedPatient, setSelectedPatient] = useState(activePatient);
  const [items, setItems]       = useState([{ ...EMPTY_ITEM }]);
  const [itemErrors, setItemErrors] = useState([{}]);

  // Price list + admission room charges
  const [priceList, setPriceList]     = useState([]);
  const [wardIdByName, setWardIdByName] = useState({});
  const [admissions, setAdmissions]   = useState([]);
  const [admissionId, setAdmissionId] = useState('');
  const [billedIds, setBilledIds]     = useState([]);
  const [roomRows, setRoomRows]       = useState([]);
  const [roomNote, setRoomNote]       = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  // upi_id isn't part of TenantContext (it's branch-level business
  // data, not session data), so it's fetched here on mount.
  const [branchUpiId, setBranchUpiId] = useState('');
  const [discountAmt, setDiscountAmt] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving]     = useState(false);
  const [invoice, setInvoice]   = useState(null);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => { setSelectedPatient(activePatient); }, [activePatient]);

  useEffect(() => {
    if (!tenant?.branchId) return;
    supabase.from('branches').select('upi_id').eq('id', tenant.branchId).maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('Loading branch UPI ID failed:', error); return; }
        setBranchUpiId(data?.upi_id || '');
      });
  }, [tenant?.branchId]);

  // Price list and wards, once.
  useEffect(() => {
    if (!tenant?.appId) return;
    (async () => {
      const [plRes, wardRes] = await Promise.all([
        supabase.from('hospital_price_list').select('id, category, name, rate, gst_rate, ward_id')
          .eq('app_id', tenant.appId).eq('active', true).order('sort_order').order('name'),
        supabase.from('wards').select('id, ward_type').eq('app_id', tenant.appId),
      ]);
      if (plRes.error) console.error('Loading price list failed:', plRes.error);
      if (wardRes.error) console.error('Loading wards failed:', wardRes.error);
      setPriceList(plRes.data || []);
      const map = {};
      (wardRes.data || []).forEach((w) => { map[w.ward_type] = w.id; });
      setWardIdByName(map);
    })();
  }, [tenant?.appId]);

  // The selected patient's recent admissions. The open one (or the one the user
  // came from on the IPD screen) is chosen automatically.
  useEffect(() => {
    setRoomRows([]);
    setRoomNote('');
    if (!selectedPatient?.id) { setAdmissions([]); setAdmissionId(''); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('ipd_admissions')
        .select('id, admission_date, discharge_date, bed_no, wards(ward_type)')
        .eq('patient_id', selectedPatient.id)
        .order('admission_date', { ascending: false }).limit(5);
      if (cancelled) return;
      if (error) { console.error('Loading admissions failed:', error); setAdmissions([]); setAdmissionId(''); return; }
      const list = data || [];
      setAdmissions(list);
      const fromIpd = location.state?.admissionId;
      const pick = list.find((a) => a.id === fromIpd) || list.find((a) => !a.discharge_date) || null;
      setAdmissionId(pick ? pick.id : '');
    })();
    return () => { cancelled = true; };
  }, [selectedPatient?.id]);

  // Which of those admissions already have a bill with room charges.
  useEffect(() => {
    if (admissions.length === 0) { setBilledIds([]); return; }
    (async () => {
      const { data, error } = await supabase.from('billing_invoices').select('admission_id')
        .in('admission_id', admissions.map((a) => a.id));
      if (error) { console.error('Checking billed admissions failed:', error); return; }
      setBilledIds((data || []).map((r) => r.admission_id));
    })();
  }, [admissions, invoice]);

  // Days and room charges for the chosen admission, worked out in the database.
  useEffect(() => {
    setRoomRows([]);
    if (!admissionId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('ipd_bill_preview', { p_admission: admissionId });
      if (cancelled) return;
      if (error) { console.error('Room charge preview failed:', error); setRoomNote('Could not work out room charges. Add them manually.'); return; }
      setRoomNote('');
      setRoomRows(data || []);
    })();
    return () => { cancelled = true; };
  }, [admissionId]);

  function setAllItems(next) {
    setItems(next);
    setItemErrors(next.map(() => ({})));
  }

  // A blank untouched first line is dropped when charges are added from the price list.
  function withoutBlank(list) {
    return list.filter((i) => !(i.description.trim() === '' && !i.unit_price && !i.source));
  }

  const totalRoomDays = roomRows.reduce((s, r) => s + Number(r.days || 0), 0);
  const roomChargeRows = roomRows.filter((r) => !r.rate_missing);
  const roomTotal = roomChargeRows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const alreadyBilled = !!admissionId && billedIds.includes(admissionId);

  function addRoomCharges() {
    const lines = roomChargeRows.map((r) => {
      const wardId = wardIdByName[r.ward_name];
      const priced = priceList.find((p) => p.category === 'room' && p.ward_id === wardId);
      return {
        description: `Room charges — ${r.ward_name} Ward, bed ${r.bed_no} (${fmtDate(r.from_date)} to ${fmtDate(r.to_date)})`,
        service_type: 'Bed charges', quantity: String(r.days), unit_price: String(r.rate),
        gst_rate: String(priced ? priced.gst_rate : 0), covered: false, source: 'room',
      };
    });
    if (lines.length === 0) return;
    setAllItems([...withoutBlank(items).filter((i) => i.source !== 'room'), ...lines]);
  }

  function addDailyExtra(p) {
    if (totalRoomDays <= 0) return;
    const line = {
      description: `${p.name} (${totalRoomDays} day${totalRoomDays === 1 ? '' : 's'})`,
      service_type: CATEGORY_TO_SERVICE.daily_extra, quantity: String(totalRoomDays), unit_price: String(p.rate),
      gst_rate: String(p.gst_rate), covered: false, source: 'extra', price_id: p.id,
    };
    setAllItems([...withoutBlank(items).filter((i) => !(i.source === 'extra' && i.price_id === p.id)), line]);
  }

  function pickFromPriceList(idx, priceId) {
    const p = priceList.find((x) => x.id === priceId);
    if (!p) return;
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], description: p.name, service_type: CATEGORY_TO_SERVICE[p.category] || 'Other', unit_price: String(p.rate), gst_rate: String(p.gst_rate), quantity: copy[idx].quantity || '1' };
      return copy;
    });
    setItemErrors((prev) => { const c = [...prev]; c[idx] = {}; return c; });
  }

  function addItem() {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
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
  const subtotal = items.reduce((sum, item) => sum + lineBase(item), 0);
  const totalGst = items.reduce((sum, item) => sum + lineGst(item), 0);

  // Lines ticked "covered by scheme" (PMJAY, Aarogyasri, insurance) stay on the
  // bill but are not charged to the patient.
  const coveredAmount = round2(items.filter((i) => i.covered).reduce((sum, item) => sum + lineBase(item) + lineGst(item), 0));
  const patientGross  = round2(subtotal + totalGst - coveredAmount);

  const discount     = Math.max(0, Number(discountAmt) || 0);
  const totalAmount  = Math.max(0, round2(patientGross - discount));

  async function generateBill() {
    setSubmitError('');

    if (!selectedPatient) { setSubmitError('Please select a patient first.'); return; }

    // Validate all items
    const allItemErrors = items.map((item) => validateItem(item));
    setItemErrors(allItemErrors);

    const hasItemErrors = allItemErrors.some((e) => Object.keys(e).length > 0);
    if (hasItemErrors) { setSubmitError('Please fix the errors in billing items.'); return; }

    // A bill fully covered by a scheme legitimately has nothing for the patient to pay.
    if (totalAmount <= 0 && coveredAmount <= 0) { setSubmitError('Total amount must be greater than zero.'); return; }

    // Discount cannot exceed what the patient would otherwise pay
    if (discount > patientGross) {
      setSubmitError('Discount cannot be more than the amount payable by the patient.');
      return;
    }

    if (alreadyBilled && items.some((i) => i.source === 'room')) {
      if (!window.confirm('Room charges for this admission were already billed on an earlier invoice. Billing them again will charge the patient twice. Continue anyway?')) return;
    }

    await createInvoiceRecord();
  }

  async function createInvoiceRecord() {
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
        covered_amount: coveredAmount,
        // Only set when this bill really carries the admission's room charges,
        // so the "already billed" warning is about room charges specifically.
        admission_id: items.some((i) => i.source === 'room') ? admissionId : null,
        payment_mode: paymentMode,
        status:       'paid',
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
    setInvoice({ ...inv, patient: selectedPatient, subtotal, discount, covered_amount: coveredAmount, invoice_date: invoiceDate });
    setSaving(false);
  }

  function newBill() {
    setInvoice(null);
    setItems([{ ...EMPTY_ITEM }]);
    setItemErrors([{}]);
    setDiscountAmt('');
    setSubmitError('');
  }

  return (
    <div className="billing-page" style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          /* The screen wrapper is min-height 100vh + 100px bottom padding
             (room for the fixed menu bar). Carried into print, that made
             the invoice slightly taller than one A4 page and pushed an
             almost-empty second page out. Reset for print only. */
          @page { size: A4; margin: 12mm; }
          html, body { height: auto !important; background: #fff !important; }
          .billing-page { min-height: 0 !important; padding-bottom: 0 !important; background: #fff !important; }
          .billing-page .print-only { padding: 0 !important; max-width: none !important; break-inside: avoid; page-break-inside: avoid; }
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

            {/* Admission room charges — read from the Price list, days counted from
                admission to discharge (admission day counts, discharge day does not). */}
            {selectedPatient && admissions.length > 0 && (
              <div style={S.card}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 12px' }}>Room charges · గది ఛార్జీలు</p>
                <label htmlFor="billing-admission" style={S.label}>Admission</label>
                <select id="billing-admission" name="billing-admission" value={admissionId} onChange={(e) => setAdmissionId(e.target.value)} style={{ ...S.select, marginBottom: 12 }}>
                  <option value="">-- Not billing room charges --</option>
                  {admissions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {fmtDate(a.admission_date)} · {a.wards?.ward_type || 'Ward'} · {a.discharge_date ? `discharged ${fmtDate(a.discharge_date)}` : 'still admitted'}
                    </option>
                  ))}
                </select>

                {alreadyBilled && (
                  <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#E05A5A' }}>
                    ⚠ Room charges for this admission were already billed on an earlier invoice. Adding them again would charge the patient twice.
                  </div>
                )}
                {roomNote && <p style={{ fontSize: 12, color: '#E8A020', margin: '0 0 10px' }}>{roomNote}</p>}

                {admissionId && roomRows.length > 0 && (
                  <>
                    {roomRows.map((r) => (
                      <div key={r.stay_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' }}>
                        <span>{r.ward_name} Ward · bed {r.bed_no} · {fmtDate(r.from_date)} → {fmtDate(r.to_date)}<br />
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>{r.days} day{r.days === 1 ? '' : 's'}{r.rate_missing ? '' : ` × ${money(r.rate)}`}</span>
                        </span>
                        {r.rate_missing
                          ? <span style={{ color: '#E8A020', textAlign: 'right' }}>No rate<br /><Link to="/hospital/price-list" style={{ color: '#E8A020', fontSize: 11 }}>Set rate →</Link></span>
                          : <span style={{ color: '#fff', fontWeight: 600 }}>{money(r.amount)}</span>}
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, margin: '10px 0' }}>
                      <span>{totalRoomDays} day{totalRoomDays === 1 ? '' : 's'} in total</span>
                      <span style={{ color: '#E8A020' }}>{money(roomTotal)}</span>
                    </div>
                    <button onClick={addRoomCharges} disabled={roomChargeRows.length === 0}
                      style={{ width: '100%', padding: 10, border: 'none', borderRadius: 8, background: roomChargeRows.length === 0 ? 'rgba(255,255,255,0.08)' : '#6AAA90', color: '#111113', fontWeight: 600, fontSize: 13, cursor: roomChargeRows.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                      {items.some((i) => i.source === 'room') ? '↻ Update room charges on the bill' : '+ Add room charges to the bill'}
                    </button>

                    {priceList.some((p) => p.category === 'daily_extra') && (
                      <div style={{ marginTop: 14 }}>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>Daily extras × {totalRoomDays} day{totalRoomDays === 1 ? '' : 's'}</p>
                        {priceList.filter((p) => p.category === 'daily_extra').map((p) => {
                          const added = items.some((i) => i.source === 'extra' && i.price_id === p.id);
                          return (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 0' }}>
                              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{p.name} · {money(p.rate)}/day</span>
                              <button onClick={() => addDailyExtra(p)}
                                style={{ padding: '4px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, background: added ? 'rgba(106,170,144,0.12)' : 'transparent', color: added ? '#6AAA90' : 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                                {added ? '✓ Added' : `+ Add ${money(p.rate * totalRoomDays)}`}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

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

                  {priceList.some((p) => p.category !== 'room') && (
                    <div style={{ marginBottom: 10 }}>
                      <select aria-label={`Pick line item ${idx + 1} from price list`} value="" onChange={(e) => pickFromPriceList(idx, e.target.value)} style={S.select}>
                        <option value="">📋 Pick from price list…</option>
                        {PICKER_GROUPS.map((g) => {
                          const opts = priceList.filter((p) => p.category === g.k);
                          return opts.length === 0 ? null : (
                            <optgroup key={g.k} label={g.label}>
                              {opts.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.rate)}</option>)}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  <div style={{ marginBottom: 10 }}>
                    <input id={`billing-item-desc-${idx}`} name={`billing-item-desc-${idx}`} aria-label={`Description for line item ${idx + 1}`} value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      placeholder="Description (e.g. Consultation fee, CBC test)"
                      style={S.input(itemErrors[idx]?.description)} />
                    {itemErrors[idx]?.description && <p style={S.fieldErr}>⚠ {itemErrors[idx].description}</p>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8 }}>
                    <select id={`billing-service-type-${idx}`} name={`billing-service-type-${idx}`} aria-label={`Service type for line item ${idx + 1}`} value={item.service_type} onChange={(e) => updateItem(idx, 'service_type', e.target.value)} style={S.select}>
                      {SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>

                    <div>
                      <input id={`billing-item-qty-${idx}`} name={`billing-item-qty-${idx}`} aria-label={`Quantity for line item ${idx + 1}`} value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        placeholder="Qty" inputMode="numeric"
                        style={S.input(itemErrors[idx]?.quantity)} />
                      {itemErrors[idx]?.quantity && <p style={S.fieldErr}>⚠ {itemErrors[idx].quantity}</p>}
                    </div>

                    <div>
                      <input id={`billing-item-price-${idx}`} name={`billing-item-price-${idx}`} aria-label={`Unit price for line item ${idx + 1}`} value={item.unit_price}
                        onChange={(e) => updateItem(idx, 'unit_price', e.target.value)}
                        placeholder="₹ Price" inputMode="numeric"
                        style={S.input(itemErrors[idx]?.unit_price)} />
                      {itemErrors[idx]?.unit_price && <p style={S.fieldErr}>⚠ {itemErrors[idx].unit_price}</p>}
                    </div>

                    <select id={`billing-gst-rate-${idx}`} name={`billing-gst-rate-${idx}`} aria-label={`GST rate for line item ${idx + 1}`} value={item.gst_rate} onChange={(e) => updateItem(idx, 'gst_rate', e.target.value)} style={S.select}>
                      {GST_RATES.map((r) => <option key={r} value={r}>GST {r}%</option>)}
                    </select>
                  </div>

                  <label htmlFor={`billing-item-covered-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: item.covered ? '#6AAA90' : 'rgba(255,255,255,0.45)', cursor: 'pointer' }}>
                    <input id={`billing-item-covered-${idx}`} name={`billing-item-covered-${idx}`} type="checkbox" checked={!!item.covered}
                      onChange={(e) => updateItem(idx, 'covered', e.target.checked)} />
                    Covered by scheme / insurance (not charged to the patient)
                  </label>

                  {Number(item.unit_price) > 0 && Number(item.quantity) > 0 && (
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>
                      Line total: ₹{((Number(item.quantity)) * (Number(item.unit_price))).toLocaleString('en-IN')}
                      {Number(item.gst_rate) > 0 ? ` + GST ₹${((Number(item.quantity)) * (Number(item.unit_price)) * Number(item.gst_rate) / 100).toFixed(2)}` : ''}
                      {item.covered ? ' · covered' : ''}
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
                  <label htmlFor="billing-payment-mode" style={S.label}>Payment mode</label>
                  <select id="billing-payment-mode" name="billing-payment-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} style={S.select}>
                    {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                  </select>
                  {/* Counter QR — only for UPI mode, and only when the
                      branch has actually configured a UPI ID in
                      Business Details. */}
                  {paymentMode === 'UPI' && branchUpiId && totalAmount > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <UpiQrCode
                        upiId={branchUpiId}
                        payeeName={tenant?.orgName}
                        amount={totalAmount}
                        note={`Hospital bill${selectedPatient?.full_name ? ` - ${selectedPatient.full_name}` : ''}`}
                        size={180}
                      />
                    </div>
                  )}
                  {paymentMode === 'UPI' && !branchUpiId && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      Set a UPI ID in Business Details to show a scannable QR code here.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="billing-discount" style={S.label}>Discount (₹)</label>
                  <input
                    id="billing-discount" name="billing-discount"
                    value={discountAmt}
                    onChange={(e) => {
                      const v = sanitize.amount(e.target.value);
                      setDiscountAmt(v);
                    }}
                    placeholder="0"
                    inputMode="numeric"
                    style={S.input(discount > patientGross)}
                  />
                  {discount > patientGross && (
                    <p style={S.fieldErr}>⚠ Discount cannot exceed the amount payable by the patient</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="billing-invoice-date" style={S.label}>Invoice date</label>
                <input id="billing-invoice-date" name="billing-invoice-date" type="date" value={invoiceDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  style={{ ...S.input(false), width: 'auto' }} />
              </div>

              {/* Totals */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {[
                  { label: 'Subtotal', value: `₹${subtotal.toLocaleString('en-IN')}`, color: 'rgba(255,255,255,0.5)' },
                  totalGst > 0 && { label: 'GST', value: `₹${totalGst.toFixed(2)}`, color: 'rgba(255,255,255,0.5)' },
                  coveredAmount > 0 && { label: 'Covered by scheme', value: `−₹${coveredAmount.toLocaleString('en-IN')}`, color: '#5A9ADF' },
                  discount > 0 && { label: 'Discount', value: `−₹${discount.toLocaleString('en-IN')}`, color: '#6AAA90' },
                ].filter(Boolean).map((row) => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: row.color, marginBottom: 4 }}>
                    <span>{row.label}</span><span>{row.value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, color: '#fff', marginTop: 8 }}>
                  <span>{coveredAmount > 0 ? 'Payable by patient' : 'Total'}</span>
                  <span style={{ color: totalAmount <= 0 && coveredAmount <= 0 ? '#E05A5A' : '#fff' }}>
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

            <button onClick={generateBill} disabled={saving || !selectedPatient}
              style={{ width: '100%', padding: 14, background: saving || !selectedPatient ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving || !selectedPatient ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving || !selectedPatient ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Generating...' : `🧾 Generate invoice — ₹${totalAmount.toLocaleString('en-IN')}`}
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
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee' }}>{item.description}{item.covered ? ' (covered by scheme)' : ''}</td>
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
            {Number(invoice.covered_amount) > 0 && <div>Covered by scheme / insurance: -₹{Number(invoice.covered_amount).toLocaleString('en-IN')}</div>}
            {Number(invoice.discount) > 0 && <div>Discount: -₹{Number(invoice.discount).toLocaleString('en-IN')}</div>}
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{Number(invoice.covered_amount) > 0 ? 'Payable by patient' : 'Total'}: ₹{Number(invoice.total_amount).toLocaleString('en-IN')}</div>
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

      {/* Wrapped so the fixed menu bar and bug-report button can never
          take up space in a printout, whatever their own styles do. */}
      <div className="no-print">
        <HospitalNav />
        <BugReporter screenName="hospital_billing" />
      </div>
    </div>
  );
}