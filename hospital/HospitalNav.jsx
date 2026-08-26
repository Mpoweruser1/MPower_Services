// shared/HospitalNav.jsx — FINAL
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

// Day-to-day operational screens stay in the primary bar. Setup/admin
// screens (Find, Wards, Doctors) move to "More" — same primary+overflow
// pattern SchoolNav.jsx already uses once there are too many items for
// one bottom bar to hold comfortably.
const NAV_ITEMS = [
  { path: '/hospital/dashboard',    icon: '📊', label: 'Home' },
  { path: '/hospital/patients/new', icon: '👤', label: 'Register' },
  { path: '/hospital/opd',          icon: '🩺', label: 'OPD' },
  { path: '/hospital/lab',          icon: '🧪', label: 'Lab reports' },
  { path: '/hospital/billing',      icon: '💳', label: 'Billing' },
  { path: '/hospital/ipd',          icon: '🛏️', label: 'IPD' },
];

const MORE_ITEMS = [
  { path: '/hospital/patients/find', icon: '🔍', label: 'Find patient' },
  { path: '/hospital/wards',         icon: '🛏️', label: 'Manage wards' },
  { path: '/hospital/doctors',       icon: '🩺', label: 'Manage doctors' },
  { path: '/hospital/staff',         icon: '👥', label: 'Manage staff' },
  { path: '/hospital/billing-analytics', icon: '📊', label: 'Billing analytics' },
  { path: '/hospital/appointment-analytics', icon: '📈', label: 'Appointment analytics' },
  { path: '/hospital/lab-tests',     icon: '🔬', label: 'Manage lab tests' },
  { path: '/hospital/appointments',  icon: '📅', label: 'OPD Appointments' },
  { path: '/hospital/reports',       icon: '📊', label: 'Reports' },
];

export default function HospitalNav() {
  const location = useLocation();
  const [showMore, setShowMore] = useState(false);

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
      <button onClick={() => setShowMore(true)}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', minWidth: 56, padding: '4px 0', cursor: 'pointer' }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>⋯</span>
        <span style={{ fontSize: 10, fontWeight: MORE_ITEMS.some((i) => location.pathname.startsWith(i.path)) ? 600 : 400, color: MORE_ITEMS.some((i) => location.pathname.startsWith(i.path)) ? '#5A9ADF' : 'rgba(255,255,255,0.4)', letterSpacing: 0.2 }}>
          More
        </span>
      </button>
    </nav>

    {showMore && (
      <div onClick={() => setShowMore(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: '#161618', width: '100%', borderRadius: '16px 16px 0 0', padding: '20px 16px 28px', fontFamily: "'Inter', -apple-system, sans-serif" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>More</p>
            <button onClick={() => setShowMore(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {MORE_ITEMS.map((item) => (
              <Link key={item.path} to={item.path} onClick={() => setShowMore(false)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '10px 4px' }}>
                <span style={{ fontSize: 26 }}>{item.icon}</span>
                <span style={{ fontSize: 11, color: '#fff', textAlign: 'center', lineHeight: 1.3 }}>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
