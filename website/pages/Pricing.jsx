// website/pages/Pricing.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// ── Product definitions ──────────────────────────────────────────────────────

const SCHOOL_PLANS = [
  {
    key: 'basic',
    name: 'Basic',
    price: 999,
    students: 'Up to 500',
    sms: '2,000 SMS/month',
    color: '#1D9E75',
    highlight: false,
    features: [
      'Attendance & marks entry',
      'Fee collection & receipts',
      'Transfer certificates',
      'Certificates & ID cards',
      'WhatsApp OTP login',
      'Basic reports',
    ],
  },
  {
    key: 'standard',
    name: 'Standard',
    price: 1999,
    students: 'Up to 1,500',
    sms: '5,000 SMS/month',
    color: '#185FA5',
    highlight: true,
    features: [
      'Everything in Basic',
      'Reports & search',
      'Hostel management',
      'Transport management',
      'Email support (48 hrs)',
      'Bulk Excel upload',
    ],
  },
  {
    key: 'advanced',
    name: 'Advanced',
    price: 3499,
    students: 'Up to 3,000',
    sms: '10,000 SMS/month',
    color: '#534AB7',
    highlight: false,
    features: [
      'Everything in Standard',
      'Activities & coaching',
      'Multi-filter reports',
      'Analytics dashboard',
      'Phone support (24 hrs)',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 5999,
    students: 'Unlimited',
    sms: '25,000 SMS/month',
    color: '#854F0B',
    highlight: false,
    features: [
      'Everything in Advanced',
      'Multi-branch management',
      'Custom reports',
      'AI insights',
      '24×7 dedicated support',
    ],
  },
];

const HOSPITAL_PLANS = [
  {
    key: 'basic',
    name: 'Basic',
    price: 1499,
    opd: 'Up to 300 OPD/month',
    sms: '2,000 SMS/month',
    color: '#1D9E75',
    highlight: false,
    features: [
      'Patient registration',
      'OPD & prescriptions',
      'Basic billing',
      'WhatsApp OTP login',
      'Basic reports',
    ],
  },
  {
    key: 'standard',
    name: 'Standard',
    price: 2999,
    opd: 'Up to 1,000 OPD/month',
    sms: '5,000 SMS/month',
    color: '#185FA5',
    highlight: true,
    features: [
      'Everything in Basic',
      'IPD management',
      'Lab reports',
      'Pharmacy',
      'Email support (48 hrs)',
    ],
  },
  {
    key: 'advanced',
    name: 'Advanced',
    price: 4999,
    opd: 'Up to 3,000 OPD/month',
    sms: '10,000 SMS/month',
    color: '#534AB7',
    highlight: false,
    features: [
      'Everything in Standard',
      'ABHA integration',
      'GST billing',
      'Analytics dashboard',
      'Phone support (24 hrs)',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 7999,
    opd: 'Unlimited',
    sms: '25,000 SMS/month',
    color: '#854F0B',
    highlight: false,
    features: [
      'Everything in Advanced',
      'Multi-branch management',
      'Custom reports',
      '24×7 dedicated support',
    ],
  },
];

const CTS_PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: 0,
    complaints: 'Up to 100/month',
    sms: 'OTP only',
    color: '#1D9E75',
    highlight: false,
    forever: true,
    features: [
      'Citizen complaint portal',
      'Staff dashboard',
      'OTP login security',
      'Case number tracking',
      'Print representation letter',
      'No WhatsApp notifications',
    ],
  },
  {
    key: 'starter',
    name: 'Starter',
    price: 1999,
    complaints: 'Up to 500/month',
    sms: '3,000 SMS/month',
    color: '#185FA5',
    highlight: false,
    features: [
      'Everything in Free',
      'WhatsApp on final status',
      'Evidence photo upload',
      'Basic reports & CSV export',
      'Email support',
    ],
  },
  {
    key: 'active',
    name: 'Active',
    price: 3999,
    complaints: 'Up to 2,000/month',
    sms: '12,000 SMS/month',
    color: '#534AB7',
    highlight: true,
    features: [
      'Everything in Starter',
      'All WhatsApp status updates',
      'Analytics dashboard',
      'Mandal & village reports',
      'Phone support (24 hrs)',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 6999,
    complaints: 'Up to 5,000/month',
    sms: '30,000 SMS/month',
    color: '#854F0B',
    highlight: false,
    features: [
      'Everything in Active',
      'Priority queue management',
      'Custom branding',
      'API access',
      '24×7 dedicated support',
    ],
  },
  {
    key: 'unlimited',
    name: 'Unlimited',
    price: 9999,
    complaints: 'Unlimited',
    sms: '75,000 SMS/month',
    color: '#1a1a2e',
    highlight: false,
    features: [
      'Everything in Pro',
      'SLA guarantee',
      'Dedicated account manager',
      'Custom reports',
      'Onboarding assistance',
    ],
  },
];

const CTS_STATE_PLANS = [
  { key: 'district', name: 'District Pack', price: 24999, constituencies: 'Up to 10', features: ['All Pro features', 'Centralized dashboard', 'District-level reports', 'Dedicated support'] },
  { key: 'state_partial', name: 'State Pack', price: 149999, constituencies: 'Up to 50', features: ['All Unlimited features', 'State-level analytics', 'Custom branding', 'SLA guarantee'] },
  { key: 'state_full', name: 'Full State', price: 299999, constituencies: 'Unlimited', features: ['Everything in State Pack', 'State government branding', 'Direct integration support', 'Dedicated team'] },
];

const COMBO_PLANS = [
  { key: 'school_hrms', name: 'School + HRMS', price: 1999, saving: '30%', modules: 'School Standard + HRMS Basic', color: '#1D9E75' },
  { key: 'hospital_hrms', name: 'Hospital + HRMS', price: 3999, saving: '25%', modules: 'Hospital Standard + HRMS Standard', color: '#185FA5' },
  { key: 'school_hospital_hrms', name: 'School + Hospital + HRMS', price: 5999, saving: '35%', modules: 'All Standard plans', color: '#534AB7' },
  { key: 'full_mpower', name: 'Full MPower', price: 8999, saving: '40%', modules: 'All modules Standard', color: '#854F0B' },
];

// ── Subcomponents ─────────────────────────────────────────────────────────────

function PlanCard({ plan, annual, subtitle }) {
  const displayPrice = annual ? Math.round(plan.price * 0.84) : plan.price;

  return (
    <div style={{
      border: plan.highlight ? `2px solid ${plan.color}` : '1px solid #e2e8f0',
      borderRadius: 12, overflow: 'hidden',
      boxShadow: plan.highlight ? `0 4px 20px ${plan.color}30` : '0 1px 4px rgba(0,0,0,0.06)',
      position: 'relative',
    }}>
      {plan.highlight && (
        <div style={{ background: plan.color, color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '4px 0', letterSpacing: 1 }}>
          MOST POPULAR
        </div>
      )}
      {plan.forever && (
        <div style={{ background: '#1D9E75', color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '4px 0', letterSpacing: 1 }}>
          FREE FOREVER
        </div>
      )}

      <div style={{ background: plan.color, padding: '16px 16px 12px', color: '#fff' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{plan.name}</div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
          {plan.price === 0 ? '₹0' : `₹${displayPrice.toLocaleString('en-IN')}`}
          {plan.price > 0 && <span style={{ fontSize: 12, fontWeight: 400 }}>/month</span>}
        </div>
        {annual && plan.price > 0 && (
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
            Save ₹{((plan.price - displayPrice) * 12).toLocaleString('en-IN')}/year
          </div>
        )}
      </div>

      <div style={{ padding: '14px 16px' }}>
        {subtitle && (
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
            {subtitle}
          </div>
        )}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 7 }}>
          {plan.features.map(f => (
            <li key={f} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <span style={{ color: plan.color, flexShrink: 0, marginTop: 1 }}>✓</span>
              {f}
            </li>
          ))}
        </ul>
        <Link
          to="/registration"
          style={{
            display: 'block', textAlign: 'center',
            padding: '10px 16px', borderRadius: 8,
            background: plan.highlight ? plan.color : '#fff',
            color: plan.highlight ? '#fff' : plan.color,
            border: `1.5px solid ${plan.color}`,
            fontSize: 13, fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {plan.price === 0 ? 'Start Free' : 'Get Started →'}
        </Link>
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginBottom: 6 }}>{title}</h2>
      <p style={{ fontSize: 13, color: '#64748b' }}>{subtitle}</p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Pricing() {
  const [annual, setAnnual] = useState(false);
  const [activeProduct, setActiveProduct] = useState('cts');

  const PRODUCTS = [
    { key: 'cts', label: '🏛️ CTS — Grievance' },
    { key: 'school', label: '🏫 School' },
    { key: 'hospital', label: '🏥 Hospital' },
    { key: 'combo', label: '📦 Combo Packs' },
  ];

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: '#f8fafc', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '40px 20px 32px', textAlign: 'center', color: '#fff' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Simple, Transparent Pricing</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
          Free to start. Pay only when you grow.
        </p>

        {/* Annual toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          <button
            onClick={() => setAnnual(false)}
            style={{
              padding: '7px 18px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: 'none',
              background: !annual ? '#e8a020' : 'rgba(255,255,255,0.1)',
              color: !annual ? '#1a1a2e' : 'rgba(255,255,255,0.7)',
              fontWeight: !annual ? 700 : 400,
            }}
          >Monthly</button>
          <button
            onClick={() => setAnnual(true)}
            style={{
              padding: '7px 18px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: 'none',
              background: annual ? '#e8a020' : 'rgba(255,255,255,0.1)',
              color: annual ? '#1a1a2e' : 'rgba(255,255,255,0.7)',
              fontWeight: annual ? 700 : 400,
            }}
          >Annual — Save 16%</button>
        </div>

        {/* Product selector */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          {PRODUCTS.map(p => (
            <button
              key={p.key}
              onClick={() => setActiveProduct(p.key)}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                border: `1.5px solid ${activeProduct === p.key ? '#e8a020' : 'rgba(255,255,255,0.2)'}`,
                background: activeProduct === p.key ? '#e8a020' : 'transparent',
                color: activeProduct === p.key ? '#1a1a2e' : 'rgba(255,255,255,0.7)',
                fontWeight: activeProduct === p.key ? 700 : 400,
                fontFamily: 'inherit',
              }}
            >{p.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px 60px' }}>

        {/* ── CTS Plans ── */}
        {activeProduct === 'cts' && (
          <>
            <SectionHeader
              title="Complaint Tracking System — Per Constituency"
              subtitle="Free forever for basic. Upgrade when MLA office needs WhatsApp notifications."
            />

            {/* Info box */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#1e40af', textAlign: 'center' }}>
              📱 Citizens can always file complaints for free · MLA offices pay for WhatsApp notifications and advanced features
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 40 }}>
              {CTS_PLANS.map(plan => (
                <PlanCard
                  key={plan.key}
                  plan={plan}
                  annual={annual}
                  subtitle={`${plan.complaints} · ${plan.sms}`}
                />
              ))}
            </div>

            {/* State packages */}
            <SectionHeader
              title="State Government Packages"
              subtitle="For state governments and district administrations covering multiple constituencies."
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
              {CTS_STATE_PLANS.map(plan => {
                const displayPrice = annual ? Math.round(plan.price * 0.84) : plan.price;
                return (
                  <div key={plan.key} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{plan.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>{plan.constituencies} constituencies</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginBottom: 14 }}>
                      ₹{displayPrice.toLocaleString('en-IN')}
                      <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>/month</span>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 6 }}>
                      {plan.features.map(f => (
                        <li key={f} style={{ fontSize: 12, color: '#374151', display: 'flex', gap: 7 }}>
                          <span style={{ color: '#1D9E75', flexShrink: 0 }}>✓</span>{f}
                        </li>
                      ))}
                    </ul>
                    <a
                      href="mailto:support@mpowerind.in"
                      style={{ display: 'block', textAlign: 'center', padding: '10px 16px', borderRadius: 8, background: '#1a1a2e', color: '#e8a020', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
                    >
                      Contact Sales →
                    </a>

                  </div>
                );
              })}
            </div>

            {/* Extra SMS note */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
              Extra SMS beyond plan — ₹0.12 each · Extra WhatsApp — ₹0.30 each · All prices exclusive of GST
            </div>
          </>
        )}

        {/* ── School Plans ── */}
        {activeProduct === 'school' && (
          <>
            <SectionHeader
              title="School Management"
              subtitle="6 months free on Basic. Upgrade anytime."
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              {SCHOOL_PLANS.map(plan => (
                <PlanCard
                  key={plan.key}
                  plan={plan}
                  annual={annual}
                  subtitle={`${plan.students} students · ${plan.sms}`}
                />
              ))}
            </div>
            <div style={{ marginTop: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
              Extra SMS beyond plan — ₹0.15 each · All prices exclusive of GST · 6 months free trial on Basic
            </div>
          </>
        )}

        {/* ── Hospital Plans ── */}
        {activeProduct === 'hospital' && (
          <>
            <SectionHeader
              title="Hospital Management"
              subtitle="6 months free on Basic. Upgrade anytime."
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              {HOSPITAL_PLANS.map(plan => (
                <PlanCard
                  key={plan.key}
                  plan={plan}
                  annual={annual}
                  subtitle={`${plan.opd} · ${plan.sms}`}
                />
              ))}
            </div>
            <div style={{ marginTop: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
              Extra SMS beyond plan — ₹0.15 each · All prices exclusive of GST · 6 months free trial on Basic
            </div>
          </>
        )}

        {/* ── Combo Plans ── */}
        {activeProduct === 'combo' && (
          <>
            <SectionHeader
              title="Combo Packages"
              subtitle="Save more by combining modules."
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {COMBO_PLANS.map(plan => {
                const displayPrice = annual ? Math.round(plan.price * 0.84) : plan.price;
                return (
                  <div key={plan.key} style={{ background: '#fff', border: `2px solid ${plan.color}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ background: plan.color, padding: '14px 16px', color: '#fff' }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{plan.name}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
                        ₹{displayPrice.toLocaleString('en-IN')}
                        <span style={{ fontSize: 12, fontWeight: 400 }}>/month</span>
                      </div>
                    </div>
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>{plan.modules}</div>
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#166534', marginBottom: 14, textAlign: 'center', fontWeight: 700 }}>
                        Save {plan.saving} vs individual plans
                      </div>
                      <Link
                        to="/registration"
                        style={{ display: 'block', textAlign: 'center', padding: '10px 16px', borderRadius: 8, background: plan.color, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
                      >
                        Get Started →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── FAQ ── */}
        <div style={{ marginTop: 48, borderTop: '1px solid #e2e8f0', paddingTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginBottom: 20, textAlign: 'center' }}>Common Questions</h2>
          <div style={{ display: 'grid', gap: 14, maxWidth: 700, margin: '0 auto' }}>
            {[
              { q: 'Is CTS really free for citizens?', a: 'Yes. Citizens can always file complaints and track status for free. No charges ever for citizens.' },
              { q: 'What happens if SMS limit is exceeded?', a: 'Extra SMS are billed at ₹0.12 each for CTS and ₹0.15 for School/Hospital. You will never be blocked — just pay for extras.' },
              { q: 'Can I upgrade or downgrade anytime?', a: 'Yes. Change plans anytime. Upgrades take effect immediately. Downgrades apply from next billing cycle.' },
              { q: 'Is there a setup fee?', a: 'No setup fee. No hidden charges. Pay only the monthly subscription.' },
              { q: 'What is the annual discount?', a: '16% discount when you pay annually. Equivalent to getting about 2 months free.' },
              { q: 'How does state government pricing work?', a: 'State packages cover multiple constituencies under one contract. Contact us for custom pricing and SLA agreements.' },
            ].map(faq => (
              <div key={faq.q} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>Q: {faq.q}</div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>A: {faq.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA ── */}
        <div style={{ marginTop: 40, background: '#1a1a2e', borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Ready to get started?</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
            Free trial on all plans. No credit card required.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/registration"
              style={{ padding: '12px 28px', borderRadius: 10, background: '#e8a020', color: '#1a1a2e', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
            >
              Start Free Trial →
            </Link>
            <a
              href="mailto:support@mpowerind.in"
              style={{ padding: '12px 28px', borderRadius: 10, background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            >
              Contact Sales
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}