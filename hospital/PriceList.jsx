// hospital/PriceList.jsx — NEW
// One place where the hospital sets its own rates. Billing only READS this list.
// Only principal / doctor can change it (the database enforces the same rule).
// Categories: room (per ward, per day), daily extras, consultations, lab tests, procedures, other.
// Rates that the system pre-loaded are marked "sample" until the hospital changes them or presses
// "These rates are correct" (needs fix_hospital_default_rates.sql; without it nothing is marked).
// "Change all rates by %" (needs fix_hospital_price_adjust.sql): preview, tick what to change, apply.
// Each ward's room row also holds the deposit usually asked at admission (needs fix_hospital_deposits.sql;
// without it the deposit box is not shown).
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import BugReporter from '../shared/BugReporter';

const TABS = [
  { k: 'room',         label: 'Rooms',         hint: 'Rate per day for each ward. Used to work out room charges from admission to discharge.' },
  { k: 'daily_extra',  label: 'Daily extras',  hint: 'Charges added for every day of stay, e.g. nursing, doctor visit, monitoring.' },
  { k: 'consultation', label: 'Consultations', hint: 'Doctor consultation fees.' },
  { k: 'lab',          label: 'Lab tests',     hint: 'Lab and diagnostic test rates.' },
  { k: 'procedure',    label: 'Procedures',    hint: 'Surgeries, dressings, injections and other procedures.' },
  { k: 'other',        label: 'Other',         hint: 'Anything else you bill for.' },
];
// Kinds of ward (as set in Manage Wards) — used to pick a group of wards for a percentage change.
const KIND_LABEL = {
  general: 'General wards', semi_private: 'Semi-private / twin sharing wards', private: 'Private rooms',
  icu: 'ICU / HDU / critical care wards', emergency: 'Emergency wards', isolation: 'Isolation wards',
  day_care: 'Day care wards', maternity: 'Maternity wards', pediatric: 'Pediatric wards', other: 'Other wards',
};
const GST_OPTIONS = [0, 5, 12, 18];
const OWNER_ROLES = ['principal', 'doctor'];

function currency(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }
function cleanMoney(v) {
  const s = String(v).replace(/[^\d.]/g, '');
  const parts = s.split('.');
  return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}` : s;
}

function cleanPercent(v) {
  const s = String(v).replace(/[^\d.-]/g, '');
  const neg = s.startsWith('-');
  const body = s.replace(/-/g, '');
  const parts = body.split('.');
  const num = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}` : body;
  return (neg ? '-' : '') + num;
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
};

function SampleBadge() {
  return <span title="Pre-loaded sample — check this rate" style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: 'rgba(232,160,32,0.14)', color: '#E8A020' }}>sample</span>;
}

