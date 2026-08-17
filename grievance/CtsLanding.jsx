// grievance/CtsLanding.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStateConfig } from './useStateConfig';
import { fetchAppIdBySlug } from './grievanceApi';
import { supabase } from '../lib/supabaseClient';

// One localStorage key per state, so a remembered choice for Andhra Pradesh
// never bleeds into a different state's CTS deployment.
function roleStorageKey(slug) {
  return `mpower_cts_role_${slug}`;
}

function destinationFor(slug, role) {
  return role === 'office' ? '/portal/login' : `/grievance/${slug}/citizen`;
}

export default function CtsLanding() {
  const { stateSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const slug = stateSlug || 'andhra-pradesh';
  const { stateConfig, loading } = useStateConfig();
  const [checkingRemembered, setCheckingRemembered] = useState(true);
  const [appId, setAppId] = useState(undefined); // undefined = still resolving, null = not found
  // CM photo — same private bucket + signed URL pattern used on the
  // Batch Report letterhead and Home.jsx, resolved fresh on page load.
  const [cmPhotoUrl, setCmPhotoUrl] = useState(null);
  useEffect(() => {
    supabase.storage.from('representative-photos').createSignedUrl('cm_photo.jpg', 3600)
      .then(({ data }) => setCmPhotoUrl(data?.signedUrl || null))
      .catch(() => setCmPhotoUrl(null));
  }, []);

  useEffect(() => {
    fetchAppIdBySlug(slug).then(setAppId);
  }, [slug]);

  // A remembered choice auto-redirects on every future visit — unless the
  // visit explicitly asks to see the picker again via ?switch=1, which is
  // how "not you?" links elsewhere in the app can send someone back here.
  useEffect(() => {
    const forceSwitch = searchParams.get('switch') === '1';
    if (forceSwitch) { setCheckingRemembered(false); return; }

    let remembered = null;
    try { remembered = localStorage.getItem(roleStorageKey(slug)); } catch {}

    if (remembered === 'citizen' || remembered === 'office') {
      navigate(destinationFor(slug, remembered), { replace: true });
    } else {
      setCheckingRemembered(false);
    }
  }, [slug, searchParams, navigate]);

  function chooseRole(role) {
    try { localStorage.setItem(roleStorageKey(slug), role); } catch {}
    navigate(destinationFor(slug, role));
  }

  const stateName = stateConfig?.name_en || 'Andhra Pradesh';
  const stateNameLocal = stateConfig?.name_local || 'ఆంధ్రప్రదేశ్';
  const totalConstituencies = stateConfig?.total_constituencies || 175;

  if (loading || checkingRemembered || appId === undefined) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading...</div>
    </div>
  );

  if (appId === null) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
      <div>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>This state isn't set up on this platform yet. Check the link you were given, or contact your local office.</p>
        <a href="/" style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 600, textDecoration: 'underline' }}>← Back to home</a>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: '#f0f4f8', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#e8a020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#1a1a2e', fontSize: 16 }}>M</div>
          <div>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>MPower CTS</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
              {stateName} Grievance System
            </div>
          </div>
        </div>
        <button style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer' }}>
          {stateNameLocal} / English
        </button>
      </div>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', padding: '20px 0 32px', color: '#fff' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: cmPhotoUrl ? '0 16px' : 0 }}>
          {/* Continuously-scrolling single-line banner — replaces the
              earlier static, wrapped two-line tagline, which took up
              real vertical space before anyone reached the actual
              citizen/office choice below. Two identical copies placed
              back to back, animated left by exactly one copy's width,
              is what makes the loop seamless (no visible jump/reset).
              Still full-width on its own when there's no CM photo to
              share the row with — only shrinks to make room when one
              exists. */}
          <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <div style={{ display: 'inline-block', animation: 'ctsTickerScroll 22s linear infinite' }}>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', padding: '0 40px' }}>
                Your concern won't stop until it reaches your leader — <span style={{ color: '#e8a020', fontWeight: 600 }}>మీ సమస్య మీ నాయకుడి వరకు చేరే వరకు ఆగదు</span>
              </span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', padding: '0 40px' }}>
                Your concern won't stop until it reaches your leader — <span style={{ color: '#e8a020', fontWeight: 600 }}>మీ సమస్య మీ నాయకుడి వరకు చేరే వరకు ఆగదు</span>
              </span>
            </div>
          </div>

          {cmPhotoUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <img src={cmPhotoUrl} alt="Chief Minister" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e8a020' }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>Chief Minister,<br />{stateName}</span>
            </div>
          )}
        </div>

        <style>{`
          @keyframes ctsTickerScroll {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
        `}</style>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 32, padding: '16px 24px', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
        {[
          { num: totalConstituencies, label: 'Constituencies', te: 'నియోజకవర్గాలు' },
          { num: '₹0', label: 'Cost to citizen', te: 'పౌరుల ఖర్చు' },
          { num: '24/7', label: 'Available', te: 'అందుబాటు' },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e' }}>{s.num}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
            <div style={{ fontSize: 9, color: '#cbd5e1' }}>{s.te}</div>
          </div>
        ))}
      </div>

      {/* Cards */}
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '24px 16px 40px', display: 'grid', gap: 16 }}>

        {/* Citizen Card */}
        <div
          onClick={() => chooseRole('citizen')}
          style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: 22, cursor: 'pointer', border: '2px solid transparent' }}
        >
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 12 }}>🏠</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 2 }}>I am a Citizen</div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>నేను పౌరుడిని — ఫిర్యాదు దాఖలు చేయాలి</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {[['✓ Free', '#f0fdf4', '#15803d'], ['✓ Track status', '#eff6ff', '#1d4ed8'], ['✓ Local language', '#fff7ed', '#c2410c']].map(([label, bg, color]) => (
              <span key={label} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500, background: bg, color }}>{label}</span>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 14 }}>
            File a complaint to your MLA or MP about government schemes, roads, water, electricity or any local issue. Completely free.
          </div>
          <button style={{ width: '100%', padding: 12, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#1a1a2e', color: '#e8a020' }}>
            📋 File a Complaint → ఫిర్యాదు దాఖలు చేయండి
          </button>
        </div>

        {/* MLA Card */}
        <div
          onClick={() => chooseRole('office')}
          style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: 22, cursor: 'pointer', border: '2px solid transparent' }}
        >
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 12 }}>🏛️</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginBottom: 2 }}>I am an MLA / MP Office</div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>నేను MLA / MP కార్యాలయం</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {[['✓ Free setup', '#f0fdf4', '#15803d'], ['✓ Dashboard', '#eff6ff', '#1d4ed8'], ['✓ Reports', '#fff7ed', '#c2410c']].map(([label, bg, color]) => (
              <span key={label} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500, background: bg, color }}>{label}</span>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 14 }}>
            Register your constituency to receive, monitor and resolve citizen complaints. Real-time dashboard and monthly reports. Free forever.
          </div>
          <button style={{ width: '100%', padding: 12, border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#e8a020', color: '#1a1a2e' }}>
            🏛️ Register / Login → నమోదు / లాగిన్
          </button>
          <div
            onClick={(e) => { e.stopPropagation(); navigate(`/grievance/${slug}/request-access`); }}
            style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: '#64748b', cursor: 'pointer' }}
          >
            New MLA/MP office? <span style={{ color: '#1a1a2e', fontWeight: 600, textDecoration: 'underline' }}>Register here →</span>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '14px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: '#64748b' }}>
          Powered by <strong>MPower Services</strong> · mpowerind.in · Free for all citizens · Available in all Indian states
        </p>
      </div>

    </div>
  );
}