// website/pages/RefundPolicy.jsx — FINAL
import React from 'react';
import { Link } from 'react-router-dom';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 720, margin: '0 auto', padding: '100px 24px 80px' },
  h2: { fontSize: 20, fontWeight: 600, color: '#fff', margin: '32px 0 12px' },
  p: { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, margin: '0 0 14px' },
};

export default function RefundPolicy() {
  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={{ background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '14px 24px', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 13 }}>M</div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>MPower</span>
        </Link>
      </div>
      <div style={S.inner}>
        <h1 style={{ fontSize: 36, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: -1 }}>Refund Policy</h1>
        <p style={{ ...S.p, color: 'rgba(255,255,255,0.6)' }}>Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <h2 style={S.h2}>Subscription fees</h2>
        <p style={S.p}>Subscription fees are charged at the start of each billing period. We do not offer partial refunds for cancellations mid-period. Your access continues until the end of the paid period.</p>

        <h2 style={S.h2}>7-day refund window</h2>
        <p style={S.p}>If you are unsatisfied with your first paid subscription payment, you may request a full refund within 7 days of that payment. This applies to your first payment only. Contact refunds@mpowerapp.in with your account details and reason.</p>

        <h2 style={S.h2}>Modification request fees</h2>
        <p style={S.p}>Modification request payments are non-refundable once development has started. If we are unable to deliver the agreed scope, we will issue a full refund or credit. We do not accept returns of completed modifications.</p>

        <h2 style={S.h2}>Failed payments</h2>
        <p style={S.p}>If a payment fails and your account is suspended, you may continue by making a successful payment. Any period of suspension is not compensated with additional free usage.</p>

        <h2 style={S.h2}>How to request a refund</h2>
        <p style={S.p}>Email refunds@mpowerapp.in with your registered email, organisation name, and reason for refund. We process refunds within 7 working days via the original payment method.</p>

        <h2 style={S.h2}>Contact</h2>
        <p style={S.p}>refunds@mpowerapp.in · MPower, Andhra Pradesh, India</p>

        <div style={{ marginTop: 32 }}>
          <Link to="/" style={{ color: '#E8A020', textDecoration: 'none', fontSize: 14 }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}