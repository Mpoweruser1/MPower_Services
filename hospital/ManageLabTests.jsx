// hospital/ManageLabTests.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import BugReporter from '../shared/BugReporter';

// sample_type values MUST match master_lab_tests_sample_type_check exactly:
// ARRAY['blood','urine','swab','other'] — lowercase, fixed set. Confirmed
// against real schema. Do not change casing here without also changing
// the DB constraint.
const COMMON_TESTS = [
  { test_name: 'Blood Sugar Fasting', normal_range: '70-100', unit: 'mg/dL', sample_type: 'blood', turnaround_hours: 4 },
  { test_name: 'Blood Sugar Post Prandial', normal_range: '70-140', unit: 'mg/dL', sample_type: 'blood', turnaround_hours: 4 },
  { test_name: 'Complete Blood Count (CBC)', normal_range: '4.5-11.0', unit: 'x10^9/L', sample_type: 'blood', turnaround_hours: 6 },
  { test_name: 'Kidney Function Test (KFT)', normal_range: 'See report', unit: 'mg/dL', sample_type: 'blood', turnaround_hours: 24 },
  { test_name: 'Lipid Profile', normal_range: 'See report', unit: 'mg/dL', sample_type: 'blood', turnaround_hours: 24 },
  { test_name: 'Liver Function Test (LFT)', normal_range: 'See report', unit: 'U/L', sample_type: 'blood', turnaround_hours: 24 },
  { test_name: 'Thyroid Profile (T3/T4/TSH)', normal_range: 'See report', unit: '\u00b5IU/mL', sample_type: 'blood', turnaround_hours: 24 },
];

