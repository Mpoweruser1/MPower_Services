// school/ManageClasses.jsx — FINAL
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { sanitize } from '../shared/useFormValidation';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const MEDIUMS = ['Telugu Medium', 'English Medium', 'Hindi Medium', 'Urdu Medium', 'Both Telugu & English'];

const PRE_PRIMARY = [
  { name: 'Play Group', order: -5 },
  { name: 'Nursery',    order: -4 },
  { name: 'Pre-KG',     order: -3 },
  { name: 'LKG',        order: -2 },
  { name: 'UKG',        order: -1 },
];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function ManageClasses() {
  const { tenant } = useTenant();
  const [classes, setClasses]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg]   = useState('');

  // Bulk setup
  const [bulkCount, setBulkCount]   = useState('10');
  const [bulkFrom, setBulkFrom]     = useState('1');
  const [bulkMedium, setBulkMedium] = useState('Telugu Medium');
  const [bulkPrefix, setBulkPrefix] = useState('Class');
  const [bulkErrors, setBulkErrors] = useState({});

  // Single add
  const [newClass, setNewClass]       = useState({ class_name: '', medium: 'Telugu Medium', class_order: '' });
  const [classErrors, setClassErrors] = useState({});

  useEffect(() => {
    if (tenant?.appId) loadClasses();
  }, [tenant?.appId]);

  async function loadClasses() {
    setLoading(true);
    const { data } = await supabase
      .from('classes')
      .select('id, class_name, medium, class_order')
      .eq('app_id', tenant.appId)
      .order('class_order');
    setClasses(data || []);
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

  // Quick add single pre-primary class
  async function quickAdd(cls) {
    setSaving(true);
    setSubmitError('');

    // Check if already exists
    const exists = classes.find((c) => c.class_name === cls.name);
    if (exists) { showError(`${cls.name} already exists.`); setSaving(false); return; }

    const { error } = await supabase.from('classes').insert({
      app_id:      tenant.appId,
      class_name:  cls.name,
      class_order: cls.order,
      medium:      bulkMedium,
    });

    if (error) { showError(`Failed to add ${cls.name}.`); }
    else { showSuccess(`✅ ${cls.name} added — ${bulkMedium}`); }

    setSaving(false);
    loadClasses();
  }

  // Bulk create numbered classes
  function validateBulk() {
    const errors = {};
    const count = parseInt(bulkCount);
    const from  = parseInt(bulkFrom);
    if (isNaN(count) || count < 1)  errors.bulkCount  = 'Enter at least 1';
    if (count > 20)                  errors.bulkCount  = 'Maximum 20 at once';
    if (isNaN(from) || from < 1)    errors.bulkFrom   = 'Must be at least 1';
    if (!bulkPrefix.trim())          errors.bulkPrefix = 'Prefix required';
    setBulkErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function bulkSetup() {
    if (!validateBulk()) return;
    setSaving(true);
    setSubmitError('');

    const count = parseInt(bulkCount);
    const from  = parseInt(bulkFrom);

    const rows = Array.from({ length: count }, (_, i) => ({
      app_id:      tenant.appId,
      class_name:  `${bulkPrefix.trim()} ${from + i}`,
      class_order: from + i,
      medium:      bulkMedium,
    }));

    const { error } = await supabase.from('classes').insert(rows);

    if (error) {
      if (error.code === '23505') {
        showError('Some classes already exist. Add only the missing ones individually.');
      } else {
        showError('Failed to create classes. Please try again.');
      }
      setSaving(false);
      return;
    }

    showSuccess(`✅ ${count} classes created successfully!`);
    setSaving(false);
    loadClasses();
  }

  // Add single class
  function validateSingle() {
    const errors = {};
    if (!newClass.class_name.trim())                      errors.class_name  = 'Class name required';
    if (!newClass.class_order || isNaN(Number(newClass.class_order))) errors.class_order = 'Order required';
    setClassErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function addClass() {
    if (!validateSingle()) return;
    setSaving(true);
    setSubmitError('');

    const exists = classes.find((c) =>
      c.class_name.toLowerCase() === newClass.class_name.trim().toLowerCase()
    );
    if (exists) { showError(`"${newClass.class_name}" already exists.`); setSaving(false); return; }

    const { error } = await supabase.from('classes').insert({
      app_id:      tenant.appId,
      class_name:  newClass.class_name.trim(),
      medium:      newClass.medium,
      class_order: parseInt(newClass.class_order),
    });

    if (error) { showError('Failed to add class.'); setSaving(false); return; }

    setNewClass({ class_name: '', medium: 'Telugu Medium', class_order: '' });
    setClassErrors({});
    setSaving(false);
    loadClasses();
  }

  // Delete class
  async function deleteClass(id, name) {
    const { count } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', id)
      .eq('status', 'active');

    if (count && count > 0) {
      showError(`Cannot delete "${name}" — ${count} active student${count > 1 ? 's are' : ' is'} in this class.`);
      return;
    }

    await supabase.from('classes').delete().eq('id', id);
    loadClasses();
  }

  // Clear all classes
  async function clearAll() {
    if (!window.confirm('Delete ALL classes? Only do this if no students are assigned.')) return;

    const { count } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('app_id', tenant.appId)
      .eq('status', 'active')
      .not('class_id', 'is', null);

    if (count && count > 0) {
      showError(`Cannot clear — ${count} students are assigned to classes.`);
      return;
    }

    await supabase.from('classes').delete().eq('app_id', tenant.appId);
    loadClasses();
  }

  const previewClasses = bulkPrefix && !isNaN(parseInt(bulkCount)) && !isNaN(parseInt(bulkFrom))
    ? Array.from({ length: Math.min(parseInt(bulkCount) || 0, 5) }, (_, i) =>
        `${bulkPrefix} ${parseInt(bulkFrom) + i}`
      )
    : [];

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Setup · తరగతుల నిర్వహణ
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Manage Classes</h1>
          {!loading && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
              {classes.length} class{classes.length !== 1 ? 'es' : ''} configured for {tenant?.orgName}
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

        {/* How to use tip */}
        {classes.length === 0 && !loading && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#E8A020' }}>👋 Welcome! Let's set up your classes</p>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              1. Select your medium below<br />
              2. Tap pre-primary buttons if your school has them<br />
              3. Use bulk setup for Class 1 onwards<br />
              4. Add any special classes individually
            </p>
          </div>
        )}

        {/* Medium selector — used by all sections below */}
        <div style={S.card}>
          <label style={S.label}>Default medium for new classes</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {MEDIUMS.map((m) => (
              <button key={m} onClick={() => { setBulkMedium(m); setNewClass((c) => ({ ...c, medium: m })); }}
                style={{ padding: '8px 14px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${bulkMedium === m ? 'rgba(232,160,32,0.4)' : 'rgba(255,255,255,0.08)'}`, background: bulkMedium === m ? 'rgba(232,160,32,0.08)' : '#111113', color: bulkMedium === m ? '#E8A020' : 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'inherit', fontWeight: bulkMedium === m ? 600 : 400 }}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Pre-primary quick add */}
        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
            Pre-primary classes · పూర్వ ప్రాథమిక
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
            Tap to add instantly — uses selected medium above
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRE_PRIMARY.map((cls) => {
              const exists = classes.some((c) => c.class_name === cls.name);
              return (
                <button key={cls.name}
                  onClick={() => !exists && quickAdd(cls)}
                  disabled={saving || exists}
                  style={{ padding: '10px 16px', border: `1px solid ${exists ? 'rgba(106,170,144,0.3)' : 'rgba(90,154,223,0.3)'}`, color: exists ? '#6AAA90' : '#5A9ADF', background: exists ? 'rgba(106,170,144,0.08)' : 'rgba(90,154,223,0.08)', borderRadius: 8, cursor: exists ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 500 }}>
                  {exists ? '✓ ' : '+ '}{cls.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bulk numbered classes */}
        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
            Bulk numbered classes
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>
            Create Class 1–10, Form 1–5, Grade 1–12, Year 1–3 etc. in one click
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={S.label}>Prefix *</label>
              <input value={bulkPrefix}
                onChange={(e) => { setBulkPrefix(e.target.value); setBulkErrors({}); }}
                placeholder="Class / Form / Grade / Year"
                style={S.input(!!bulkErrors.bulkPrefix)} />
              {bulkErrors.bulkPrefix && <p style={S.fieldErr}>⚠ {bulkErrors.bulkPrefix}</p>}
            </div>
            <div>
              <label style={S.label}>Start from *</label>
              <input value={bulkFrom}
                onChange={(e) => { setBulkFrom(sanitize.integer(e.target.value)); setBulkErrors({}); }}
                inputMode="numeric" placeholder="1"
                style={S.input(!!bulkErrors.bulkFrom)} />
              {bulkErrors.bulkFrom && <p style={S.fieldErr}>⚠ {bulkErrors.bulkFrom}</p>}
            </div>
            <div>
              <label style={S.label}>Count *</label>
              <input value={bulkCount}
                onChange={(e) => { setBulkCount(sanitize.integer(e.target.value)); setBulkErrors({}); }}
                inputMode="numeric" placeholder="10"
                style={S.input(!!bulkErrors.bulkCount)} />
              {bulkErrors.bulkCount && <p style={S.fieldErr}>⚠ {bulkErrors.bulkCount}</p>}
            </div>
          </div>

          {/* Preview */}
          {previewClasses.length > 0 && (
            <div style={{ background: '#111113', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '0 0 4px' }}>Preview:</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                {previewClasses.join(', ')}
                {parseInt(bulkCount) > 5 ? ` ... ${bulkPrefix} ${parseInt(bulkFrom) + parseInt(bulkCount) - 1}` : ''}
                {' — '}{bulkMedium}
              </p>
            </div>
          )}

          <button onClick={bulkSetup} disabled={saving}
            style={{ width: '100%', padding: 12, background: saving ? 'rgba(255,255,255,0.08)' : '#6AAA90', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Creating...' : `✓ Create ${bulkCount || 0} classes`}
          </button>
        </div>

        {/* Add single custom class */}
        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>
            Add custom class
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
            For anything not covered above — Class 11, Class 12, PUC, Diploma etc.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.label}>Class name *</label>
              <input value={newClass.class_name}
                onChange={(e) => { setNewClass((c) => ({ ...c, class_name: e.target.value })); setClassErrors({}); }}
                placeholder="e.g. Class 11 / LKG / Diploma"
                style={S.input(!!classErrors.class_name)} />
              {classErrors.class_name && <p style={S.fieldErr}>⚠ {classErrors.class_name}</p>}
            </div>
            <div>
              <label style={S.label}>Medium</label>
              <select value={newClass.medium}
                onChange={(e) => setNewClass((c) => ({ ...c, medium: e.target.value }))}
                style={{ ...S.input(false), cursor: 'pointer' }}>
                {MEDIUMS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Order *</label>
              <input value={newClass.class_order}
                onChange={(e) => { setNewClass((c) => ({ ...c, class_order: sanitize.integer(e.target.value) })); setClassErrors({}); }}
                inputMode="numeric" placeholder="11"
                style={S.input(!!classErrors.class_order)} />
              {classErrors.class_order && <p style={S.fieldErr}>⚠ {classErrors.class_order}</p>}
            </div>
          </div>
          <button onClick={addClass} disabled={saving}
            style={{ width: '100%', padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Adding...' : '+ Add class'}
          </button>
        </div>

        {/* Existing classes list */}
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>Loading...</p>
        ) : classes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#161618', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🏫</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
              No classes yet — use the options above to get started.
            </p>
          </div>
        ) : (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 }}>
                Your classes ({classes.length})
              </p>
              <button onClick={clearAll}
                style={{ padding: '5px 12px', border: '1px solid rgba(224,90,90,0.3)', color: '#E05A5A', background: 'transparent', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                Clear all
              </button>
            </div>

            {classes.map((c) => {
              const isPrePrimary = c.class_order < 1;
              return (
                <div key={c.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{isPrePrimary ? '🌱' : '📚'}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{c.class_name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                        {c.medium} · Order: {c.class_order}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => deleteClass(c.id, c.class_name)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'rgba(224,90,90,0.4)', padding: '4px 8px' }}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

      </div>

      <SchoolNav />
      <BugReporter screenName="manage_classes" />
    </div>
  );
}