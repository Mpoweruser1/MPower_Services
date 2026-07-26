// shared/PayButton.jsx — FINAL
import React, { useState } from 'react';
import { useRazorpay } from './useRazorpay';

export default function PayButton({
  amount, label, purpose, clientId, invoiceId, modRequestId,
  customerName, customerPhone, customerEmail, description,
  onSuccess, style,
}) {
  const { initiatePayment, paying, error } = useRazorpay();
  const [paid, setPaid] = useState(false);

  async function handlePay() {
    await initiatePayment({
      amount, purpose, clientId, invoiceId, modRequestId,
      customerName, customerPhone, customerEmail, description,
      onSuccess: (paymentId) => { setPaid(true); onSuccess?.(paymentId); },
    });
  }

  if (paid) {
    return (
      <div style={{ padding: '12px 16px', background: 'rgba(106,170,144,0.1)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 8, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 14, color: '#6AAA90', fontWeight: 500 }}>✓ Payment successful!</p>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Receipt sent via WhatsApp</p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handlePay}
        disabled={paying}
        style={{
          width: '100%', padding: '13px 20px',
          background: paying ? 'rgba(255,255,255,0.08)' : '#E8A020',
          color: paying ? 'rgba(255,255,255,0.3)' : '#111113',
          border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
          cursor: paying ? 'not-allowed' : 'pointer',
          fontFamily: 'Inter, sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          ...style,
        }}
      >
        {paying ? 'Processing...' : <><span>💳</span>{label || `Pay ₹${Number(amount).toLocaleString('en-IN')}`}</>}
      </button>
      {error && <p style={{ fontSize: 12, color: '#E05A5A', marginTop: 8, textAlign: 'center' }}>{error}</p>}
    </div>
  );
}