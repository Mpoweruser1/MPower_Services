// school/PromoteStudents.jsx — NEW
//
// Pass/fail is read from marks.pass_fail (real, per-subject data
// already recorded by the school's own exam system) rather than a
// generic percentage threshold invented here — different subjects or
// exam boards may use different passing rules, and this table already
// captures whatever the school's own process determined.
//
// Auto-suggestion only — every student can be overridden individually
// with a reason before the batch is executed. Execution itself is
// restricted to the principal role, which is how "needs principal/HM
// approval" is enforced here — same owner-role convention already
// used everywhere else in this app.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';
import { isFailLike, computeDecision, nextAcademicYear } from '../shared/promotionLogic';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 900, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  select: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
};

const DECISION_CONFIG = {
  promoted:  { label: 'Promote',  color: '#6AAA90' },
  retained:  { label: 'Retain',   color: '#E05A5A' },
  graduated: { label: 'Graduate', color: '#E8A020' },
};

// isFailLike and nextAcademicYear now imported from
// shared/promotionLogic.js — see its test suite for coverage.

export default function PromoteStudents() {
  const { tenant } = useTenant();
  const isPrincipal = tenant?.role === 'principal';

  const [step, setStep] = useState('setup'); // 'setup' | 'review' | 'history'
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear]   = useState('');
  const [examTypes, setExamTypes]         = useState([]);
  const [selectedExamType, setSelectedExamType] = useState('');
  const [toYear, setToYear]               = useState('');

  const [loading, setLoading]     = useState(false);
  const [students, setStudents]   = useState([]); // review rows
  const [classes, setClasses]     = useState([]);
  const [executing, setExecuting] = useState(false);
  const [error, setError]         = useState('');
  const [batches, setBatches]     = useState([]);

  useEffect(() => {
    if (tenant?.appId) loadAcademicYears();
  }, [tenant?.appId]);

  useEffect(() => {
    if (selectedYear) loadExamTypes();
  }, [selectedYear]);

  useEffect(() => {
    if (step === 'history' && tenant?.appId) loadBatches();
  }, [step, tenant?.appId]);

  async function loadAcademicYears() {
    const { data } = await supabase
      .from('exams').select('academic_year')
      .eq('app_id', tenant.appId);
    const years = [...new Set((data || []).map((e) => e.academic_year).filter(Boolean))].sort().reverse();
    setAcademicYears(years);
    if (years.length > 0) {
      setSelectedYear(years[0]);
      setToYear(nextAcademicYear(years[0]));
    }
  }

  async function loadExamTypes() {
    const { data } = await supabase
      .from('exams').select('exam_type')
      .eq('app_id', tenant.appId)
      .eq('academic_year', selectedYear);
    const types = [...new Set((data || []).map((e) => e.exam_type).filter(Boolean))];
    setExamTypes(types);
    if (types.length > 0) setSelectedExamType(types[0]);
  }

  async function loadReview() {
    if (!selectedYear || !selectedExamType) {
      setError('Select an academic year and exam type first.');
      return;
    }
    setError('');
    setLoading(true);

    const { data: classRows } = await supabase
      .from('classes').select('id, class_name, class_order')
      .eq('app_id', tenant.appId).order('class_order');
    setClasses(classRows || []);
    const highestOrder = Math.max(...(classRows || []).map((c) => c.class_order), 0);

    const { data: studentRows } = await supabase
      .from('students').select('id, full_name, sid, class_id, section, status')
      .eq('app_id', tenant.appId).eq('status', 'active');

    const { data: examRows } = await supabase
      .from('exams').select('id, class_id')
      .eq('app_id', tenant.appId).eq('academic_year', selectedYear).eq('exam_type', selectedExamType);
    const examIds = (examRows || []).map((e) => e.id);

    const { data: markRows } = examIds.length
      ? await supabase.from('marks').select('student_id, percentage, pass_fail').in('exam_id', examIds)
      : { data: [] };

    const marksByStudent = {};
    (markRows || []).forEach((m) => {
      if (!marksByStudent[m.student_id]) marksByStudent[m.student_id] = [];
      marksByStudent[m.student_id].push(m);
    });

    const reviewRows = (studentRows || []).map((s) => {
      const cls = (classRows || []).find((c) => c.id === s.class_id);
      const marks = marksByStudent[s.id] || [];
      const failCount = marks.filter((m) => isFailLike(m.pass_fail)).length;
      const avgPct = marks.length
        ? Math.round(marks.reduce((sum, m) => sum + Number(m.percentage || 0), 0) / marks.length)
        : null;

      const isHighest = cls && cls.class_order === highestOrder;
      const nextClass = (classRows || []).find((c) => c.class_order === (cls?.class_order ?? -999) + 1);

      // The actual promotion rule now lives in shared/promotionLogic.js
      // — tested independently, including the deliberate "highest
      // class always graduates, even with failing marks" rule.
      const { decision, reason } = computeDecision({ isHighest, marksCount: marks.length, failCount });

      return {
        student: s,
        currentClass: cls,
        nextClass,
        marksCount: marks.length,
        failCount,
        avgPct,
        decision,
        reason,
      };
    });

    reviewRows.sort((a, b) => (a.currentClass?.class_order ?? 0) - (b.currentClass?.class_order ?? 0) || a.student.full_name.localeCompare(b.student.full_name));
    setStudents(reviewRows);
    setLoading(false);
    setStep('review');
  }

  function updateDecision(studentId, decision, reason) {
    setStudents((prev) => prev.map((r) => r.student.id === studentId ? { ...r, decision, reason } : r));
  }

  async function executeBatch() {
    if (!isPrincipal) return;
    if (!window.confirm(`Promote ${students.filter((s) => s.decision === 'promoted').length} students, retain ${students.filter((s) => s.decision === 'retained').length}, graduate ${students.filter((s) => s.decision === 'graduated').length}? This can be undone afterward if needed.`)) return;

    setExecuting(true);
    setError('');

    const { data: batch, error: batchErr } = await supabase
      .from('promotion_batches')
      .insert({
        app_id: tenant.appId,
        from_academic_year: selectedYear,
        to_academic_year: toYear,
        executed_by: tenant.userRowId,
      })
      .select()
      .single();

    if (batchErr) {
      console.error('Promotion batch creation failed:', batchErr);
      setError(batchErr.message || 'Failed to create promotion batch. Please try again.');
      setExecuting(false);
      return;
    }

    // Previously, nothing in this loop checked for errors at all — a
    // failed update would leave promotion_records saying a student
    // was promoted while their actual class_id never changed, with no
    // way to tell afterward. Now every write is checked, and any
    // failure is collected so the person running this sees exactly
    // which students (if any) didn't go through, instead of a blanket
    // "done" that may not be true.
    const failures = [];
    for (const row of students) {
      const toClassId = row.decision === 'promoted' ? row.nextClass?.id : null;
      const toSection = row.decision === 'promoted' ? row.student.section : null;

      const { error: recErr } = await supabase.from('promotion_records').insert({
        batch_id: batch.id,
        student_id: row.student.id,
        from_class_id: row.currentClass?.id || null,
        from_section: row.student.section,
        from_status: row.student.status,
        to_class_id: toClassId,
        to_section: toSection,
        decision: row.decision,
        avg_percentage: row.avgPct,
        reason: row.reason || null,
      });

      if (recErr) {
        console.error(`Promotion record failed for ${row.student.full_name}:`, recErr);
        failures.push(`${row.student.full_name} (record not logged: ${recErr.message})`);
        continue; // don't attempt the student update if the record itself failed
      }

      if (row.decision === 'promoted' && toClassId) {
        const { error: updErr } = await supabase.from('students').update({ class_id: toClassId }).eq('id', row.student.id);
        if (updErr) {
          console.error(`Class update failed for ${row.student.full_name}:`, updErr);
          failures.push(`${row.student.full_name} (class not updated: ${updErr.message})`);
        }
      } else if (row.decision === 'graduated') {
        const { error: updErr } = await supabase.from('students').update({ status: 'graduated' }).eq('id', row.student.id);
        if (updErr) {
          console.error(`Graduation update failed for ${row.student.full_name}:`, updErr);
          failures.push(`${row.student.full_name} (status not updated: ${updErr.message})`);
        }
      }
      // 'retained' students: no data change, just the logged record above
    }

    setExecuting(false);
    if (failures.length > 0) {
      setError(`Promotion completed with ${failures.length} problem(s) — review before treating this batch as fully done:\n${failures.join('\n')}`);
    }
    setStep('history');
  }

  async function loadBatches() {
    const { data: batchRows } = await supabase
      .from('promotion_batches').select('*')
      .eq('app_id', tenant.appId)
      .order('executed_at', { ascending: false });

    const withCounts = await Promise.all((batchRows || []).map(async (b) => {
      const { data: records } = await supabase.from('promotion_records').select('decision').eq('batch_id', b.id);
      const counts = { promoted: 0, retained: 0, graduated: 0 };
      (records || []).forEach((r) => { counts[r.decision] = (counts[r.decision] || 0) + 1; });
      return { ...b, counts };
    }));

    setBatches(withCounts);
  }

  async function undoBatch(batchId) {
    if (!isPrincipal) return;
    if (!window.confirm('Undo this promotion batch? Every student in it will be restored to their previous class and status.')) return;

    setError('');
    const { data: records } = await supabase.from('promotion_records').select('*').eq('batch_id', batchId);

    // Same missing-error-check issue as the promotion loop above — a
    // failed restore would previously leave a student on their
    // promoted class/status while the batch itself gets marked
    // "reverted", silently contradicting each other.
    const failures = [];
    for (const r of records || []) {
      const { error: undoErr } = await supabase.from('students').update({
        class_id: r.from_class_id,
        status: r.from_status,
      }).eq('id', r.student_id);
      if (undoErr) {
        console.error(`Undo failed for student ${r.student_id}:`, undoErr);
        failures.push(`Student ID ${r.student_id}: ${undoErr.message}`);
      }
    }

    const { error: batchUpdateErr } = await supabase.from('promotion_batches').update({
      status: 'reverted',
      reverted_by: tenant.userRowId,
      reverted_at: new Date().toISOString(),
    }).eq('id', batchId);

    if (batchUpdateErr) {
      console.error('Marking batch reverted failed:', batchUpdateErr);
      failures.push(`Batch status update: ${batchUpdateErr.message}`);
    }

    if (failures.length > 0) {
      setError(`Undo completed with ${failures.length} problem(s):\n${failures.join('\n')}`);
    }

    loadBatches();
  }

  const summary = {
    promoted: students.filter((s) => s.decision === 'promoted').length,
    retained: students.filter((s) => s.decision === 'retained').length,
    graduated: students.filter((s) => s.decision === 'graduated').length,
  };

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Year-end · ప్రమోషన్</p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Promote Students</h1>
          </div>
          <button onClick={() => setStep('history')}
            style={{ padding: '8px 14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            📋 History
          </button>
        </div>

        {!isPrincipal && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#E8A020' }}>
              You can review and prepare the promotion list, but only the Principal can execute it or undo a batch.
            </p>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Setup */}
        {step === 'setup' && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>
              Which exam determines promotion?
            </p>
            {academicYears.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No exams recorded yet — marks need to exist before students can be promoted based on results.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label style={S.label}>From academic year</label>
                    <select value={selectedYear} onChange={(e) => { setSelectedYear(e.target.value); setToYear(nextAcademicYear(e.target.value)); }} style={{ ...S.select, width: '100%' }}>
                      {academicYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>To academic year</label>
                    <input value={toYear} onChange={(e) => setToYear(e.target.value)} style={{ ...S.input, width: '100%' }} />
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={S.label}>Determining exam</label>
                  <select value={selectedExamType} onChange={(e) => setSelectedExamType(e.target.value)} style={{ ...S.select, width: '100%' }}>
                    {examTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
                    Only real exam types found in your {selectedYear} records are listed — pick whichever one represents your final/annual result.
                  </p>
                </div>
                <button onClick={loadReview} disabled={loading}
                  style={{ width: '100%', padding: 12, background: loading ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {loading ? 'Loading...' : 'Load students for review →'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Review */}
        {step === 'review' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1, background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#6AAA90' }}>{summary.promoted}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Promoted</p>
              </div>
              <div style={{ flex: 1, background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#E05A5A' }}>{summary.retained}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Retained</p>
              </div>
              <div style={{ flex: 1, background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.2)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#E8A020' }}>{summary.graduated}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Graduated</p>
              </div>
            </div>

            <div style={S.card}>
              {students.map((row) => {
                const cfg = DECISION_CONFIG[row.decision];
                return (
                  <div key={row.student.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{row.student.full_name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                          {row.student.sid} · {row.currentClass?.class_name}{row.student.section ? `-${row.student.section}` : ''}
                          {row.marksCount > 0 ? ` · ${row.marksCount - row.failCount}/${row.marksCount} passed` : ' · No marks'}
                          {row.avgPct !== null ? ` · avg ${row.avgPct}%` : ''}
                        </p>
                      </div>
                      <select value={row.decision}
                        onChange={(e) => updateDecision(row.student.id, e.target.value, row.reason)}
                        style={{ ...S.select, fontSize: 12, padding: '6px 10px', color: cfg.color, borderColor: `${cfg.color}40` }}>
                        {Object.entries(DECISION_CONFIG).map(([key, c]) => <option key={key} value={key}>{c.label}</option>)}
                      </select>
                    </div>
                    <input
                      value={row.reason}
                      onChange={(e) => updateDecision(row.student.id, row.decision, e.target.value)}
                      placeholder="Reason (required for Retain, or any manual override)"
                      style={{ ...S.input, width: '100%', fontSize: 12, padding: '7px 10px' }}
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('setup')}
                style={{ flex: 1, padding: 12, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                ← Back
              </button>
              <button onClick={executeBatch} disabled={!isPrincipal || executing}
                style={{ flex: 2, padding: 12, border: 'none', borderRadius: 8, background: !isPrincipal || executing ? 'rgba(255,255,255,0.08)' : '#E8A020', color: !isPrincipal || executing ? 'rgba(255,255,255,0.3)' : '#111113', fontWeight: 700, cursor: !isPrincipal || executing ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                {executing ? 'Executing...' : !isPrincipal ? '🔒 Principal approval required' : `✓ Execute promotion (${students.length} students)`}
              </button>
            </div>
          </>
        )}

        {/* History */}
        {step === 'history' && (
          <>
            <button onClick={() => setStep('setup')}
              style={{ marginBottom: 16, padding: '8px 14px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
              ← New promotion
            </button>
            {batches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: '#161618', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>📋</p>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No promotion batches yet.</p>
              </div>
            ) : (
              batches.map((b) => (
                <div key={b.id} style={{ ...S.card, opacity: b.status === 'reverted' ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>
                        {b.from_academic_year} → {b.to_academic_year}
                        {b.status === 'reverted' && <span style={{ marginLeft: 8, fontSize: 11, color: '#E05A5A' }}>REVERTED</span>}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        {new Date(b.executed_at).toLocaleString('en-IN')} · {b.counts.promoted || 0} promoted · {b.counts.retained || 0} retained · {b.counts.graduated || 0} graduated
                      </p>
                    </div>
                    {b.status === 'completed' && (
                      <button onClick={() => undoBatch(b.id)} disabled={!isPrincipal}
                        style={{ padding: '7px 14px', border: '1px solid rgba(224,90,90,0.3)', color: isPrincipal ? '#E05A5A' : 'rgba(224,90,90,0.3)', background: 'transparent', borderRadius: 7, cursor: isPrincipal ? 'pointer' : 'not-allowed', fontSize: 12, fontFamily: 'inherit', flexShrink: 0 }}>
                        {isPrincipal ? 'Undo' : '🔒 Undo'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

      </div>

      <SchoolNav />
      <BugReporter screenName="promote_students" />
    </div>
  );
}
