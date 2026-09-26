// website/pages/RefundPolicy.jsx
//
// Rewritten 26-09-2026. The previous version used a non-working email
// on the wrong domain (refunds@mpowerapp.in), did not name the
// operator (payment gateways check the business name), did not cover
// the free trial, annual plans, or how to cancel, and showed a
// "Last updated" date that changed to today's date on every visit.
import React from 'react';
import { Link } from 'react-router-dom';

const LAST_UPDATED = '26 September 2026';
const CONTACT_EMAIL = 'adminzoho@mpowerind.in';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 720, margin: '0 auto', padding: '100px 24px 80px' },
  h2: { fontSize: 20, fontWeight: 600, color: '#fff', margin: '32px 0 12px' },
  p: { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, margin: '0 0 14px' },
  strong: { color: 'rgba(255,255,255,0.85)', fontWeight: 600 },
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
        <p style={{ ...S.p, color: 'rgba(255,255,255,0.4)' }}>Last updated: {LAST_UPDATED}</p>
        <p style={S.p}>MPower is operated by <span style={S.strong}>Suribabu Kommana, Sole Proprietor, trading as MPower Services</span>, Andhra Pradesh, India.</p>

        <h2 style={S.h2}>Free trial</h2>
        <p style={S.p}>New accounts get 6 months free on the Basic plan. No payment is taken during the trial, so there is nothing to refund. You are charged only if you choose a paid plan.</p>

        <h2 style={S.h2}>Subscription fees</h2>
        <p style={S.p}>Subscriptions are charged at the start of each billing period, monthly or annually as you choose. If you cancel partway through a period, your access continues until the end of that paid period. We do not give partial refunds for unused time.</p>

        <h2 style={S.h2}>7-day refund on your first payment</h2>
        <p style={S.p}>If you are not satisfied with your <span style={S.strong}>first</span> paid subscription payment, you may ask for a full refund within 7 days of that payment. This applies to the first payment only, whether monthly or annual.</p>

        <h2 style={S.h2}>Annual plans</h2>
        <p style={S.p}>Annual plans are paid in advance for 12 months. Apart from the 7-day refund on your first payment, annual fees are not refunded, including for unused months if you cancel partway through the year. Your access continues until the end of the paid year.</p>

        <h2 style={S.h2}>How to cancel</h2>
        <p style={S.p}>Email {CONTACT_EMAIL} from your registered email address with your organisation name. Cancellation takes effect at the end of your current paid period, and you will not be charged again after that.</p>

        <h2 style={S.h2}>Custom development (modification requests)</h2>
        <p style={S.p}>Payments for custom development are non-refundable once work has started. If we cannot deliver the agreed scope, we will give a full refund or credit. Completed work cannot be returned.</p>

        <h2 style={S.h2}>Failed payments</h2>
        <p style={S.p}>If a payment fails and your account is suspended, you can restore it by making a successful payment. Time spent suspended is not added back as free usage.</p>

        <h2 style={S.h2}>How to request a refund</h2>
        <p style={S.p}>Email {CONTACT_EMAIL} with your registered email address, organisation name, payment ID, and the reason for the refund. Approved refunds are initiated within 7 working days to the original payment method. Your bank may take a few more working days to show the amount.</p>

        <h2 style={S.h2}>Contact</h2>
        <p style={S.p}>Suribabu Kommana, MPower Services · {CONTACT_EMAIL} · Andhra Pradesh, India</p>

        <div style={{ marginTop: 32 }}>
          <Link to="/" style={{ color: '#E8A020', textDecoration: 'none', fontSize: 14 }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
