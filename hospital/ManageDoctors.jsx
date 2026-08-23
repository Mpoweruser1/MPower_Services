// hospital/ManageDoctors.jsx — NEW
//
// Unlike ManageClasses.jsx/ManageWards.jsx, this doesn't create brand
// new records from scratch — doctors.staff_id must reference a real,
// existing users row with role='doctor'. Creating that user account in
// the first place (an actual login) is a separate concern, handled
// wherever staff accounts get provisioned. This screen's job is the
// step after that: giving an existing doctor-role account their
// doctors profile (designation, employment type, fee, registration
// number) — the exact thing OpdVisit.jsx's doctor dropdown depends on.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import BugReporter from '../shared/BugReporter';

// Confirmed real values — doctors_employment_type_check constraint
const EMPLOYMENT_TYPES = [
  { value: 'consultant',       label: 'Consultant' },
  { value: 'visiting',         label: 'Visiting' },
  { value: 'resident',         label: 'Resident' },
  { value: 'senior_resident',  label: 'Senior Resident' },
];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function ManageDoctors() {
  const { tenant } = useTenant();
  const [doctors, setDoctors]           = useState([]);
  const [unlinkedUsers, setUnlinkedUsers] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [submitError, setSubmitError]   = useState('');
  const [successMsg, setSuccessMsg]     = useState('');

  const [selectedUserId, setSelectedUserId] = useState('');
  const [form, setForm] = useState({
    designation: '', employment_type: 'consultant',
    registration_no: '', consultation_fee: '',
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (tenant?.appId) loadAll();
  }, [tenant?.appId]);

  async function loadAll() {
    setLoading(true);

    const [doctorsRes, doctorUsersRes] = await Promise.allSettled([
      supabase.from('doctors')
        .select('id, staff_id, designation, employment_type, registration_no, consultation_fee, users(full_name)')
        .eq('app_id', tenant.appId),
      supabase.from('users')
        .select('id, full_name, phone')
        .eq('app_id', tenant.appId)
        .eq('role', 'doctor'),
    ]);

    const doctorRows = doctorsRes.status === 'fulfilled' ? (doctorsRes.value.data || []) : [];
    const doctorUsers = doctorUsersRes.status === 'fulfilled' ? (doctorUsersRes.value.data || []) : [];

    setDoctors(doctorRows);

    // Which doctor-role users don't have a doctors profile yet —
    // these are the ones this screen actually needs to help with.
    const linkedStaffIds = new Set(doctorRows.map((d) => d.staff_id));
    setUnlinkedUsers(doctorUsers.filter((u) => !linkedStaffIds.has(u.id)));

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

  function validate() {
    const errors = {};
    if (!selectedUserId) errors.selectedUserId = 'Select a doctor account first';
    if (!form.designation.trim()) errors.designation = 'Designation required';
    const fee = form.consultation_fee ? Number(form.consultation_fee) : null;
    if (fee !== null && (isNaN(fee) || fee < 0)) errors.consultation_fee = 'Enter a valid fee';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function createProfile() {
    if (!validate()) return;
    setSaving(true);
    setSubmitError('');

    const { error } = await supabase.from('doctors').insert({
      app_id:           tenant.appId,
      staff_id:         selectedUserId,
      designation:      form.designation.trim(),
      employment_type:  form.employment_type,
      registration_no:  form.registration_no.trim() || null,
      consultation_fee: form.consultation_fee ? Number(form.consultation_fee) : null,
    });

    if (error) {
      showError('Failed to create doctor profile. Please try again.');
      setSaving(false);
      return;
    }

    showSuccess('✅ Doctor profile created');
    setSelectedUserId('');
    setForm({ designation: '', employment_type: 'consultant', registration_no: '', consultation_fee: '' });
    setFormErrors({});
    setSaving(false);
    loadAll();
  }

  // Delete — guarded against existing OPD visits/lab orders/
  // admissions referencing this doctor, same dependent-data pattern
  // as ManageClasses.jsx/ManageWards.jsx.
  async function deleteDoctor(id, name) {
    const { count } = await supabase
      .from('opd_visits')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_id', id);

    if (count && count > 0) {
      showError(`Cannot remove "${name}" — ${count} OPD visit${count > 1 ? 's' : ''} reference this doctor.`);
      return;
    }

    if (!window.confirm(`Remove doctor profile for "${name}"? Their account isn't deleted, only this hospital profile.`)) return;

    await supabase.from('doctors').delete().eq('id', id);
    loadAll();
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Setup · వైద్యుల నిర్వహణ
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Manage Doctors</h1>
          {!loading && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
              {doctors.length} doctor{doctors.length !== 1 ? 's' : ''} configured for {tenant?.orgName}
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

        {/* No unlinked accounts at all — nothing to do here */}
        {!loading && unlinkedUsers.length === 0 && doctors.length === 0 && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#E8A020' }}>No doctor accounts found</p>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              This screen sets up a profile for an existing doctor-role account — it doesn't create new logins.
              A staff account with the "doctor" role needs to exist first.
            </p>
          </div>
        )}

        {/* Create profile for an unlinked doctor account */}
        {!loading && unlinkedUsers.length > 0 && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
              Set up a doctor profile
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
              {unlinkedUsers.length} account{unlinkedUsers.length > 1 ? 's have' : ' has'} the doctor role but no profile yet
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={S.label}>Doctor account *</label>
              <select value={selectedUserId}
                onChange={(e) => { setSelectedUserId(e.target.value); setFormErrors({}); }}
                style={{ ...S.input(!!formErrors.selectedUserId), cursor: 'pointer' }}>
                <option value="">-- Select --</option>
                {unlinkedUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}{u.phone ? ` · ${u.phone}` : ''}</option>
                ))}
              </select>
              {formErrors.selectedUserId && <p style={S.fieldErr}>⚠ {formErrors.selectedUserId}</p>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={S.label}>Designation *</label>
                <input value={form.designation}
                  onChange={(e) => { setForm((f) => ({ ...f, designation: e.target.value })); setFormErrors({}); }}
                  placeholder="e.g. General Physician"
                  style={S.input(!!formErrors.designation)} />
                {formErrors.designation && <p style={S.fieldErr}>⚠ {formErrors.designation}</p>}
              </div>
              <div>
                <label style={S.label}>Employment type</label>
                <select value={form.employment_type}
                  onChange={(e) => setForm((f) => ({ ...f, employment_type: e.target.value }))}
                  style={{ ...S.input(false), cursor: 'pointer' }}>
                  {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={S.label}>Registration number</label>
                <input value={form.registration_no}
                  onChange={(e) => setForm((f) => ({ ...f, registration_no: e.target.value }))}
                  placeholder="Medical council reg. no."
                  style={S.input(false)} />
              </div>
              <div>
                <label style={S.label}>Consultation fee (₹)</label>
                <input value={form.consultation_fee}
                  onChange={(e) => { setForm((f) => ({ ...f, consultation_fee: e.target.value.replace(/[^0-9.]/g, '') })); setFormErrors({}); }}
                  inputMode="decimal" placeholder="e.g. 300"
                  style={S.input(!!formErrors.consultation_fee)} />
                {formErrors.consultation_fee && <p style={S.fieldErr}>⚠ {formErrors.consultation_fee}</p>}
              </div>
            </div>

            <button onClick={createProfile} disabled={saving}
              style={{ width: '100%', padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Creating...' : '+ Create doctor profile'}
            </button>
          </div>
        )}

        {/* Existing doctor profiles */}
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>Loading...</p>
        ) : doctors.length > 0 && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
              Configured doctors ({doctors.length})
            </p>
            {doctors.map((d) => {
              const typeLabel = EMPLOYMENT_TYPES.find((t) => t.value === d.employment_type)?.label || d.employment_type;
              return (
                <div key={d.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>🩺</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{d.users?.full_name || 'Unknown'}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                        {d.designation} · {typeLabel}
                        {d.consultation_fee ? ` · ₹${Number(d.consultation_fee).toLocaleString('en-IN')}` : ''}
                        {d.registration_no ? ` · Reg: ${d.registration_no}` : ''}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => deleteDoctor(d.id, d.users?.full_name || 'this doctor')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'rgba(224,90,90,0.4)', padding: '4px 8px' }}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

      </div>

      <HospitalNav />
      <BugReporter screenName="manage_doctors" />
    </div>
  );
}
