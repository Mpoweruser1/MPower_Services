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
        // The Print item is context-aware: if we're already sitting on
        // the print page, pressing it should actually trigger the
        // browser print dialog (like the page's own "Print now" button)
        // instead of navigating to itself with the query params
        // stripped, which looked like the button did nothing. From
        // every other screen (Queue/Reports/Verify) it still just
        // navigates to the print centre as before.
        const isPrintAction = l.to === '/grievance/print' && active;
        const itemStyle = {
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 3,
          textDecoration: 'none', minWidth: 56,
        };
        const inner = (
          <>
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
          </>
        );
        return isPrintAction ? (
          <button
            key={l.to}
            type="button"
            onClick={() => window.print()}
            style={{ ...itemStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {inner}
          </button>
        ) : (
          <Link key={l.to} to={l.to} style={itemStyle}>
            {inner}
          </Link>
        );
      })}
    </nav>
    </>
  );
}