// website/pages/Products.jsx — FINAL
import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 1080, margin: '0 auto', padding: '100px 24px 80px' },
};

const PRODUCTS = {
  school: {
    icon: '🏫', name: 'MPower School', color: '#6AAA90',
    tagline: 'Complete school management — attendance to TC',
    taglineTe: 'పాఠశాల నిర్వహణ — హాజరు నుండి TC వరకు',
    features: [
      { icon: '✅', title: 'Smart Attendance', desc: 'Class-wise daily attendance with WhatsApp absent alerts to parents. Works offline.' },
      { icon: '💰', title: 'Fee Collection — 3 ways', desc: 'Counter cash, online Razorpay on this device, or WhatsApp payment link to parent.' },
      { icon: '👤', title: 'Student Admission — 5 steps', desc: 'Full wizard with APAAR ID, caste, welfare scheme detection, village/mandal/district.' },
      { icon: '📄', title: 'Transfer Certificate', desc: '16-field TC with fee dues check, conduct grade, print-ready A4 format.' },
      { icon: '🎓', title: 'Certificates — 7 types', desc: 'Bonafide, study, conduct, income support, caste support, medium, attendance.' },
      { icon: '🚌', title: 'Transport', desc: 'Routes, drivers, vehicle numbers, timings, student-route assignment.' },
      { icon: '🏠', title: 'Hostel', desc: 'Room management, bed allocation, occupancy tracking, gender-wise blocks.' },
      { icon: '⚽', title: 'Activities & Coaching', desc: 'Sports, cultural, NSS/NCC, coaching classes — participant tracking.' },
      { icon: '📊', title: 'Reports', desc: 'Attendance, fee defaulters, caste-wise, village-wise, welfare eligible students, UDISE+ export.' },
      { icon: '🔍', title: 'Power Search', desc: 'Search "SC girls", "absent today", "fee due ravi", "hostel 6A" — fuzzy matching, typo tolerant.' },
    ],
  },
  hospital: {
    icon: '🏥', name: 'MPower Hospital', color: '#5A9ADF',
    tagline: 'OPD, IPD, lab, billing and ABHA — all connected',
    taglineTe: 'OPD, IPD, లాబ్, బిల్లింగ్ మరియు ABHA — అన్నీ కలిపి',
    features: [
      { icon: '👤', title: 'Patient Registration', desc: 'Register with ABHA consent, blood group, allergies. Auto-generates patient UID.' },
      { icon: '🩺', title: 'OPD Visit', desc: 'Chief complaint, diagnosis, prescription with medicines table, follow-up date.' },
      { icon: '🔬', title: 'Lab Reports', desc: 'Order tests, enter results, WhatsApp result-ready notification to patient.' },
      { icon: '💳', title: 'Hospital Billing + GST', desc: 'Line items with GST rates, discount, totals. WhatsApp receipt + payment link.' },
      { icon: '🛏️', title: 'IPD / Bed Management', desc: 'Visual ward map, admit, discharge summary, bed availability.' },
      { icon: '💊', title: 'Aarogyasri & PMJAY', desc: 'Welfare schemes panel on patient registration — all AP health schemes identified.' },
      { icon: '🔗', title: 'ABHA Linking', desc: 'Consent-based ABHA health account linking for ABDM compliance.' },
      { icon: '📱', title: 'WhatsApp at every step', desc: 'Registration, prescription, lab results, discharge, bill — all via WhatsApp.' },
    ],
  },
  grievance: {
    icon: '🏛️', name: 'MPower CTS', color: '#E8A020',
    tagline: 'Citizen complaint tracking for MLA offices',
    taglineTe: 'MLA కార్యాలయాల కోసం పౌర ఫిర్యాదు వ్యవస్థ',
    features: [
      { icon: '📋', title: 'Citizen Portal', desc: 'No login needed. Cascading district → mandal → village dropdown. Rate limiting 3/day.' },
      { icon: '🔍', title: 'Complaint Tracker', desc: 'Citizens track their complaint by case number. Full timeline history.' },
      { icon: '👨‍💼', title: 'Staff Dashboard', desc: 'Stage updates with WhatsApp notification, filters, bulk print for minister.' },
      { icon: '📊', title: 'Welfare Reporting', desc: 'Pension subcategories (old age/widow/disability/weaver), ration, health, education — separate reports.' },
      { icon: '📍', title: 'Location Analytics', desc: 'Mandal-wise and village-wise complaint breakdown — identify problem hotspots.' },
      { icon: '🖨️', title: 'Print for Minister', desc: 'Batch print with executive summary, category-wise rows, citizen representation letters.' },
      { icon: '🔐', title: 'Verification Queue', desc: 'Staff screen to verify new complaints before moving to review — filter spam.' },
    ],
  },
};

