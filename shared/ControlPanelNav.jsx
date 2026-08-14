// shared/ControlPanelNav.jsx — FINAL
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabaseClient';

// Was missing Help Admin, Access, and Security entirely — those pages
// were only reachable from the dashboard's own Quick Access grid, with
// no way back to any OTHER Control Panel section once there except
// the browser back button. Also had no Home link at all. Fixed here
// with the same primary+overflow "More" pattern already proven for
// School/Hospital nav once there are too many items for one bottom bar.
const PRIMARY_ITEMS = [
  { path: '/portal/dashboard',      icon: '🏠', label: 'Home',        roles: ['developer', 'support'] },
  { path: '/control/clients',       icon: '👥', label: 'Clients',     roles: ['developer', 'support'] },
  { path: '/control/tickets',       icon: '🎫', label: 'Tickets',     roles: ['developer', 'support'] },
  { path: '/control/billing',       icon: '💳', label: 'Billing',     roles: ['developer', 'support'] },
];

const MORE_ITEMS = [
  { path: '/control/onboarding',    icon: '🚀', label: 'Onboarding',  roles: ['developer', 'support'] },
  { path: '/control/modifications', icon: '✏️', label: 'Requests',    roles: ['developer', 'support'] },
  { path: '/control/help-admin',    icon: '📚', label: 'Help Admin',  roles: ['developer', 'support'] },
  { path: '/control/access',        icon: '🔐', label: 'Access',      roles: ['developer', 'support'] },
  { path: '/control/security',      icon: '🛡️', label: 'Security',    roles: ['developer', 'support'] },
];

export default function ControlPanelNav() {
  const location  = useLocation();
  const { tenant } = useTenant();
  const [showMore, setShowMore] = useState(false);

  const visiblePrimary = PRIMARY_ITEMS.filter((item) => !item.roles || item.roles.includes(tenant?.role));
  const visibleMore = MORE_ITEMS.filter((item) => !item.roles || item.roles.includes(tenant?.role));

  return (
    <>
      {showMore && (
        <div onClick={() => setShowMore(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#161618', borderTop: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px 16px 0 0', padding: '16px 0 24px', fontFamily: "'Inter', -apple-system, sans-serif" }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 10, padding: '0 16px 16px' }}>
              {visibleMore.map((item) => (
                <Link key={item.path} to={item.path} onClick={() => setShowMore(false)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '12px 8px', background: '#1C1C1E', borderRadius: 10 }}>
                  <span style={{ fontSize: 22 }}>{item.icon}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{item.label}</span>
                </Link>
              ))}
            </div>
            <button onClick={() => supabase.auth.signOut()}
              style={{ width: 'calc(100% - 32px)', margin: '0 16px', padding: 12, background: 'transparent', border: '1px solid rgba(224,90,90,0.3)', borderRadius: 10, color: '#E05A5A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Sign out
            </button>
          </div>
        </div>
      )}

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#111113',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        padding: '8px 0 12px',
        zIndex: 100,
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}>
        {visiblePrimary.map((item) => {
          const active = location.pathname.startsWith(item.path) && item.path !== '/portal/dashboard' || location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none', minWidth: 56, padding: '4px 0' }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
              <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#E8A020' : 'rgba(255,255,255,0.4)' }}>
                {item.label}
              </span>
              {active && (
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#E8A020', marginTop: 1 }} />
              )}
            </Link>
          );
        })}
        <button onClick={() => setShowMore(true)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', minWidth: 56, padding: '4px 0', fontFamily: 'inherit' }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>⋯</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>More</span>
        </button>
      </nav>
    </>
  );
}