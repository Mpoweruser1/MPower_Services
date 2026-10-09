// shared/RequireModule.jsx — NEW (9-10-2026)
// Keeps each product (School, Hospital, CTS) walled off from the others.
// A logged-in person may only open screens of THEIR OWN product, decided by
// tenant.appType (loaded from their organisation's row in TenantContext).
// Anyone else is sent to /portal/dashboard, which always shows their own
// product's links. No page of the wrong product renders, not even for a
// moment.
//
// Two exports:
//   RequireModule      — wrap a group of routes (layout route) or one screen.
//                        <Route element={<RequireModule modules={['school']} />}> ...routes... </Route>
//                        Optional blockRoles={['developer','support']}: those roles are
//                        refused here even if their organisation's product matches
//                        (developer/support work in the Control Panel only).
//   RedirectIfSignedIn — wrap the public website pages that advertise every
//                        product ("/" and "/products"). A real staff login is
//                        sent to its own dashboard instead. Visitors and
//                        anonymous citizens (no tenant) see the page as before.
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';

function Loading() {
  return (
    <div style={{ minHeight: '100vh', background: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading...</p>
    </div>
  );
}

export default function RequireModule({ modules, blockRoles, children }) {
  const { session, tenant, loading } = useTenant();

  if (loading) return <Loading />;
  if (!session) return <Navigate to="/portal/login" replace />;
  // Signed in but no staff record (e.g. an anonymous citizen session) —
  // none of these screens is theirs.
  if (!tenant) return <Navigate to="/portal/dashboard" replace />;
  if (!modules.includes(tenant.appType)) return <Navigate to="/portal/dashboard" replace />;
  if (blockRoles && blockRoles.includes(tenant.role)) return <Navigate to="/portal/dashboard" replace />;

  return children ?? <Outlet />;
}

export function RedirectIfSignedIn({ children }) {
  const { tenant, loading } = useTenant();

  if (loading) return <Loading />;
  if (tenant) return <Navigate to="/portal/dashboard" replace />;

  return children;
}
