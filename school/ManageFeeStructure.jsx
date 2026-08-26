// school/ManageFeeStructure.jsx — NEW
// Closes a real, confirmed gap: fee_dues has never had any way to be
// created — fee_structure and fee_dues.fee_structure_id both already
// existed as real, empty infrastructure, with zero UI anywhere.
// Verified real schema before writing this: fee_structure(id, app_id,
// class_id [nullable = applies to all classes], fee_type, amount,
// due_date, academic_year); fee_dues(id, student_id, fee_structure_id,
// fee_type, amount_due, amount_paid, due_date, status).
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

function currency(n) { return `\u20b9${Number(n || 0).toLocaleString('en-IN')}`; }

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
};

export default function ManageFeeStructure() {
  const { tenant } = useTenant();
  const [classes, setClasses] = useState([]);
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    fee_type: '', amount: '', due_date: '', class_id: '',
    academic_year: `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}`,
  });

  useEffect(() => {
    if (tenant?.appId) { loadClasses(); loadStructures(); }
  }, [tenant?.appId]);

  async function loadClasses() {
    const { data } = await supabase.from('classes').select('id, class_name').eq('app_id', tenant.appId).order('class_order');
    setClasses(data || []);
  }

  async function loadStructures() {
    setLoading(true);
    const { data } = await supabase
      .from('fee_structure').select('id, fee_type, amount, due_date, academic_year, class_id, classes(class_name)')
      .eq('app_id', tenant.appId).order('created_at', { ascending: false });
    setStructures(data || []);
    setLoading(false);
  }

  async function createStructureAndGenerateDues() {
    if (!form.fee_type.trim() || !form.amount) {
      setMessage('Fee type and amount are required.');
      return;
    }

    // Guard against accidentally creating the same fee twice — the
    // database constraint on fee_dues prevents duplicate dues per
    // student for the SAME fee_structure_id, but each click here
    // creates a NEW fee_structure row, so that constraint alone
    // wouldn't catch someone re-entering the identical fee next month
    // thinking it's new.
    const existing = structures.find((s) =>
      s.fee_type.trim().toLowerCase() === form.fee_type.trim().toLowerCase() &&
      (s.class_id || null) === (form.class_id || null) &&
      s.academic_year === form.academic_year
    );
    if (existing && !window.confirm(`"${form.fee_type}" already exists for ${existing.classes?.class_name || 'all classes'} in ${form.academic_year}. Create another one anyway?`)) {
      return;
    }

    setSaving(true);
    setMessage('');

    const { data: structure, error: structErr } = await supabase
      .from('fee_structure')
      .insert({
        app_id: tenant.appId,
        class_id: form.class_id || null, // null = applies to all classes
        fee_type: form.fee_type.trim(),
        amount: Number(form.amount),
        due_date: form.due_date || null,
        academic_year: form.academic_year,
      })
      .select().single();

    if (structErr) {
      setSaving(false);
      setMessage('Failed to create fee structure.');
      return;
    }

    // Bulk-generate one fee_dues row per matching active student —
    // this is the step that was completely missing before: fee_dues
    // could be read everywhere but never actually created anywhere.
    let studentQuery = supabase.from('students').select('id').eq('app_id', tenant.appId).eq('status', 'active');
    if (form.class_id) studentQuery = studentQuery.eq('class_id', form.class_id);
    const { data: students } = await studentQuery;

    if (!students || students.length === 0) {
      setSaving(false);
      setMessage('Fee structure created, but no active students matched to generate dues for.');
      setForm({ fee_type: '', amount: '', due_date: '', class_id: '', academic_year: form.academic_year });
      loadStructures();
      return;
    }

    const dueRows = students.map((s) => ({
      student_id: s.id,
      fee_structure_id: structure.id,
      fee_type: form.fee_type.trim(),
      amount_due: Number(form.amount),
      due_date: form.due_date || null,
      status: 'pending',
    }));

    // Upsert, not insert — the new unique constraint on
    // (student_id, fee_structure_id) means a genuine re-run for the
    // same fee_structure_id updates cleanly instead of erroring out.
    const { error: duesErr } = await supabase.from('fee_dues').upsert(dueRows, { onConflict: 'student_id,fee_structure_id' });
    setSaving(false);

    if (duesErr) {
      setMessage(`Fee structure created, but generating dues failed: ${duesErr.message}`);
      loadStructures();
      return;
    }

    setMessage(`✅ Created and generated dues for ${students.length} students`);
    setForm({ fee_type: '', amount: '', due_date: '', class_id: '', academic_year: form.academic_year });
    loadStructures();
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Setup</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Fee Structure</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
            Define a fee once — this generates the actual due for every matching student, which then shows up in Fee Collection.
          </p>
        </div>

        {message && (
          <div style={{ background: message.startsWith('✅') ? 'rgba(106,170,144,0.08)' : 'rgba(224,90,90,0.08)', border: `1px solid ${message.startsWith('✅') ? 'rgba(106,170,144,0.2)' : 'rgba(224,90,90,0.2)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: message.startsWith('✅') ? '#6AAA90' : '#E05A5A' }}>
            {message}
          </div>
        )}

        <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
          <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>Create a fee</p>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Fee type *</label>
            <input value={form.fee_type} onChange={(e) => setForm((f) => ({ ...f, fee_type: e.target.value }))} placeholder="e.g. Tuition Fee - Term 1" style={S.input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Amount (₹) *</label>
              <input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/\D/g, '') }))} placeholder="15000" style={S.input} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Due date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} style={S.input} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Applies to</label>
            <select value={form.class_id} onChange={(e) => setForm((f) => ({ ...f, class_id: e.target.value }))} style={{ ...S.input, cursor: 'pointer' }}>
              <option value="">All classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name} only</option>)}
            </select>
          </div>
          <button onClick={createStructureAndGenerateDues} disabled={saving}
            style={{ width: '100%', padding: 12, border: 'none', borderRadius: 8, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            {saving ? 'Creating and generating dues...' : '+ Create & generate dues'}
          </button>
        </div>

        {!loading && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
              Existing fee structures ({structures.length})
            </p>
            {structures.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>No fee structures created yet.</p>
            ) : (
              structures.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: '#fff' }}>{s.fee_type}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{s.classes?.class_name || 'All classes'} · {s.academic_year}</p>
                  </div>
                  <span style={{ fontSize: 13, color: '#E8A020', fontWeight: 600 }}>{currency(s.amount)}</span>
                </div>
              ))
            )}
          </div>
        )}

      </div>
      <SchoolNav />
      <BugReporter screenName="manage_fee_structure" />
    </div>
  );
}
