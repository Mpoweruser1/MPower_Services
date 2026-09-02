// hospital/ManageHospitalStaff.jsx — NEW
// Mirrors school/ManageStaff.jsx exactly — the invite-staff-member
// edge function already checks for 'doctor' as a valid inviter role
// (confirmed real), meaning this was always meant to exist; the
// screen to actually use it was just never built.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import BugReporter from '../shared/BugReporter';

const ROLE_LABELS = {
  doctor: 'Doctor',
  nurse: 'Nurse',
  lab_technician: 'Lab Technician',
  receptionist: 'Receptionist',
  billing_clerk: 'Billing Clerk',
};

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
};

export default function ManageHospitalStaff() {
  const { tenant } = useTenant();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ email: '', fullName: '', phone: '', role: 'doctor' });

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    // email removed — users has no email column at all (confirmed
    // real schema). This query has been failing outright every time,
    // and since the error was never captured or checked, "Current
    // Staff" has silently shown empty for every hospital using this
    // screen, with no indication anything was wrong.
    const { data, error } = await supabase
      .from('users').select('id, full_name, phone, alternate_phone, role')
      .eq('app_id', tenant.appId).order('full_name');
    if (error) {
      console.error('Loading staff list failed:', error);
      setMessage(error.message || 'Failed to load staff list.');
    }
    setStaff(data || []);
    setLoading(false);
  }

  async function sendInvite() {
    if (!form.email.trim() || !form.fullName.trim()) {
      setMessage('Email and full name are required.');
      return;
    }
    setInviting(true);
    setMessage('');
    const { data, error } = await supabase.functions.invoke('invite-staff-member', {
      body: { email: form.email.trim(), fullName: form.fullName.trim(), phone: form.phone.trim(), role: form.role },
    });
    setInviting(false);
    if (error || data?.error) {
      setMessage(data?.error || 'Failed to send invite.');
      return;
    }
    setMessage(`✅ Invite sent to ${form.email}`);
    setForm({ email: '', fullName: '', phone: '', role: 'doctor' });
    load();
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Setup</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Manage Staff</h1>
        </div>

        {message && (
          <div style={{ background: message.startsWith('✅') ? 'rgba(106,170,144,0.08)' : 'rgba(224,90,90,0.08)', border: `1px solid ${message.startsWith('✅') ? 'rgba(106,170,144,0.2)' : 'rgba(224,90,90,0.2)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: message.startsWith('✅') ? '#6AAA90' : '#E05A5A' }}>
            {message}
          </div>
        )}

        <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
          <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>Invite a staff member</p>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Full name *</label>
            <input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} style={S.input} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Email *</label>
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={S.input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Role</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} style={{ ...S.input, cursor: 'pointer' }}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <button onClick={sendInvite} disabled={inviting}
            style={{ width: '100%', padding: 11, border: 'none', borderRadius: 8, background: inviting ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', fontWeight: 700, cursor: inviting ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            {inviting ? 'Sending invite...' : '📧 Send invite'}
          </button>
        </div>

        {!loading && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
              Current staff ({staff.length})
            </p>
            {staff.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, color: '#fff' }}>{s.full_name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{ROLE_LABELS[s.role] || s.role} · {s.phone || s.alternate_phone || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
      <HospitalNav />
      <BugReporter screenName="manage_hospital_staff" />
    </div>
  );
}
