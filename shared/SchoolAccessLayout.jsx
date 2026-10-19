// shared/SchoolAccessLayout.jsx — NEW (School Round 1, 16-10-2026)
//
// One layout route that wraps every /school/* screen in App.jsx:
//   <Route element={<SchoolAccessLayout />}> ...all School routes... </Route>
// It looks at the address in the browser, finds which permission module that
// screen needs (schoolAccess.js), and either shows the screen or a clear
// "no access" page that still has the menu on it. Typing a URL by hand gets
// the same answer as tapping the menu.
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SchoolAccessProvider, useSchoolAccess } from './SchoolAccessContext';
import { moduleForPath } from './schoolAccess';
import SchoolNav from './SchoolNav';

const wrap = { minHeight: '100vh', background: '#1C1C1E', fontFamily: "'Inter', -apple-system, sans-serif" };

function Checking() {
  return (
    <div style={wrap}>
      <p style={{ padding: 16, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Checking access...</p>
      <SchoolNav />
    </div>
  );
}

function Refused({ loadError, onRetry }) {
  return (
    <div style={wrap}>
      <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: 20 }}>
        <p style={{ fontSize: 28, margin: '0 0 8px' }}>🔒</p>
        {loadError ? (
          <>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
              Could not check your access just now. Check your connection and try again.
            </p>
            <button onClick={onRetry}
              style={{ marginTop: 8, padding: '10px 20px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Try again
            </button>
          </>
        ) : (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
            You don't have access to this section. Ask your principal to give you access if you need it.
          </p>
        )}
      </div>
      <SchoolNav />
    </div>
  );
}

function Guard() {
  const { pathname } = useLocation();
  const access = useSchoolAccess();
  const moduleCode = moduleForPath(pathname);

  // Dashboard: open to every School login.
  if (moduleCode === null) return <Outlet />;
  if (!access) return <Refused loadError={false} />;
  if (access.isOwner) return <Outlet />;
  if (access.loading) return <Checking />;
  if (moduleCode !== undefined && access.can(moduleCode)) return <Outlet />;
  return <Refused loadError={access.loadError} onRetry={access.retry} />;
}

export default function SchoolAccessLayout() {
  return (
    <SchoolAccessProvider>
      <Guard />
    </SchoolAccessProvider>
  );
}
