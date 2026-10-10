// controlpanel/WelfareSchemesAdmin.jsx — NEW (developer / support only)
// Add, edit, switch off and import the welfare schemes that the school
// admission screen, the patient registration screen and the citizen
// complaint screen show to parents / patients / citizens.
//
// Nothing here is pre-filled: every scheme (name, amount, who qualifies) is
// entered and checked by your team. The values for caste category, gender and
// religion are the SAME lists the admission form uses, so a scheme only
// matches a student when the words are identical — that is why these are
// tick-boxes and the CSV import rejects any other spelling.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import ControlPanelNav from '../shared/ControlPanelNav';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 760, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 10 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
};
const MUTED = 'rgba(255,255,255,0.6)';

// Same lists as the admission form and the welfare panel.
export const CASTE_CATEGORIES = ['OC', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'SC', 'ST', 'EWS', 'Other'];
export const GENDERS = ['Male', 'Female', 'Other'];
export const RELIGIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other'];
export const MODULES = ['school', 'hospital'];
export const SCHEME_TYPES = [
  ['school_scholarship', 'Scholarship (school)'],
  ['school_hostel', 'Hostel (school)'],
  ['school_fee_reimbursement', 'Fee reimbursement (school)'],
  ['hospital_insurance', 'Health insurance'],
  ['hospital_govt_scheme', 'Government health scheme'],
  ['pension', 'Pension'],
  ['ration', 'Ration'],
  ['housing', 'Housing'],
  ['agriculture', 'Agriculture'],
  ['caste_corporation', 'Caste corporation'],
  ['grievance_welfare', 'Other welfare'],
];
const TYPE_KEYS = SCHEME_TYPES.map(([k]) => k);
const LEVELS = ['central', 'state'];

const EMPTY = {
  scheme_name: '', scheme_name_telugu: '', scheme_type: 'school_scholarship', scheme_level: 'state',
  applicable_module: [], eligible_caste_categories: [], eligible_genders: [], eligible_religions: [],
  max_annual_income: '', requires_govt_school: false, requires_75_attendance: false,
  benefit_description: '', benefit_description_telugu: '', benefit_amount_per_year: '',
  documents_required: '', apply_via: '', apply_via_telugu: '', scheme_url: '', is_active: true,
};

// CSV columns, in order. List columns use | between values.
export const CSV_COLUMNS = [
  'scheme_name', 'scheme_name_telugu', 'scheme_type', 'scheme_level', 'applicable_module',
  'eligible_caste_categories', 'eligible_genders', 'eligible_religions', 'max_annual_income',
  'requires_govt_school', 'requires_75_attendance', 'benefit_description', 'benefit_description_telugu',
  'benefit_amount_per_year', 'documents_required', 'apply_via', 'apply_via_telugu', 'scheme_url', 'is_active',
];

