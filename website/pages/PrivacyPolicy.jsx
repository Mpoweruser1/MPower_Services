// website/pages/PrivacyPolicy.jsx — FINAL
import React from 'react';
import { Link } from 'react-router-dom';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 720, margin: '0 auto', padding: '100px 24px 80px' },
  h2: { fontSize: 20, fontWeight: 600, color: '#fff', margin: '32px 0 12px' },
  p: { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, margin: '0 0 14px' },
};

export default function PrivacyPolicy() {
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
        <h1 style={{ fontSize: 36, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: -1 }}>Privacy Policy</h1>
        <p style={{ ...S.p, color: 'rgba(255,255,255,0.4)' }}>Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <h2 style={S.h2}>What data we collect</h2>
        <p style={S.p}>We collect organisation name, contact person name, phone number, email address, and the data you enter into the platform — student records, patient records, fee payments, attendance, and complaint information. All data is encrypted at rest and in transit.</p>

        <h2 style={S.h2}>How we use your data</h2>
        <p style={S.p}>Your data is used solely to provide the MPower service to your organisation. We do not sell, share, or use your data for advertising. Student and patient data is never shared with third parties except as required by law.</p>

        <h2 style={S.h2}>WhatsApp notifications</h2>
        <p style={S.p}>Phone numbers collected for WhatsApp notifications are used only to send operational messages — attendance alerts, fee receipts, lab results, complaint updates. Recipients can opt out by contacting the organisation.</p>

        <h2 style={S.h2}>Data storage</h2>
        <p style={S.p}>All data is stored on Supabase (PostgreSQL) hosted on AWS in the ap-south-1 (Mumbai) region. Data does not leave India.</p>

        <h2 style={S.h2}>Data retention</h2>
        <p style={S.p}>Your data is retained for as long as your account is active. If you cancel, data is retained for 90 days in case you wish to reactivate. After 90 days, data is permanently deleted upon request.</p>

        <h2 style={S.h2}>Your rights</h2>
        <p style={S.p}>You have the right to access, correct, export, or delete your data. Contact us at support@mpowerapp.in to exercise these rights.</p>

        <h2 style={S.h2}>Security</h2>
        <p style={S.p}>We implement row-level security (RLS), idle session timeout, audit logging, and encrypted connections. Each organisation's data is completely isolated — no cross-tenant access is possible.</p>

        <h2 style={S.h2}>Contact</h2>
        <p style={S.p}>For privacy concerns: privacy@mpowerapp.in · MPower, Andhra Pradesh, India</p>

        <div style={{ marginTop: 32 }}>
          <Link to="/" style={{ color: '#E8A020', textDecoration: 'none', fontSize: 14 }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}