// website/pages/PrivacyPolicy.jsx
//
// Rewritten 26-09-2026 after review against the DPDP Act 2023 and
// DPDP Rules 2025 (core duties enforceable from 13 May 2027). The
// previous version had non-working contact emails (wrong domain,
// mpowerapp.in), claimed data never leaves India (Twilio and Netlify
// operate outside India), claimed data is never shared (CTS complaints
// are shared with the constituency office and authorities), did not
// name the operator, and showed a "Last updated" date that changed to
// today's date on every visit.
import React from 'react';
import { Link } from 'react-router-dom';

const LAST_UPDATED = '26 September 2026';
const CONTACT_EMAIL = 'adminzoho@mpowerind.in';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 720, margin: '0 auto', padding: '100px 24px 80px' },
  h2: { fontSize: 20, fontWeight: 600, color: '#fff', margin: '32px 0 12px' },
  p: { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, margin: '0 0 14px' },
  ul: { fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, margin: '0 0 14px', paddingLeft: 20 },
  strong: { color: 'rgba(255,255,255,0.85)', fontWeight: 600 },
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
        <p style={{ ...S.p, color: 'rgba(255,255,255,0.4)' }}>Last updated: {LAST_UPDATED}</p>

        <h2 style={S.h2}>Who we are</h2>
        <p style={S.p}>MPower is operated by <span style={S.strong}>Suribabu Kommana, Sole Proprietor, trading as MPower Services</span>, Andhra Pradesh, India. MPower provides software for schools, hospitals, and citizen grievance offices. This policy explains what personal data we handle, why, who can see it, and your rights under India's Digital Personal Data Protection Act, 2023.</p>

        <h2 style={S.h2}>Who is responsible for your data</h2>
        <ul style={S.ul}>
          <li><span style={S.strong}>Schools and hospitals</span> decide what student and patient information they record in MPower. They are responsible for that data, and MPower processes it on their behalf, only as they instruct.</li>
          <li><span style={S.strong}>Citizen complaints (CTS)</span> — citizens give their details to MPower to file a complaint with their elected representative's office.</li>
          <li><span style={S.strong}>Our customers</span> — we are responsible for the contact and billing details of the organisations that use MPower.</li>
        </ul>

        <h2 style={S.h2}>What data we collect</h2>
        <ul style={S.ul}>
          <li><span style={S.strong}>Organisations:</span> organisation name, contact person, phone number, email address, and billing records.</li>
          <li><span style={S.strong}>Schools:</span> student details (name, date of birth, gender, class, address, parent names and phone numbers, and category details entered for welfare schemes), attendance, marks, fees, transport, hostel, and certificates.</li>
          <li><span style={S.strong}>Hospitals:</span> patient details, visits, prescriptions, lab results, admissions, billing, and ABHA (health ID) details where the patient has agreed to link them.</li>
          <li><span style={S.strong}>Citizens (CTS):</span> phone number, name, father's or husband's name, address, ward, constituency, mandal and village, complaint details, and any photos or videos attached.</li>
        </ul>

        <h2 style={S.h2}>How we use it</h2>
        <p style={S.p}>Only to provide the MPower service — running the school, hospital, or grievance office, and sending the operational messages that go with it. We do not sell personal data, and we do not use it for advertising or marketing.</p>

        <h2 style={S.h2}>Children's data</h2>
        <p style={S.p}>Most students are under 18. The school is responsible for obtaining a parent's or guardian's consent for the student information it records in MPower. Children's data is used only for school administration. MPower never tracks, profiles, or shows advertising to children.</p>

        <h2 style={S.h2}>Health data</h2>
        <p style={S.p}>Patient records can be seen only by staff of the hospital that created them. ABHA health IDs are linked only with the patient's consent, and each consent is recorded.</p>

        <h2 style={S.h2}>Who can see or receive your data</h2>
        <ul style={S.ul}>
          <li><span style={S.strong}>The organisation you deal with</span> — your school, hospital, or constituency office, and only its authorised staff.</li>
          <li><span style={S.strong}>For citizen complaints</span> — the constituency office handling the complaint, the authorities it is escalated to, and summary reports prepared for the District Collector's office.</li>
          <li><span style={S.strong}>Service providers</span> who help us run MPower, each only for its own task:
            <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
              <li>Supabase — database and storage (AWS, Mumbai, India)</li>
              <li>Netlify — delivers the website itself; your records are not stored there</li>
              <li>Twilio — WhatsApp messages and login codes (outside India)</li>
              <li>Razorpay — online payments (India)</li>
              <li>Zoho — email (India)</li>
              <li>MSG91 — SMS messages (India)</li>
            </ul>
          </li>
          <li><span style={S.strong}>When required by law</span> — for example, a valid order from a court or government authority.</li>
        </ul>

        <h2 style={S.h2}>Where data is stored</h2>
        <p style={S.p}>All records are stored in our main database in Mumbai, India. When a WhatsApp message or login code is sent, the phone number and message pass through Twilio and WhatsApp, which operate outside India.</p>

        <h2 style={S.h2}>WhatsApp messages</h2>
        <p style={S.p}>Phone numbers are used only for operational messages — login codes, attendance alerts, fee receipts, lab results, and complaint updates. To stop receiving them, ask the school or hospital that sends them.</p>

        <h2 style={S.h2}>How long we keep data</h2>
        <p style={S.p}>We keep data while the organisation's account is active. If an organisation cancels, we keep its data for 90 days in case it wishes to return, and then delete it — except records the law requires us or the organisation to keep, such as tax and billing records or medical records, which are kept only for as long as required.</p>

        <h2 style={S.h2}>Your rights</h2>
        <p style={S.p}>You can ask to see your data, correct it, have it deleted, or withdraw a consent you gave. You may also name someone to exercise these rights for you if you are unable to. For school or hospital records, it is usually fastest to ask that organisation first — or write to us and we will help. We aim to reply within 30 days. If you are not satisfied with our reply, you may complain to the Data Protection Board of India.</p>

        <h2 style={S.h2}>Security</h2>
        <p style={S.p}>Data is encrypted in transit and at rest. Each organisation's data is kept separate by rules enforced in the database itself, sessions time out when idle, and important actions are logged. We review these protections regularly. No system can be guaranteed completely secure, but we work to keep your data safe.</p>

        <h2 style={S.h2}>If there is a data breach</h2>
        <p style={S.p}>If a breach affects your personal data, we will inform the affected people without delay and report it to the Data Protection Board of India as the law requires.</p>

        <h2 style={S.h2}>Cookies and browser storage</h2>
        <p style={S.p}>We do not use advertising or tracking cookies. Your browser stores only what is needed to keep you signed in.</p>

        <h2 style={S.h2}>Language</h2>
        <p style={S.p}>This policy is available in Telugu on request.</p>

        <h2 style={S.h2}>Changes to this policy</h2>
        <p style={S.p}>If we change this policy, we will update the date above. Organisations using MPower will be told about important changes.</p>

        <h2 style={S.h2}>Contact and grievances</h2>
        <p style={S.p}>For any privacy question, request, or complaint: Suribabu Kommana, MPower Services · {CONTACT_EMAIL} · Andhra Pradesh, India</p>

        <div style={{ marginTop: 32 }}>
          <Link to="/" style={{ color: '#E8A020', textDecoration: 'none', fontSize: 14 }}>← Back to home</Link>
        </div>
      </div>
    </div>
  );
}
