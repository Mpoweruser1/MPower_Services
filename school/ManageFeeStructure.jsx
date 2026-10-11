// school/ManageFeeStructure.jsx — UPDATED (fee categories, who the fee applies to, rate-based fees, edit / turn off)
// A fee is defined once here; "Generate dues" then creates the due for every matching student.
// The amount can be fixed, or worked out per student: hostel fee by room type + sharing, transport fee by distance.
// Concessions (set on the student's page) are applied automatically. A due that already has a payment is never changed.
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';
import { findDuplicateFeeStructure } from '../shared/feeStructureLogic';

function currency(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }

const CATEGORIES = [
  ['tuition', 'Tuition'], ['admission', 'Admission'], ['hostel', 'Hostel'], ['transport', 'Transport'],
  ['computer', 'Computer lab'], ['exam', 'Exam'], ['books_uniform', 'Books & uniform'], ['activities', 'Activities'], ['other', 'Other'],
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);
const FREQUENCIES = [['one_time', 'One time'], ['monthly', 'Monthly'], ['term', 'Per term'], ['yearly', 'Yearly']];
const FREQUENCY_LABEL = Object.fromEntries(FREQUENCIES);
const APPLIES = [['all', 'All students'], ['hostel', 'Hostel students only'], ['day_scholar', 'Day scholars only'], ['transport', 'Students on transport']];
const APPLIES_LABEL = Object.fromEntries(APPLIES);
const PRICING = [['fixed', 'Fixed amount'], ['hostel_room', 'By hostel room type & sharing'], ['transport_distance', 'By distance from school']];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' },
};

function currentAcademicYear() {
  const d = new Date();
  // Indian academic year starts in April: Oct 2026 is 2026-27, Feb 2027 is still 2026-27.
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}
const EMPTY_FORM = () => ({
  fee_type: '', category: 'tuition', frequency: 'one_time', applies_to: 'all', pricing: 'fixed',
  amount: '', due_date: '', class_id: '', academic_year: currentAcademicYear(),
});