// All 28 states + 8 UTs — a citizen picking their state goes straight to
// that state's citizen portal. States not yet provisioned in the DB get
// CitizenPortal.jsx's existing "not set up yet" message rather than an
// error, so the list isn't restricted to only the live states.
const STATES = [
  { name: 'Andhra Pradesh', slug: 'andhra-pradesh' },
  { name: 'Arunachal Pradesh', slug: 'arunachal-pradesh' },
  { name: 'Assam', slug: 'assam' },
  { name: 'Bihar', slug: 'bihar' },
  { name: 'Chhattisgarh', slug: 'chhattisgarh' },
  { name: 'Goa', slug: 'goa' },
  { name: 'Gujarat', slug: 'gujarat' },
  { name: 'Haryana', slug: 'haryana' },
  { name: 'Himachal Pradesh', slug: 'himachal-pradesh' },
  { name: 'Jharkhand', slug: 'jharkhand' },
  { name: 'Karnataka', slug: 'karnataka' },
  { name: 'Kerala', slug: 'kerala' },
  { name: 'Madhya Pradesh', slug: 'madhya-pradesh' },
  { name: 'Maharashtra', slug: 'maharashtra' },
  { name: 'Manipur', slug: 'manipur' },
  { name: 'Meghalaya', slug: 'meghalaya' },
  { name: 'Mizoram', slug: 'mizoram' },
  { name: 'Nagaland', slug: 'nagaland' },
  { name: 'Odisha', slug: 'odisha' },
  { name: 'Punjab', slug: 'punjab' },
  { name: 'Rajasthan', slug: 'rajasthan' },
  { name: 'Sikkim', slug: 'sikkim' },
  { name: 'Tamil Nadu', slug: 'tamil-nadu' },
  { name: 'Telangana', slug: 'telangana' },
  { name: 'Tripura', slug: 'tripura' },
  { name: 'Uttar Pradesh', slug: 'uttar-pradesh' },
  { name: 'Uttarakhand', slug: 'uttarakhand' },
  { name: 'West Bengal', slug: 'west-bengal' },
  { name: 'Andaman and Nicobar Islands', slug: 'andaman-and-nicobar-islands' },
  { name: 'Chandigarh', slug: 'chandigarh' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', slug: 'dadra-and-nagar-haveli-and-daman-and-diu' },
  { name: 'Delhi (NCT)', slug: 'delhi' },
  { name: 'Jammu and Kashmir', slug: 'jammu-and-kashmir' },
  { name: 'Ladakh', slug: 'ladakh' },
  { name: 'Lakshadweep', slug: 'lakshadweep' },
  { name: 'Puducherry', slug: 'puducherry' },
];

// Inline state picker — no separate page. destinationFor maps the
// chosen state's slug to where selecting it should navigate.
function StateSelectDropdown({ color, placeholder, destinationFor, variant = 'solid' }) {
  const navigate = useNavigate();
  const solidStyle = { background: color, color: '#111113', border: 'none', fontWeight: 700 };
  const outlineStyle = { background: 'transparent', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)', fontWeight: 600 };
  return (
    <select
      defaultValue=""
      onChange={(e) => { if (e.target.value) navigate(destinationFor(e.target.value)); }}
      style={{ width: '100%', padding: '13px 16px', borderRadius: 10, fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', ...(variant === 'solid' ? solidStyle : outlineStyle) }}
    >
      <option value="" disabled>{placeholder}</option>
      {STATES.map((s) => (
        <option key={s.slug} value={s.slug}>{s.name}</option>
      ))}
    </select>
  );
}

export default function Products() {
  const { appType } = useParams();
  const [activeTab, setActiveTab] = useState(appType || 'school');
  const product = PRODUCTS[activeTab] || PRODUCTS.school;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+Telugu:wght@400;600&display=swap');`}</style>

      {/* Header */}
      <div style={{ background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '14px 24px', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 14 }}>M</div>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>MPower</span>
          </Link>
          <Link to={`/registration?type=${activeTab}`} style={{ padding: '8px 20px', background: '#E8A020', color: '#111113', borderRadius: 20, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Start free →</Link>
        </div>
      </div>

      <div style={S.inner}>

        {/* Product tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 52, justifyContent: 'center' }}>
          {Object.entries(PRODUCTS).map(([key, p]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              style={{ padding: '10px 24px', fontSize: 14, borderRadius: 24, cursor: 'pointer', border: activeTab === key ? 'none' : '1px solid rgba(255,255,255,0.1)', background: activeTab === key ? p.color : 'transparent', color: activeTab === key ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: activeTab === key ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{p.icon}</span> {p.name}
            </button>
          ))}
        </div>

        {/* Product hero */}
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <span style={{ fontSize: 56, display: 'block', marginBottom: 16 }}>{product.icon}</span>
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 700, color: '#fff', margin: '0 0 12px', letterSpacing: -1 }}>{product.name}</h1>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', margin: '0 0 6px' }}>{product.tagline}</p>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', margin: '0 0 32px', fontFamily: "'Noto Sans Telugu', sans-serif" }}>{product.taglineTe}</p>
          {activeTab === 'grievance' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380, margin: '0 auto' }}>
              <StateSelectDropdown
                color={product.color}
                placeholder="File / track a complaint — select your state"
                destinationFor={(slug) => `/grievance/${slug}/citizen`}
              />
              <StateSelectDropdown
                variant="outline"
                placeholder="Register your office (free trial) — select your state"
                destinationFor={(slug) => `/grievance/${slug}/request-access`}
              />
            </div>
          ) : (
            <Link to={`/registration?type=${activeTab}`}
              style={{ display: 'inline-block', padding: '13px 32px', background: product.color, color: '#111113', borderRadius: 10, textDecoration: 'none', fontSize: 15, fontWeight: 700 }}>
              Start 6-month free trial →
            </Link>
          )}
        </div>

        {/* Features grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {product.features.map((f) => (
            <div key={f.title} style={{ padding: '22px', background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
              <span style={{ fontSize: 26, display: 'block', marginBottom: 10 }}>{f.icon}</span>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 60, padding: '40px 24px', background: '#161618', borderRadius: 20, border: '1px solid rgba(255,255,255,0.07)' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: '0 0 12px', letterSpacing: -0.5 }}>
            Try {product.name} free for 6 months
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', margin: '0 0 28px' }}>No credit card · Setup in 10 minutes · Cancel anytime</p>
          {activeTab === 'grievance' && (
            <div style={{ maxWidth: 380, margin: '0 auto 12px' }}>
              <StateSelectDropdown
                color="#E8A020"
                placeholder="File / track a complaint — select your state"
                destinationFor={(slug) => `/grievance/${slug}/citizen`}
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {activeTab === 'grievance' ? (
              <div style={{ maxWidth: 220, flex: '1 1 220px' }}>
                <StateSelectDropdown
                  variant="outline"
                  placeholder="Register your office"
                  destinationFor={(slug) => `/grievance/${slug}/request-access`}
                />
              </div>
            ) : (
              <Link to={`/registration?type=${activeTab}`} style={{ padding: '13px 28px', background: '#E8A020', color: '#111113', borderRadius: 10, textDecoration: 'none', fontSize: 15, fontWeight: 700 }}>Start free trial →</Link>
            )}
            <Link to="/pricing" style={{ padding: '13px 28px', background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, textDecoration: 'none', fontSize: 15 }}>See pricing</Link>
          </div>
        </div>
      </div>
    </div>
  );
}