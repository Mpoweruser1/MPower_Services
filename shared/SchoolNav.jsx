// shared/SchoolNav.jsx — FINAL
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';

const NAV_ITEMS = [
  { path: '/school/dashboard',     icon: '📊', label: 'Home' },
  { path: '/school/admission',     icon: '👤', label: 'Admit' },
  { path: '/school/attendance',    icon: '✅', label: 'Attendance' },
  { path: '/school/fee-collection',icon: '💰', label: 'Fees' },
  { path: '/school/reports',       icon: '🔍', label: 'Reports',
    // The 5 analytics/report screens moved out of "More" now open from
    // the Reports screen, so the Reports tab stays highlighted there.
    alsoActive: ['/school/attendance-analytics', '/school/academic-analytics', '/school/fee-analytics', '/school/fee-structure-report', '/school/hostel-welfare-report'] },
];

// "More" was one flat grid of 27 screens — hard to scan. Now grouped
// under headings, the same way the Reports screen is. The 5 report-type
// screens (Fee / Attendance / Academic analytics, Fee structure report,
// Hostel welfare eligibility) moved to the Reports screen, where the
// Advanced-plan lock applies to them.
const MORE_GROUPS = [
  { label: 'Students', items: [
    { path: '/school/student',          icon: '🔎', label: 'Find student' },
    { path: '/school/search',           icon: '🔍', label: 'Universal search' },
    { path: '/school/tc',               icon: '📜', label: 'Transfer certificate' },
    { path: '/school/certificates',     icon: '🏅', label: 'Certificates' },
    { path: '/school/id-cards',         icon: '🪪', label: 'ID cards' },
    { path: '/school/promote-students', icon: '🎓', label: 'Promote students' },
    { path: '/school/birthdays',        icon: '🎂', label: 'Birthday wishes' },
  ] },
  { label: 'Academics', items: [
    { path: '/school/marks-entry', icon: '✍️', label: 'Marks entry' },
    { path: '/school/report-card', icon: '📜', label: 'Report card' },
    { path: '/school/timetable',   icon: '🗓️', label: 'Timetable' },
    { path: '/school/homework',    icon: '📔', label: 'Homework diary' },
    { path: '/school/ptm',         icon: '🗓️', label: 'Parent meetings' },
    { path: '/school/subjects',    icon: '📚', label: 'Manage subjects' },
    { path: '/school/classes',     icon: '🏫', label: 'Manage classes' },
  ] },
  { label: 'Fees', items: [
    { path: '/school/fee-structure',    icon: '🧾', label: 'Fee structure' },
    { path: '/school/activity-finance', icon: '💵', label: 'Activity finance' },
  ] },
  { label: 'Facilities', items: [
    { path: '/school/transport',  icon: '🚌', label: 'Transport' },
    { path: '/school/hostel',     icon: '🏠', label: 'Hostel' },
    { path: '/school/activities', icon: '🎨', label: 'Activities' },
  ] },
  { label: 'Setup', items: [
    { path: '/school/staff',            icon: '👥', label: 'Manage staff' },
    { path: '/school/holidays',         icon: '📅', label: 'Holiday management' },
    { path: '/school/business-details', icon: '🏫', label: 'Business details' },
  ] },
];
const MORE_ITEMS = MORE_GROUPS.flatMap((g) => g.items);

export default function SchoolNav() {
  const location  = useLocation();
  const { tenant } = useTenant();
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
          (item.path !== '/school/dashboard' && location.pathname.startsWith(item.path)) ||
          (item.alsoActive || []).some((p) => location.pathname.startsWith(p));
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
      <button onClick={() => setShowMore(true)}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', minWidth: 56, padding: '4px 0', cursor: 'pointer' }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>⋯</span>
        <span style={{ fontSize: 10, fontWeight: MORE_ITEMS.some((i) => location.pathname.startsWith(i.path)) ? 600 : 400, color: MORE_ITEMS.some((i) => location.pathname.startsWith(i.path)) ? '#E8A020' : 'rgba(255,255,255,0.4)', letterSpacing: 0.2 }}>
          More
        </span>
      </button>
    </nav>

    {showMore && (
      <div onClick={() => setShowMore(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: '#161618', width: '100%', maxHeight: '80vh', overflowY: 'auto', borderRadius: '16px 16px 0 0', padding: '20px 16px 28px', fontFamily: "'Inter', -apple-system, sans-serif" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>More</p>
            <button onClick={() => setShowMore(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>
          {MORE_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 18 }}>
              <p style={{ margin: '0 0 6px 4px', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{group.label}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {group.items.map((item) => (
                  <Link key={item.path} to={item.path} onClick={() => setShowMore(false)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '10px 4px', background: '#1C1C1E', borderRadius: 10 }}>
                    <span style={{ fontSize: 24 }}>{item.icon}</span>
                    <span style={{ fontSize: 11, color: '#fff', textAlign: 'center', lineHeight: 1.3 }}>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
    </>
  );
}