// website/pages/PortalDashboard.jsx — FINAL
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useTenant } from '../../context/TenantContext';

const SCHOOL_LINKS = [
  { label: 'Dashboard',            path: '/school/dashboard',      icon: '📊' },
  { label: 'Student Admission',    path: '/school/admission',      icon: '👤' },
  { label: 'Manage Classes',       path: '/school/classes', icon: '🏫' },
  { label: 'Attendance',           path: '/school/attendance',     icon: '✅' },
  { label: 'Fee Collection',       path: '/school/fee-collection', icon: '💰' },
  { label: 'Transfer Certificate', path: '/school/tc',             icon: '📄' },
  { label: 'Certificates',         path: '/school/certificates',   icon: '🎓' },
  { label: 'Transport',            path: '/school/transport',      icon: '🚌' },
  { label: 'Hostel',               path: '/school/hostel',         icon: '🏠' },
  { label: 'Activities & Coaching',path: '/school/activities',     icon: '⚽' },
  { label: 'Reports & Search',     path: '/school/reports',        icon: '🔍' },
];

const HOSPITAL_LINKS = [
  { label: 'Dashboard',            path: '/hospital/dashboard',    icon: '📊' },
  { label: 'Patient Registration', path: '/hospital/patients/new', icon: '🧑‍⚕️' },
  { label: 'OPD Visit',            path: '/hospital/opd',          icon: '🩺' },
  { label: 'Billing',              path: '/hospital/billing',      icon: '💳' },
  { label: 'IPD / Bed Management', path: '/hospital/ipd',          icon: '🛏️' },
  { label: 'Lab Reports',          path: '/hospital/lab',          icon: '🔬' },
];

const CONTROL_LINKS = [
  { label: 'Clients',      path: '/control/clients',       icon: '👥' },
  { label: 'Tickets',      path: '/control/tickets',       icon: '🎫' },
  { label: 'Billing',      path: '/control/billing',       icon: '💳' },
  { label: 'Onboarding',   path: '/control/onboarding',    icon: '🚀' },
  { label: 'Requests',     path: '/control/modifications', icon: '✏️' },
  { label: 'Help Admin',   path: '/control/help-admin',    icon: '📚' },
  { label: 'Access',       path: '/control/access',        icon: '🔐' },
  { label: 'Security',     path: '/control/security',      icon: '🛡️' },
];

function grievanceLinks(role) {
  const links = [
    { label: 'Complaint Queue', path: '/grievance/staff',   icon: '📋' },
    { label: 'Reports',         path: '/grievance/reports', icon: '📈' },
  ];
  if (role === 'grievance_admin') {
    links.splice(1, 0, {
      label: 'Verification Queue',
      path:  '/grievance/verify-queue',
      icon:  '✅',
    });
  }
  return links;
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 640, margin: '0 auto', padding: '32px 20px 40px' },
};

export default function PortalDashboard() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [appInfo, setAppInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAppInfo() {
      if (!tenant?.appId) { setLoading(false); return; }
      const { data } = await supabase
        .from('apps')
        .select('app_type, org_name, subscription_tier')
        .eq('id', tenant.appId)
        .single();
      setAppInfo(data);
      setLoading(false);
    }
    if (!tenantLoading) loadAppInfo();
  }, [tenant, tenantLoading]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/portal/login';
  }

  if (tenantLoading || loading) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading your dashboard...</p>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>You are not logged in.</p>
          <Link to="/portal/login" style={{ color: '#E8A020' }}>Go to login →</Link>
        </div>
      </div>
    );
  }

  const appType = appInfo?.app_type || tenant?.appType;

  const isSchool    = appType === 'school';
  const isHospital  = appType === 'hospital';
  const isGrievance = appType === 'grievance' || appType === 'government';
  const isControl   = ['developer', 'support'].includes(tenant.role);

  const links = isControl   ? CONTROL_LINKS
              : isHospital  ? HOSPITAL_LINKS
              : isGrievance ? grievanceLinks(tenant.role)
              : SCHOOL_LINKS;

  const sectorBadge = isControl   ? { icon: '🖥️',  label: 'Control Panel',      color: '#9B7FE8' }
                    : isHospital  ? { icon: '🏥',  label: 'Hospital',            color: '#5A9ADF' }
                    : isGrievance ? { icon: '🏛️', label: 'Complaint Tracking',  color: '#E8A020' }
                    :               { icon: '🏫',  label: 'School',              color: '#6AAA90' };

  const trialDaysLeft = tenant?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt) - Date.now()) / 86400000))
    : null;

  const isPrincipalOrDoctor = ['principal', 'doctor', 'grievance_admin'].includes(tenant.role);

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      {/* Top bar */}
      <div style={{ background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 13 }}>M</div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>MPower Portal</span>
        </div>
        <button onClick={logout}
          style={{ fontSize: 12, padding: '6px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
          Log out
        </button>
      </div>

      <div style={S.inner}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 4px' }}>Welcome back</p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: -0.5 }}>
            {appInfo?.org_name || tenant?.orgName || 'Dashboard'}
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
            {tenant?.fullName && `${tenant.fullName} · `}{tenant?.role}
          </p>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: `${sectorBadge.color}15`, color: sectorBadge.color, fontWeight: 500 }}>
            {sectorBadge.icon} {sectorBadge.label}
          </span>
          <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>
            {tenant?.tier || 'basic'} tier
          </span>
          {tenant?.clientStatus === 'trial' && trialDaysLeft !== null && (
            <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: trialDaysLeft <= 7 ? 'rgba(224,90,90,0.12)' : 'rgba(232,160,32,0.12)', color: trialDaysLeft <= 7 ? '#E05A5A' : '#E8A020' }}>
              ⏰ {trialDaysLeft} days left in trial
            </span>
          )}
        </div>

        {/* Quick access */}
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
          Quick access
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
          {links.map((link) => (
            <Link key={link.path} to={link.path}
              style={{ display: 'block', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none', background: '#161618', textAlign: 'center' }}>
              <span style={{ fontSize: 26, display: 'block', marginBottom: 8 }}>{link.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#fff', lineHeight: 1.3 }}>{link.label}</span>
            </Link>
          ))}
        </div>

        {/* Corrections link — principal/doctor/admin only */}
        {isPrincipalOrDoctor && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 500, color: '#E8A020' }}>
              ✏️ Data corrections & deletions
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Review and approve correction requests from staff
            </p>
            <Link to="/corrections"
              style={{ fontSize: 13, color: '#E8A020', textDecoration: 'none', fontWeight: 500 }}>
              Open corrections queue →
            </Link>
          </div>
        )}

        {/* Grievance citizen portal link */}
        {isGrievance && (
          <div style={{ background: 'rgba(90,154,223,0.06)', border: '1px solid rgba(90,154,223,0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 500, color: '#5A9ADF' }}>
              🏛️ Citizen Portal
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Share this link with citizens to file complaints
            </p>
            <Link to="/grievance/andhra-pradesh/citizen"
              style={{ fontSize: 13, color: '#5A9ADF', textDecoration: 'none', fontWeight: 500 }}>
              /grievance/andhra-pradesh/citizen →
            </Link>
          </div>
        )}

        {/* Setup link — if first time */}
        <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
          Need help getting started?{' '}
          <Link to="/portal/setup" style={{ color: '#E8A020', textDecoration: 'none' }}>
            Open setup wizard →
          </Link>
          {' '}or contact support.
        </div>
      </div>
    </div>
  );
}