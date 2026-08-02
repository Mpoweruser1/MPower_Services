// website/pages/ClientPortal.jsx — FINAL
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useTenant } from '../../context/TenantContext';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 40 },
  inner: { maxWidth: 640, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 14 },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
};

const TIER_FEATURES = {
  basic:       { price: 299,  label: 'Basic',       color: '#6AAA90' },
  standard:    { price: 599,  label: 'Standard',    color: '#5A9ADF' },
  advanced:    { price: 999,  label: 'Advanced',    color: '#9A8AE0' },
  specialised: { price: 1999, label: 'Specialised', color: '#E8A020' },
};

export default function ClientPortal() {
  const { tenant } = useTenant();
  const [tab, setTab]               = useState('account');
  const [orgName, setOrgName]       = useState(tenant?.orgName || '');
  const [phone, setPhone]           = useState(tenant?.phone || '');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd]         = useState('');
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdMsg, setPwdMsg]         = useState('');

  useEffect(() => {
    if (tenant?.orgName) setOrgName(tenant.orgName);
    if (tenant?.phone)   setPhone(tenant.phone);
  }, [tenant]);

  async function saveProfile() {
    setSaving(true);
    await supabase.from('apps').update({ org_name: orgName.trim() }).eq('id', tenant?.appId);
    await supabase.from('users').update({ phone: phone.trim() }).eq('auth_id', tenant?.userId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function changePassword() {
    if (!newPwd || newPwd.length < 8) { setPwdMsg('New password must be at least 8 characters.'); return; }
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setChangingPwd(false);
    if (error) { setPwdMsg('Failed to change password: ' + error.message); }
    else { setPwdMsg('✓ Password changed successfully.'); setCurrentPwd(''); setNewPwd(''); }
  }

  const tierCfg = TIER_FEATURES[tenant?.tier] || TIER_FEATURES.basic;
  const trialDaysLeft = tenant?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt) - Date.now()) / 86400000))
    : null;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>My Account</p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{tenant?.orgName}</p>
        </div>
        <Link to="/portal/dashboard" style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: 12 }}>← Dashboard</Link>
      </nav>

      <div style={S.inner}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {[{ k: 'account', l: 'Account' }, { k: 'subscription', l: 'Subscription' }, { k: 'security', l: 'Security' }].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Account tab */}
        {tab === 'account' && (
          <div style={S.card}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Profile</p>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Organisation name</label>
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} style={S.input} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Contact phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} style={S.input} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={S.label}>Role</label>
              <input value={tenant?.role || '—'} readOnly style={{ ...S.input, opacity: 0.5 }} />
            </div>
            {saved ? (
              <p style={{ fontSize: 13, color: '#6AAA90', fontWeight: 500 }}>✓ Profile updated</p>
            ) : (
              <button onClick={saveProfile} disabled={saving}
                style={{ width: '100%', padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Save profile'}
              </button>
            )}
          </div>
        )}

        {/* Subscription tab */}
        {tab === 'subscription' && (
          <>
            <div style={S.card}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Current plan</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: tierCfg.color }}>{tierCfg.label}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    {tenant?.clientStatus === 'trial' ? 'Free trial' : `₹${tierCfg.price}/month`}
                  </p>
                </div>
                {tenant?.clientStatus === 'trial' && trialDaysLeft !== null && (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: trialDaysLeft <= 7 ? '#E05A5A' : '#E8A020' }}>{trialDaysLeft}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>days left</p>
                  </div>
                )}
              </div>
              <Link to="/pricing"
                style={{ display: 'block', textAlign: 'center', padding: 11, background: '#E8A020', color: '#111113', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
                Upgrade plan →
              </Link>
            </div>

            <div style={S.card}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Need a custom feature?</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 14px', lineHeight: 1.6 }}>
                Raise a modification request — custom reports, extra fields, new modules. We quote within 2 working days.
              </p>
              <Link to="/control/modifications"
                style={{ display: 'block', textAlign: 'center', padding: 11, background: 'transparent', color: '#E8A020', border: '1px solid rgba(232,160,32,0.3)', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
                Modification requests →
              </Link>
            </div>
          </>
        )}

        {/* Security tab */}
        {tab === 'security' && (
          <div style={S.card}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Change password</p>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>New password</label>
              <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Min 8 characters" style={S.input} />
            </div>
            {pwdMsg && (
              <p style={{ fontSize: 13, color: pwdMsg.startsWith('✓') ? '#6AAA90' : '#E05A5A', marginBottom: 12 }}>{pwdMsg}</p>
            )}
            <button onClick={changePassword} disabled={changingPwd || newPwd.length < 8}
              style={{ width: '100%', padding: 11, background: changingPwd || newPwd.length < 8 ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: changingPwd || newPwd.length < 8 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {changingPwd ? 'Changing...' : 'Change password'}
            </button>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 12 }}>Session</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>
                Idle timeout: 30 minutes. You are automatically logged out after 30 minutes of inactivity for security.
              </p>
              <button onClick={() => supabase.auth.signOut().then(() => window.location.href = '/portal/login')}
                style={{ width: '100%', padding: 11, background: 'rgba(224,90,90,0.08)', color: '#E05A5A', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                Sign out of all devices
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}