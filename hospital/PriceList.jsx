// hospital/PriceList.jsx — NEW
// One place where the hospital sets its own rates. Billing only READS this list.
// Only principal / doctor can change it (the database enforces the same rule).
// Categories: room (per ward, per day), daily extras, consultations, lab tests, procedures, other.
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
const GST_OPTIONS = [0, 5, 12, 18];
const OWNER_ROLES = ['principal', 'doctor'];

function currency(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }
function cleanMoney(v) {
  const s = String(v).replace(/[^\d.]/g, '');
  const parts = s.split('.');
  return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}` : s;
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
};

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
  const [roomDrafts, setRoomDrafts] = useState({}); // ward_id -> { rate, gst_rate }

  useEffect(() => { if (tenant?.appId) load(); }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    setLoadError('');
    const [listRes, wardRes] = await Promise.all([
      supabase.from('hospital_price_list')
        .select('id, category, name, rate, gst_rate, ward_id, active, sort_order')
        .eq('app_id', tenant.appId).order('sort_order').order('name'),
      supabase.from('wards').select('id, ward_type, total_beds').eq('app_id', tenant.appId).order('ward_type'),
    ]);
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
    const msg = validate(`${ward.ward_type}`, rate);
    if (msg) { flash(setError, msg); return; }
    setSaving(true);
    let err;
    if (existing) {
      ({ error: err } = await supabase.from('hospital_price_list')
        .update({ rate: Number(rate), gst_rate: Number(gst), active: true }).eq('id', existing.id));
    } else {
      ({ error: err } = await supabase.from('hospital_price_list').insert({
        app_id: tenant.appId, category: 'room', name: `${ward.ward_type} Ward`, ward_id: ward.id,
        rate: Number(rate), gst_rate: Number(gst),
      }));
    }
    setSaving(false);
    if (err) { console.error('Saving room rate failed:', err); flash(setError, dbError(err, 'Could not save the room rate.')); return; }
    setRoomDrafts((d) => { const n = { ...d }; delete n[ward.id]; return n; });
    flash(setMessage, `✅ ${ward.ward_type} rate saved`);
    load();
  }

  const current = TABS.find((t) => t.k === tab);
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

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button key={t.k} onClick={() => { setTab(t.k); setEditing(null); setForm({ name: '', rate: '', gst_rate: 0 }); }}
              style={{ padding: '8px 14px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 14px' }}>{current.hint}</p>

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
              const missing = !existing || !existing.active;
              return (
                <div key={w.id} style={{ ...S.card, border: `1px solid ${missing ? 'rgba(232,160,32,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{w.ward_type} Ward</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{w.total_beds} beds</p>
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
                          <p style={{ margin: 0, fontSize: 13, color: '#fff' }}>{it.name}{!it.active && ' (off)'}</p>
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
