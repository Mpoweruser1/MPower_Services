// shared/PermissionGate.jsx
import React from 'react';
import { usePermission } from './usePermission';

export default function PermissionGate({ moduleCode, action = 'can_view', children, fallback, nav }) {
  const permission = usePermission(moduleCode);

  // Both states below render `nav` when given. Without it, a user
  // denied access (or stuck on a slow permission check) would be
  // stranded with no way back — the same dead-end bug already fixed
  // across the rest of the app. Pass the screen's own nav, e.g.
  // <PermissionGate moduleCode="hostel" nav={<SchoolNav />}>.
  if (permission.loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#1C1C1E' }}>
        <div style={{ padding: 16, fontSize: 13, color: '#888' }}>Checking access...</div>
        {nav}
      </div>
    );
  }

  if (!permission[action]) {
    return fallback || (
      <div style={{ minHeight: '100vh', background: '#1C1C1E' }}>
        <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: 20, fontFamily: 'sans-serif' }}>
          <p style={{ fontSize: 28 }}>🔒</p>
          <p style={{ fontSize: 14, color: '#888' }}>You don't have access to this section. Contact your administrator if you believe this is incorrect.</p>
        </div>
        {nav}
      </div>
    );
  }

  return children;
}