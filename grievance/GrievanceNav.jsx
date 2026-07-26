// grievance/GrievanceNav.jsx — FINAL
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';

export default function GrievanceNav() {
  const location  = useLocation();
  const { tenant } = useTenant();

  const NAV_ITEMS = [
    { path: '/grievance/staff',       icon: '📋', label: 'Queue' },
    { path: '/grievance/reports',     icon: '📈', label: 'Reports' },
    { path: '/portal/dashboard',      icon: '🏠', label: 'Home' },
    ...(tenant?.role === 'grievance_admin' ? [
      { path: '/grievance/verify-queue', icon: '✅', label: 'Verify' },
    ] : []),
  ];

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#111113',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      padding: '8px 0 12px', zIndex: 100,
      fontFamily: "'Inter', sans-serif",
    }}>
      {NAV_ITEMS.map((item) => {
        const active = location.pathname === item.path;
        return (
          <Link key={item.path} to={item.path}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none', minWidth: 56, padding: '4px 0' }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, color: active ? '#E8A020' : 'rgba(255,255,255,0.4)' }}>
              {item.label}
            </span>
            {active && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#E8A020', marginTop: 1 }} />}
          </Link>
        );
      })}
    </nav>
  );
}