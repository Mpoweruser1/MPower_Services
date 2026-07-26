// shared/PermissionGate.jsx
import React from 'react';
import { usePermission } from './usePermission';

export default function PermissionGate({ moduleCode, action = 'can_view', children, fallback }) {
  const permission = usePermission(moduleCode);

  if (permission.loading) {
    return <div style={{ padding: 16, fontSize: 13, color: '#888' }}>Checking access...</div>;
  }

  if (!permission[action]) {
    return fallback || (
      <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: 20, fontFamily: 'sans-serif' }}>
        <p style={{ fontSize: 28 }}>🔒</p>
        <p style={{ fontSize: 14, color: '#888' }}>You don't have access to this section. Contact your administrator if you believe this is incorrect.</p>
      </div>
    );
  }

  return children;
}