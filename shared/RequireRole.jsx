// shared/RequireRole.jsx — FINAL
// Wraps routes that should only be accessible by specific roles
// Usage: <RequireRole roles={['developer','support']}><Component /></RequireRole>

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';

export default function RequireRole({ roles, children, redirectTo = '/portal/dashboard' }) {
  const { tenant, loading } = useTenant();

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading...</p>
    </div>
  );

  if (!tenant) return <Navigate to="/portal/login" replace />;

  if (!roles.includes(tenant.role)) {
    return (
      <div style={{ minHeight: '100vh', background: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 32 }}>🔐</p>
        <p style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Access denied</p>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          This page requires {roles.join(' or ')} role. You are logged in as {tenant.role}.
        </p>
        <a href="/portal/dashboard" style={{ color: '#E8A020', fontSize: 13 }}>← Back to dashboard</a>
      </div>
    );
  }

  return children;
}