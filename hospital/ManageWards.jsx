// hospital/ManageWards.jsx — NEW
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { sanitize } from '../shared/useFormValidation';
import HospitalNav from '../shared/HospitalNav';
import BugReporter from '../shared/BugReporter';
import { buildWardWithBeds, groupBedsByRoom } from '../shared/bedLogic';
import { fetchAllRows } from './hospitalUtils';

// What kind of ward it is, and whether it is air-conditioned. Used to tell wards apart in lists and
// reports; the name stays whatever the hospital calls it ("General AC", "Twin sharing" ...).
const WARD_KINDS = [
  { k: 'general',      label: 'General ward' },
  { k: 'semi_private', label: 'Semi-private / twin sharing' },
  { k: 'private',      label: 'Private room' },
  { k: 'icu',          label: 'ICU / HDU / critical care' },
  { k: 'emergency',    label: 'Emergency / casualty' },
  { k: 'isolation',    label: 'Isolation' },
  { k: 'day_care',     label: 'Day care' },
  { k: 'maternity',    label: 'Maternity' },
  { k: 'pediatric',    label: 'Pediatric' },
  { k: 'other',        label: 'Other' },
];
const KIND_LABEL = Object.fromEntries(WARD_KINDS.map((x) => [x.k, x.label]));

