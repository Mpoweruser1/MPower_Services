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
  const modKey = path.startsWith('/hospital') ? 'hospital'
               : path.startsWith('/control')  ? 'control'
               : path.startsWith('/grievance')? 'grievance'
               : 'school';
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
    background:      '#fff',
    borderBottom:    '1px solid #e2e8f0',
    fontFamily:      'sans-serif',
    position:        'sticky',
    top:             0,
    zIndex:          100,
  };

  return (
    <>
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
              <span style={{ color: '#cbd5e1', fontSize: 13 }}>›</span>
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{screen}</span>
            </>
          )}
        </div>

        {/* Right: user avatar + name + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: '#E6F1FB', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: '#185FA5',
          }}>{initials}</div>

          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e' }}>{name}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{roleLabel}</div>
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={loggingOut}
            style={{
              marginLeft: 6,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 600,
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              background: '#fff',
              color: '#64748b',
              cursor: 'pointer',
            }}
          >
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </nav>

      {/* Confirm dialog — inline, no fixed position */}
      {showConfirm && (
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: 20,
          margin: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span style={{ fontSize: 13, color: '#374151' }}>Sign out of MPower?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowConfirm(false)}
              style={{ padding: '6px 14px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#64748b', cursor: 'pointer' }}
            >Cancel</button>
            <button
              onClick={handleLogout}
              style={{ padding: '6px 14px', fontSize: 12, border: 'none', borderRadius: 6, background: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >Sign out</button>
          </div>
        </div>
      )}
    </>
  );
}