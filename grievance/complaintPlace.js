// src/pages/grievance/complaintPlace.js   (NEW file -- add, don't replace; 14-10-2026)
//
// "Where is the problem?" -- one place that turns a complaint's saved problem location into
// words, so the staff screens, the printed documents and the citizen's own screen all say the
// same thing. No database calls here (grievanceApi.js does the name look-ups); these are plain
// functions, which is also what makes them easy to test.
//
// A complaint's "place" has two bases:
//   'problem' -- the citizen chose a village (and maybe a ward) for the problem. That is the
//                place used from then on (the database stores it as problem_village_id ...).
//   'home'    -- nothing separate was chosen, so the problem is taken to be in the citizen's
//                own village. Every complaint filed before 14-10-2026 is like this.
// A landmark and a GPS point may be present with either basis.

const clean = (s) => (typeof s === 'string' ? s.trim() : '');

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// row  : a complaints row (select *), with the problem_* columns
// maps : { village: {id: name}, mandal: {id: name}, sach: {id: name} } -- any may be empty
export function buildPlace(row, maps = {}) {
  const r = row || {};
  const name = (map, id) => (id && map && map[id]) || '';
  const problem = !!r.problem_village_id;
  const lat = num(r.problem_latitude);
  const lng = num(r.problem_longitude);
  const hasGps = lat !== null && lng !== null;
  return {
    basis: problem ? 'problem' : 'home',
    village: problem ? name(maps.village, r.problem_village_id) : name(maps.village, r.village_id),
    mandal: problem ? name(maps.mandal, r.problem_mandal_id) : name(maps.mandal, r.mandal_id),
    ward: (problem ? name(maps.sach, r.problem_sachivalayam_id) : '') || clean(r.problem_ward_no),
    landmark: clean(r.problem_landmark),
    lat: hasGps ? lat : null,
    lng: hasGps ? lng : null,
    homeVillage: name(maps.village, r.village_id),
    homeMandal: name(maps.mandal, r.mandal_id),
    // true when the problem is in a different village from the citizen's own
    differs: problem && r.problem_village_id !== r.village_id,
  };
}

// "Chinnapuram, Pedana"  or, with the ward, "Chinnapuram, Pedana — Ward 3"
export function placeName(p, withWard = false) {
  if (!p) return '';
  const base = [p.village, p.mandal].filter(Boolean).join(', ');
  return withWard && p.ward && base ? `${base} — ${p.ward}` : base;
}

// The citizen's own area, "Kothapalli, Pedana" (blank when unknown)
export function homeName(p) {
  return p ? [p.homeVillage, p.homeMandal].filter(Boolean).join(', ') : '';
}

// "16.989123, 82.247568" or '' when there is no GPS point
export function gpsText(p) {
  return p && p.lat !== null && p.lng !== null ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` : '';
}

// A link that opens the point in Google Maps, or '' when there is no GPS point
export function mapUrl(p) {
  return p && p.lat !== null && p.lng !== null
    ? `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
    : '';
}

// One short line for lists: "📍 Chinnapuram, Pedana — Ward 3 · Near the temple"
// (📍 = a place the citizen chose, 🏠 = taken from the citizen's home area). '' if nothing is known.
export function placeListLine(p) {
  if (!p) return '';
  const where = placeName(p, true);
  const parts = [where, p.landmark].filter(Boolean);
  if (parts.length === 0) return '';
  return `${p.basis === 'problem' ? '📍' : '🏠'} ${parts.join(' · ')}`;
}

// For printed documents: the place in words, "Not specified" when nothing is known
export function printPlace(p) {
  return placeName(p, true) || 'Not specified';
}
