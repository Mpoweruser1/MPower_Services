// shared/BusinessDetails.jsx — NEW
// Shared between School and Hospital — both print documents (invoices,
// certificates, report cards) via the same PrintHeader.jsx, so both
// need a way to actually enter the business details PrintHeader now
// displays (phone, GSTIN, PAN, registration no.) alongside the
// existing address fields, which previously had nowhere to be edited
// either — address/district existed on branches from day one but no
// screen ever let anyone set or change them after initial setup.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import BugReporter from './BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 640, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16 },
  sectionLabel: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  hint: { fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 },
};

const EMPTY = {
  address: '', city: '', district: '', pincode: '',
  phone: '', gstin: '', pan: '', registration_no: '',
};

export default function BusinessDetails({ NavComponent }) {
  const { tenant } = useTenant();
  const isPrincipalOrDoctor = tenant?.role === 'principal' || tenant?.role === 'doctor';

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (tenant?.branchId) load();
    else setLoading(false);
  }, [tenant?.branchId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('branches')
      .select('address, city, district, pincode, phone, gstin, pan, registration_no')
      .eq('id', tenant.branchId)
      .maybeSingle();
    if (data) {
      setForm({
        address: data.address || '', city: data.city || '',
        district: data.district || '', pincode: data.pincode || '',
        phone: data.phone || '', gstin: data.gstin || '',
        pan: data.pan || '', registration_no: data.registration_no || '',
      });
    }
    setLoading(false);
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    setError('');
    setMessage('');

    if (!tenant?.branchId) {
      setError('No branch found for this account yet — complete first-time setup before adding business details.');
      return;
    }

    setSaving(true);
    const { error: updateErr } = await supabase
      .from('branches')
      .update({
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        district: form.district.trim() || null,
        pincode: form.pincode.trim() || null,
        phone: form.phone.trim() || null,
        gstin: form.gstin.trim().toUpperCase() || null,
        pan: form.pan.trim().toUpperCase() || null,
        registration_no: form.registration_no.trim() || null,
      })
      .eq('id', tenant.branchId);

    setSaving(false);

    if (updateErr) {
      setError(updateErr.message || 'Failed to save business details. Please try again.');
      return;
    }

    setMessage('✅ Business details saved — these now appear on invoices, certificates, and other printed documents.');
  }

  if (!isPrincipalOrDoctor) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <div style={{ ...S.card, textAlign: 'center', marginTop: 40 }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🔒</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
              Only the Principal or Doctor account can edit business details.
            </p>
          </div>
        </div>
        {NavComponent && <NavComponent />}
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Setup</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Business Details</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
            Shown on invoices, certificates, and every printed document — for {tenant?.orgName}
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {error}
          </div>
        )}
        {message && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>
            {message}
          </div>
        )}

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        ) : (
          <>
            <div style={S.card}>
              <p style={S.sectionLabel}>Address</p>

              <label style={S.label}>Address</label>
              <input value={form.address} onChange={(e) => update('address', e.target.value)}
                placeholder="Street / area" style={{ ...S.input, marginBottom: 12 }} />

              <div style={S.row2}>
                <div>
                  <label style={S.label}>City</label>
                  <input value={form.city} onChange={(e) => update('city', e.target.value)} style={S.input} />
                </div>
                <div>
                  <label style={S.label}>District</label>
                  <input value={form.district} onChange={(e) => update('district', e.target.value)} style={S.input} />
                </div>
              </div>

              <label style={S.label}>Pincode</label>
              <input value={form.pincode} onChange={(e) => update('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" placeholder="6-digit pincode" style={{ ...S.input, maxWidth: 160 }} />
            </div>

            <div style={S.card}>
              <p style={S.sectionLabel}>Business details</p>

              <label style={S.label}>Business phone</label>
              <input value={form.phone} onChange={(e) => update('phone', e.target.value)}
                placeholder="Reception / billing contact number" style={{ ...S.input, marginBottom: 4 }} />
              <p style={{ ...S.hint, marginBottom: 12 }}>Shown on invoices — separate from your own personal phone number</p>

              <div style={S.row2}>
                <div>
                  <label style={S.label}>GSTIN</label>
                  <input value={form.gstin} onChange={(e) => update('gstin', e.target.value.toUpperCase())}
                    placeholder="15-character GSTIN" maxLength={15} style={S.input} />
                </div>
                <div>
                  <label style={S.label}>PAN</label>
                  <input value={form.pan} onChange={(e) => update('pan', e.target.value.toUpperCase())}
                    placeholder="10-character PAN" maxLength={10} style={S.input} />
                </div>
              </div>
              <p style={S.hint}>Leave blank if not GST-registered</p>

              <label style={{ ...S.label, marginTop: 12 }}>Registration number</label>
              <input value={form.registration_no} onChange={(e) => update('registration_no', e.target.value)}
                placeholder="Hospital / school registration or license no." style={S.input} />
            </div>

            <button onClick={save} disabled={saving}
              style={{ width: '100%', padding: 13, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving...' : '✓ Save business details'}
            </button>
          </>
        )}

      </div>
      {NavComponent && <NavComponent />}
      <BugReporter screenName="business_details" />
    </div>
  );
}
