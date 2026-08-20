// shared/TopNav.jsx
// Persistent top navigation bar — shown on every portal screen
// Shows: MPower logo | module breadcrumb | user name + role | logout button
// Usage: <TopNav module="School" screen="Dashboard" />

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

const MODULE_COLORS = {
  school:   { bg: '#185FA5', label: 'School' },
  hospital: { bg: '#085041', label: 'Hospital' },
  control:  { bg: '#412402', label: 'Control panel' },
  grievance:{ bg: '#3C3489', label: 'Grievance' },
};

const ROLE_LABELS = {
  principal:       'Principal',
  teacher:         'Teacher',
  fee_clerk:       'Fee clerk',
  receptionist:    'Receptionist',
  doctor:          'Doctor',
  nurse:           'Nurse',
  developer:       'Developer',
  support:         'Support',
  grievance_staff: 'Grievance staff',
  grievance_admin: 'Grievance admin',
  parent:          'Parent',
  student:         'Student',
};

export default function TopNav({ screen }) {
  const { tenant } = useTenant();
  const navigate    = useNavigate();
  const location    = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Derive module from current path
  const path   = location.pathname;
  // Path-based detection is precise for module-specific routes
  // (/school/*, /hospital/*, /grievance/*, /control/*). But shared
  // routes used by every tenant type — /portal/dashboard,
  // /portal/account, /portal/setup, /corrections — don't start with
  // any of those, and this used to silently fall back to a hardcoded
  // 'school' regardless of who was actually logged in. A Hospital
  // doctor, a CTS grievance_admin, or Control-panel staff landing on
  // their own shared Portal Dashboard would all incorrectly see
  // "SCHOOL" in the badge. Falling back to the tenant's real role
  // instead of guessing fixes this for every tenant type at once.
  const ROLE_TO_MODULE = {
    principal: 'school', teacher: 'school', fee_clerk: 'school',
    parent: 'school', student: 'school',
    doctor: 'hospital', nurse: 'hospital', receptionist: 'hospital', pharmacist: 'hospital',
    grievance_staff: 'grievance', grievance_admin: 'grievance',
    representative: 'grievance', authority: 'grievance',
    developer: 'control', support: 'control',
  };
  const modKey = path.startsWith('/hospital') ? 'hospital'
               : path.startsWith('/control')  ? 'control'
               : path.startsWith('/grievance')? 'grievance'
               : path.startsWith('/school')   ? 'school'
               : ROLE_TO_MODULE[tenant?.role] || 'school';
  const mod    = MODULE_COLORS[modKey];

  // Initials for avatar
  const name     = tenant?.fullName || tenant?.role || 'User';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const roleLabel = ROLE_LABELS[tenant?.role] || tenant?.role || '';

  async function handleLogout() {
    setLoggingOut(true);
    // Clear any localStorage drafts
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('draft_') || k.startsWith('mpower_')) localStorage.removeItem(k);
    });
    // Must run BEFORE signOut() — the edge function identifies the
    // caller from their own still-valid access token. Wrapped so a
    // failed release (e.g. offline) never blocks sign-out itself;
    // worst case the row just goes stale on its own after 30 minutes.
    try {
      await supabase.functions.invoke('check-and-claim-session', { body: { action: 'release' } });
    } catch { /* non-blocking */ }
    await supabase.auth.signOut();
    // signOut triggers onAuthStateChange → session becomes null → RequireAuth redirects to /login
    setLoggingOut(false);
  }

  const NAV_STYLE = {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    height:          48,
    padding:         '0 16px',
    background:      '#111113',
    borderBottom:    '1px solid rgba(255,255,255,0.08)',
    fontFamily:      "'Inter', -apple-system, sans-serif",
    position:        'sticky',
    top:             0,
    zIndex:          100,
  };

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <nav style={NAV_STYLE}>
        {/* Left: logo + module badge + screen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: '#1a1a2e', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#e8a020',
          }}>M</div>

          <span style={{
            background: mod.bg, color: '#fff',
            fontSize: 10, fontWeight: 600,
            padding: '2px 8px', borderRadius: 4,
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>{mod.label}</span>

          {screen && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>›</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{screen}</span>
            </>
          )}
        </div>

        {/* Right: user avatar + name + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(232,160,32,0.12)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: '#E8A020',
          }}>{initials}</div>

          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{roleLabel}</div>
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={loggingOut}
            style={{
              marginLeft: 6,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </nav>

      {/* Confirm dialog — inline, no fixed position */}
      {showConfirm && (
        <div style={{
          background: '#161618',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          padding: 20,
          margin: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
          <span style={{ fontSize: 13, color: '#fff' }}>Sign out of MPower?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowConfirm(false)}
              style={{ padding: '6px 14px', fontSize: 12, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit' }}
            >Cancel</button>
            <button
              onClick={handleLogout}
              style={{ padding: '6px 14px', fontSize: 12, border: 'none', borderRadius: 6, background: '#E05A5A', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >Sign out</button>
          </div>
        </div>
      )}
    </>
  );
}