// ── CSV helpers ───────────────────────────────────────────────
export function parseCsv(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const list = (v) => String(v || '').split('|').map((x) => x.trim()).filter(Boolean);
const bool = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '') return null;
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return undefined; // not understood
};
const cleanUrl = (u) => String(u || '').trim().replace(/^https?:\/\//i, '');

// Turn one CSV row (object keyed by column) into a database row, or list problems.
export function validateRow(r) {
  const errs = [];
  const out = {};
  out.scheme_name = String(r.scheme_name || '').trim();
  if (!out.scheme_name) errs.push('scheme_name is required');
  out.scheme_name_telugu = String(r.scheme_name_telugu || '').trim() || null;

  out.scheme_type = String(r.scheme_type || '').trim();
  if (!TYPE_KEYS.includes(out.scheme_type)) errs.push(`scheme_type must be one of: ${TYPE_KEYS.join(', ')}`);

  out.scheme_level = String(r.scheme_level || '').trim().toLowerCase();
  if (!LEVELS.includes(out.scheme_level)) errs.push('scheme_level must be central or state');

  const check = (col, allowed) => {
    const vals = list(r[col]);
    const bad = vals.filter((v) => !allowed.includes(v));
    if (bad.length) errs.push(`${col}: "${bad.join('", "')}" not allowed — use only ${allowed.join(' | ')}`);
    return vals;
  };
  out.applicable_module = check('applicable_module', MODULES);
  if (!out.applicable_module.length) errs.push('applicable_module is required (school, hospital, or school|hospital)');
  out.eligible_caste_categories = check('eligible_caste_categories', CASTE_CATEGORIES);
  out.eligible_genders = check('eligible_genders', GENDERS);
  out.eligible_religions = check('eligible_religions', RELIGIONS);

  for (const col of ['max_annual_income', 'benefit_amount_per_year']) {
    const raw = String(r[col] ?? '').trim();
    if (raw === '') { out[col] = null; continue; }
    const n = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0) { errs.push(`${col} must be a number (no ₹ sign)`); out[col] = null; } else out[col] = n;
  }
  for (const col of ['requires_govt_school', 'requires_75_attendance']) {
    const b = bool(r[col]);
    if (b === undefined) errs.push(`${col} must be yes or no`);
    out[col] = b === true;
  }
  const act = bool(r.is_active);
  if (act === undefined) errs.push('is_active must be yes or no');
  out.is_active = act === null ? true : act;

  out.benefit_description = String(r.benefit_description || '').trim() || null;
  out.benefit_description_telugu = String(r.benefit_description_telugu || '').trim() || null;
  out.documents_required = list(r.documents_required);
  out.apply_via = String(r.apply_via || '').trim() || null;
  out.apply_via_telugu = String(r.apply_via_telugu || '').trim() || null;
  out.scheme_url = cleanUrl(r.scheme_url) || null;
  return { row: out, errs };
}

// Form state -> database row.
function formToRow(f) {
  return {
    scheme_name: f.scheme_name.trim(),
    scheme_name_telugu: f.scheme_name_telugu.trim() || null,
    scheme_type: f.scheme_type,
    scheme_level: f.scheme_level,
    applicable_module: f.applicable_module,
    eligible_caste_categories: f.eligible_caste_categories,
    eligible_genders: f.eligible_genders,
    eligible_religions: f.eligible_religions,
    max_annual_income: f.max_annual_income === '' ? null : Number(f.max_annual_income),
    requires_govt_school: !!f.requires_govt_school,
    requires_75_attendance: !!f.requires_75_attendance,
    benefit_description: f.benefit_description.trim() || null,
    benefit_description_telugu: f.benefit_description_telugu.trim() || null,
    benefit_amount_per_year: f.benefit_amount_per_year === '' ? null : Number(f.benefit_amount_per_year),
    documents_required: f.documents_required.split('\n').map((x) => x.trim()).filter(Boolean),
    apply_via: f.apply_via.trim() || null,
    apply_via_telugu: f.apply_via_telugu.trim() || null,
    scheme_url: cleanUrl(f.scheme_url) || null,
    is_active: !!f.is_active,
  };
}
function rowToForm(r) {
  return {
    ...EMPTY, ...r,
    scheme_name_telugu: r.scheme_name_telugu || '', applicable_module: r.applicable_module || [],
    eligible_caste_categories: r.eligible_caste_categories || [], eligible_genders: r.eligible_genders || [],
    eligible_religions: r.eligible_religions || [],
    max_annual_income: r.max_annual_income ?? '', benefit_amount_per_year: r.benefit_amount_per_year ?? '',
    benefit_description: r.benefit_description || '', benefit_description_telugu: r.benefit_description_telugu || '',
    documents_required: (r.documents_required || []).join('\n'), apply_via: r.apply_via || '',
    apply_via_telugu: r.apply_via_telugu || '', scheme_url: r.scheme_url || '',
  };
}

