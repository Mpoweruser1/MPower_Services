// shared/CorrectionRequest.jsx — FINAL
// Embed this on any screen to let staff raise a correction or deletion request
// Usage: <CorrectionRequest module="student" recordId={student.id} recordLabel={student.full_name} fields={STUDENT_FIELDS} />

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

// Verified against StudentAdmission.jsx's own constants — reusing the
// exact same arrays rather than inventing new ones, so a correction
// request can never produce a value the admission form itself
// wouldn't have allowed in the first place.
const GENDERS = ['Male', 'Female', 'Other'];
const CASTE_CATEGORIES = ['OC', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'SC', 'ST', 'EWS', 'Other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
// Verified against StaffDashboard.jsx's own priority filter — same
// two values, nothing else exists.
const PRIORITIES = ['Normal', 'Urgent'];

// Reference-type loaders — fetch real options instead of asking the
// requester to somehow know and type a raw foreign-key id. Each
// returns [{ value, label }]; value is what actually gets written to
// the DB on approval.
async function loadClassOptions(appId) {
  const { data } = await supabase.from('classes').select('id, class_name').eq('app_id', appId).order('class_order');
  return (data || []).map((c) => ({ value: c.id, label: c.class_name }));
}

async function loadCategoryOptions(appId) {
  // Same query as fetchCategories() in grievance/grievanceApi.js,
  // inlined here rather than imported — this file lives in shared/
  // and is used by School and Hospital too, so it shouldn't pull in
  // grievance-specific module code just for this one field type.
  // label_en is what's actually stored/filtered on complaints
  // elsewhere (see StaffDashboard.jsx's own category filter, which
  // compares directly against c.label_en) — matching that here so an
  // approved correction is stored the same way a category is stored
  // anywhere else in the app.
  const { data } = await supabase
    .from('complaint_categories')
    .select('label_en')
    .or(`app_id.eq.${appId},app_id.is.null`)
    .order('sort_order');
  return (data || []).map((c) => ({ value: c.label_en, label: c.label_en }));
}

// Pass these per module
export const STUDENT_FIELDS = [
  { key: 'full_name',      label: 'Full name' },
  { key: 'dob',            label: 'Date of birth', type: 'date' },
  { key: 'gender',         label: 'Gender', type: 'select', options: GENDERS },
  { key: 'class_id',       label: 'Class / Section', type: 'reference', loadOptions: loadClassOptions },
  { key: 'caste_category', label: 'Caste category', type: 'select', options: CASTE_CATEGORIES },
  { key: 'parent_name',    label: 'Parent name' },
  { key: 'parent_phone',   label: 'Parent phone' },
  { key: 'admission_no',   label: 'Admission number' },
  // No schema for this is currently verifiable anywhere in the School
  // module — village_id isn't set by StudentAdmission.jsx or shown
  // anywhere else, so there's no confirmed villages table/columns to
  // build a safe lookup against. Left as free text deliberately,
  // rather than guessing at a query that could silently 404 or write
  // the wrong thing.
  { key: 'village_id',     label: 'Village' },
  { key: 'blood_group',    label: 'Blood group', type: 'select', options: BLOOD_GROUPS },
  { key: 'apaar_id',       label: 'APAAR ID' },
];

export const PATIENT_FIELDS = [
  { key: 'full_name',   label: 'Full name' },
  { key: 'dob',         label: 'Date of birth', type: 'date' },
  // Assumed same values as School's GENDERS/BLOOD_GROUPS — Hospital's
  // own PatientRegistration.jsx hasn't been reviewed yet to confirm
  // these are identical there. Low risk (gender/blood-group values
  // are near-universal) but flagging the assumption rather than
  // presenting it as verified the way School's are.
  { key: 'gender',      label: 'Gender', type: 'select', options: GENDERS },
  { key: 'phone',       label: 'Phone number' },
  { key: 'blood_group', label: 'Blood group', type: 'select', options: BLOOD_GROUPS },
  { key: 'address',     label: 'Address' },
  { key: 'allergies',   label: 'Allergies' },
  { key: 'abha_id',     label: 'ABHA ID' },
];

export const COMPLAINT_FIELDS = [
  { key: 'category',    label: 'Category', type: 'reference', loadOptions: loadCategoryOptions },
  { key: 'priority',    label: 'Priority', type: 'select', options: PRIORITIES },
  { key: 'title',       label: 'Title' },
  { key: 'description', label: 'Description' },
];

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 },
  modal: { background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif', maxHeight: '90vh', overflowY: 'auto' },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  select: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer' },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
};

