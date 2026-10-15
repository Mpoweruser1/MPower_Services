// hospital/InvoicePrint.jsx — NEW
// The printed invoice, used by the billing screen (right after a bill is made)
// and by the bill list (reprint). It was inside HospitalBilling.jsx; moved here
// unchanged in layout so both places print exactly the same page.
// Hidden on screen, shown only when printing (the .print-only rule lives in the
// screen that uses it). A bill that used a deposit shows the deposit and the balance paid now.
import React from 'react';

function fmtInvoiceDate(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  return new Date(`${s}T00:00:00`).toLocaleDateString('en-IN');
}

export default function InvoicePrint({ invoice, orgName }) {
  if (!invoice) return null;
  const cancelled = invoice.status === 'cancelled';
  const claimPending = invoice.claim_status === 'pending' && !cancelled;
  const claimReceived = invoice.claim_status === 'received' && !cancelled;

  return (
    <div className="print-only" style={{ background: '#fff', color: '#000', padding: '32px 40px', fontFamily: 'serif', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 24, borderBottom: '2px solid #000', paddingBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{orgName || 'Hospital'}</h2>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 0', textTransform: 'uppercase', letterSpacing: 2 }}>Invoice</h3>
      </div>

      {cancelled && (
        <div style={{ border: '2px solid #000', padding: '8px 12px', marginBottom: 16, textAlign: 'center', fontWeight: 700, letterSpacing: 2 }}>
          CANCELLED{invoice.cancel_reason ? <div style={{ fontWeight: 400, letterSpacing: 0, fontSize: 12, marginTop: 4 }}>Reason: {invoice.cancel_reason}</div> : null}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 20 }}>
        <span>Invoice No: <strong>{invoice.invoice_no}</strong></span>
        <span>Date: <strong>{fmtInvoiceDate(invoice.invoice_date)}</strong></span>
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
        {Number(invoice.deposit_applied) > 0 && (
          <>
            <div>Less: deposit already paid: -₹{Number(invoice.deposit_applied).toLocaleString('en-IN')}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Balance paid now: ₹{Math.max(0, Math.round((Number(invoice.total_amount) - Number(invoice.deposit_applied)) * 100) / 100).toLocaleString('en-IN')}</div>
          </>
        )}
      </div>

      <div style={{ fontSize: 13, marginBottom: 40 }}>
        Payment mode: <strong>{invoice.payment_mode}</strong> · Status: <strong>{cancelled ? 'cancelled' : invoice.status}</strong>
        {claimPending && <div style={{ marginTop: 4 }}>Scheme / insurance claim: <strong>pending</strong></div>}
        {claimReceived && <div style={{ marginTop: 4 }}>Scheme / insurance claim: <strong>received</strong>{invoice.claim_ref ? ` (ref ${invoice.claim_ref})` : ''}</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #000', paddingTop: 8, width: 180 }}>
            Authorised Signatory<br />
            <span style={{ fontSize: 11, color: '#555' }}>{orgName || 'Hospital'}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, padding: '6px 10px', background: '#f5f5f5', borderRadius: 4, fontSize: 10, color: '#888', fontFamily: 'monospace' }}>
        Invoice No: {invoice.invoice_no} · Generated: {new Date().toLocaleString('en-IN')} · MPower
      </div>
    </div>
  );
}
