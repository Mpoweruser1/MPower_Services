// shared/TopBar.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

export default function TopBar({ screenTitle }) {
  const { tenant } = useTenant();

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/portal/login';
  }

  return (
    <>
      <style>{`
        @media print {
          .mpower-topbar { display: none !important; }
        }
      `}</style>
      <div
        className="mpower-topbar"
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', background: '#0D1B2A', color: '#fff',
          position: 'sticky', top: 0, zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/portal/dashboard" style={{ color: '#EF9F27', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            ← MPower
          </Link>
          {screenTitle && (
            <>
              <span style={{ color: '#555', fontSize: 13 }}>|</span>
              <span style={{ fontSize: 13, color: '#ccc' }}>{screenTitle}</span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {tenant?.fullName && (
            <span style={{ fontSize: 12, color: '#aaa' }}>{tenant.fullName} · {tenant.role}</span>
          )}
          <button
            onClick={logout}
            style={{
              fontSize: 12, padding: '5px 12px', border: '1px solid #444',
              borderRadius: 6, background: 'transparent', color: '#ccc',
              cursor: 'pointer',
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </>
  );
}