export default function CorrectionRequest({
  module,       // 'student' | 'patient' | 'complaint'
  recordId,     // uuid of the record
  recordLabel,  // display name e.g. "Ravi Kumar (S-001)"
  fields,       // array of { key, label } — use exports above
  currentValues = {}, // optional — pre-fills old_value
  buttonLabel = '✏️ Request correction',
  buttonStyle = {},
}) {
  const { tenant } = useTenant();
  const [open, setOpen]             = useState(false);
  const [requestType, setRequestType] = useState('correction');
  const [fieldName, setFieldName]   = useState(fields?.[0]?.key || '');
  const [oldValue, setOldValue]     = useState('');
  const [newValue, setNewValue]     = useState('');
  const [reason, setReason]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);
  const [error, setError]           = useState('');
  const [referenceOptions, setReferenceOptions] = useState([]);
  const [loadingOptions, setLoadingOptions]     = useState(false);

  const selectedField = fields?.find((f) => f.key === fieldName);

  // Loads real options for a 'reference' field whenever the selected
  // field changes to one — e.g. real class names instead of asking
  // the requester to type a raw class_id UUID they'd have no way of
  // knowing.
  useEffect(() => {
    if (!open || selectedField?.type !== 'reference' || !tenant?.appId) {
      setReferenceOptions([]);
      return;
    }
    let cancelled = false;
    setLoadingOptions(true);
    selectedField.loadOptions(tenant.appId)
      .then((opts) => { if (!cancelled) setReferenceOptions(opts); })
      .catch(() => { if (!cancelled) setReferenceOptions([]); })
      .finally(() => { if (!cancelled) setLoadingOptions(false); });
    return () => { cancelled = true; };
  }, [open, selectedField, tenant?.appId]);

  function openModal() {
    setRequestType('correction');
    setFieldName(fields?.[0]?.key || '');
    setOldValue(currentValues[fields?.[0]?.key] || '');
    setNewValue('');
    setReason('');
    setDone(false);
    setError('');
    setOpen(true);
  }

  function onFieldChange(key) {
    setFieldName(key);
    setOldValue(currentValues[key] || '');
    setNewValue('');
  }

  async function submit() {
    setError('');
    if (!reason.trim()) { setError('Reason is required.'); return; }
    if (requestType === 'correction' && !newValue.trim()) { setError('New value is required.'); return; }

    setSubmitting(true);

    const { error: insertErr } = await supabase
  .from('correction_requests')
  .insert({
    app_id:           tenant.appId,
    requested_by:     tenant.userRowId,
    module,
    record_id:        recordId,
    record_label:     recordLabel,
    request_type:     requestType,
    field_name:       requestType === 'correction' ? fieldName : null,
    old_value:        requestType === 'correction' ? (oldValue || null) : null,
    new_value:        requestType === 'correction' ? newValue.trim() : null,
    reason:           reason.trim(),
    status:           'pending',
    // First reminder due tomorrow
    next_reminder_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

    if (insertErr) {
      setError('Failed to submit request. Please try again.');
      setSubmitting(false);
      return;
    }

    // WhatsApp alert to admin/principal
    await supabase.functions.invoke('send-whatsapp', {
      body: {
        type:        'correction_request_raised',
        appId:       tenant.appId,
        requestedBy: tenant.fullName,
        module,
        recordLabel,
        requestType,
        fieldLabel:  selectedField?.label || fieldName,
        oldValue:    oldValue || '—',
        newValue:    newValue || '—',
        reason:      reason.trim(),
      },
    });

    setSubmitting(false);
    setDone(true);
  }

  return (
    <>
      {/* Trigger button */}
      <button onClick={openModal}
        style={{ padding: '7px 14px', border: '1px solid rgba(232,160,32,0.3)', color: '#E8A020', background: 'rgba(232,160,32,0.06)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', ...buttonStyle }}>
        {buttonLabel}
      </button>

      {/* Modal */}
      {open && (
        <div style={S.overlay} onClick={() => setOpen(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>

            {done ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ fontSize: 36, marginBottom: 12 }}>✅</p>
                <p style={{ fontSize: 16, fontWeight: 600, color: '#6AAA90', margin: '0 0 8px' }}>
                  Request submitted
                </p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px', lineHeight: 1.6 }}>
                  The admin has been notified via WhatsApp.<br />
                  You will be informed once approved or rejected.
                </p>
                <button onClick={() => setOpen(false)}
                  style={{ padding: '10px 28px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>
                      {requestType === 'deletion' ? '🗑️ Request deletion' : '✏️ Request correction'}
                    </p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{recordLabel}</p>
                  </div>
                  <button onClick={() => setOpen(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'rgba(255,255,255,0.6)', padding: 0 }}>✕</button>
                </div>

                {/* Request type toggle */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {[
                    { value: 'correction', label: '✏️ Correct a field' },
                    { value: 'deletion',   label: '🗑️ Delete record' },
                  ].map((t) => (
                    <button key={t.value} onClick={() => setRequestType(t.value)}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${requestType === t.value ? 'rgba(232,160,32,0.4)' : 'rgba(255,255,255,0.08)'}`, background: requestType === t.value ? 'rgba(232,160,32,0.08)' : '#111113', color: requestType === t.value ? '#E8A020' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontWeight: requestType === t.value ? 600 : 400, fontFamily: 'inherit' }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Correction fields */}
                {requestType === 'correction' && (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <label style={S.label}>Which field needs correction?</label>
                      <select value={fieldName} onChange={(e) => onFieldChange(e.target.value)} style={S.select}>
                        {fields?.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                      <div>
                        <label style={S.label}>Current (wrong) value</label>
                        <input value={oldValue} onChange={(e) => setOldValue(e.target.value)}
                          placeholder="What it says now" style={S.input} />
                      </div>
                      <div>
                        <label style={S.label}>Correct value</label>
                        {selectedField?.type === 'date' ? (
                          <input type="date" value={newValue} onChange={(e) => setNewValue(e.target.value)}
                            style={S.input} autoFocus />
                        ) : selectedField?.type === 'select' ? (
                          <select value={newValue} onChange={(e) => setNewValue(e.target.value)} style={S.select} autoFocus>
                            <option value="">-- Select --</option>
                            {selectedField.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : selectedField?.type === 'reference' ? (
                          <select value={newValue} onChange={(e) => setNewValue(e.target.value)} style={S.select} disabled={loadingOptions} autoFocus>
                            <option value="">{loadingOptions ? 'Loading…' : '-- Select --'}</option>
                            {referenceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : (
                          <input value={newValue} onChange={(e) => setNewValue(e.target.value)}
                            placeholder="What it should be" style={S.input} autoFocus />
                        )}
                      </div>
                    </div>
                    {selectedField?.type === 'reference' && !loadingOptions && referenceOptions.length === 0 && (
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: -8, marginBottom: 14 }}>
                        No options found — check with an admin before submitting.
                      </p>
                    )}
                  </>
                )}

                {/* Deletion warning */}
                {requestType === 'deletion' && (
                  <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
                      ⚠️ Deletion request for: {recordLabel}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      This will be sent to the admin for approval. The record will NOT be deleted until approved.
                    </p>
                  </div>
                )}

                {/* Reason */}
                <div style={{ marginBottom: 16 }}>
                  <label style={S.label}>Reason for this request *</label>
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="Why does this need to be changed or deleted? Be specific."
                    rows={3}
                    style={{ ...S.input, resize: 'none', lineHeight: 1.6 }} />
                </div>

                {/* Submitter info */}
                <div style={{ background: '#111113', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
                  📋 Submitted by: <strong style={{ color: '#fff' }}>{tenant?.fullName}</strong> · {tenant?.role}<br />
                  🔔 Admin will be notified via WhatsApp for approval
                </div>

                {error && (
                  <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#E05A5A' }}>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button onClick={submit} disabled={submitting}
                  style={{ width: '100%', padding: 12, background: submitting ? 'rgba(255,255,255,0.08)' : requestType === 'deletion' ? '#E05A5A' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {submitting ? 'Submitting...' : requestType === 'deletion' ? 'Request deletion →' : 'Submit correction request →'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}