export default function PriceList() {
  const { tenant } = useTenant();
  const canEdit = OWNER_ROLES.includes(tenant?.role);

  const [tab, setTab] = useState('room');
  const [items, setItems] = useState([]);
  const [wards, setWards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState({ name: '', rate: '', gst_rate: 0 });
  const [editing, setEditing] = useState(null); // { id, rate, gst_rate, name }
  const [roomDrafts, setRoomDrafts] = useState({}); // ward_id -> { rate, gst_rate, deposit }
  const [depositsReady, setDepositsReady] = useState(false);

  // change many rates by a percentage: the panel, the preview from the database, what is ticked
  const [adjOpen, setAdjOpen] = useState(false);
  const [adj, setAdj] = useState({ percent: '', round: '1', scope: 'all' });
  const [adjPreview, setAdjPreview] = useState(null); // [{ item_id, item_name, old_rate, new_rate }]
  const [adjTicked, setAdjTicked] = useState({});      // item_id -> true
  const [adjBusy, setAdjBusy] = useState(false);
  const [adjError, setAdjError] = useState('');

  useEffect(() => { if (tenant?.appId) load(); }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    setLoadError('');
    const LIST_COLS = [
      'id, category, name, rate, gst_rate, ward_id, active, sort_order, is_sample, deposit',
      'id, category, name, rate, gst_rate, ward_id, active, sort_order, is_sample',
      'id, category, name, rate, gst_rate, ward_id, active, sort_order',
    ];
    const readList = (cols) => supabase.from('hospital_price_list').select(cols)
      .eq('app_id', tenant.appId).order('sort_order').order('name');
    const [listResFull, wardResFull] = await Promise.all([
      readList(LIST_COLS[0]),
      supabase.from('wards').select('id, ward_type, total_beds, ward_kind, is_ac').eq('app_id', tenant.appId).order('ward_type'),
    ]);
    // 42703 = a column that is not there yet: read the list without the newest one
    // (deposit = fix_hospital_deposits.sql, is_sample = fix_hospital_default_rates.sql)
    let listRes = listResFull;
    let ladder = 0;
    while (listRes.error?.code === '42703' && ladder < LIST_COLS.length - 1) {
      ladder += 1;
      listRes = await readList(LIST_COLS[ladder]);
    }
    setDepositsReady(ladder === 0 && !listRes.error);
    // 42703 on the wards = the kind / AC columns do not exist yet: read the wards without them (only "all wards" can be chosen then)
    let wardRes = wardResFull;
    if (wardResFull.error?.code === '42703') {
      wardRes = await supabase.from('wards').select('id, ward_type, total_beds').eq('app_id', tenant.appId).order('ward_type');
    }
    if (listRes.error || wardRes.error) {
      const err = listRes.error || wardRes.error;
      console.error('Loading price list failed:', err);
      setLoadError(err.message || 'Could not load the price list.');
    }
    setItems(listRes.data || []);
    setWards(wardRes.data || []);
    setLoading(false);
  }

  function flash(setter, text) {
    setter(text);
    setTimeout(() => setter(''), 4000);
  }

  function validate(name, rate) {
    if (!name.trim()) return 'Name is required.';
    if (rate === '' || isNaN(Number(rate))) return 'Enter a rate.';
    if (Number(rate) < 0) return 'Rate cannot be negative.';
    if (Number(rate) > 10000000) return 'Rate looks too high — please check.';
    return '';
  }

  function dbError(err, fallback) {
    if (err?.code === '23505') return 'An item with this name already exists in this category.';
    if (err?.code === '42501' || /row-level security/i.test(err?.message || '')) return 'Only the principal or a doctor can change the price list.';
    return err?.message || fallback;
  }

  async function addItem() {
    const msg = validate(form.name, form.rate);
    if (msg) { flash(setError, msg); return; }
    setSaving(true);
    const { error: err } = await supabase.from('hospital_price_list').insert({
      app_id: tenant.appId, category: tab, name: form.name.trim(),
      rate: Number(form.rate), gst_rate: Number(form.gst_rate),
    });
    setSaving(false);
    if (err) { console.error('Adding price list item failed:', err); flash(setError, dbError(err, 'Could not add the item.')); return; }
    setForm({ name: '', rate: '', gst_rate: 0 });
    flash(setMessage, '✅ Added');
    load();
  }

  async function saveEdit() {
    const msg = validate(editing.name, editing.rate);
    if (msg) { flash(setError, msg); return; }
    setSaving(true);
    const { error: err } = await supabase.from('hospital_price_list')
      .update({ name: editing.name.trim(), rate: Number(editing.rate), gst_rate: Number(editing.gst_rate) })
      .eq('id', editing.id);
    setSaving(false);
    if (err) { console.error('Updating price list item failed:', err); flash(setError, dbError(err, 'Could not save the change.')); return; }
    setEditing(null);
    flash(setMessage, '✅ Saved');
    load();
  }

  async function toggleActive(item) {
    const { error: err } = await supabase.from('hospital_price_list').update({ active: !item.active }).eq('id', item.id);
    if (err) { console.error('Toggling price list item failed:', err); flash(setError, dbError(err, 'Could not update the item.')); return; }
    load();
  }

  async function saveRoomRate(ward) {
    const draft = roomDrafts[ward.id] || {};
    const existing = items.find((i) => i.category === 'room' && i.ward_id === ward.id);
    const rate = draft.rate !== undefined ? draft.rate : (existing ? String(existing.rate) : '');
    const gst = draft.gst_rate !== undefined ? draft.gst_rate : (existing ? existing.gst_rate : 0);
    const deposit = draft.deposit !== undefined ? draft.deposit : (existing ? String(existing.deposit ?? 0) : '');
    const msg = validate(`${ward.ward_type}`, rate);
    if (msg) { flash(setError, msg); return; }
    if (depositsReady && deposit !== '' && (isNaN(Number(deposit)) || Number(deposit) < 0 || Number(deposit) > 10000000)) { flash(setError, 'Enter a deposit between 0 and 1,00,00,000, or leave it empty for none.'); return; }
    setSaving(true);
    // the deposit is sent only when it was typed here (and the database knows it), so a rate saved
    // from an older copy of this screen never overwrites a deposit
    const depositPart = depositsReady && draft.deposit !== undefined ? { deposit: Number(deposit || 0) } : {};
    let err;
    if (existing) {
      ({ error: err } = await supabase.from('hospital_price_list')
        .update({ rate: Number(rate), gst_rate: Number(gst), active: true, ...depositPart }).eq('id', existing.id));
    } else {
      ({ error: err } = await supabase.from('hospital_price_list').insert({
        app_id: tenant.appId, category: 'room', name: `${ward.ward_type} Ward`, ward_id: ward.id,
        rate: Number(rate), gst_rate: Number(gst), ...depositPart,
      }));
    }
    setSaving(false);
    if (err) { console.error('Saving room rate failed:', err); flash(setError, dbError(err, 'Could not save the room rate.')); return; }
    setRoomDrafts((d) => { const n = { ...d }; delete n[ward.id]; return n; });
    flash(setMessage, `✅ ${ward.ward_type} rate saved`);
    load();
  }

  // "These rates are correct": the pre-loaded rates of this section stop being samples
  async function confirmSection() {
    setSaving(true);
    const { error: err } = await supabase.from('hospital_price_list').update({ is_sample: false })
      .eq('app_id', tenant.appId).eq('category', tab).eq('is_sample', true);
    setSaving(false);
    if (err) { console.error('Confirming the rates failed:', err); flash(setError, dbError(err, 'Could not confirm the rates.')); return; }
    flash(setMessage, `✅ ${current.label} rates confirmed`);
    load();
  }

  function closeAdjust() { setAdjOpen(false); setAdj({ percent: '', round: '1', scope: 'all' }); setAdjPreview(null); setAdjTicked({}); setAdjError(''); }

  // Which room rates a group of wards covers: 'all', 'ac', 'nonac' or 'kind:<kind>'.
  function inScope(wardId, scope) {
    if (scope === 'all') return true;
    const w = wards.find((x) => x.id === wardId);
    if (!w) return false;
    if (scope === 'ac') return !!w.is_ac;
    if (scope === 'nonac') return !w.is_ac;
    if (scope.startsWith('kind:')) return (w.ward_kind || 'general') === scope.slice(5);
    return false;
  }

  async function previewAdjust() {
    setAdjError('');
    const pct = Number(adj.percent);
    if (adj.percent === '' || adj.percent === '-' || adj.percent === '.' || isNaN(pct)) { setAdjError('Enter a percentage, for example 10 to raise every rate by 10%, or -5 to lower it.'); return; }
    if (pct === 0) { setAdjError('0% changes nothing.'); return; }
    if (pct < -50 || pct > 100) { setAdjError('Enter a percentage between -50 and 100.'); return; }
    // room rates can be limited to a group of wards (the database changes only the ids it is given)
    let scopeIds = null;
    if (tab === 'room' && adj.scope !== 'all') {
      scopeIds = items.filter((i) => i.category === 'room' && i.active && inScope(i.ward_id, adj.scope)).map((i) => i.id);
      if (scopeIds.length === 0) { setAdjError('No wards with a room rate in that group.'); return; }
    }
    setAdjBusy(true);
    const { data, error: err } = await supabase.rpc('adjust_price_list', {
      p_category: tab, p_percent: pct, p_round: Number(adj.round), p_ids: scopeIds, p_apply: false,
    });
    setAdjBusy(false);
    if (err) {
      console.error('Previewing the rate change failed:', err);
      setAdjError(/adjust_price_list/i.test(err.message || '') && /(find|exist)/i.test(err.message || '')
        ? 'The rate-change database script has not been run yet.' : (err.message || 'Could not work out the new rates.'));
      return;
    }
    const rows = (data || []).map((r) => ({ item_id: r.item_id, item_name: r.item_name, old_rate: Number(r.old_rate), new_rate: Number(r.new_rate) }));
    const ticked = {};
    rows.forEach((r) => { if (r.new_rate !== r.old_rate) ticked[r.item_id] = true; });
    setAdjPreview(rows);
    setAdjTicked(ticked);
  }

  async function applyAdjust() {
    const ids = Object.keys(adjTicked).filter((k) => adjTicked[k]);
    if (ids.length === 0) { setAdjError('Tick at least one rate to change.'); return; }
    setAdjBusy(true);
    setAdjError('');
    const { error: err } = await supabase.rpc('adjust_price_list', {
      p_category: tab, p_percent: Number(adj.percent), p_round: Number(adj.round), p_ids: ids, p_apply: true,
    });
    setAdjBusy(false);
    if (err) { console.error('Changing the rates failed:', err); setAdjError(dbError(err, 'Could not change the rates.')); return; }
    closeAdjust();
    flash(setMessage, `✅ ${ids.length} rate${ids.length === 1 ? '' : 's'} changed`);
    load();
  }

  const current = TABS.find((t) => t.k === tab);
  const sampleTotal = items.filter((i) => i.is_sample).length;
  const sampleInTab = items.filter((i) => i.is_sample && i.category === tab).length;
  const activeInTab = items.filter((i) => i.category === tab && i.active).length;
  // groups of wards that can be chosen for a room-rate change (only groups that really have a room rate)
  const activeRoomItems = items.filter((i) => i.category === 'room' && i.active);
  const scopeOptions = [{ k: 'all', label: 'All wards' }];
  if (wards.some((w) => w.is_ac !== undefined)) {
    if (activeRoomItems.some((i) => inScope(i.ward_id, 'ac'))) scopeOptions.push({ k: 'ac', label: 'AC wards only' });
    if (activeRoomItems.some((i) => inScope(i.ward_id, 'nonac'))) scopeOptions.push({ k: 'nonac', label: 'Non-AC wards only' });
    Object.keys(KIND_LABEL).forEach((k) => {
      if (activeRoomItems.some((i) => inScope(i.ward_id, `kind:${k}`))) scopeOptions.push({ k: `kind:${k}`, label: KIND_LABEL[k] });
    });
  }
  const tabItems = items.filter((i) => i.category === tab && (showInactive || i.active));
  const inactiveCount = items.filter((i) => i.category === tab && !i.active).length;
  const roomRateMap = {};
  items.filter((i) => i.category === 'room').forEach((i) => { roomRateMap[i.ward_id] = i; });
  const wardsWithoutRate = wards.filter((w) => !roomRateMap[w.id] || !roomRateMap[w.id].active);

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Setup · ధరల జాబితా</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Price List</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
            Your hospital's rates. Billing picks from this list — change rates here, not on the bill.
          </p>
        </div>

        {!canEdit && (
          <div style={{ background: 'rgba(90,154,223,0.08)', border: '1px solid rgba(90,154,223,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#5A9ADF' }}>
            View only — the principal or a doctor can change rates.
          </div>
        )}
        {loadError && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>⚠️ {loadError}</div>
        )}
        {error && (
          <div role="alert" style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>⚠️ {error}</div>
        )}
        {message && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>{message}</div>
        )}

        {!loading && wardsWithoutRate.length > 0 && tab !== 'room' && (
          <div onClick={() => setTab('room')} style={{ cursor: 'pointer', background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#E8A020' }}>
            {wardsWithoutRate.length} ward{wardsWithoutRate.length > 1 ? 's have' : ' has'} no room rate yet — room charges for patients in {wardsWithoutRate.length > 1 ? 'them' : 'it'} cannot be calculated. Tap to set.
          </div>
        )}

        {!loading && sampleTotal > 0 && (
          <div style={{ background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#E8A020' }}>
            {sampleTotal} rate{sampleTotal === 1 ? ' was' : 's were'} pre-loaded as samples, not your hospital's real prices. Check them, change what is different, then press "These rates are correct" in each section.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.k} onClick={() => { setTab(t.k); setEditing(null); setForm({ name: '', rate: '', gst_rate: 0 }); closeAdjust(); }}
              style={{ padding: '8px 14px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>{current.hint}</p>

        {!loading && canEdit && sampleInTab > 0 && (
          <button type="button" onClick={confirmSection} disabled={saving}
            style={{ marginBottom: 14, padding: '9px 14px', border: '1px solid rgba(106,170,144,0.4)', borderRadius: 8, background: 'rgba(106,170,144,0.08)', color: '#6AAA90', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            ✓ These rates are correct ({sampleInTab} sample{sampleInTab === 1 ? '' : 's'} in {current.label.toLowerCase()})
          </button>
        )}

        {!loading && canEdit && activeInTab > 0 && (
          <div style={{ ...S.card, border: '1px solid rgba(90,154,223,0.25)' }}>
            {!adjOpen ? (
              <button type="button" onClick={() => setAdjOpen(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: '#5A9ADF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                % Change all {current.label.toLowerCase()} rates at once
              </button>
            ) : (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#5A9ADF' }}>Change all {current.label.toLowerCase()} rates by a percentage</p>
                <p style={{ margin: '0 0 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  Applies to the {activeInTab} rate{activeInTab === 1 ? '' : 's'} that {activeInTab === 1 ? 'is' : 'are'} switched on in this section. You see the new rates first and can untick any you want to keep.
                  {tab === 'room' ? ' Patients already admitted keep the room rate they were admitted with; a new rate applies from the next admission or bed move.' : ''}
                </p>
                {tab === 'room' && scopeOptions.length > 1 && (
                  <div style={{ marginBottom: 10 }}>
                    <label htmlFor="pl-adj-scope" style={S.label}>Which wards</label>
                    <select id="pl-adj-scope" name="pl-adj-scope" value={adj.scope}
                      onChange={(e) => { setAdj((a) => ({ ...a, scope: e.target.value })); setAdjPreview(null); setAdjError(''); }} style={{ ...S.input, cursor: 'pointer' }}>
                      {scopeOptions.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
                    </select>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Rates belong to the ward, so every bed of the chosen wards follows.</p>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label htmlFor="pl-adj-percent" style={S.label}>Change by % (use - to lower)</label>
                    <input id="pl-adj-percent" name="pl-adj-percent" inputMode="decimal" value={adj.percent} placeholder="e.g. 10 or -5"
                      onChange={(e) => { setAdj((a) => ({ ...a, percent: cleanPercent(e.target.value) })); setAdjPreview(null); setAdjError(''); }} style={S.input} />
                  </div>
                  <div>
                    <label htmlFor="pl-adj-round" style={S.label}>Round to nearest</label>
                    <select id="pl-adj-round" name="pl-adj-round" value={adj.round}
                      onChange={(e) => { setAdj((a) => ({ ...a, round: e.target.value })); setAdjPreview(null); setAdjError(''); }} style={{ ...S.input, cursor: 'pointer' }}>
                      <option value="1">₹1</option>
                      <option value="5">₹5</option>
                      <option value="10">₹10</option>
                    </select>
                  </div>
                </div>
                {adjError && <div role="alert" style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#E05A5A' }}>⚠️ {adjError}</div>}

                {adjPreview && (
                  <div style={{ marginBottom: 10 }}>
                    {adjPreview.map((r) => {
                      const changes = r.new_rate !== r.old_rate;
                      return (
                        <label key={r.item_id} htmlFor={`pl-adj-${r.item_id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13, opacity: changes ? 1 : 0.5, cursor: changes ? 'pointer' : 'default' }}>
                          <input id={`pl-adj-${r.item_id}`} type="checkbox" disabled={!changes} checked={!!adjTicked[r.item_id]}
                            onChange={(e) => setAdjTicked((t) => ({ ...t, [r.item_id]: e.target.checked }))} />
                          <span style={{ flex: 1, minWidth: 0 }}>{r.item_name}</span>
                          <span style={{ color: 'rgba(255,255,255,0.45)' }}>{currency(r.old_rate)}</span>
                          <span style={{ color: 'rgba(255,255,255,0.3)' }}>→</span>
                          <span style={{ color: changes ? '#E8A020' : 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{currency(r.new_rate)}</span>
                        </label>
                      );
                    })}
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                      {adjPreview.filter((r) => r.new_rate !== r.old_rate).length === 0
                        ? 'No rate would change with these numbers.'
                        : `${Object.values(adjTicked).filter(Boolean).length} of ${adjPreview.filter((r) => r.new_rate !== r.old_rate).length} changing rates ticked.`}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={closeAdjust}
                    style={{ flex: 1, padding: 10, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Cancel</button>
                  {!adjPreview ? (
                    <button type="button" onClick={previewAdjust} disabled={adjBusy}
                      style={{ flex: 2, padding: 10, border: 'none', borderRadius: 8, background: adjBusy ? 'rgba(255,255,255,0.08)' : '#5A9ADF', color: '#111113', fontWeight: 600, cursor: adjBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                      {adjBusy ? 'Working...' : 'Show new rates'}
                    </button>
                  ) : (
                    <button type="button" onClick={applyAdjust} disabled={adjBusy || Object.values(adjTicked).filter(Boolean).length === 0}
                      style={{ flex: 2, padding: 10, border: 'none', borderRadius: 8, background: adjBusy || Object.values(adjTicked).filter(Boolean).length === 0 ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', fontWeight: 700, cursor: adjBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
                      {adjBusy ? 'Saving...' : `Change ${Object.values(adjTicked).filter(Boolean).length} rate${Object.values(adjTicked).filter(Boolean).length === 1 ? '' : 's'}`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 30 }}>Loading...</p>
        ) : tab === 'room' ? (
          wards.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 10px' }}>No wards yet. Add your wards first, then set a rate for each.</p>
              <Link to="/hospital/wards" style={{ color: '#5A9ADF', fontSize: 13 }}>Go to Manage wards →</Link>
            </div>
          ) : (
            wards.map((w) => {
              const existing = roomRateMap[w.id];
              const draft = roomDrafts[w.id] || {};
              const rate = draft.rate !== undefined ? draft.rate : (existing ? String(existing.rate) : '');
              const gst = draft.gst_rate !== undefined ? draft.gst_rate : (existing ? existing.gst_rate : 0);
              const deposit = draft.deposit !== undefined ? draft.deposit : (existing ? String(existing.deposit ?? 0) : '');
              const missing = !existing || !existing.active;
              return (
                <div key={w.id} style={{ ...S.card, border: `1px solid ${missing ? 'rgba(232,160,32,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{w.ward_type} Ward{existing?.is_sample && <SampleBadge />}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{w.total_beds} beds{depositsReady && existing ? ` · deposit ${Number(existing.deposit) > 0 ? currency(existing.deposit) : 'none'}` : ''}</p>
                    </div>
                    {missing
                      ? <span style={{ fontSize: 11, color: '#E8A020' }}>No rate set</span>
                      : <span style={{ fontSize: 13, color: '#E8A020', fontWeight: 600 }}>{currency(existing.rate)} / day</span>}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px auto', gap: 8, alignItems: 'end' }}>
                      <div>
                        <label htmlFor={`room-rate-${w.id}`} style={S.label}>Rate per day (₹)</label>
                        <input id={`room-rate-${w.id}`} name={`room-rate-${w.id}`} inputMode="decimal" value={rate} placeholder="e.g. 1500"
                          onChange={(e) => setRoomDrafts((d) => ({ ...d, [w.id]: { ...d[w.id], rate: cleanMoney(e.target.value) } }))} style={S.input} />
                      </div>
                      <div>
                        <label htmlFor={`room-gst-${w.id}`} style={S.label}>GST %</label>
                        <select id={`room-gst-${w.id}`} name={`room-gst-${w.id}`} value={gst}
                          onChange={(e) => setRoomDrafts((d) => ({ ...d, [w.id]: { ...d[w.id], gst_rate: Number(e.target.value) } }))} style={{ ...S.input, cursor: 'pointer' }}>
                          {GST_OPTIONS.map((g) => <option key={g} value={g}>{g}%</option>)}
                        </select>
                      </div>
                      <button onClick={() => saveRoomRate(w)} disabled={saving}
                        style={{ padding: '10px 16px', background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        Save
                      </button>
                      {depositsReady && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label htmlFor={`room-deposit-${w.id}`} style={S.label}>Deposit at admission (₹)</label>
                          <input id={`room-deposit-${w.id}`} name={`room-deposit-${w.id}`} inputMode="decimal" value={deposit} placeholder="0 = none"
                            onChange={(e) => setRoomDrafts((d) => ({ ...d, [w.id]: { ...d[w.id], deposit: cleanMoney(e.target.value) } }))} style={S.input} />
                          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Shown when a patient is admitted to this ward; the staff can change it for a patient. Press Save to keep it.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          <>
            {canEdit && (
              <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
                <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, margin: '0 0 12px' }}>Add to {current.label.toLowerCase()}</p>
                <div style={{ marginBottom: 10 }}>
                  <label htmlFor="pl-new-name" style={S.label}>Name *</label>
                  <input id="pl-new-name" name="pl-new-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Nursing charge" style={S.input} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label htmlFor="pl-new-rate" style={S.label}>{tab === 'daily_extra' ? 'Rate per day (₹) *' : 'Rate (₹) *'}</label>
                    <input id="pl-new-rate" name="pl-new-rate" inputMode="decimal" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: cleanMoney(e.target.value) }))} placeholder="0" style={S.input} />
                  </div>
                  <div>
                    <label htmlFor="pl-new-gst" style={S.label}>GST %</label>
                    <select id="pl-new-gst" name="pl-new-gst" value={form.gst_rate} onChange={(e) => setForm((f) => ({ ...f, gst_rate: Number(e.target.value) }))} style={{ ...S.input, cursor: 'pointer' }}>
                      {GST_OPTIONS.map((g) => <option key={g} value={g}>{g}%</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={addItem} disabled={saving}
                  style={{ width: '100%', padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Saving...' : '+ Add'}
                </button>
              </div>
            )}

            {tabItems.length === 0 ? (
              <div style={{ ...S.card, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Nothing here yet.</p>
              </div>
            ) : (
              <div style={S.card}>
                {tabItems.map((it) => (
                  <div key={it.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: it.active ? 1 : 0.5 }}>
                    {editing?.id === it.id ? (
                      <div>
                        <input aria-label="Name" value={editing.name} onChange={(e) => setEditing((x) => ({ ...x, name: e.target.value }))} style={{ ...S.input, marginBottom: 8 }} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, marginBottom: 8 }}>
                          <input aria-label="Rate" inputMode="decimal" value={editing.rate} onChange={(e) => setEditing((x) => ({ ...x, rate: cleanMoney(e.target.value) }))} style={S.input} />
                          <select aria-label="GST" value={editing.gst_rate} onChange={(e) => setEditing((x) => ({ ...x, gst_rate: Number(e.target.value) }))} style={{ ...S.input, cursor: 'pointer' }}>
                            {GST_OPTIONS.map((g) => <option key={g} value={g}>{g}%</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setEditing(null)} style={{ flex: 1, padding: 9, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Cancel</button>
                          <button onClick={saveEdit} disabled={saving} style={{ flex: 2, padding: 9, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, color: '#fff' }}>{it.name}{!it.active && ' (off)'}{it.is_sample && <SampleBadge />}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>GST {it.gst_rate}%{tab === 'daily_extra' ? ' · per day' : ''}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 13, color: '#E8A020', fontWeight: 600 }}>{currency(it.rate)}</span>
                          {canEdit && (
                            <>
                              <button onClick={() => setEditing({ id: it.id, name: it.name, rate: String(it.rate), gst_rate: it.gst_rate })}
                                style={{ padding: '4px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Edit</button>
                              <button onClick={() => toggleActive(it)}
                                style={{ padding: '4px 10px', border: `1px solid ${it.active ? 'rgba(224,90,90,0.3)' : 'rgba(106,170,144,0.3)'}`, borderRadius: 6, background: 'transparent', color: it.active ? '#E05A5A' : '#6AAA90', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                                {it.active ? 'Turn off' : 'Turn on'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {inactiveCount > 0 && (
              <button onClick={() => setShowInactive((v) => !v)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                {showInactive ? 'Hide' : 'Show'} {inactiveCount} turned-off item{inactiveCount > 1 ? 's' : ''}
              </button>
            )}
          </>
        )}
      </div>
      <HospitalNav />
      <BugReporter screenName="price_list" />
    </div>
  );
}
