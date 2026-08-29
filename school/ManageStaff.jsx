// school/ManageStaff.jsx — NEW
// The actual missing piece that made every role-based feature
// (ManageAccess.jsx, teacher-run Attendance, fee-clerk-run
// FeeCollection) incomplete — this is where those accounts actually
// get created.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const ROLE_LABELS = {
  teacher: 'Teacher',
  fee_clerk: 'Fee Clerk',
};

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  select: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

export default function ManageStaff() {
  const { tenant } = useTenant();
  const isPrincipal = tenant?.role === 'principal';

  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({ email: '', fullName: '', phone: '', role: 'teacher' });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (tenant?.appId) loadStaff();
  }, [tenant?.appId]);

  async function loadStaff() {
    setLoading(true);
    const { data } = await supabase
      .from('users')
      .select('id, full_name, phone, role, created_at')
      .eq('app_id', tenant.appId)
      .order('created_at');
    setStaff(data || []);
    setLoading(false);
  }

  function validate() {
    const errors = {};
    if (!form.email.trim() || !form.email.includes('@')) errors.email = 'Enter a valid email';
    if (!form.fullName.trim()) errors.fullName = 'Name required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function sendInvite() {
    if (!validate()) return;
    setInviting(true);
    setError('');
    setMessage('');

    const { data, error: inviteErr } = await supabase.functions.invoke('invite-staff-member', {
      body: {
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        role: form.role,
      },
    });

    setInviting(false);

    if (inviteErr || data?.error) {
      // supabase-js only populates `data` on a 2xx response. This edge
      // function deliberately returns non-2xx statuses (400/401/403/502)
      // with a real error message in the JSON body — that body lives in
      // inviteErr.context (a raw Response), not in `data`, on failure.
      // Without reading it, every failure showed the same generic
      // message no matter what the server actually said.
      let realMessage = data?.error;
      if (!realMessage && inviteErr?.context) {
        try {
          const body = await inviteErr.context.json();
          realMessage = body?.error;
        } catch {
          // context wasn't valid JSON — fall through to generic message
        }
      }
      setError(realMessage || 'Failed to send invite. Please try again.');
      return;
    }

    setMessage(`✅ Invite sent to ${form.email.trim()} — they'll get an email to set their own password.`);
    setForm({ email: '', fullName: '', phone: '', role: 'teacher' });
    setFormErrors({});
    loadStaff();
  }

  if (!isPrincipal) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <div style={{ ...S.card, textAlign: 'center', marginTop: 40 }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🔒</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
              Only the Principal account can manage staff.
            </p>
          </div>
        </div>
        <SchoolNav />
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Setup</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Manage Staff</h1>
          {!loading && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
              {staff.length} account{staff.length !== 1 ? 's' : ''} at {tenant?.orgName}
            </p>
          )}
        </div>

        {error && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {error}
          </div>
        )}
        {message && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>
            {message}
          </div>
        )}

        <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
          <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>Invite a staff member</p>
          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>Full name *</label>
            <input value={form.fullName} onChange={(e) => { setForm((f) => ({ ...f, fullName: e.target.value })); setFormErrors({}); }}
              placeholder="e.g. Priya Sharma" style={S.input(!!formErrors.fullName)} />
            {formErrors.fullName && <p style={S.fieldErr}>⚠ {formErrors.fullName}</p>}
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>Email *</label>
            <input value={form.email} onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setFormErrors({}); }}
              placeholder="their.email@example.com" style={S.input(!!formErrors.email)} />
            {formErrors.email && <p style={S.fieldErr}>⚠ {formErrors.email}</p>}
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
              They'll receive an email invite to set their own password — nothing is sent in plain text.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div>
              <label style={S.label}>Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Optional" style={S.input(false)} />
            </div>
            <div>
              <label style={S.label}>Role</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} style={S.select}>
                <option value="teacher">Teacher</option>
                <option value="fee_clerk">Fee Clerk</option>
              </select>
            </div>
          </div>
          <button onClick={sendInvite} disabled={inviting}
            style={{ width: '100%', padding: 12, border: 'none', borderRadius: 8, background: inviting ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', fontWeight: 700, cursor: inviting ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
            {inviting ? 'Sending invite...' : '📧 Send invite'}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 20 }}>Loading...</p>
        ) : (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
              Current staff ({staff.length})
            </p>
            {staff.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{s.full_name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    {ROLE_LABELS[s.role] || s.role}{s.phone ? ` · ${s.phone}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
      <SchoolNav />
      <BugReporter screenName="manage_staff" />
    </div>
  );
}
