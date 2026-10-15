// src/grievance/ProblemLocationFields.jsx   (NEW file -- add, don't replace; 14-10-2026)
//
// "Where is the problem?" for the CTS complaint form (stage 2 of the problem-location work).
//
// Until now a complaint was placed where the CITIZEN LIVES. A broken main road on the
// other side of the constituency was counted against the complainant's own village.
// This adds the problem's own place, with these rules (agreed 14-10-2026):
//   * default = "same as my home area" -- nothing extra to fill in;
//   * or a different mandal / village / ward INSIDE the citizen's own constituency
//     (only places from the lists, no new villages can be created here);
//   * optional landmark text and optional "use my current location" (GPS);
//   * the choice is FINAL once submitted -- the database refuses later changes.
//
// The database (cts_problem_location_stage1.sql) re-checks everything: same constituency,
// village inside mandal, ward inside village. Nothing here is trusted on its own.
//
// Used by CitizenPortal.jsx:
//   const loc = useProblemLocation({ citizen, appSettings, t });
//   <ProblemLocationFields loc={loc} t={t} landmarkMic={<MicButton .../>} />
//   submitComplaint({ ..., ...loc.payload() })

import { useState, useEffect } from 'react';
import { fetchMandals, fetchVillages, fetchSachivalayams } from './grievanceApi';