// Must match master_lab_tests_sample_type_check exactly — this is the
// only set of values the DB will accept, so the custom-test form below
// uses this as a dropdown instead of free text.
const SAMPLE_TYPES = [
  { value: 'blood', label: 'Blood' },
  { value: 'urine', label: 'Urine' },
  { value: 'swab',  label: 'Swab' },
  { value: 'other', label: 'Other' },
];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function ManageLabTests() {
  const { tenant } = useTenant();
  const [tests, setTests]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg]   = useState('');

  const [newTest, setNewTest] = useState({ test_name: '', normal_range: '', unit: '', sample_type: 'blood', turnaround_hours: '24' });
  const [testErrors, setTestErrors] = useState({});

  useEffect(() => {
    if (tenant?.appId) loadTests();
  }, [tenant?.appId]);

  async function loadTests() {
    setLoading(true);
    const { data } = await supabase.from('master_lab_tests').select('id, test_name, normal_range, unit, sample_type, turnaround_hours').eq('app_id', tenant.appId).order('test_name');
    setTests(data || []);
    setLoading(false);
  }

  function showSuccess(msg) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); }
  function showError(msg) { setSubmitError(msg); setTimeout(() => setSubmitError(''), 5000); }

  async function quickAdd(test) {
    setSaving(true);
    setSubmitError('');
    const exists = tests.find((t) => t.test_name === test.test_name);
    if (exists) { showError(`${test.test_name} already exists.`); setSaving(false); return; }

    const { error } = await supabase.from('master_lab_tests').insert({ app_id: tenant.appId, ...test });
    if (error) showError(`Failed to add ${test.test_name}.`);
    else showSuccess(`\u2705 ${test.test_name} added`);
    setSaving(false);
    loadTests();
  }

  function validateCustom() {
    const errors = {};
    if (!newTest.test_name.trim()) errors.test_name = 'Test name required';
    setTestErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function addCustomTest() {
    if (!validateCustom()) return;
    setSaving(true);
    setSubmitError('');

    const exists = tests.find((t) => t.test_name.toLowerCase() === newTest.test_name.trim().toLowerCase());
    if (exists) { showError(`"${newTest.test_name}" already exists.`); setSaving(false); return; }

    const { error } = await supabase.from('master_lab_tests').insert({
      app_id: tenant.appId,
      test_name: newTest.test_name.trim(),
      normal_range: newTest.normal_range.trim() || null,
      unit: newTest.unit.trim() || null,
      sample_type: newTest.sample_type || null,
      turnaround_hours: newTest.turnaround_hours ? parseInt(newTest.turnaround_hours) : null,
    });

    if (error) showError('Failed to add test.');
    else {
      setNewTest({ test_name: '', normal_range: '', unit: '', sample_type: 'blood', turnaround_hours: '24' });
      setTestErrors({});
      showSuccess('\u2705 Test added');
    }
    setSaving(false);
    loadTests();
  }

  async function deleteTest(id, name) {
    if (!window.confirm(`Remove "${name}" from your test catalog? Already-ordered tests keep their own record and won't be affected.`)) return;
    await supabase.from('master_lab_tests').delete().eq('id', id);
    loadTests();
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Setup</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Manage Lab Tests</h1>
          {!loading && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
              {tests.length} test{tests.length !== 1 ? 's' : ''} configured for {tenant?.orgName}
            </p>
          )}
        </div>

        {submitError && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>\u26a0\ufe0f {submitError}</span>
            <button onClick={() => setSubmitError('')} style={{ background: 'none', border: 'none', color: '#E05A5A', cursor: 'pointer', fontSize: 18, padding: 0 }}>\u2715</button>
          </div>
        )}

        {successMsg && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>
            {successMsg}
          </div>
        )}

        {tests.length === 0 && !loading && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#E8A020' }}>\ud83d\udc4b Set up your lab test catalog</p>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              Tap common tests below to add them instantly, or add any custom test not listed.
            </p>
          </div>
        )}

        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Common tests</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COMMON_TESTS.map((t) => {
              const exists = tests.some((x) => x.test_name === t.test_name);
              return (
                <button key={t.test_name} onClick={() => !exists && quickAdd(t)} disabled={saving || exists}
                  style={{ padding: '10px 16px', border: `1px solid ${exists ? 'rgba(106,170,144,0.3)' : 'rgba(90,154,223,0.3)'}`, color: exists ? '#6AAA90' : '#5A9ADF', background: exists ? 'rgba(106,170,144,0.08)' : 'rgba(90,154,223,0.08)', borderRadius: 8, cursor: exists ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 500 }}>
                  {exists ? '\u2713 ' : '+ '}{t.test_name}
                </button>
              );
            })}
          </div>
        </div>

        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Add custom test</p>
          <div style={{ marginBottom: 10 }}>
            <label htmlFor="lab-test-name" style={S.label}>Test name *</label>
            <input id="lab-test-name" name="lab-test-name" value={newTest.test_name} onChange={(e) => { setNewTest((t) => ({ ...t, test_name: e.target.value })); setTestErrors({}); }}
              placeholder="e.g. Vitamin D, HbA1c" style={S.input(!!testErrors.test_name)} />
            {testErrors.test_name && <p style={S.fieldErr}>\u26a0 {testErrors.test_name}</p>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label htmlFor="lab-test-normal-range" style={S.label}>Normal range</label>
              <input id="lab-test-normal-range" name="lab-test-normal-range" value={newTest.normal_range} onChange={(e) => setNewTest((t) => ({ ...t, normal_range: e.target.value }))} placeholder="e.g. 70-100" style={S.input(false)} />
            </div>
            <div>
              <label htmlFor="lab-test-unit" style={S.label}>Unit</label>
              <input id="lab-test-unit" name="lab-test-unit" value={newTest.unit} onChange={(e) => setNewTest((t) => ({ ...t, unit: e.target.value }))} placeholder="e.g. mg/dL" style={S.input(false)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label htmlFor="lab-test-sample-type" style={S.label}>Sample type</label>
              <select id="lab-test-sample-type" name="lab-test-sample-type" value={newTest.sample_type} onChange={(e) => setNewTest((t) => ({ ...t, sample_type: e.target.value }))} style={{ ...S.input(false), cursor: 'pointer' }}>
                {SAMPLE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lab-test-turnaround" style={S.label}>Turnaround (hours)</label>
              <input id="lab-test-turnaround" name="lab-test-turnaround" value={newTest.turnaround_hours} onChange={(e) => setNewTest((t) => ({ ...t, turnaround_hours: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="24" style={S.input(false)} />
            </div>
          </div>
          <button onClick={addCustomTest} disabled={saving}
            style={{ width: '100%', padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Adding...' : '+ Add test'}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>Loading...</p>
        ) : tests.length > 0 && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Your test catalog ({tests.length})</p>
            {tests.map((t) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{t.test_name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    {t.normal_range}{t.unit ? ` ${t.unit}` : ''} \u00b7 {t.sample_type ? t.sample_type[0].toUpperCase() + t.sample_type.slice(1) : ''} \u00b7 {t.turnaround_hours}h turnaround
                  </p>
                </div>
                <button onClick={() => deleteTest(t.id, t.test_name)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'rgba(224,90,90,0.4)', padding: '4px 8px' }}>\u2715</button>
              </div>
            ))}
          </div>
        )}

      </div>
      <HospitalNav />
      <BugReporter screenName="manage_lab_tests" />
    </div>
  );
}
