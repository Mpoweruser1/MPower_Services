// shared/SchoolNav.jsx — FINAL
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';

const NAV_ITEMS = [
  { path: '/school/dashboard',     icon: '📊', label: 'Home' },
  { path: '/school/admission',     icon: '👤', label: 'Admit' },
  { path: '/school/attendance',    icon: '✅', label: 'Attendance' },
  { path: '/school/fee-collection',icon: '💰', label: 'Fees' },
  { path: '/school/reports',       icon: '🔍', label: 'Reports' },
];

export default function SchoolNav() {
  const location  = useLocation();
  const { tenant } = useTenant();

  return (
    <>
    <style>{`@media print { .no-print { display: none !important; } }`}</style>
    <nav className="no-print" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#111113',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      padding: '8px 0 12px',
      zIndex: 100,
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {NAV_ITEMS.map((item) => {
        const active = location.pathname === item.path ||
          (item.path !== '/school/dashboard' && location.pathname.startsWith(item.path));
        return (
          <Link key={item.path} to={item.path}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none', minWidth: 56, padding: '4px 0' }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, color: active ? '#E8A020' : 'rgba(255,255,255,0.4)', letterSpacing: 0.2 }}>
              {item.label}
            </span>
            {active && (
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#E8A020', marginTop: 1 }} />
            )}
          </Link>
        );
      })}
    </nav>
    </>
  );
}