export function useProblemLocation({ citizen, appSettings, t }) {
  const [mode, setModeState] = useState('home'); // 'home' | 'other'
  const [mandals, setMandals] = useState([]);
  const [homeVillageName, setHomeVillageName] = useState('');
  const [homeMandalName, setHomeMandalName] = useState('');
  const [mandalId, setMandalIdState] = useState(citizen?.mandal_id || '');
  const [villages, setVillages] = useState([]);
  const [villageId, setVillageId] = useState('');
  const [sachivalayams, setSachivalayams] = useState([]);
  const [sachivalayamId, setSachivalayamId] = useState('');
  const [landmark, setLandmark] = useState('');
  const [gps, setGps] = useState(null); // { lat, lng, accuracy }
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('');
  const [listError, setListError] = useState(false);

  const hasSachivalayam = !!appSettings?.has_sachivalayam;

  // The home area's names (for the "same as my home area" line) and the mandal list.
  useEffect(() => {
    if (!citizen?.constituency_id) return undefined;
    let cancelled = false;
    Promise.all([
      fetchMandals(citizen.constituency_id),
      citizen.mandal_id ? fetchVillages(citizen.mandal_id) : Promise.resolve([]),
    ])
      .then(([mandalList, homeVillages]) => {
        if (cancelled) return;
        setMandals(mandalList);
        setHomeMandalName(mandalList.find((m) => m.id === citizen.mandal_id)?.name || '');
        setHomeVillageName(homeVillages.find((v) => v.id === citizen.village_id)?.name || '');
      })
      .catch(() => { if (!cancelled) setListError(true); });
    return () => { cancelled = true; };
  }, [citizen?.constituency_id, citizen?.mandal_id, citizen?.village_id]);

  // Villages of the chosen mandal -- only needed while "a different place" is selected.
  useEffect(() => {
    if (mode !== 'other' || !mandalId) { setVillages([]); return undefined; }
    let cancelled = false;
    fetchVillages(mandalId)
      .then((list) => {
        if (cancelled) return;
        setVillages(list);
        setVillageId((v) => (list.some((x) => x.id === v) ? v : ''));
      })
      .catch(() => { if (!cancelled) setListError(true); });
    return () => { cancelled = true; };
  }, [mode, mandalId]);

  // Wards of the chosen village (only for states that use sachivalayams).
  useEffect(() => {
    if (mode !== 'other' || !villageId || !hasSachivalayam) {
      setSachivalayams([]);
      setSachivalayamId('');
      return undefined;
    }
    let cancelled = false;
    fetchSachivalayams(villageId)
      .then((list) => {
        if (cancelled) return;
        setSachivalayams(list);
        setSachivalayamId((s) => (list.some((x) => x.id === s) ? s : ''));
      })
      .catch(() => { if (!cancelled) setSachivalayams([]); });
    return () => { cancelled = true; };
  }, [mode, villageId, hasSachivalayam]);

  function setMode(next) {
    setModeState(next);
    if (next === 'home') {
      setVillageId('');
      setSachivalayamId('');
      setMandalIdState(citizen?.mandal_id || '');
    }
  }

  function setMandalId(id) {
    setMandalIdState(id);
    setVillageId('');
    setSachivalayamId('');
  }

  function requestGps() {
    setGpsMessage('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsMessage(t('pl_gps_unavailable', 'This phone or browser cannot share its location.'));
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
          lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
          accuracy: Math.round(pos.coords.accuracy || 0),
        });
        setGpsBusy(false);
      },
      (err) => {
        setGpsBusy(false);
        setGpsMessage(
          err && err.code === 1
            ? t('pl_gps_denied', 'Location was not allowed. You can still describe the place in the landmark box.')
            : t('pl_gps_failed', 'Could not get your location. You can still describe the place in the landmark box.'),
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  function clearGps() {
    setGps(null);
    setGpsMessage('');
  }

  // A different place was really chosen (choosing the home village again, with no ward,
  // is the same as "my home area" and is filed that way).
  const isDifferent =
    mode === 'other' && !!villageId && !(villageId === citizen?.village_id && !sachivalayamId);

  function validate() {
    return !(mode === 'other' && !villageId);
  }

  // The fields saved with the complaint. The mandal is worked out by the database.
  function payload() {
    const text = landmark.trim();
    return {
      problemVillageId: isDifferent ? villageId : null,
      problemSachivalayamId: isDifferent && sachivalayamId ? sachivalayamId : null,
      problemLandmark: text || null,
      problemLatitude: gps ? gps.lat : null,
      problemLongitude: gps ? gps.lng : null,
    };
  }

  // For the review screen.
  function summary() {
    return {
      isDifferent,
      villageName: villages.find((v) => v.id === villageId)?.name || '',
      mandalName: mandals.find((m) => m.id === mandalId)?.name || '',
      wardName: sachivalayams.find((s) => s.id === sachivalayamId)?.name || '',
      homeVillageName,
      homeMandalName,
      landmark: landmark.trim(),
      hasGps: !!gps,
    };
  }

  function reset() {
    setModeState('home');
    setMandalIdState(citizen?.mandal_id || '');
    setVillageId('');
    setSachivalayamId('');
    setLandmark('');
    setGps(null);
    setGpsMessage('');
  }

  return {
    mode, setMode,
    mandals, mandalId, setMandalId,
    villages, villageId, setVillageId,
    sachivalayams, sachivalayamId, setSachivalayamId,
    hasSachivalayam,
    landmark, setLandmark,
    gps, gpsBusy, gpsMessage, requestGps, clearGps,
    homeVillageName, homeMandalName, listError,
    isDifferent, validate, payload, summary, reset,
  };
}

/* ---------------------------------------------------------------------
 * The form section
 * ------------------------------------------------------------------- */

const labelText = { fontSize: 12, fontWeight: 600, color: '#64748b' };
const inputBox = { border: '1px solid #e2e8f0', borderRadius: 6, padding: '9px 11px', fontSize: 13.5, width: '100%', background: '#fff' };

function Row({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={labelText}>{label}</span>
      {children}
    </label>
  );
}

export function ProblemLocationFields({ loc, t, landmarkMic = null }) {
  const homeLine = [loc.homeVillageName, loc.homeMandalName].filter(Boolean).join(', ');

  function choice(value, title, sub) {
    const on = loc.mode === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => loc.setMode(value)}
        style={{
          flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          border: `2px solid ${on ? '#1a1a2e' : '#e2e8f0'}`,
          background: on ? '#1a1a2e15' : '#fff',
          color: on ? '#1a1a2e' : '#64748b',
          cursor: 'pointer',
        }}
      >
        {title}
        {sub ? <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, marginTop: 2 }}>{sub}</span> : null}
      </button>
    );
  }

  return (
    <div role="group" aria-labelledby="problem-place-title" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, display: 'grid', gap: 12, minWidth: 0 }}>
      <div id="problem-place-title" style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>
        📍 {t('pl_title', 'Where is the problem?')}
      </div>

      <div role="radiogroup" aria-label={t('pl_title', 'Where is the problem?')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {choice('home', t('pl_same_home', 'Same as my home area'), homeLine)}
        {choice('other', t('pl_other_place', 'A different place in my constituency'), '')}
      </div>

      {loc.mode === 'other' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Row label={t('pl_mandal', 'Mandal')}>
            <select id="problem-mandal" name="problem-mandal" value={loc.mandalId} onChange={(e) => loc.setMandalId(e.target.value)} style={inputBox}>
              <option value="">{t('pl_choose_mandal', 'Choose the mandal…')}</option>
              {loc.mandals.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Row>
          <Row label={t('pl_village', 'Village')}>
            <select id="problem-village" name="problem-village" value={loc.villageId} onChange={(e) => loc.setVillageId(e.target.value)} disabled={!loc.mandalId} style={inputBox}>
              <option value="">{t('pl_choose_village', 'Choose the village…')}</option>
              {loc.villages.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Row>
          {loc.hasSachivalayam && loc.sachivalayams.length > 0 && (
            <Row label={t('pl_ward', 'Ward / Sachivalayam (optional)')}>
              <select id="problem-sachivalayam" name="problem-sachivalayam" value={loc.sachivalayamId} onChange={(e) => loc.setSachivalayamId(e.target.value)} style={inputBox}>
                <option value="">{t('pl_choose_ward', 'Choose the ward…')}</option>
                {loc.sachivalayams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Row>
          )}
          {loc.listError && (
            <p style={{ fontSize: 12, color: '#B91C1C', margin: 0 }}>
              {t('pl_list_error', 'Could not load the list of places. Please check your internet and try again, or use the landmark box.')}
            </p>
          )}
        </div>
      )}

      <Row label={t('pl_landmark', 'Landmark or road name (optional)')}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            id="problem-landmark" name="problem-landmark"
            value={loc.landmark}
            onChange={(e) => loc.setLandmark(e.target.value)}
            maxLength={200}
            placeholder={t('pl_landmark_hint', 'e.g. Main Road near the bus stand')}
            style={{ ...inputBox, flex: 1 }}
          />
          {landmarkMic}
        </div>
      </Row>

      <div style={{ display: 'grid', gap: 6 }}>
        {loc.gps ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, color: '#16a34a', fontWeight: 600 }}>
            <span>✓ {t('pl_gps_done', 'Location added')}{loc.gps.accuracy ? ` (±${loc.gps.accuracy} m)` : ''}</span>
            <button type="button" onClick={loc.clearGps} style={{ border: 'none', background: 'none', color: '#B91C1C', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
              ✕ {t('pl_gps_clear', 'Remove')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={loc.requestGps}
            disabled={loc.gpsBusy}
            style={{ justifySelf: 'start', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 6, padding: '9px 12px', fontSize: 12.5, fontWeight: 600, color: '#1a1a2e', cursor: loc.gpsBusy ? 'default' : 'pointer' }}
          >
            {loc.gpsBusy ? t('pl_gps_wait', 'Getting your location…') : `🎯 ${t('pl_use_gps', 'Use my current location')}`}
          </button>
        )}
        <p style={{ fontSize: 11.5, color: '#64748b', margin: 0 }}>
          {t('pl_gps_hint', 'Use this only if you are standing at the place of the problem.')}{' '}
          {t('pl_privacy', 'Your location is saved only with this complaint, so officers can find the problem.')}
        </p>
        <p role="status" aria-live="polite" style={{ fontSize: 12, color: '#B91C1C', margin: 0 }}>{loc.gpsMessage}</p>
      </div>

      <p style={{ fontSize: 11.5, color: '#64748b', margin: 0 }}>
        {t('pl_final_note', 'This place cannot be changed after you submit.')}
      </p>
    </div>
  );
}
