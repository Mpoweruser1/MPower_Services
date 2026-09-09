// shared/UpiQrCode.jsx — NEW
//
// Renders a scannable UPI QR code for over-the-counter payments.
//
// IMPORTANT — deliberate limitation, not an oversight:
// A UPI QR payment is NOT verified by this app. The patient scans,
// pays from their own UPI app, and the money arrives in the
// hospital's bank account directly — MPower never sees a
// confirmation. Staff MUST check their own UPI app / bank SMS before
// marking the bill as paid. This is exactly why the component shows
// an explicit warning rather than a "Payment successful" state.
//
// For a payment the app CAN verify automatically, use PayButton
// (Razorpay) instead — that flow has real server-side verification.
// Both are offered because they suit different situations: QR for a
// patient standing at the counter (no fees, instant), PayButton for
// a payment link sent to someone remote (verified, small fee).
//
// UPI URI format follows the NPCI spec:
//   upi://pay?pa=<vpa>&pn=<payee name>&am=<amount>&cu=INR&tn=<note>
import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export default function UpiQrCode({ upiId, payeeName, amount, note, size = 200 }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!upiId) { setSvg(''); return; }

    // Amount is fixed to 2 decimals — UPI apps reject malformed
    // amounts, and a QR that silently fails to open is worse than
    // no QR at all.
    const params = new URLSearchParams({
      pa: upiId.trim(),
      pn: payeeName || 'Payment',
      am: Number(amount || 0).toFixed(2),
      cu: 'INR',
    });
    if (note) params.set('tn', note);

    const uri = `upi://pay?${params.toString()}`;

    QRCode.toString(uri, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then((generated) => { setSvg(generated); setError(''); })
      .catch((err) => {
        console.error('UPI QR generation failed:', err);
        setError(err.message || 'Could not generate QR code.');
        setSvg('');
      });
  }, [upiId, payeeName, amount, note, size]);

  // No UPI ID configured — show nothing rather than a broken code.
  if (!upiId) return null;

  if (error) {
    return (
      <div style={{ padding: 12, background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, fontSize: 12, color: '#E05A5A' }}>
        ⚠ {error}
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ background: '#fff', padding: 12, borderRadius: 10, display: 'inline-block', lineHeight: 0 }}
        dangerouslySetInnerHTML={{ __html: svg }} />
      <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: '#fff' }}>
        Scan to pay ₹{Number(amount || 0).toLocaleString('en-IN')}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
        {upiId}
      </p>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#E8A020', maxWidth: 240 }}>
        ⚠ Confirm payment received in your UPI app before marking this bill paid — QR payments are not auto-verified.
      </p>
    </div>
  );
}
