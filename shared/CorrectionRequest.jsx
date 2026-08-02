// shared/CorrectionRequest.jsx — FINAL
// Embed this on any screen to let staff raise a correction or deletion request
// Usage: <CorrectionRequest module="student" recordId={student.id} recordLabel={student.full_name} fields={STUDENT_FIELDS} />

import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

// Pass these per module
export const STUDENT_FIELDS = [
  { key: 'full_name',      label: 'Full name' },
  { key: 'dob',            label: 'Date of birth' },
  { key: 'gender',         label: 'Gender' },
  { key: 'class_id',       label: 'Class / Section' },
  { key: 'caste_category', label: 'Caste category' },
  { key: 'parent_name',    label: 'Parent name' },
  { key: 'parent_phone',   label: 'Parent phone' },
  { key: 'admission_no',   label: 'Admission number' },
  { key: 'village_id',     label: 'Village' },
  { key: 'blood_group',    label: 'Blood group' },
  { key: 'apaar_id',       label: 'APAAR ID' },
];

export const PATIENT_FIELDS = [
  { key: 'full_name',   label: 'Full name' },
  { key: 'dob',         label: 'Date of birth' },
  { key: 'gender',      label: 'Gender' },
  { key: 'phone',       label: 'Phone number' },
  { key: 'blood_group', label: 'Blood group' },
  { key: 'address',     label: 'Address' },
  { key: 'allergies',   label: 'Allergies' },
  { key: 'abha_id',     label: 'ABHA ID' },
];

export const COMPLAINT_FIELDS = [
  { key: 'category',    label: 'Category' },
  { key: 'priority',    label: 'Priority' },
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

    const selectedField = fields?.find((f) => f.key === fieldName);

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
                        <input value={newValue} onChange={(e) => setNewValue(e.target.value)}
                          placeholder="What it should be" style={S.input} autoFocus />
                      </div>
                    </div>
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