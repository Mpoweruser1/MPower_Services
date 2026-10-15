// hospital/HospitalBilling.jsx — FINAL
// Deposit: for the chosen admission the deposit in hand is shown (DepositBox) and can be used on the bill;
// the bill keeps its full amount, the deposit is the part already paid. Needs fix_hospital_deposits.sql;
// without it no deposit is shown and bills are made as before.
import React, { useState, useEffect, useRef } from 'react';
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
import InvoicePrint from './InvoicePrint';
import BillList from './BillList';
import DepositBox from './DepositBox';
import { istToday } from './hospitalUtils';

// 'Online' (Razorpay) is deliberately not offered: hospital online payments are
// switched off until the money destination is settled, and the database now
// refuses any bill marked Online or carrying a Razorpay payment id.
const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Insurance', 'Aarogyasri', 'PMJAY'];
const SERVICE_TYPES = ['Consultation', 'Lab test', 'Medicines', 'Procedure', 'Bed charges', 'Nursing', 'X-Ray / Scan', 'Other'];
const GST_RATES     = [0, 5, 12, 18];
const SCHEME_MODES  = ['Insurance', 'Aarogyasri', 'PMJAY'];

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
  const [priceListLoaded, setPriceListLoaded] = useState(false);
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
  const [invoiceDate, setInvoiceDate] = useState(istToday());
  // deposit of the chosen admission: what DepositBox last reported, whether it is used on this bill
  // (null = not chosen yet: used when there is some in hand), and a typed amount ('' = as much as fits)
  const [depSummary, setDepSummary] = useState(null);
  const [useDeposit, setUseDeposit] = useState(null);
  const [depositAmt, setDepositAmt] = useState('');
  const [depKey, setDepKey]         = useState(0);
  const [depositLeft, setDepositLeft] = useState(0);
  const [saving, setSaving]     = useState(false);
  const [invoice, setInvoice]   = useState(null);
  const [submitError, setSubmitError] = useState('');
  // 'new' = make a bill, 'bills' = find / reprint / cancel earlier bills.
  const [tab, setTab]           = useState(location.state?.tab === 'bills' ? 'bills' : 'new');
  const [printJob, setPrintJob] = useState(null);
  // Lab tests ordered on the Lab screen can arrive here ("Bill these tests"): added once as lines, priced from the Price list
  const labPrefilled = useRef(false);
  const [labNote, setLabNote] = useState('');

  useEffect(() => { setSelectedPatient(activePatient); }, [activePatient]);

  useEffect(() => {
    const tests = location.state?.labTests;
    if (labPrefilled.current || !Array.isArray(tests) || tests.length === 0 || !tenant?.appId || !priceListLoaded) return;
    labPrefilled.current = true;
    let unpriced = 0;
    const lines = tests.map((t) => {
      const p = priceList.find((x) => x.category === 'lab' && String(x.name).trim().toLowerCase() === String(t.name).trim().toLowerCase());
      const rate = p ? p.rate : (Number(t.price) > 0 ? Number(t.price) : null);
      if (rate === null) unpriced += 1;
      return { description: t.name, service_type: 'Lab test', quantity: '1', unit_price: rate === null ? '' : String(rate), gst_rate: String(p ? p.gst_rate : 0), covered: false, price_id: p ? p.id : undefined };
    });
    setAllItems(lines);
    setLabNote(`${lines.length} lab test${lines.length === 1 ? '' : 's'} added from the Lab screen.${unpriced > 0 ? ` ${unpriced} ${unpriced === 1 ? 'has' : 'have'} no price on the Price list — enter the price.` : ''}`);
  }, [priceListLoaded, priceList, tenant?.appId]);

  // Reprint of an earlier bill from the Bills tab.
  useEffect(() => {
    if (!printJob) return undefined;
    const t = setTimeout(() => window.print(), 150);
    return () => clearTimeout(t);
  }, [printJob]);

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
      let [plRes, wardRes] = await Promise.all([
        supabase.from('hospital_price_list').select('id, category, name, rate, gst_rate, ward_id, is_sample')
          .eq('app_id', tenant.appId).eq('active', true).order('sort_order').order('name'),
        supabase.from('wards').select('id, ward_type').eq('app_id', tenant.appId),
      ]);
      // 42703 = the "sample" mark does not exist yet (older database): read the list without it
      if (plRes.error && plRes.error.code === '42703') {
        plRes = await supabase.from('hospital_price_list').select('id, category, name, rate, gst_rate, ward_id')
          .eq('app_id', tenant.appId).eq('active', true).order('sort_order').order('name');
      }
      if (plRes.error) console.error('Loading price list failed:', plRes.error);
      if (wardRes.error) console.error('Loading wards failed:', wardRes.error);
      setPriceList(plRes.data || []);
      setPriceListLoaded(true);
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
      let pick = list.find((a) => a.id === fromIpd) || list.find((a) => !a.discharge_date) || null;
      // A patient who has gone home but still has deposit in hand: the final bill is usually made now,
      // so that admission is chosen (its deposit has to be used or refunded).
      if (!pick && list.length > 0) {
        const { data: ds, error: dsErr } = await supabase.rpc('ipd_deposit_summary', { p_admissions: list.map((a) => a.id) });
        if (cancelled) return;
        if (!dsErr) {
          const withMoney = new Set((ds || []).filter((d) => Number(d.in_hand) > 0).map((d) => d.admission_id));
          pick = list.find((a) => withMoney.has(a.id)) || null;
        }
      }
      setAdmissionId(pick ? pick.id : '');
    })();
    return () => { cancelled = true; };
  }, [selectedPatient?.id]);

  // Which of those admissions already have a bill with room charges.
  useEffect(() => {
    if (admissions.length === 0) { setBilledIds([]); return; }
    (async () => {
      // A cancelled bill no longer counts as billed, so its room charges can be billed again.
      const { data, error } = await supabase.from('billing_invoices').select('admission_id')
        .in('admission_id', admissions.map((a) => a.id))
        .neq('status', 'cancelled');
      if (error) { console.error('Checking billed admissions failed:', error); return; }
      setBilledIds((data || []).map((r) => r.admission_id));
    })();
  }, [admissions, invoice]);

  // another admission: the deposit choices start again
  useEffect(() => { setDepSummary(null); setUseDeposit(null); setDepositAmt(''); }, [admissionId]);

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
        gst_rate: String(priced ? priced.gst_rate : 0), covered: false, source: 'room', price_id: priced ? priced.id : undefined,
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
      copy[idx] = { ...copy[idx], description: p.name, service_type: CATEGORY_TO_SERVICE[p.category] || 'Other', unit_price: String(p.rate), gst_rate: String(p.gst_rate), quantity: copy[idx].quantity || '1', price_id: p.id };
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

  // The deposit used on this bill. The bill keeps its full amount; the deposit is the part already paid.
  const depositInHand = admissionId && depSummary ? Number(depSummary.in_hand) || 0 : 0;
  const depositWanted = useDeposit === null ? true : useDeposit;
  const depositTyped  = depositAmt !== '';
  const depositUse    = depositWanted && depositInHand > 0
    ? round2(depositTyped ? (Number(depositAmt) || 0) : Math.min(depositInHand, totalAmount))
    : 0;
  const payNow        = Math.max(0, round2(totalAmount - depositUse));
  const isOwner       = ['principal', 'doctor'].includes(tenant?.role);
  const pickedAdmission = admissions.find((a) => a.id === admissionId);

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

    if (depositWanted && depositInHand > 0 && depositTyped && !(Number(depositAmt) > 0)) { setSubmitError('Enter the deposit amount to use, or untick "Use the deposit".'); return; }
    if (depositUse > depositInHand) { setSubmitError(`Only ${money(depositInHand)} is in the deposit.`); return; }
    if (depositUse > totalAmount) { setSubmitError('The deposit used cannot be more than the bill amount.'); return; }

    if (!invoiceDate) { setSubmitError('Select the invoice date.'); return; }
    if (invoiceDate > istToday()) { setSubmitError('The invoice date cannot be in the future.'); return; }

    // A scheme / insurance payment mode with nothing marked as covered would be saved as a
    // bill the patient paid in full — usually a forgotten tick.
    if (SCHEME_MODES.includes(paymentMode) && coveredAmount <= 0) {
      if (!window.confirm(`The payment mode is ${paymentMode}, but no item is marked "Covered by scheme / insurance". The whole amount will be recorded as paid by the patient and no claim will be tracked. Continue anyway?`)) return;
    }

    // Rates the system pre-loaded and the hospital has not yet confirmed (Price list → "sample"): ask before billing with them
    const sampleNames = [...new Set(items.filter((i) => {
      const p = i.price_id ? priceList.find((x) => x.id === i.price_id) : null;
      return p && p.is_sample && Number(i.unit_price) === Number(p.rate);
    }).map((i) => i.description.split(' — ')[0]))];
    if (sampleNames.length > 0) {
      const shown = sampleNames.slice(0, 4).join(', ') + (sampleNames.length > 4 ? ` and ${sampleNames.length - 4} more` : '');
      if (!window.confirm(`These rates are still pre-loaded samples and have not been confirmed on the Price list: ${shown}. Check they are correct before billing. Continue with this bill?`)) return;
    }

    if (alreadyBilled && items.some((i) => i.source === 'room')) {
      if (!window.confirm('Room charges for this admission were already billed on an earlier invoice. Billing them again will charge the patient twice. Continue anyway?')) return;
    }

    await createInvoiceRecord();
  }

  async function createInvoiceRecord() {
    setSaving(true);

    // The invoice number is given by the database (one running series per hospital per
    // financial year), so it is not sent from here.
    const { data: inv, error: invErr } = await supabase
      .from('billing_invoices')
      .insert({
        app_id:       tenant.appId,
        branch_id:    tenant.branchId || null,
        patient_id:   selectedPatient.id,
        invoice_date: invoiceDate,
        line_items:   items,
        gst_amount:   totalGst,
        total_amount: totalAmount,
        covered_amount: coveredAmount,
        // Only set when this bill really carries the admission's room charges,
        // so the "already billed" warning is about room charges specifically.
        admission_id: items.some((i) => i.source === 'room') ? admissionId : null,
        payment_mode: paymentMode,
        status:       'paid',
        // The part covered by a scheme / insurer is money still to be received.
        claim_status: coveredAmount > 0 ? 'pending' : null,
        // The part already paid as deposit (the database checks it against the deposit in hand).
        ...(depositUse > 0 ? { deposit_applied: depositUse, deposit_admission_id: admissionId } : {}),
      })
      .select()
      .single();

    if (invErr) {
      console.error('Invoice generation failed:', invErr);
      setSubmitError(invErr.message || 'Failed to generate invoice. Please try again.');
      setDepKey((k) => k + 1); // the deposit may have changed meanwhile: show the real figure
      setSaving(false);
      return;
    }

    if (selectedPatient.phone) {
      await supabase.functions.invoke('send-whatsapp', {
        body: { type: 'hospital_receipt', patientId: selectedPatient.id, invoiceNo: inv.invoice_no, amount: totalAmount },
      });
    }

    // billing_invoices has no subtotal / discount columns — they are merged in from the
    // values worked out above for the printout. (The Bills tab works them out again from
    // the saved lines, GST and amounts.)
    setInvoice({ ...inv, patient: selectedPatient, subtotal, discount, covered_amount: coveredAmount, invoice_date: invoiceDate, deposit_applied: depositUse });
    setDepositLeft(round2(depositInHand - depositUse));
    setDepKey((k) => k + 1);
    setSaving(false);
  }

  function newBill() {
    setInvoice(null);
    setItems([{ ...EMPTY_ITEM }]);
    setItemErrors([{}]);
    setDiscountAmt('');
    setInvoiceDate(istToday());
    setSubmitError('');
    setUseDeposit(null);
    setDepositAmt('');
    setDepositLeft(0);
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

        <div role="tablist" aria-label="Billing" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['new', 'New bill'], ['bills', 'Bills']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              style={{ padding: '8px 18px', fontSize: 13, borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', border: tab === k ? 'none' : '1px solid rgba(255,255,255,0.12)', background: tab === k ? '#E8A020' : 'transparent', color: tab === k ? '#111113' : 'rgba(255,255,255,0.55)', fontWeight: tab === k ? 600 : 400 }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'bills' ? (
          <BillList onPrint={(inv) => setPrintJob({ inv, n: Date.now() })} initialFilter={location.state?.filter} />
        ) : !invoice ? (
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

            {/* Deposit of the chosen admission: see it, take more, refund (owner) */}
            {selectedPatient && admissionId && (
              <div style={S.card}>
                <DepositBox key={`${admissionId}-${depKey}`} admissionId={admissionId} admissionOpen={!!pickedAdmission && !pickedAdmission.discharge_date}
                  required={null} canRefund={isOwner} onChanged={setDepSummary} patientName={selectedPatient?.full_name} />
              </div>
            )}

            {/* Billing items */}
            {labNote && <div role="status" style={{ background: 'rgba(90,154,223,0.08)', border: '1px solid rgba(90,154,223,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#5A9ADF' }}>🔬 {labNote}</div>}
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
                  {paymentMode === 'UPI' && branchUpiId && payNow > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <UpiQrCode
                        upiId={branchUpiId}
                        payeeName={tenant?.orgName}
                        amount={payNow}
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
                  max={istToday()}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  style={{ ...S.input(false), width: 'auto' }} />
              </div>

              {depositInHand > 0 && (
                <div style={{ marginTop: 14, padding: '10px 12px', background: '#111113', borderRadius: 8 }}>
                  <label htmlFor="billing-use-deposit" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: depositWanted ? '#6AAA90' : 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>
                    <input id="billing-use-deposit" name="billing-use-deposit" type="checkbox" checked={depositWanted} onChange={(e) => setUseDeposit(e.target.checked)} />
                    Use the deposit for this bill ({money(depositInHand)} in hand)
                  </label>
                  {depositWanted && (
                    <div style={{ marginTop: 8 }}>
                      <label htmlFor="billing-deposit-use" style={S.label}>Deposit to use (₹)</label>
                      <input id="billing-deposit-use" name="billing-deposit-use" inputMode="decimal" value={depositAmt}
                        placeholder={String(Math.min(depositInHand, totalAmount))}
                        onChange={(e) => setDepositAmt(sanitize.amount(e.target.value))}
                        style={{ ...S.input(depositUse > depositInHand || depositUse > totalAmount), maxWidth: 200 }} />
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Leave empty to use as much as the bill needs.</p>
                    </div>
                  )}
                </div>
              )}

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
              {depositUse > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6AAA90', marginBottom: 4 }}>
                    <span>Less: deposit already paid</span><span>−{money(depositUse)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#E8A020' }}>
                    <span>Balance to pay now</span><span>{money(payNow)}</span>
                  </div>
                </div>
              )}
              {coveredAmount > 0 && (
                <p style={{ margin: '10px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  The covered amount ({money(coveredAmount)}) is saved as a claim to be received from the scheme / insurer. You can mark it received later in the Bills tab.
                </p>
              )}
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
          <>
          {depositLeft > 0 && (
            <div role="status" style={{ background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E8A020' }}>
              {money(depositLeft)} of the patient's deposit is still in hand. Use it on the next bill, or — when the patient goes home — the owner can refund it (select the patient under New bill, then Refund in the Deposit box).
            </div>
          )}
          <NextActions
            title="Invoice done — what next?"
            actions={[]}
            secondaryActions={[
              { icon: '🖨️', label: 'Print invoice', onClick: () => window.print() },
              { icon: '🧾', label: 'New bill', onClick: newBill },
              { icon: '🏠', label: 'Dashboard', href: '/hospital/dashboard' },
            ]}
          />
          </>
        )}
      </div>

      {/* Print-only invoice — hidden on screen, shown only when printing. On the Bills tab it
          is the bill being reprinted; otherwise the bill just made. */}
      <InvoicePrint invoice={tab === 'bills' ? printJob?.inv : invoice} orgName={tenant?.orgName} />

      {/* Wrapped so the fixed menu bar and bug-report button can never
          take up space in a printout, whatever their own styles do. */}
      <div className="no-print">
        <HospitalNav />
        <BugReporter screenName="hospital_billing" />
      </div>
    </div>
  );
}