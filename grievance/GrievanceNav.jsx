// grievance/GrievanceNav.jsx
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';

export default function GrievanceNav() {
  const { stateSlug } = useParams();
  const slug = stateSlug || 'andhra-pradesh';
  const location = useLocation();
  const path = location.pathname;
  const { tenant } = useTenant();
  const isStaff = !!tenant;

  const allLinks = [
    { to: `/grievance/${slug}/staff`,   icon: '📋', label: 'Queue',   te: 'క్యూ',       staffOnly: true },
    { to: `/grievance/${slug}/reports`, icon: '📈', label: 'Reports', te: 'నివేదికలు',  staffOnly: true },
    { to: `/grievance/${slug}/admin`,   icon: '✅', label: 'Verify',  te: 'ధృవీకరణ',    staffOnly: true },
    { to: `/grievance/print`,           icon: '🖨️', label: 'Print',   te: 'ముద్రణ',      staffOnly: false },
  ];
  const links = allLinks.filter((l) => !l.staffOnly || isStaff);

  return (
    <>
    <style>{`@media print { .no-print { display: none !important; } }`}</style>
    <nav className="no-print" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#1a1a2e', borderTop: '1px solid rgba(255,255,255,0.1)',
      display: 'flex', justifyContent: 'space-around',
      padding: '8px 0 12px', zIndex: 100,
    }}>
      {links.map(l => {
        const active = path === l.to;
        return (
          <Link key={l.to} to={l.to} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 3,
            textDecoration: 'none', minWidth: 56,
          }}>
            <span style={{ fontSize: 20 }}>{l.icon}</span>
            <span style={{
              fontSize: 10,
              fontWeight: active ? 700 : 400,
              color: active ? '#e8a020' : 'rgba(255,255,255,0.4)',
            }}>
              {l.label}
            </span>
            {active && (
              <div style={{
                width: 4, height: 4,
                borderRadius: '50%', background: '#e8a020',
              }} />
            )}
          </Link>
        );
      })}
    </nav>
    </>
  );
}