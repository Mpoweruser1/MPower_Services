// shared/HospitalNav.jsx — FINAL
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/hospital/dashboard',    icon: '📊', label: 'Home' },
  { path: '/hospital/patients/new', icon: '👤', label: 'Register' },
  { path: '/hospital/opd',          icon: '🩺', label: 'OPD' },
  { path: '/hospital/billing',      icon: '💳', label: 'Billing' },
  { path: '/hospital/ipd',          icon: '🛏️', label: 'IPD' },
];

export default function HospitalNav() {
  const location = useLocation();

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
          (item.path !== '/hospital/dashboard' && location.pathname.startsWith(item.path));
        return (
          <Link key={item.path} to={item.path}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none', minWidth: 56, padding: '4px 0' }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, color: active ? '#5A9ADF' : 'rgba(255,255,255,0.4)', letterSpacing: 0.2 }}>
              {item.label}
            </span>
            {active && (
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#5A9ADF', marginTop: 1 }} />
            )}
          </Link>
        );
      })}
    </nav>
    </>
  );
}