// Common ward types for quick-add — mirrors ManageClasses.jsx's
// PRE_PRIMARY quick-add pattern. Custom types still available below
// for anything not covered here. AC can be changed afterwards in the list.
const COMMON_WARDS = [
  { name: 'General',      kind: 'general',      ac: false },
  { name: 'ICU',          kind: 'icu',          ac: true },
  { name: 'Maternity',    kind: 'maternity',    ac: false },
  { name: 'Pediatric',    kind: 'pediatric',    ac: false },
  { name: 'Emergency',    kind: 'emergency',    ac: false },
  { name: 'Private',      kind: 'private',      ac: false },
  { name: 'Semi-Private', kind: 'semi_private', ac: false },
  { name: 'Isolation',    kind: 'isolation',    ac: true },
  { name: 'Day Care',     kind: 'day_care',     ac: false },
];

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
  const [loadError, setLoadError]     = useState('');
  const [saving, setSaving]           = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successMsg, setSuccessMsg]   = useState('');

  // Quick add — shared bed count for whichever common type is tapped
  const [quickBeds, setQuickBeds] = useState('10');

  // Custom add
  const [newWard, setNewWard]       = useState({ ward_type: '', total_beds: '', ward_kind: 'general', is_ac: false });
  const [wardErrors, setWardErrors] = useState({});

  // Rooms and beds: every bed of every ward, who is in a bed right now, which ward is open,
  // the "add beds" form per ward and the bed being renamed.
  const [bedRows, setBedRows]       = useState([]);
  const [openAdm, setOpenAdm]       = useState([]);
  const [bedListReady, setBedListReady] = useState(false);
  const [openWardId, setOpenWardId] = useState(null);
  const [addBeds, setAddBeds]       = useState({ room: '', count: '' });
  const [editBed, setEditBed]       = useState(null);
  const [bedBusy, setBedBusy]       = useState(false);

  useEffect(() => {
    if (tenant?.appId) loadWards();
  }, [tenant?.appId]);

  async function loadWards() {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('wards')
      .select('id, ward_type, total_beds, ward_kind, is_ac')
      .eq('app_id', tenant.appId)
      .order('ward_type');
    if (error) {
      console.error('Loading wards failed:', error);
      setLoadError(error.message || 'Could not load the wards.');
    }
    setWards(data || []);

    // The beds and the patients in them. If the bed table does not exist yet (database script not
    // run) the rooms-and-beds panel is simply not shown.
    const wardIds = (data || []).map((w) => w.id);
    try {
      const rows = await fetchAllRows(() => supabase.from('ward_beds')
        .select('id, ward_id, room, label, seq').eq('app_id', tenant.appId).order('seq').order('id'));
      setBedRows(rows);
      setBedListReady(true);
      if (wardIds.length > 0) {
        const { data: adm, error: admErr } = await supabase.from('ipd_admissions')
          .select('ward_id, bed_no').is('discharge_date', null).in('ward_id', wardIds);
        if (admErr) { console.error('Loading occupied beds failed:', admErr); setLoadError('Could not check which beds have patients. Bed changes are paused — please refresh.'); setBedListReady(false); }
        setOpenAdm(adm || []);
      } else {
        setOpenAdm([]);
      }
    } catch (bedErr) {
      console.error('Loading the beds failed:', bedErr);
      setBedRows([]);
      setBedListReady(false);
      if (bedErr?.code !== '42P01' && bedErr?.code !== 'PGRST205') setLoadError('Could not load the beds of the wards. Please refresh.');
    }
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
  async function quickAdd(def) {
    const wardType = def.name;
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
      ward_kind:  def.kind,
      is_ac:      def.ac,
    });

    if (error) { console.error('Ward quick-add failed:', error); showError(error.message || `Failed to add ${wardType} ward.`); }
    else { showSuccess(`✅ ${wardType} ward added — ${beds} beds${def.ac ? ' · AC' : ''}`); }

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
      ward_kind:  newWard.ward_kind,
      is_ac:      newWard.is_ac,
    });

    if (error) {
      console.error('Custom ward add failed:', error);
      if (error.code === '23505') showError('This ward type already exists.');
      else showError(error.message || 'Failed to add ward.');
      setSaving(false);
      return;
    }

    setNewWard({ ward_type: '', total_beds: '', ward_kind: 'general', is_ac: false });
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
    if (beds > 500) { showError('Bed count seems too high — please check.'); return; }

    // The bed count cannot go below the patients who are in this ward right now.
    const { count: occupied, error: occErr } = await supabase
      .from('ipd_admissions')
      .select('id', { count: 'exact', head: true })
      .eq('ward_id', id)
      .is('discharge_date', null);
    if (occErr) { console.error('Checking occupied beds failed:', occErr); showError('Could not check the occupied beds. Please try again.'); return; }
    if (beds < (occupied || 0)) {
      showError(`${occupied} patient${occupied > 1 ? 's are' : ' is'} admitted in this ward right now, so it needs at least ${occupied} beds.`);
      return;
    }

    const { error } = await supabase.from('wards').update({ total_beds: beds }).eq('id', id);
    if (error) { console.error('Bed count update failed:', error); showError(error.message || 'Failed to update bed count.'); return; }
    showSuccess('✅ Bed count updated');
    loadWards();
  }

  // Change a ward's kind or AC / non-AC.
  async function updateWardTags(id, patch) {
    const { error } = await supabase.from('wards').update(patch).eq('id', id);
    if (error) { console.error('Ward update failed:', error); showError(error.message || 'Failed to update the ward.'); return; }
    showSuccess('✅ Ward updated');
    loadWards();
  }

  // Add beds to a ward, optionally in a named room ("Room 12" + 4 beds = Room 12-1 ... Room 12-4).
  async function addBedsToWard(wardId) {
    const count = parseInt(addBeds.count, 10);
    if (isNaN(count) || count < 1 || count > 100) { showError('Enter how many beds to add (1 to 100).'); return; }
    setBedBusy(true);
    const { error } = await supabase.rpc('add_ward_beds', { p_ward: wardId, p_count: count, p_room: addBeds.room.trim() || null });
    setBedBusy(false);
    if (error) { console.error('Adding beds failed:', error); showError(error.message || 'Could not add the beds.'); return; }
    setAddBeds({ room: '', count: '' });
    showSuccess(`✅ ${count} bed${count === 1 ? '' : 's'} added${addBeds.room.trim() ? ` to ${addBeds.room.trim()}` : ''}`);
    loadWards();
  }

  async function saveBedEdit() {
    if (!editBed) return;
    setBedBusy(true);
    const { error } = await supabase.rpc('rename_ward_bed', { p_bed: editBed.id, p_label: editBed.label, p_room: editBed.room.trim() || null });
    setBedBusy(false);
    if (error) { console.error('Renaming the bed failed:', error); showError(error.message || 'Could not change the bed.'); return; }
    setEditBed(null);
    showSuccess('✅ Bed updated');
    loadWards();
  }

  async function removeBed(bed) {
    if (!window.confirm(`Remove bed "${bed.bedNo}"? This cannot be undone.`)) return;
    setBedBusy(true);
    const { error } = await supabase.rpc('remove_ward_bed', { p_bed: bed.id });
    setBedBusy(false);
    if (error) { console.error('Removing the bed failed:', error); showError(error.message || 'Could not remove the bed.'); return; }
    showSuccess('✅ Bed removed');
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

    const { error } = await supabase.from('wards').delete().eq('id', id);
    // Previously not checked at all — a failed delete (e.g. blocked by
    // RLS or a foreign key it didn't anticipate) would show nothing,
    // leaving the ward still in the list with no explanation.
    if (error) {
      console.error('Ward delete failed:', error);
      showError(error.message || 'Failed to delete ward. Please try again.');
      return;
    }
    loadWards();
  }

  const totalBeds = wards.reduce((s, w) => s + (w.total_beds || 0), 0);
  const acBeds    = wards.filter((w) => w.is_ac).reduce((s, w) => s + (w.total_beds || 0), 0);

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
              {acBeds > 0 ? ` (${acBeds} AC · ${totalBeds - acBeds} non-AC)` : ''}
            </p>
          )}
        </div>

        <div style={{ marginBottom: 14, fontSize: 12 }}>
          <Link to="/hospital/price-list" style={{ color: '#5A9ADF' }}>Set room rates per day for these wards →</Link>
        </div>

        {/* Error / success banners */}
        {submitError && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {submitError}</span>
            <button onClick={() => setSubmitError('')} style={{ background: 'none', border: 'none', color: '#E05A5A', cursor: 'pointer', fontSize: 18, padding: 0 }}>✕</button>
          </div>
        )}

        {loadError && (
          <div role="alert" style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {loadError}
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
          <label htmlFor="ward-quick-beds" style={S.label}>Default beds for quick-add wards below</label>
          <input id="ward-quick-beds" name="ward-quick-beds" value={quickBeds}
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
            {COMMON_WARDS.map((def) => {
              const wardType = def.name;
              const exists = wards.some((w) => w.ward_type === wardType);
              return (
                <button key={wardType}
                  onClick={() => !exists && quickAdd(def)}
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
            For anything not covered above — Cardiac, Neonatal, Dialysis, "General AC", "Twin sharing" etc. Each ward has its own name, bed count and room rate.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label htmlFor="ward-new-ward-ward-type" style={S.label}>Ward type *</label>
              <input id="ward-new-ward-ward-type" name="ward-new-ward-ward-type" value={newWard.ward_type}
                onChange={(e) => { setNewWard((w) => ({ ...w, ward_type: e.target.value })); setWardErrors({}); }}
                placeholder="e.g. Cardiac / Neonatal"
                style={S.input(!!wardErrors.ward_type)} />
              {wardErrors.ward_type && <p style={S.fieldErr}>⚠ {wardErrors.ward_type}</p>}
            </div>
            <div>
              <label htmlFor="ward-new-ward-total-beds" style={S.label}>Total beds *</label>
              <input id="ward-new-ward-total-beds" name="ward-new-ward-total-beds" value={newWard.total_beds}
                onChange={(e) => { setNewWard((w) => ({ ...w, total_beds: sanitize.integer(e.target.value) })); setWardErrors({}); }}
                inputMode="numeric" placeholder="10"
                style={S.input(!!wardErrors.total_beds)} />
              {wardErrors.total_beds && <p style={S.fieldErr}>⚠ {wardErrors.total_beds}</p>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 14, alignItems: 'end' }}>
            <div>
              <label htmlFor="ward-new-ward-kind" style={S.label}>Kind of ward</label>
              <select id="ward-new-ward-kind" name="ward-new-ward-kind" value={newWard.ward_kind}
                onChange={(e) => setNewWard((w) => ({ ...w, ward_kind: e.target.value }))}
                style={{ ...S.input(false), cursor: 'pointer' }}>
                {WARD_KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}
              </select>
            </div>
            <label htmlFor="ward-new-ward-ac" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: newWard.is_ac ? '#5A9ADF' : 'rgba(255,255,255,0.55)', cursor: 'pointer', paddingBottom: 10 }}>
              <input id="ward-new-ward-ac" name="ward-new-ward-ac" type="checkbox" checked={newWard.is_ac}
                onChange={(e) => setNewWard((w) => ({ ...w, is_ac: e.target.checked }))} />
              Air-conditioned
            </label>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 16 }}>🛏️</span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>
                      {w.ward_type} Ward
                      <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: w.is_ac ? 'rgba(90,154,223,0.14)' : 'rgba(255,255,255,0.06)', color: w.is_ac ? '#5A9ADF' : 'rgba(255,255,255,0.45)' }}>
                        {(KIND_LABEL[w.ward_kind] || 'General')} · {w.is_ac ? 'AC' : 'Non-AC'}
                      </span>
                    </p>
                    <p
                      onClick={() => updateBedCount(w.id, w.total_beds)}
                      style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)', cursor: 'pointer' }}
                      title="Click to edit bed count"
                    >
                      {w.total_beds} beds ✎
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                      <select aria-label={`Kind of ward for ${w.ward_type}`} value={w.ward_kind || 'general'}
                        onChange={(e) => updateWardTags(w.id, { ward_kind: e.target.value })}
                        style={{ padding: '4px 8px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'inherit', cursor: 'pointer' }}>
                        {WARD_KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>
                        <input type="checkbox" aria-label={`Air-conditioned: ${w.ward_type}`} checked={!!w.is_ac}
                          onChange={(e) => updateWardTags(w.id, { is_ac: e.target.checked })} />
                        AC
                      </label>
                    </div>

                    {bedListReady && (() => {
                      const full = buildWardWithBeds(w, openAdm, bedRows);
                      const isOpen = openWardId === w.id;
                      return (
                        <div style={{ marginTop: 8 }}>
                          <button type="button" onClick={() => { setOpenWardId(isOpen ? null : w.id); setEditBed(null); }}
                            aria-expanded={isOpen}
                            style={{ background: 'none', border: 'none', padding: 0, color: '#5A9ADF', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {isOpen ? '▾' : '▸'} Rooms &amp; beds ({full.beds.length})
                          </button>
                          {isOpen && (
                            <div style={{ marginTop: 10 }}>
                              {groupBedsByRoom(full.beds).map((g) => (
                                <div key={g.room || '__no_room'} style={{ marginBottom: 10 }}>
                                  {g.room && <p style={{ margin: '0 0 6px', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{g.room}</p>}
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {g.beds.map((b) => (
                                      <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, fontSize: 12, background: b.occupied ? 'rgba(224,90,90,0.1)' : 'rgba(106,170,144,0.1)', color: b.occupied ? '#E05A5A' : '#6AAA90', border: `1px solid ${b.occupied ? 'rgba(224,90,90,0.25)' : 'rgba(106,170,144,0.25)'}` }}>
                                        {b.bedNo}{b.occupied ? ' · patient' : ''}
                                        <button type="button" aria-label={`Rename or move bed ${b.bedNo}`} disabled={bedBusy}
                                          onClick={() => setEditBed({ id: b.id, label: b.bedNo, room: b.room || '', occupied: b.occupied })}
                                          style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', fontSize: 11 }}>✎</button>
                                        {!b.occupied && (
                                          <button type="button" aria-label={`Remove bed ${b.bedNo}`} disabled={bedBusy}
                                            onClick={() => removeBed(b)}
                                            style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(224,90,90,0.7)', cursor: 'pointer', fontSize: 11 }}>✕</button>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}

                              {editBed && full.beds.some((b) => b.id === editBed.id) && (
                                <div style={{ background: '#111113', borderRadius: 8, padding: 10, margin: '8px 0' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                    <div>
                                      <label htmlFor={`bed-edit-label-${w.id}`} style={{ ...S.label, marginBottom: 4 }}>Bed name</label>
                                      <input id={`bed-edit-label-${w.id}`} name={`bed-edit-label-${w.id}`} value={editBed.label} disabled={editBed.occupied}
                                        onChange={(e) => setEditBed((x) => ({ ...x, label: e.target.value }))} style={S.input(false)} />
                                    </div>
                                    <div>
                                      <label htmlFor={`bed-edit-room-${w.id}`} style={{ ...S.label, marginBottom: 4 }}>Room</label>
                                      <input id={`bed-edit-room-${w.id}`} name={`bed-edit-room-${w.id}`} value={editBed.room} placeholder="(none)"
                                        onChange={(e) => setEditBed((x) => ({ ...x, room: e.target.value }))} style={S.input(false)} />
                                    </div>
                                  </div>
                                  {editBed.occupied && <p style={{ margin: '0 0 8px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>A patient is in this bed, so only the room can be changed now.</p>}
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" onClick={saveBedEdit} disabled={bedBusy}
                                      style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#E8A020', color: '#111113', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                                    <button type="button" onClick={() => setEditBed(null)}
                                      style={{ padding: '6px 14px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                  </div>
                                </div>
                              )}

                              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end', marginTop: 8 }}>
                                <div>
                                  <label htmlFor={`bed-add-room-${w.id}`} style={{ ...S.label, marginBottom: 4 }}>Room (optional)</label>
                                  <input id={`bed-add-room-${w.id}`} name={`bed-add-room-${w.id}`} value={addBeds.room} placeholder="e.g. Room 12"
                                    onChange={(e) => setAddBeds((x) => ({ ...x, room: e.target.value }))} style={S.input(false)} />
                                </div>
                                <div>
                                  <label htmlFor={`bed-add-count-${w.id}`} style={{ ...S.label, marginBottom: 4 }}>Beds</label>
                                  <input id={`bed-add-count-${w.id}`} name={`bed-add-count-${w.id}`} value={addBeds.count} placeholder="2 or 4" inputMode="numeric"
                                    onChange={(e) => setAddBeds((x) => ({ ...x, count: sanitize.integer(e.target.value) }))} style={S.input(false)} />
                                </div>
                                <button type="button" onClick={() => addBedsToWard(w.id)} disabled={bedBusy}
                                  style={{ padding: '10px 14px', border: 'none', borderRadius: 8, background: bedBusy ? 'rgba(255,255,255,0.08)' : '#6AAA90', color: '#111113', fontWeight: 600, fontSize: 12, cursor: bedBusy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                                  + Add beds
                                </button>
                              </div>
                              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                                A room with 2 or 4 beds: type the room name and the number of beds. The room rate is set per ward on the price list.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
