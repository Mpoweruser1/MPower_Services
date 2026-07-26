// website/pages/Pricing.jsx — FINAL
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 1000, margin: '0 auto', padding: '100px 24px 80px' },
};

const TIERS = [
  {
    key: 'basic', name: 'Basic', monthlyPrice: 299, annualPrice: 249,
    color: '#6AAA90', popular: false,
    desc: 'Everything you need to get started',
    features: [
      'Attendance marking & WhatsApp alerts',
      'Fee collection — cash / UPI / payment link',
      'Student admission — 5-step wizard',
      'Transfer certificate & 7 certificate types',
      'OPD / IPD / Lab / Billing (hospital)',
      'Citizen complaint portal (grievance)',
      'Help videos in Telugu',
      'Email support — 48 hours SLA',
    ],
  },
  {
    key: 'standard', name: 'Standard', monthlyPrice: 599, annualPrice: 499,
    color: '#5A9ADF', popular: true,
    desc: 'For growing organisations',
    features: [
      'Everything in Basic',
      'ID cards with QR code printing',
      'Bulk Excel upload for students / patients',
      'APAAR ID and ABHA linking',
      'Multi-filter reports (caste + gender + village)',
      'Welfare scheme eligibility reports',
      'Village-wise and caste-wise analytics',
      'Phone support — 24 hours SLA',
    ],
  },
  {
    key: 'advanced', name: 'Advanced', monthlyPrice: 999, annualPrice: 832,
    color: '#9A8AE0', popular: false,
    desc: 'For established multi-branch operations',
    features: [
      'Everything in Standard',
      'Multi-branch dashboard and comparison',
      'Power search with fuzzy / typo tolerance',
      'UDISE+ export format for schools',
      'GST-compliant hospital billing',
      'Custom report builder',
      'Modification request portal',
      'Phone support — 4 hours SLA',
    ],
  },
  {
    key: 'specialised', name: 'Specialised', monthlyPrice: 1999, annualPrice: 1666,
    color: '#E8A020', popular: false,
    desc: 'For large institutions and government',
    features: [
      'Everything in Advanced',
      'Dedicated account manager',
      'Custom module development',
      'On-site training visit (AP/TS)',
      'SLA 99.9% uptime guarantee',
      'Custom branding / white label',
      '24×7 phone & WhatsApp support',
      'Government compliance reports',
    ],
  },
];

const FAQ = [
  { q: 'Can I use for school AND hospital?', a: 'Yes — one account can run multiple apps. A school principal and hospital doctor can both log in with their own credentials under the same organisation.' },
  { q: 'What happens after 6 months free?', a: 'You choose a paid tier and continue. No automatic billing — you pay only when you choose to. If you do nothing, the account moves to read-only mode.' },
  { q: 'Is there a contract or lock-in?', a: 'No contract. Month-to-month. Cancel or downgrade anytime.' },
  { q: 'Do you support Telugu?', a: 'Yes — every screen, every label, and every WhatsApp message is available in Telugu. This is designed for AP and Telangana first.' },
  { q: 'How does the modification request work?', a: 'You raise a request describing what you need. We review and send a quote within 2 working days. Work starts only after you accept and pay. No hidden charges.' },
  { q: 'Is there a limit on students or patients?', a: 'No — all tiers are unlimited records. Price is per organisation per month, not per student.' },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');`}</style>

      {/* Header */}
      <div style={{ background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '14px 24px', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 14 }}>M</div>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>MPower</span>
          </Link>
          <Link to="/registration" style={{ padding: '8px 20px', background: '#E8A020', color: '#111113', borderRadius: 20, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Start free →</Link>
        </div>
      </div>

      <div style={S.inner}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, color: '#fff', margin: '0 0 14px', letterSpacing: -1 }}>Simple pricing</h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.45)', margin: '0 0 28px' }}>
            Same plans for School, Hospital and Grievance. Unlimited records. No per-student pricing.
          </p>

          {/* Monthly / Annual toggle */}
          <div style={{ display: 'inline-flex', background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 4, gap: 4 }}>
            <button onClick={() => setAnnual(false)}
              style={{ padding: '8px 20px', borderRadius: 20, border: 'none', background: !annual ? '#E8A020' : 'transparent', color: !annual ? '#111113' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontWeight: !annual ? 600 : 400, fontFamily: 'inherit' }}>
              Monthly
            </button>
            <button onClick={() => setAnnual(true)}
              style={{ padding: '8px 20px', borderRadius: 20, border: 'none', background: annual ? '#E8A020' : 'transparent', color: annual ? '#111113' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontWeight: annual ? 600 : 400, fontFamily: 'inherit' }}>
              Annual <span style={{ fontSize: 11 }}>save ~17%</span>
            </button>
          </div>
        </div>

        {/* Pricing cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 60 }}>
          {TIERS.map((tier) => (
            <div key={tier.key} style={{ padding: '28px 22px', background: tier.popular ? 'rgba(90,154,223,0.06)' : '#161618', border: `1px solid ${tier.popular ? 'rgba(90,154,223,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 18, position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {tier.popular && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#5A9ADF', color: '#fff', padding: '4px 16px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Most popular
                </div>
              )}

              <div style={{ marginBottom: 'auto' }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: tier.color, margin: '0 0 4px' }}>{tier.name}</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>{tier.desc}</p>

                <div style={{ marginBottom: 20 }}>
                  {tier.key === 'basic' ? (
                    <>
                      <p style={{ fontSize: 32, fontWeight: 700, color: '#6AAA90', margin: 0 }}>Free</p>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>6 months then ₹{annual ? tier.annualPrice : tier.monthlyPrice}/mo</p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: 32, fontWeight: 700, color: '#fff', margin: 0 }}>
                        ₹{annual ? tier.annualPrice : tier.monthlyPrice}
                        <span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>/mo</span>
                      </p>
                      {annual && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: '4px 0 0' }}>billed annually</p>}
                    </>
                  )}
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
                  {tier.features.map((f) => (
                    <li key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                      <span style={{ color: tier.color, flexShrink: 0, marginTop: 1 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <Link to="/registration"
                style={{ display: 'block', textAlign: 'center', padding: '11px 0', background: tier.popular ? tier.color : 'rgba(255,255,255,0.06)', color: tier.popular ? '#111113' : '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600, border: tier.popular ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
                {tier.key === 'basic' ? 'Start free →' : 'Get started →'}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 32, textAlign: 'center', letterSpacing: -0.5 }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <div key={f.q} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '20px 0' }}>
              <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 500, color: '#fff' }}>{f.q}</p>
              <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>{f.a}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 64 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: '0 0 12px', letterSpacing: -0.5 }}>Start free today</h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', margin: '0 0 28px' }}>6 months Basic tier free · No credit card · No lock-in</p>
          <Link to="/registration" style={{ display: 'inline-block', padding: '14px 36px', background: '#E8A020', color: '#111113', borderRadius: 10, textDecoration: 'none', fontSize: 16, fontWeight: 700 }}>
            Start free trial →
          </Link>
        </div>
      </div>
    </div>
  );
}