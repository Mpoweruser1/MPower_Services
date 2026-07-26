// shared/RepresentativeBanner.jsx
// Shows CM photo (left) and MLA/Representative photo (right)
// Used on CitizenPortal and Staff Dashboard
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

function PhotoCard({ name, designation, party, photoUrl, since, side }) {
  const initials = name ? name.split(' ').map((w) => w[0]).slice(0, 2).join('') : '?';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', flex: 1, padding: '12px 8px',
    }}>
      {/* Photo or initials avatar */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        overflow: 'hidden', marginBottom: 8,
        border: '3px solid #fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        background: side === 'left' ? '#185FA5' : '#534AB7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <span style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{initials}</span>
        )}
      </div>
      <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#0D1B2A' }}>{name || '—'}</p>
      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#534AB7', fontWeight: 500 }}>{designation}</p>
      {party && <p style={{ margin: '1px 0 0', fontSize: 10, color: '#888' }}>{party}</p>}
      {since && <p style={{ margin: '1px 0 0', fontSize: 10, color: '#aaa' }}>Since {new Date(since).getFullYear()}</p>}
    </div>
  );
}

export default function RepresentativeBanner({ appId, stateName, constituencyId }) {
  const [cm, setCm] = useState(null);
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!stateName) { setLoading(false); return; }

      // Load CM for this state
      const { data: cmData } = await supabase
        .from('cms')
        .select('*')
        .eq('state_name', stateName)
        .eq('is_active', true)
        .maybeSingle();
      setCm(cmData);

      // Load MLA/Representative for this constituency or app
      if (constituencyId) {
        const { data: constData } = await supabase
          .from('constituencies')
          .select('rep_name, rep_photo_url, rep_party, rep_designation, rep_since, tier')
          .eq('id', constituencyId)
          .maybeSingle();
        setRep(constData);
      } else if (appId) {
        // Fall back to app's constituency
        const { data: constData } = await supabase
          .from('constituencies')
          .select('rep_name, rep_photo_url, rep_party, rep_designation, rep_since, tier')
          .eq('app_id', appId)
          .limit(1)
          .maybeSingle();
        setRep(constData);
      }

      setLoading(false);
    }
    load();
  }, [stateName, constituencyId, appId]);

  if (loading || (!cm && !rep)) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #E6F1FB 0%, #EEEDFE 100%)',
      borderRadius: 12, marginBottom: 16, overflow: 'hidden',
      border: '1px solid #ddd',
    }}>
      {/* State name header */}
      <div style={{
        background: '#0D1B2A', padding: '6px 12px', textAlign: 'center',
      }}>
        <p style={{ margin: 0, fontSize: 11, color: '#EF9F27', fontWeight: 600, letterSpacing: 1 }}>
          {stateName ? `GOVERNMENT OF ${stateName.toUpperCase()}` : 'COMPLAINT TRACKING SYSTEM'}
        </p>
        <p style={{ margin: '1px 0 0', fontSize: 10, color: '#aaa' }}>
          Powered by MPower Public Services
        </p>
      </div>

      {/* Photos row */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* CM - left side */}
        {cm && (
          <PhotoCard
            name={cm.cm_name}
            designation={cm.cm_designation || 'Chief Minister'}
            party={cm.cm_party}
            photoUrl={cm.cm_photo_url}
            since={cm.cm_since}
            side="left"
          />
        )}

        {/* Divider */}
        {cm && rep && (
          <div style={{ width: 1, background: '#ddd', margin: '12px 0' }} />
        )}

        {/* MLA/Rep - right side */}
        {rep && (
          <PhotoCard
            name={rep.rep_name}
            designation={rep.rep_designation || 'MLA'}
            party={rep.rep_party}
            photoUrl={rep.rep_photo_url}
            since={rep.rep_since}
            side="right"
          />
        )}
      </div>

      {/* Constituency name footer */}
      {rep && (
        <div style={{
          background: 'rgba(83,74,183,0.08)', padding: '5px 12px',
          textAlign: 'center', borderTop: '1px solid #ddd',
        }}>
          <p style={{ margin: 0, fontSize: 11, color: '#534AB7', fontWeight: 500 }}>
            Your {rep.tier || 'MLA'} Constituency Representative
          </p>
        </div>
      )}
    </div>
  );
}