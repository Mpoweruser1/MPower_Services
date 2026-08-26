// shared/TierGate.jsx — NEW
// Wraps a full screen (rather than a single catalog entry) with a
// tier check. Reuses the exact lock badge styling already
// established in ReportsSearchIdCards.jsx's report catalog, rather
// than inventing a new visual language for "this is locked."
import React from 'react';
import { useTenant } from '../context/TenantContext';
import { canAccess } from './tierAccess';
import SchoolNav from './SchoolNav';

export default function TierGate({ requiredTier, featureName, children }) {
  const { tenant } = useTenant();

  if (canAccess(tenant?.tier, requiredTier)) {
    return children;
  }

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '80px 20px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 40, marginBottom: 16 }}>&#128274;</p>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>{featureName} is a {requiredTier} plan feature</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 1.6 }}>
          Your current plan doesn't include this. Contact your MPower account manager to upgrade.
        </p>
        <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 12, background: 'rgba(232,160,32,0.12)', color: '#E8A020', fontWeight: 500 }}>
          Requires: {requiredTier}
        </span>
      </div>
      <SchoolNav />
    </div>
  );
}
