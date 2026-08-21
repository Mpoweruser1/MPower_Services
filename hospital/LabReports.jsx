// hospital/LabReports.jsx — FINAL
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { useVisit } from '../context/VisitContext';
import { sanitize } from '../shared/useFormValidation';
import PatientSelector from '../shared/PatientSelector';
import PrintHeader from '../shared/PrintHeader';
import HospitalNav from '../shared/HospitalNav';
import NextActions from '../shared/NextActions';
import BugReporter from '../shared/BugReporter';

const STATUS_CONFIG = {
  pending:    { color: '#E8A020', bg: 'rgba(232,160,32,0.12)',  label: 'Pending' },
  processing: { color: '#5A9ADF', bg: 'rgba(90,154,223,0.12)',  label: 'Processing' },
  completed:  { color: '#6AAA90', bg: 'rgba(106,170,144,0.12)', label: 'Completed' },
};

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function LabReports() {
  const { tenant }                                       = useTenant();
  const { activePatient, setActivePatient, clearPatient } = useVisit();

  const [tab, setTab]                   = useState('order');
  const [selectedPatient, setSelectedPatient] = useState(activePatient);
  const [masterTests, setMasterTests]   = useState([]);
  const [panels, setPanels]             = useState([]);
  const [selectedTests, setSelectedTests] = useState([]);
  const [pendingTests, setPendingTests] = useState([]);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [enteringResult, setEnteringResult] = useState(null);
  const [resultValue, setResultValue]   = useState('');
  const [resultValueError, setResultValueError] = useState('');
  const [resultNotes, setResultNotes]   = useState('');
  const [submitError, setSubmitError]   = useState('');

  useEffect(() => {
    if (tenant?.appId) loadMasterTests();
  }, [tenant?.appId]);

  useEffect(() => { setSelectedPatient(activePatient); }, [activePatient]);

  useEffect(() => {
    if (selectedPatient && tab === 'results') loadPendingTests();
  }, [selectedPatient, tab]);

  async function loadMasterTests() {
    const [testsRes, panelsRes] = await Promise.allSettled([
      supabase.from('master_lab_tests').select('*').eq('app_id', tenant.appId).order('test_name'),
      supabase.from('lab_test_panels').select('*').eq('app_id', tenant.appId).order('panel_name'),
    ]);
    setMasterTests(testsRes.status === 'fulfilled' ? (testsRes.value.data || []) : []);
    setPanels(panelsRes.status === 'fulfilled' ? (panelsRes.value.data || []) : []);
  }

  async function loadPendingTests() {
    if (!selectedPatient) return;
    const { data } = await supabase
      .from('lab_tests').select('*')
      .eq('patient_id', selectedPatient.id)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false });
    // lab_tests has no normal_range/unit columns of its own — merging
    // them in from the catalog we already loaded, matched by test name.
    const enriched = (data || []).map((t) => {
      const master = masterTests.find((m) => m.test_name === t.test_name);
      return { ...t, normal_range: master?.normal_range || null, unit: master?.unit || null };
    });
    setPendingTests(enriched);
  }

  function toggleTest(test) {
    setSelectedTests((prev) =>
      prev.find((t) => t.id === test.id)
        ? prev.filter((t) => t.id !== test.id)
        : [...prev, test]
    );
  }

  async function orderTests() {
    setSubmitError('');
    if (!selectedPatient) { setSubmitError('Select a patient first.'); return; }
    if (selectedTests.length === 0) { setSubmitError('Select at least one test.'); return; }
    setSaving(true);

    const rows = selectedTests.map((test) => ({
      app_id:     tenant.appId,
      patient_id: selectedPatient.id,
      test_name:  test.test_name,
      ordered_by: tenant.userRowId,
      status:     'pending',
    }));

    const { error } = await supabase.from('lab_tests').insert(rows);
    if (error) {
      console.error('Lab test order failed:', error);
      setSubmitError('Failed to order tests.');
      setSaving(false);
      return;
    }

    setSelectedTests([]);
    setSaved(true);
    setTimeout(() => { setSaved(false); setTab('results'); loadPendingTests(); }, 1500);
    setSaving(false);
  }

  function validateResult(value, test) {
    if (!value.trim()) return 'Result value is required';
    // If test has a unit that suggests numeric result, validate
    if (test.unit && test.unit !== 'text' && test.unit !== 'qualitative') {
      const num = Number(value.replace(/[^0-9.+-]/g, ''));
      if (isNaN(num) && !/positive|negative|reactive|non-reactive/i.test(value)) {
        return 'Enter a valid numeric result or qualitative result (Positive/Negative)';
      }
      if (num < 0 && !test.unit?.includes('C') && !test.unit?.includes('temp')) {
        return 'Result value cannot be negative for this test';
      }
    }
    return null;
  }

  async function enterResult(test) {
    const valErr = validateResult(resultValue, test);
    if (valErr) { setResultValueError(valErr); return; }

    const { error } = await supabase.from('lab_tests').update({
      status:          'completed',
      result_value:    resultValue.trim(),
      result_notes:    resultNotes.trim() || null,
      result_ready_at: new Date().toISOString(),
    }).eq('id', test.id);

    if (error) { setResultValueError('Failed to save result.'); return; }

    if (selectedPatient?.phone) {
      await supabase.functions.invoke('send-whatsapp', {
        body: { type: 'lab_result_ready', patientId: selectedPatient.id, testName: test.test_name },
      });
    }

    setEnteringResult(null);
    setResultValue('');
    setResultValueError('');
    setResultNotes('');
    loadPendingTests();
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print { .no-print { display: none !important; } }
      `}</style>
      <PrintHeader documentTitle="Lab Report" />

      <div style={S.inner}>
        <div className="no-print" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Lab Reports · లాబ్ నివేదికలు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Laboratory</h1>
        </div>

        <div style={{ ...S.card, marginBottom: 16 }}>
          <PatientSelector
            selectedPatient={selectedPatient}
            onSelect={(p) => { setSelectedPatient(p); setActivePatient(p); }}
            onClear={() => { setSelectedPatient(null); clearPatient(); }}
            label="Select patient for lab work"
          />
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { k: 'order',   l: 'Order tests' },
            { k: 'results', l: `Enter results${pendingTests.length > 0 ? ` (${pendingTests.length})` : ''}` },
          ].map((t) => (
            <button key={t.k} onClick={() => { setTab(t.k); if (t.k === 'results') loadPendingTests(); }}
              style={{ padding: '8px 18px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
        </div>

        {tab === 'order' && (
          <>
            {masterTests.length === 0 ? (
              <div style={{ ...S.card, textAlign: 'center', padding: '32px 20px' }}>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No lab tests configured yet.</p>
              </div>
            ) : (
              <>
                {panels.length > 0 && (
                  <div style={S.card}>
                    <p style={{ ...S.label }}>Test panels</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {panels.map((panel) => (
                        <div key={panel.id} onClick={() => {
                          const panelTests = masterTests.filter((t) => t.panel_id === panel.id);
                          panelTests.forEach((t) => {
                            if (!selectedTests.find((s) => s.id === t.id))
                              setSelectedTests((prev) => [...prev, t]);
                          });
                        }}
                          style={{ padding: '10px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, cursor: 'pointer' }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{panel.panel_name}</p>
                          {panel.price && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6AAA90' }}>₹{Number(panel.price).toLocaleString('en-IN')}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={S.card}>
                  <p style={S.label}>Individual tests</p>
                  {masterTests.map((test) => {
                    const isSelected = !!selectedTests.find((t) => t.id === test.id);
                    return (
                      <div key={test.id} onClick={() => toggleTest(test)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${isSelected ? '#E8A020' : 'rgba(255,255,255,0.2)'}`, background: isSelected ? '#E8A020' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {isSelected && <span style={{ fontSize: 11, color: '#111113', fontWeight: 700 }}>✓</span>}
                          </div>
                          <div>
                            <p style={{ margin: 0, fontSize: 13, color: '#fff' }}>{test.test_name}</p>
                            {test.normal_range && <p style={{ margin: '1px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Normal: {test.normal_range} {test.unit || ''}</p>}
                          </div>
                        </div>
                        {test.price && <p style={{ margin: 0, fontSize: 13, color: '#6AAA90' }}>₹{Number(test.price).toLocaleString('en-IN')}</p>}
                      </div>
                    );
                  })}
                </div>

                {submitError && (
                  <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                    ⚠️ {submitError}
                  </div>
                )}

                {saved && (
                  <div style={{ padding: 12, background: 'rgba(106,170,144,0.1)', borderRadius: 8, textAlign: 'center', marginBottom: 12 }}>
                    <p style={{ margin: 0, fontSize: 14, color: '#6AAA90', fontWeight: 500 }}>✓ Tests ordered successfully</p>
                  </div>
                )}

                <button onClick={orderTests} disabled={saving || selectedTests.length === 0 || !selectedPatient}
                  style={{ width: '100%', padding: 13, background: saving || selectedTests.length === 0 || !selectedPatient ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving || selectedTests.length === 0 || !selectedPatient ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Ordering...' : selectedPatient ? `Order ${selectedTests.length} test${selectedTests.length !== 1 ? 's' : ''}` : 'Select patient first'}
                </button>
              </>
            )}
          </>
        )}

        {tab === 'results' && (
          pendingTests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                {selectedPatient ? 'No pending lab tests.' : 'Select a patient to view pending tests.'}
              </p>
            </div>
          ) : (
            pendingTests.map((test) => {
              const cfg = STATUS_CONFIG[test.status] || STATUS_CONFIG.pending;
              return (
                <div key={test.id} style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{test.test_name}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        Ordered: {new Date(test.created_at).toLocaleString('en-IN')}
                        {test.normal_range ? ` · Normal: ${test.normal_range} ${test.unit || ''}` : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
                  </div>

                  {enteringResult?.id === test.id ? (
                    <div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={S.label}>
                          Result value {test.unit ? `(${test.unit})` : ''} <span style={{ color: '#E05A5A' }}>*</span>
                        </label>
                        <input
                          value={resultValue}
                          onChange={(e) => { setResultValue(e.target.value); setResultValueError(''); }}
                          placeholder={test.normal_range ? `Normal: ${test.normal_range}` : 'Enter result'}
                          style={S.input(!!resultValueError)}
                          autoFocus
                        />
                        {resultValueError && <p style={S.fieldErr}>⚠ {resultValueError}</p>}
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                          Enter numeric value or Positive/Negative
                        </p>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={S.label}>Notes / remarks (optional)</label>
                        <input value={resultNotes} onChange={(e) => setResultNotes(e.target.value)}
                          placeholder="Any observations..." style={S.input(false)} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setEnteringResult(null); setResultValue(''); setResultValueError(''); setResultNotes(''); }}
                          style={{ flex: 1, padding: 9, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>
                          Cancel
                        </button>
                        <button onClick={() => enterResult(test)}
                          style={{ flex: 2, padding: 9, background: '#6AAA90', color: '#111113', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                          Save result →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setEnteringResult(test); setResultValue(''); setResultValueError(''); setResultNotes(''); }}
                      style={{ width: '100%', padding: '8px 0', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                      Enter result
                    </button>
                  )}
                </div>
              );
            })
          )
        )}
      </div>

      <HospitalNav />
      <BugReporter screenName="lab_reports" />
    </div>
  );
}