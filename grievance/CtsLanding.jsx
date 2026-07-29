// grievance/CtsLanding.jsx
// Dynamic nationwide CTS landing page
// URL: /grievance/:stateSlug
// Routes citizen to /grievance/:stateSlug/citizen
// Routes staff to /grievance/:stateSlug/staff

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStateConfig } from './useStateConfig';
import { useTenant } from '../context/TenantContext';

export default function CtsLanding() {
  const { stateSlug } = useParams();
  const navigate = useNavigate();
  const { config, loading, error } = useStateConfig(stateSlug);
  const { tenant } = useTenant();

  useEffect(() => {
    if (loading || !config) return;

    // Staff and admin go to staff dashboard
    if (tenant?.role && ['representative', 'authority', 'grievance_admin', 'grievance_staff'].includes(tenant.role)) {
      navigate(`/grievance/${stateSlug}/staff`, { replace: true });
      return;
    }

    // Everyone else goes to citizen portal
    navigate(`/grievance/${stateSlug}/citizen`, { replace: true });
  }, [loading, config, tenant, stateSlug, navigate]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#1a1a2e',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
          Loading...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', background: '#1a1a2e',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
      }}>
        <div style={{ textAlign: 'center', color: '#f87171', fontSize: 14, padding: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🚫</div>
          <div>This grievance portal is not available yet.</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>{stateSlug}</div>
        </div>
      </div>
    );
  }

  return null;
}