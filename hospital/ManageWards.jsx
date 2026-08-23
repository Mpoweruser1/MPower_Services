// hospital/ManageWards.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { sanitize } from '../shared/useFormValidation';
import HospitalNav from '../shared/HospitalNav';
import BugReporter from '../shared/BugReporter';

// Common ward types for quick-add — mirrors ManageClasses.jsx's
// PRE_PRIMARY quick-add pattern. Custom types still available below
// for anything not covered here.
const COMMON_WARDS = ['General', 'ICU', 'Maternity', 'Pediatric', 'Emergency', 'Private', 'Semi-Private', 'Isolation'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function ManageWards() {
  const { tenant } = useTenant();
  const [wards, setWards]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg]   = useState('');

  // Quick add — shared bed count for whichever common type is tapped
  const [quickBeds, setQuickBeds] = useState('10');

  // Custom add
  const [newWard, setNewWard]       = useState({ ward_type: '', total_beds: '' });
  const [wardErrors, setWardErrors] = useState({});

  useEffect(() => {
    if (tenant?.appId) loadWards();
  }, [tenant?.appId]);

  async function loadWards() {
    setLoading(true);
    const { data } = await supabase
      .from('wards')
      .select('id, ward_type, total_beds')
      .eq('app_id', tenant.appId)
      .order('ward_type');
    setWards(data || []);
    setLoading(false);
  }

  function showSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  function showError(msg) {
    setSubmitError(msg);
    setTimeout(() => setSubmitError(''), 5000);
  }

  // Quick add a common ward type
  async function quickAdd(wardType) {
    setSaving(true);
    setSubmitError('');

    const exists = wards.find((w) => w.ward_type === wardType);
    if (exists) { showError(`${wardType} ward already exists.`); setSaving(false); return; }

    const beds = parseInt(quickBeds);
    if (isNaN(beds) || beds < 1) { showError('Enter a valid bed count first.'); setSaving(false); return; }

    const { error } = await supabase.from('wards').insert({
      app_id:     tenant.appId,
      ward_type:  wardType,
      total_beds: beds,
    });

    if (error) { showError(`Failed to add ${wardType} ward.`); }
    else { showSuccess(`✅ ${wardType} ward added — ${beds} beds`); }

    setSaving(false);
    loadWards();
  }

  // Add custom ward
  function validateCustom() {
    const errors = {};
    if (!newWard.ward_type.trim()) errors.ward_type = 'Ward type required';
    const beds = parseInt(newWard.total_beds);
    if (isNaN(beds) || beds < 1) errors.total_beds = 'Enter at least 1 bed';
    if (beds > 500) errors.total_beds = 'Bed count seems too high — please check';
    setWardErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function addCustomWard() {
    if (!validateCustom()) return;
    setSaving(true);
    setSubmitError('');

    const exists = wards.find((w) =>
      w.ward_type.toLowerCase() === newWard.ward_type.trim().toLowerCase()
    );
    if (exists) { showError(`"${newWard.ward_type}" already exists.`); setSaving(false); return; }

    const { error } = await supabase.from('wards').insert({
      app_id:     tenant.appId,
      ward_type:  newWard.ward_type.trim(),
      total_beds: parseInt(newWard.total_beds),
    });

    if (error) {
      if (error.code === '23505') showError('This ward type already exists.');
      else showError('Failed to add ward.');
      setSaving(false);
      return;
    }

    setNewWard({ ward_type: '', total_beds: '' });
    setWardErrors({});
    setSaving(false);
    loadWards();
  }

  // Edit bed count directly on an existing ward
  async function updateBedCount(id, currentBeds) {
    const input = window.prompt('New total beds for this ward:', currentBeds);
    if (input === null) return;
    const beds = parseInt(input);
    if (isNaN(beds) || beds < 1) { showError('Enter a valid bed count.'); return; }

    const { error } = await supabase.from('wards').update({ total_beds: beds }).eq('id', id);
    if (error) { showError('Failed to update bed count.'); return; }
    showSuccess('✅ Bed count updated');
    loadWards();
  }

  // Delete ward — guarded against active admissions, same pattern as
  // ManageClasses.jsx checking active students before allowing delete.
  async function deleteWard(id, wardType) {
    const { count } = await supabase
      .from('ipd_admissions')
      .select('id', { count: 'exact', head: true })
      .eq('ward_id', id)
      .is('discharge_date', null);

    if (count && count > 0) {
      showError(`Cannot delete "${wardType}" — ${count} patient${count > 1 ? 's are' : ' is'} currently admitted there.`);
      return;
    }

    if (!window.confirm(`Delete "${wardType}" ward? This cannot be undone.`)) return;

    await supabase.from('wards').delete().eq('id', id);
    loadWards();
  }

  const totalBeds = wards.reduce((s, w) => s + (w.total_beds || 0), 0);

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Setup · వార్డుల నిర్వహణ
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Manage Wards</h1>
          {!loading && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
              {wards.length} ward{wards.length !== 1 ? 's' : ''} · {totalBeds} total beds for {tenant?.orgName}
            </p>
          )}
        </div>

        {/* Error / success banners */}
        {submitError && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {submitError}</span>
            <button onClick={() => setSubmitError('')} style={{ background: 'none', border: 'none', color: '#E05A5A', cursor: 'pointer', fontSize: 18, padding: 0 }}>✕</button>
          </div>
        )}

        {successMsg && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>
            {successMsg}
          </div>
        )}

        {/* Welcome tip */}
        {wards.length === 0 && !loading && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#E8A020' }}>👋 Set up your wards</p>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              1. Set a default bed count below<br />
              2. Tap common ward types to add them instantly<br />
              3. Add any custom ward types not listed
            </p>
          </div>
        )}

        {/* Default bed count for quick-add */}
        <div style={S.card}>
          <label style={S.label}>Default beds for quick-add wards below</label>
          <input value={quickBeds}
            onChange={(e) => setQuickBeds(sanitize.integer(e.target.value))}
            inputMode="numeric" placeholder="10"
            style={{ ...S.input(false), maxWidth: 120 }} />
        </div>

        {/* Common ward quick add */}
        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
            Common ward types
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
            Tap to add instantly — uses the bed count above
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COMMON_WARDS.map((wardType) => {
              const exists = wards.some((w) => w.ward_type === wardType);
              return (
                <button key={wardType}
                  onClick={() => !exists && quickAdd(wardType)}
                  disabled={saving || exists}
                  style={{ padding: '10px 16px', border: `1px solid ${exists ? 'rgba(106,170,144,0.3)' : 'rgba(90,154,223,0.3)'}`, color: exists ? '#6AAA90' : '#5A9ADF', background: exists ? 'rgba(106,170,144,0.08)' : 'rgba(90,154,223,0.08)', borderRadius: 8, cursor: exists ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 500 }}>
                  {exists ? '✓ ' : '+ '}{wardType}
                </button>
              );
            })}
          </div>
        </div>

        {/* Add custom ward */}
        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>
            Add custom ward
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
            For anything not covered above — Cardiac, Neonatal, Dialysis etc.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.label}>Ward type *</label>
              <input value={newWard.ward_type}
                onChange={(e) => { setNewWard((w) => ({ ...w, ward_type: e.target.value })); setWardErrors({}); }}
                placeholder="e.g. Cardiac / Neonatal"
                style={S.input(!!wardErrors.ward_type)} />
              {wardErrors.ward_type && <p style={S.fieldErr}>⚠ {wardErrors.ward_type}</p>}
            </div>
            <div>
              <label style={S.label}>Total beds *</label>
              <input value={newWard.total_beds}
                onChange={(e) => { setNewWard((w) => ({ ...w, total_beds: sanitize.integer(e.target.value) })); setWardErrors({}); }}
                inputMode="numeric" placeholder="10"
                style={S.input(!!wardErrors.total_beds)} />
              {wardErrors.total_beds && <p style={S.fieldErr}>⚠ {wardErrors.total_beds}</p>}
            </div>
          </div>
          <button onClick={addCustomWard} disabled={saving}
            style={{ width: '100%', padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Adding...' : '+ Add ward'}
          </button>
        </div>

        {/* Existing wards list */}
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>Loading...</p>
        ) : wards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#161618', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🛏️</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
              No wards yet — use the options above to get started.
            </p>
          </div>
        ) : (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
              Your wards ({wards.length})
            </p>
            {wards.map((w) => (
              <div key={w.id}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>🛏️</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{w.ward_type} Ward</p>
                    <p
                      onClick={() => updateBedCount(w.id, w.total_beds)}
                      style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)', cursor: 'pointer' }}
                      title="Click to edit bed count"
                    >
                      {w.total_beds} beds ✎
                    </p>
                  </div>
                </div>
                <button onClick={() => deleteWard(w.id, w.ward_type)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'rgba(224,90,90,0.4)', padding: '4px 8px' }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

      </div>

      <HospitalNav />
      <BugReporter screenName="manage_wards" />
    </div>
  );
}