export default function ManageFeeStructure() {
  const { tenant } = useTenant();
  const [classes, setClasses] = useState([]);
  const [structures, setStructures] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(EMPTY_FORM());
  const [preview, setPreview] = useState(null); // { id, name, result }
  const [editing, setEditing] = useState(null); // { id, fee_type, amount, due_date, pricing }
  const [showGaps, setShowGaps] = useState(false);

  useEffect(() => { if (tenant?.appId) { loadClasses(); loadStructures(); loadGaps(); } }, [tenant?.appId]);

  async function loadClasses() {
    const { data } = await supabase.from('classes').select('id, class_name').eq('app_id', tenant.appId).order('class_order');
    setClasses(data || []);
  }

  async function loadStructures() {
    setLoading(true);
    const { data, error } = await supabase.from('fee_structure')
      .select('id, fee_type, amount, due_date, academic_year, class_id, category, frequency, applies_to, pricing, active, classes(class_name)')
      .eq('app_id', tenant.appId).order('created_at', { ascending: false });
    if (error) { console.error('Loading fee structures failed:', error); setMessage(error.message || 'Could not load fees.'); }
    setStructures(data || []);
    setLoading(false);
  }

  async function loadGaps() {
    const { data, error } = await supabase.rpc('school_fee_setup_gaps');
    if (error) { console.error('Loading fee setup gaps failed:', error); return; }
    setGaps(data || []);
  }

  function setPricing(pricing) {
    setForm((f) => ({
      ...f, pricing,
      applies_to: pricing === 'hostel_room' ? 'hostel' : pricing === 'transport_distance' ? 'transport' : f.applies_to,
      category: pricing === 'hostel_room' ? 'hostel' : pricing === 'transport_distance' ? 'transport' : f.category,
    }));
  }

  async function runPreview(structureId, name) {
    const { data, error } = await supabase.rpc('generate_fee_dues', { p_structure: structureId, p_dry_run: true });
    if (error) { console.error('Fee preview failed:', error); setMessage(error.message || 'Could not work out the dues.'); return false; }
    setPreview({ id: structureId, name, result: data });
    return true;
  }

  async function createFee() {
    setMessage('');
    if (!form.fee_type.trim()) { setMessage('Fee name is required.'); return; }
    if (form.pricing === 'fixed' && (!form.amount || Number(form.amount) <= 0)) { setMessage('Enter the amount.'); return; }

    const existing = findDuplicateFeeStructure(structures, form);
    if (existing && !window.confirm(`"${form.fee_type}" already exists for ${existing.classes?.class_name || 'all classes'} in ${form.academic_year}. Create another one anyway?`)) return;

    setSaving(true);
    const { data: structure, error } = await supabase.from('fee_structure').insert({
      app_id: tenant.appId,
      class_id: form.class_id || null,
      fee_type: form.fee_type.trim(),
      amount: form.pricing === 'fixed' ? Number(form.amount) : 0,
      due_date: form.due_date || null,
      academic_year: form.academic_year,
      category: form.category, frequency: form.frequency, applies_to: form.applies_to, pricing: form.pricing,
    }).select().single();
    if (error) {
      console.error('Creating fee failed:', error);
      setSaving(false);
      setMessage(error.message || 'Failed to create the fee.');
      return;
    }
    setForm(EMPTY_FORM());
    await loadStructures();
    await runPreview(structure.id, structure.fee_type);
    setSaving(false);
  }

  async function confirmGenerate() {
    setSaving(true);
    const { data, error } = await supabase.rpc('generate_fee_dues', { p_structure: preview.id, p_dry_run: false });
    setSaving(false);
    if (error) { console.error('Generating dues failed:', error); setMessage(error.message || 'Generating dues failed.'); return; }
    setMessage(`✅ Dues generated for ${data.billed} student${data.billed === 1 ? '' : 's'} — ${currency(data.total)} in total${data.skipped.length ? `. ${data.skipped.length} skipped (see below).` : '.'}`);
    setPreview({ ...preview, result: data, done: true });
    loadGaps();
  }

  async function toggleActive(s) {
    const { error } = await supabase.from('fee_structure').update({ active: !s.active }).eq('id', s.id);
    if (error) { console.error('Toggling fee failed:', error); setMessage(error.message || 'Could not update the fee.'); return; }
    loadStructures();
  }

  async function saveEdit() {
    if (!editing.fee_type.trim()) { setMessage('Fee name is required.'); return; }
    if (editing.pricing === 'fixed' && (!editing.amount || Number(editing.amount) <= 0)) { setMessage('Enter the amount.'); return; }
    const patch = { fee_type: editing.fee_type.trim(), due_date: editing.due_date || null };
    if (editing.pricing === 'fixed') patch.amount = Number(editing.amount);
    const { error } = await supabase.from('fee_structure').update(patch).eq('id', editing.id);
    if (error) { console.error('Editing fee failed:', error); setMessage(error.message || 'Could not save the change.'); return; }
    setEditing(null);
    setMessage('✅ Saved. Use "Update dues" on this fee to apply it to students who have not paid yet.');
    loadStructures();
  }

  const msgOk = message.startsWith('✅');
  const needsHostelSetup = (preview?.result?.skipped || []).some((x) => /room|sharing/i.test(x.reason));
  const needsDistanceSetup = (preview?.result?.skipped || []).some((x) => /distance|km/i.test(x.reason));

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Setup</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Fee Structure</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
            Define a fee once — it creates the due for every matching student, which then shows up in Fee Collection.
          </p>
        </div>

        {message && (
          <div role="status" style={{ background: msgOk ? 'rgba(106,170,144,0.08)' : 'rgba(224,90,90,0.08)', border: `1px solid ${msgOk ? 'rgba(106,170,144,0.2)' : 'rgba(224,90,90,0.2)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: msgOk ? '#6AAA90' : '#E05A5A' }}>
            {message}
          </div>
        )}

        {gaps.length > 0 && (
          <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.25)', background: 'rgba(232,160,32,0.05)' }}>
            <button onClick={() => setShowGaps((v) => !v)} style={{ background: 'none', border: 'none', color: '#E8A020', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit', textAlign: 'left' }}>
              ⚠ {gaps.length} student{gaps.length === 1 ? '' : 's'} need setup before hostel / transport fees can be worked out {showGaps ? '▲' : '▼'}
            </button>
            {showGaps && (
              <div style={{ marginTop: 10 }}>
                {gaps.slice(0, 40).map((g) => (
                  <div key={`${g.kind}-${g.student_id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '5px 0', color: 'rgba(255,255,255,0.7)' }}>
                    <span>{g.name} <span style={{ color: 'rgba(255,255,255,0.35)' }}>({g.sid})</span></span>
                    <span style={{ color: '#E8A020', textAlign: 'right' }}>{g.kind === 'hostel' ? 'Hostel' : 'Transport'}: {g.reason}</span>
                  </div>
                ))}
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '10px 0 0' }}>
                  Hostel: set room types and put students in rooms on the <Link to="/school/hostel" style={{ color: '#5A9ADF' }}>Hostel</Link> screen. Transport: add distance bands on the <Link to="/school/transport" style={{ color: '#5A9ADF' }}>Transport</Link> screen and enter each student's distance on their <Link to="/school/student" style={{ color: '#5A9ADF' }}>student page</Link>.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Create */}
        <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
          <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>Create a fee</p>

          <div style={{ marginBottom: 10 }}>
            <label htmlFor="fee-struct-fee-type" style={S.label}>Fee name *</label>
            <input id="fee-struct-fee-type" name="fee-struct-fee-type" value={form.fee_type} onChange={(e) => setForm((f) => ({ ...f, fee_type: e.target.value }))} placeholder="e.g. Tuition Fee - Term 1" style={S.input} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label htmlFor="fee-struct-category" style={S.label}>Category</label>
              <select id="fee-struct-category" name="fee-struct-category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ ...S.input, cursor: 'pointer' }}>
                {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fee-struct-frequency" style={S.label}>How often</label>
              <select id="fee-struct-frequency" name="fee-struct-frequency" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} style={{ ...S.input, cursor: 'pointer' }}>
                {FREQUENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label htmlFor="fee-struct-pricing" style={S.label}>How the amount is set</label>
            <select id="fee-struct-pricing" name="fee-struct-pricing" value={form.pricing} onChange={(e) => setPricing(e.target.value)} style={{ ...S.input, cursor: 'pointer' }}>
              {PRICING.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {form.pricing === 'hostel_room' && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '6px 0 0' }}>Each hostel student is charged the rate for their own room type and sharing (set on the Hostel screen).</p>}
            {form.pricing === 'transport_distance' && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '6px 0 0' }}>Each student on transport is charged the rate for their distance band (set on the Transport screen).</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {form.pricing === 'fixed' ? (
              <div>
                <label htmlFor="fee-struct-amount" style={S.label}>Amount (₹) *</label>
                <input id="fee-struct-amount" name="fee-struct-amount" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/\D/g, '') }))} placeholder="15000" inputMode="numeric" style={S.input} />
              </div>
            ) : (
              <div>
                <label style={S.label}>Amount</label>
                <p style={{ margin: 0, padding: '10px 0', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>From the rate list</p>
              </div>
            )}
            <div>
              <label htmlFor="fee-struct-due-date" style={S.label}>Due date</label>
              <input id="fee-struct-due-date" name="fee-struct-due-date" type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} style={S.input} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label htmlFor="fee-struct-class-id" style={S.label}>Class</label>
              <select id="fee-struct-class-id" name="fee-struct-class-id" value={form.class_id} onChange={(e) => setForm((f) => ({ ...f, class_id: e.target.value }))} style={{ ...S.input, cursor: 'pointer' }}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name} only</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fee-struct-applies" style={S.label}>Charged to</label>
              <select id="fee-struct-applies" name="fee-struct-applies" value={form.applies_to} disabled={form.pricing !== 'fixed'}
                onChange={(e) => setForm((f) => ({ ...f, applies_to: e.target.value }))} style={{ ...S.input, cursor: form.pricing === 'fixed' ? 'pointer' : 'not-allowed', opacity: form.pricing === 'fixed' ? 1 : 0.6 }}>
                {APPLIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>

          <button onClick={createFee} disabled={saving}
            style={{ width: '100%', padding: 12, border: 'none', borderRadius: 8, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            {saving ? 'Working...' : 'Create fee & preview dues'}
          </button>
        </div>

        {/* Preview of the dues before they are created */}
        {preview && (
          <div style={{ ...S.card, border: '1px solid rgba(90,154,223,0.3)' }}>
            <p style={{ fontSize: 12, color: '#5A9ADF', fontWeight: 600, margin: '0 0 10px' }}>
              {preview.done ? 'Dues generated' : 'Preview'} — {preview.name}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              {[
                ['Students matched', preview.result.matched],
                [preview.done ? 'Billed' : 'Will be billed', preview.result.billed],
                ['Total', currency(preview.result.total)],
              ].map(([l, v]) => (
                <div key={l} style={{ background: '#111113', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{v}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{l}</p>
                </div>
              ))}
            </div>
            {preview.result.with_concession > 0 && <p style={{ fontSize: 12, color: '#6AAA90', margin: '0 0 6px' }}>{preview.result.with_concession} student{preview.result.with_concession === 1 ? '' : 's'} get a concession.</p>}
            {preview.result.kept_paid > 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '0 0 6px' }}>{preview.result.kept_paid} already have a payment and are left as they are.</p>}

            {preview.result.skipped.length > 0 && (
              <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.2)', borderRadius: 8, padding: 10, margin: '8px 0' }}>
                <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: '#E8A020' }}>{preview.result.skipped.length} not billed — their amount cannot be worked out yet</p>
                {preview.result.skipped.slice(0, 30).map((x) => (
                  <div key={x.student_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '3px 0', color: 'rgba(255,255,255,0.7)' }}>
                    <span>{x.name} ({x.sid})</span><span style={{ color: '#E8A020', textAlign: 'right' }}>{x.reason}</span>
                  </div>
                ))}
                {needsHostelSetup && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '8px 0 0' }}>Fix these on the <Link to="/school/hostel" style={{ color: '#5A9ADF' }}>Hostel</Link> screen, then use "Update dues" on this fee.</p>}
                {needsDistanceSetup && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '8px 0 0' }}>Add distance bands on <Link to="/school/transport" style={{ color: '#5A9ADF' }}>Transport</Link> and each student's distance on their student page, then use "Update dues" on this fee.</p>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => setPreview(null)} style={{ flex: 1, padding: 10, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                {preview.done ? 'Close' : 'Not now'}
              </button>
              {!preview.done && (
                <button onClick={confirmGenerate} disabled={saving || preview.result.billed === 0}
                  style={{ flex: 2, padding: 10, border: 'none', borderRadius: 8, background: (saving || preview.result.billed === 0) ? 'rgba(255,255,255,0.08)' : '#6AAA90', color: '#111113', fontWeight: 700, cursor: (saving || preview.result.billed === 0) ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                  {saving ? 'Generating...' : `Generate dues for ${preview.result.billed} student${preview.result.billed === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Existing fees */}
        {!loading && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
              Existing fees ({structures.length})
            </p>
            {structures.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>No fees created yet.</p>
            ) : (
              structures.map((s) => (
                <div key={s.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: s.active ? 1 : 0.55 }}>
                  {editing?.id === s.id ? (
                    <div>
                      <input aria-label="Fee name" value={editing.fee_type} onChange={(e) => setEditing((x) => ({ ...x, fee_type: e.target.value }))} style={{ ...S.input, marginBottom: 8 }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        {editing.pricing === 'fixed'
                          ? <input aria-label="Amount" inputMode="numeric" value={editing.amount} onChange={(e) => setEditing((x) => ({ ...x, amount: e.target.value.replace(/\D/g, '') }))} style={S.input} />
                          : <p style={{ margin: 0, padding: '10px 0', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Amount comes from the rate list</p>}
                        <input aria-label="Due date" type="date" value={editing.due_date || ''} onChange={(e) => setEditing((x) => ({ ...x, due_date: e.target.value }))} style={S.input} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setEditing(null)} style={{ flex: 1, padding: 9, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Cancel</button>
                        <button onClick={saveEdit} style={{ flex: 2, padding: 9, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, color: '#fff' }}>{s.fee_type}{!s.active && ' (off)'}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                            {CATEGORY_LABEL[s.category] || 'Other'} · {FREQUENCY_LABEL[s.frequency] || 'One time'} · {s.classes?.class_name || 'All classes'} · {APPLIES_LABEL[s.applies_to] || 'All students'} · {s.academic_year}
                          </p>
                        </div>
                        <span style={{ fontSize: 13, color: '#E8A020', fontWeight: 600, flexShrink: 0, textAlign: 'right' }}>
                          {s.pricing === 'fixed' ? currency(s.amount) : s.pricing === 'hostel_room' ? 'By room' : 'By distance'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {s.active && (
                          <button onClick={() => runPreview(s.id, s.fee_type)}
                            style={{ padding: '4px 10px', border: '1px solid rgba(90,154,223,0.3)', borderRadius: 6, background: 'transparent', color: '#5A9ADF', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Update dues</button>
                        )}
                        <button onClick={() => setEditing({ id: s.id, fee_type: s.fee_type, amount: String(s.amount), due_date: s.due_date, pricing: s.pricing })}
                          style={{ padding: '4px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Edit</button>
                        <button onClick={() => toggleActive(s)}
                          style={{ padding: '4px 10px', border: `1px solid ${s.active ? 'rgba(224,90,90,0.3)' : 'rgba(106,170,144,0.3)'}`, borderRadius: 6, background: 'transparent', color: s.active ? '#E05A5A' : '#6AAA90', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                          {s.active ? 'Turn off' : 'Turn on'}
                        </button>
                      </div>
                    </>
                  )}
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