function Ticks({ label, hint, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={S.label}>{label}</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <label key={o} style={{ padding: '6px 12px', borderRadius: 16, cursor: 'pointer', fontSize: 13, border: `1px solid ${on ? 'rgba(232,160,32,0.5)' : 'rgba(255,255,255,0.12)'}`, background: on ? 'rgba(232,160,32,0.1)' : 'transparent', color: on ? '#E8A020' : MUTED }}>
              <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} style={{ display: 'none' }} />
              {o}
            </label>
          );
        })}
      </div>
      {hint && <p style={{ margin: '6px 0 0', fontSize: 12, color: MUTED }}>{hint}</p>}
    </div>
  );
}

export default function WelfareSchemesAdmin() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('list'); // list | form | import
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState('all');
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const isStaff = !!tenant && ['developer', 'support'].includes(tenant.role);
  useEffect(() => { if (isStaff) load(); }, [isStaff]);

  async function load() {
    setLoading(true); setErr('');
    const { data, error } = await supabase.from('master_welfare_schemes').select('*').order('scheme_type').order('scheme_name');
    if (error) setErr(`Could not load schemes: ${error.message}`);
    setRows(data || []);
    setLoading(false);
  }

  const shown = useMemo(() => rows.filter((r) =>
    filter === 'all' ? true : filter === 'off' ? !r.is_active : (r.applicable_module || []).includes(filter)), [rows, filter]);

  function startNew() { setEditId(null); setForm(EMPTY); setErr(''); setMsg(''); setMode('form'); }
  function startEdit(r) { setEditId(r.id); setForm(rowToForm(r)); setErr(''); setMsg(''); setMode('form'); }
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setErr(''); setMsg('');
    if (!form.scheme_name.trim()) { setErr('Scheme name is required.'); return; }
    if (!form.applicable_module.length) { setErr('Tick at least one place to show this scheme (School or Hospital) — otherwise nobody will see it.'); return; }
    if (form.max_annual_income !== '' && !(Number(form.max_annual_income) >= 0)) { setErr('Income limit must be a number.'); return; }
    if (form.benefit_amount_per_year !== '' && !(Number(form.benefit_amount_per_year) >= 0)) { setErr('Benefit amount must be a number.'); return; }
    setBusy(true);
    const row = formToRow(form);
    const q = editId
      ? supabase.from('master_welfare_schemes').update(row).eq('id', editId)
      : supabase.from('master_welfare_schemes').insert(row);
    const { error } = await q;
    setBusy(false);
    if (error) { setErr(error.message || 'Could not save. Please try again.'); return; }
    setMsg(editId ? 'Scheme updated.' : 'Scheme added.');
    setMode('list');
    load();
  }

  async function toggle(r) {
    setErr('');
    const { error } = await supabase.from('master_welfare_schemes').update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) { setErr(error.message); return; }
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: !r.is_active } : x)));
  }

  async function remove(r) {
    if (!window.confirm(`Delete "${r.scheme_name}"?\n\nThis also removes it from every student's scheme list. Use "Switch off" instead if you only want to hide it.`)) return;
    setErr('');
    const { error } = await supabase.from('master_welfare_schemes').delete().eq('id', r.id);
    if (error) { setErr(error.message); return; }
    setRows((prev) => prev.filter((x) => x.id !== r.id));
  }

  // ── CSV ──
  function downloadTemplate() {
    const blob = new Blob(['﻿' + CSV_COLUMNS.join(',') + '\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'welfare_schemes_template.csv';
    a.click();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(''); setMsg('');
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) { setErr('The file has no scheme rows. Use the template and fill in one scheme per row.'); setPreview(null); return; }
    const header = table[0].map((h) => h.trim());
    const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length) { setErr(`These columns are missing: ${missing.join(', ')}. Start from the template.`); setPreview(null); return; }
    const items = table.slice(1).map((cells, i) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = cells[idx] ?? ''; });
      const { row, errs } = validateRow(obj);
      const existing = rows.find((x) => x.scheme_name.trim().toLowerCase() === row.scheme_name.toLowerCase() && x.scheme_level === row.scheme_level);
      return { line: i + 2, row, errs, existingId: existing?.id || null };
    });
    // The same scheme twice in one file would be ambiguous.
    const seen = new Map();
    items.forEach((it) => {
      const key = `${it.row.scheme_name.toLowerCase()}|${it.row.scheme_level}`;
      if (it.row.scheme_name && seen.has(key)) it.errs.push(`same scheme as line ${seen.get(key)}`);
      else seen.set(key, it.line);
    });
    setPreview(items);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function runImport() {
    setBusy(true); setErr('');
    const toInsert = preview.filter((p) => !p.existingId).map((p) => p.row);
    const toUpdate = preview.filter((p) => p.existingId);
    if (toInsert.length) {
      const { error } = await supabase.from('master_welfare_schemes').insert(toInsert);
      if (error) { setBusy(false); setErr(`Import stopped: ${error.message}`); return; }
    }
    for (const u of toUpdate) {
      const { error } = await supabase.from('master_welfare_schemes').update(u.row).eq('id', u.existingId);
      if (error) { setBusy(false); setErr(`Import stopped at line ${u.line}: ${error.message}. Rows before it were saved.`); load(); return; }
    }
    setBusy(false);
    setMsg(`Imported: ${toInsert.length} added, ${toUpdate.length} updated.`);
    setPreview(null); setMode('list'); load();
  }

  if (tenantLoading) return <div style={S.page}><div style={S.inner}><p style={{ color: MUTED, fontSize: 13 }}>Loading…</p></div><ControlPanelNav /></div>;
  if (!isStaff) return <div style={S.page}><div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Control Panel access only.</p></div><ControlPanelNav /></div>;

  const btn = (primary) => ({ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', border: primary ? 'none' : '1px solid rgba(255,255,255,0.15)', background: primary ? '#E8A020' : 'transparent', color: primary ? '#111113' : 'rgba(255,255,255,0.7)' });
  const typeLabel = (k) => (SCHEME_TYPES.find(([x]) => x === k) || [k, k])[1];
  const bad = preview ? preview.filter((p) => p.errs.length > 0).length : 0;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <nav style={{ padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Welfare Schemes</p>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>Shown to parents, patients and citizens · you enter and check every detail</p>
      </nav>

      <div style={S.inner}>
        {err && <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#E05A5A' }}>⚠ {err}</div>}
        {msg && <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#6AAA90' }}>✓ {msg}</div>}

        {mode === 'list' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={startNew} style={btn(true)}>+ Add scheme</button>
              <button onClick={() => { setMode('import'); setPreview(null); setErr(''); setMsg(''); }} style={btn(false)}>Import from spreadsheet</button>
              <select id="welfare-filter" name="welfare-filter" aria-label="Filter schemes" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...S.input, width: 'auto', marginLeft: 'auto', padding: '8px 12px', fontSize: 12 }}>
                <option value="all">All schemes</option>
                <option value="school">School</option>
                <option value="hospital">Hospital</option>
                <option value="off">Switched off</option>
              </select>
            </div>
            {loading ? <p style={{ color: MUTED, fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading schemes...</p>
              : shown.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 14, color: MUTED }}>{rows.length === 0 ? 'No schemes yet. Add one, or import a filled spreadsheet.' : 'No schemes match this filter.'}</p>
                </div>
              ) : shown.map((r) => (
                <div key={r.id} style={{ ...S.card, opacity: r.is_active ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{r.scheme_name}</p>
                      {r.scheme_name_telugu && <p style={{ margin: '2px 0 0', fontSize: 13, color: MUTED }}>{r.scheme_name_telugu}</p>}
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: MUTED }}>
                        {typeLabel(r.scheme_type)} · {r.scheme_level === 'central' ? 'Central' : 'State'}
                        {(r.applicable_module || []).length ? ` · ${(r.applicable_module || []).join(', ')}` : ''}
                        {!r.is_active ? ' · SWITCHED OFF' : ''}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>
                        {(r.eligible_caste_categories || []).length ? `Caste: ${r.eligible_caste_categories.join(', ')}` : 'Any caste'}
                        {(r.eligible_genders || []).length ? ` · ${r.eligible_genders.join(', ')}` : ''}
                        {r.max_annual_income ? ` · income up to ₹${Number(r.max_annual_income).toLocaleString('en-IN')}` : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <button onClick={() => startEdit(r)} style={btn(false)}>Edit</button>
                      <button onClick={() => toggle(r)} style={btn(false)}>{r.is_active ? 'Switch off' : 'Switch on'}</button>
                      <button onClick={() => remove(r)} style={{ ...btn(false), color: '#E05A5A', borderColor: 'rgba(224,90,90,0.3)' }}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
          </>
        )}

        {mode === 'form' && (
          <div style={S.card}>
            <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>{editId ? 'Edit scheme' : 'Add scheme'}</p>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="ws-name" style={S.label}>Scheme name (English) *</label>
              <input id="ws-name" name="ws-name" value={form.scheme_name} onChange={(e) => set('scheme_name', e.target.value)} style={S.input} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="ws-name-te" style={S.label}>Scheme name (Telugu)</label>
              <input id="ws-name-te" name="ws-name-te" value={form.scheme_name_telugu} onChange={(e) => set('scheme_name_telugu', e.target.value)} style={S.input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label htmlFor="ws-type" style={S.label}>Type *</label>
                <select id="ws-type" name="ws-type" value={form.scheme_type} onChange={(e) => set('scheme_type', e.target.value)} style={S.input}>
                  {SCHEME_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ws-level" style={S.label}>Level *</label>
                <select id="ws-level" name="ws-level" value={form.scheme_level} onChange={(e) => set('scheme_level', e.target.value)} style={S.input}>
                  <option value="state">State</option><option value="central">Central</option>
                </select>
              </div>
            </div>
            <Ticks label="Shown in" options={MODULES} value={form.applicable_module} onChange={(v) => set('applicable_module', v)}
              hint="School = admission screen · Hospital = patient registration. Pension, ration, housing and similar schemes appear on citizen complaints by their type, so leave both unticked for those." />
            <Ticks label="Who qualifies — caste category" options={CASTE_CATEGORIES} value={form.eligible_caste_categories} onChange={(v) => set('eligible_caste_categories', v)} hint="Leave none ticked if every category qualifies." />
            <Ticks label="Who qualifies — gender" options={GENDERS} value={form.eligible_genders} onChange={(v) => set('eligible_genders', v)} hint="Leave none ticked if all qualify." />
            <Ticks label="Who qualifies — religion" options={RELIGIONS} value={form.eligible_religions} onChange={(v) => set('eligible_religions', v)} hint="Leave none ticked if all qualify." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label htmlFor="ws-income" style={S.label}>Income limit per year (₹)</label>
                <input id="ws-income" name="ws-income" type="number" min="0" value={form.max_annual_income} onChange={(e) => set('max_annual_income', e.target.value)} style={S.input} placeholder="Blank = no limit" />
              </div>
              <div>
                <label htmlFor="ws-amount" style={S.label}>Benefit per year (₹)</label>
                <input id="ws-amount" name="ws-amount" type="number" min="0" value={form.benefit_amount_per_year} onChange={(e) => set('benefit_amount_per_year', e.target.value)} style={S.input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, color: MUTED }}><input type="checkbox" checked={form.requires_govt_school} onChange={(e) => set('requires_govt_school', e.target.checked)} /> Government school only</label>
              <label style={{ fontSize: 13, color: MUTED }}><input type="checkbox" checked={form.requires_75_attendance} onChange={(e) => set('requires_75_attendance', e.target.checked)} /> Needs 75% attendance</label>
              <label style={{ fontSize: 13, color: MUTED }}><input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Switched on</label>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="ws-benefit" style={S.label}>What the family gets (English)</label>
              <textarea id="ws-benefit" name="ws-benefit" rows={2} value={form.benefit_description} onChange={(e) => set('benefit_description', e.target.value)} style={{ ...S.input, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="ws-benefit-te" style={S.label}>What the family gets (Telugu)</label>
              <textarea id="ws-benefit-te" name="ws-benefit-te" rows={2} value={form.benefit_description_telugu} onChange={(e) => set('benefit_description_telugu', e.target.value)} style={{ ...S.input, resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="ws-docs" style={S.label}>Documents needed (one per line)</label>
              <textarea id="ws-docs" name="ws-docs" rows={3} value={form.documents_required} onChange={(e) => set('documents_required', e.target.value)} style={{ ...S.input, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label htmlFor="ws-apply" style={S.label}>Where to apply (English)</label>
                <input id="ws-apply" name="ws-apply" value={form.apply_via} onChange={(e) => set('apply_via', e.target.value)} style={S.input} />
              </div>
              <div>
                <label htmlFor="ws-apply-te" style={S.label}>Where to apply (Telugu)</label>
                <input id="ws-apply-te" name="ws-apply-te" value={form.apply_via_telugu} onChange={(e) => set('apply_via_telugu', e.target.value)} style={S.input} />
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="ws-url" style={S.label}>Website</label>
              <input id="ws-url" name="ws-url" value={form.scheme_url} onChange={(e) => set('scheme_url', e.target.value)} style={S.input} placeholder="example.gov.in/scheme" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={busy} style={btn(true)}>{busy ? 'Saving…' : 'Save scheme'}</button>
              <button onClick={() => { setMode('list'); setErr(''); }} style={btn(false)}>Cancel</button>
            </div>
          </div>
        )}

        {mode === 'import' && (
          <div style={S.card}>
            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600 }}>Import from spreadsheet</p>
            <ol style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13, color: MUTED, lineHeight: 1.8 }}>
              <li>Download the template. It has the column headings and no schemes.</li>
              <li>Fill one scheme per row. Where a box takes several values, separate them with | (for example: SC|ST).</li>
              <li>Save as <strong>CSV UTF-8</strong> so Telugu letters stay correct.</li>
              <li>Choose the file. You will see every row checked before anything is saved.</li>
            </ol>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: MUTED, lineHeight: 1.7 }}>
              Allowed words — scheme_type: {TYPE_KEYS.join(', ')}. scheme_level: central or state. applicable_module: {MODULES.join(', ')}. caste: {CASTE_CATEGORIES.join(', ')}. gender: {GENDERS.join(', ')}. religion: {RELIGIONS.join(', ')}. Yes/no columns: yes or no. A scheme with the same name and level is updated instead of added twice.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button onClick={downloadTemplate} style={btn(false)}>Download template</button>
              <label style={{ ...btn(true), display: 'inline-block' }}>
                Choose filled CSV
                <input ref={fileRef} id="welfare-csv" name="welfare-csv" type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
              </label>
              <button onClick={() => { setMode('list'); setPreview(null); }} style={btn(false)}>Back</button>
            </div>

            {preview && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: bad ? '#E05A5A' : '#6AAA90', fontWeight: 600 }}>
                  {bad ? `${bad} row${bad > 1 ? 's have' : ' has'} a problem — fix the file and choose it again. Nothing has been saved.` : `All ${preview.length} rows are fine.`}
                </p>
                <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
                  {preview.map((p) => (
                    <div key={p.line} style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12 }}>
                      <span style={{ color: MUTED }}>Line {p.line} · </span>
                      <span style={{ color: '#fff' }}>{p.row.scheme_name || '(no name)'}</span>
                      {p.errs.length === 0 && <span style={{ color: p.existingId ? '#E8A020' : '#6AAA90' }}> · {p.existingId ? 'will update the existing scheme' : 'will be added'}</span>}
                      {p.errs.map((e, i) => <div key={i} style={{ color: '#E05A5A', marginTop: 2 }}>⚠ {e}</div>)}
                    </div>
                  ))}
                </div>
                <button onClick={runImport} disabled={busy || bad > 0} style={{ ...btn(true), opacity: bad > 0 ? 0.4 : 1 }}>
                  {busy ? 'Importing…' : `Import ${preview.length} scheme${preview.length > 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <ControlPanelNav />
      <BugReporter screenName="welfare_schemes_admin" />
    </div>
  );
}
