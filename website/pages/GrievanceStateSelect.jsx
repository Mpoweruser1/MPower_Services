// website/pages/GrievanceStateSelect.jsx — CORRECTED
// A citizen picking "File / track a complaint" lands here first, since
// CTS is built for every state, not just the ones currently provisioned.
// Selecting any state navigates straight to that state's citizen portal.
// If a state isn't set up yet, CitizenPortal.jsx already shows a clear
// "not set up on this platform yet" message rather than erroring — so
// this list doesn't need to be filtered down to only the live states.
//
// Styling matches CtsLanding.jsx exactly: light page background
// (#f0f4f8), dark navy header bar (#1a1a2e) with the gold (#e8a020)
// logo mark, white cards for selectable items. The logo is wrapped in
// a link back to the site home — this page didn't have any way back
// at all in its first version, which was a real gap.
import React from 'react';
import { Link } from 'react-router-dom';

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

export default function GrievanceStateSelect() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: '#f0f4f8', minHeight: '100vh' }}>

      {/* Header — matches CtsLanding exactly */}
      <div style={{ background: '#1a1a2e', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#e8a020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#1a1a2e', fontSize: 16 }}>M</div>
          <div>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>MPower CTS</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Complaint Tracking System</div>
          </div>
        </Link>
        <Link to="/products/grievance" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '6px 14px', borderRadius: 20, fontSize: 12, textDecoration: 'none' }}>
          ← Back
        </Link>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px 48px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: '0 0 6px' }}>Select your state</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>File or track a complaint with your MLA or MP — free, transparent, and tracked.</p>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {STATES.map((s) => (
            <Link
              key={s.slug}
              to={`/grievance/${s.slug}/citizen`}
              style={{
                display: 'block', padding: '16px 18px', background: '#fff',
                borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                border: '1px solid #f1f5f9', textDecoration: 'none',
                color: '#1a1a2e', fontSize: 15, fontWeight: 600,
              }}
            >
              {s.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
