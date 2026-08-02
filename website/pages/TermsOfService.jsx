// website/pages/TermsOfService.jsx — FINAL
import React from 'react';
import { Link } from 'react-router-dom';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 720, margin: '0 auto', padding: '100px 24px 80px' },
  h2: { fontSize: 20, fontWeight: 600, color: '#fff', margin: '32px 0 12px' },
  p: { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, margin: '0 0 14px' },
};

export default function TermsOfService() {
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
        <h1 style={{ fontSize: 36, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: -1 }}>Terms of Service</h1>
        <p style={{ ...S.p, color: 'rgba(255,255,255,0.6)' }}>Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <h2 style={S.h2}>§1 — Acceptance</h2>
        <p style={S.p}>By registering for and using MPower, you agree to these Terms of Service. If you do not agree, do not use the platform.</p>

        <h2 style={S.h2}>§2 — Free trial</h2>
        <p style={S.p}>New accounts receive 6 months free on the Basic tier. No credit card is required for the trial. After the trial period, you must choose a paid plan to continue using the platform. If no plan is chosen, the account moves to read-only mode.</p>

        <h2 style={S.h2}>§3 — Subscription and billing</h2>
        <p style={S.p}>Paid subscriptions are billed monthly or annually as selected. Prices are shown inclusive of applicable taxes. We reserve the right to change pricing with 30 days notice. Your subscription renews automatically unless cancelled.</p>

        <h2 style={S.h2}>§4 — Cancellation</h2>
        <p style={S.p}>You may cancel at any time. Cancellation takes effect at the end of the current billing period. No partial refunds are given for mid-period cancellations. Refer to our Refund Policy for details.</p>

        <h2 style={S.h2}>§5 — Acceptable use</h2>
        <p style={S.p}>You may not use MPower for illegal activities, to store false information, or to harm any person. You are responsible for all data entered into the platform by your organisation's users.</p>

        <h2 style={S.h2}>§6A — Modification requests</h2>
        <p style={S.p}>Custom development requests (modifications) are quoted separately. Work begins only after written acceptance of the quote and full payment. The delivered modification is the intellectual property of MPower and is licensed to you for use within the platform. Modification fees are non-refundable once development has started.</p>

        <h2 style={S.h2}>§7 — Liability limitation</h2>
        <p style={S.p}>MPower is provided as-is. We are not liable for data loss, business interruption, or consequential damages. Our total liability is limited to the subscription fees paid in the last 3 months.</p>

        <h2 style={S.h2}>§8 — Governing law</h2>
        <p style={S.p}>These terms are governed by the laws of India. Disputes shall be subject to the jurisdiction of courts in Andhra Pradesh.</p>

        <h2 style={S.h2}>§9 — Contact</h2>
        <p style={S.p}>legal@mpowerapp.in · MPower, Andhra Pradesh, India</p>

        <div style={{ marginTop: 32 }}>
          <Link to="/" style={{ color: '#E8A020', textDecoration: 'none', fontSize: 14 }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}