// shared/bedLogic.js — UPDATED (rooms and beds as a real list)
//
// A ward's beds now come from the ward_beds table (one row per bed: name, optional room). Wards
// that have no rows yet (the database script has not been run) fall back to the made-up names the
// screens always used, so nothing breaks while the two parts are rolled out.
//
// A bed can be on hold: reserved (optionally until a date) or out of service. A held bed is not
// available and cannot be chosen; the database refuses it as well.
//
// The database is the real safeguard against two patients in one bed (a unique index) and against
// a bed that is not in the ward (a trigger). The checks here only give a friendly message first.

/**
 * The made-up bed name used before beds were real records, e.g. ward_type "General", ward.id
 * starting "e1752e80..." gives "GE175-1", "GE175-2" ... Used only when a ward has no bed rows.
 */
export function generateBedNumber(ward, index) {
  const prefix = (ward.ward_type || 'W').slice(0, 1).toUpperCase();
  const wardCode = ward.id.slice(0, 4).toUpperCase();
  return `${prefix}${wardCode}-${index + 1}`;
}

/**
 * Is a hold in force? An out-of-service hold always is; a reservation stops counting after its
 * "until" date (the date itself still counts). Without `today` a reservation is taken as in force.
 */
export function isHoldActive(kind, until, today) {
  if (!kind) return false;
  if (kind !== 'reserved') return true;
  if (!until || !today) return true;
  return String(until) >= String(today);
}

function sameBed(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/**
 * Builds the bed list of one ward plus its occupancy summary.
 *
 * @param {{id: string, ward_type: string, total_beds: number}} ward
 * @param {Array<{ward_id: string, bed_no: string}>} activeAdmissions - admissions with
 *   discharge_date null
 * @param {Array<{id: string, ward_id: string, room: string|null, label: string, seq: number,
 *   hold_kind?: string|null, hold_note?: string|null, hold_until?: string|null}>} [bedRows]
 *   rows of ward_beds (any ward; the ones of this ward are used)
 * @param {string} [today] today's date (YYYY-MM-DD, India), to tell an expired reservation
 * @returns the ward plus: beds [{id, bedNo, room, occupied, hold}], hasBedList, occupied, held,
 *   available (free beds that are not on hold)
 */
export function buildWardWithBeds(ward, activeAdmissions, bedRows, today) {
  const occupiedBedNos = activeAdmissions.filter((a) => a.ward_id === ward.id).map((a) => a.bed_no);
  const mine = (bedRows || []).filter((b) => b.ward_id === ward.id).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  let beds;
  if (mine.length > 0) {
    beds = mine.map((b) => ({
      id: b.id, bedNo: b.label, room: b.room || null,
      occupied: occupiedBedNos.some((n) => sameBed(n, b.label)),
      hold: isHoldActive(b.hold_kind, b.hold_until, today)
        ? { kind: b.hold_kind, note: b.hold_note || '', until: b.hold_until || null } : null,
    }));
  } else {
    beds = Array.from({ length: ward.total_beds || 0 }, (_, i) => {
      const bedNo = generateBedNumber(ward, i);
      return { id: null, bedNo, room: null, occupied: occupiedBedNos.some((n) => sameBed(n, bedNo)), hold: null };
    });
  }
  const held = beds.filter((b) => b.hold && !b.occupied).length;
  return {
    ...ward,
    beds,
    hasBedList: mine.length > 0,
    total_beds: beds.length,
    occupied: occupiedBedNos.length,
    held,
    available: Math.max(0, beds.length - occupiedBedNos.length - held),
  };
}

/**
 * Groups a ward's beds by room, in the order the rooms first appear. Beds with no room come last
 * under room = null.
 * @returns Array<{room: string|null, beds: Array}>
 */
export function groupBedsByRoom(beds) {
  const order = [];
  const map = new Map();
  (beds || []).forEach((b) => {
    const key = b.room || null;
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(b);
  });
  const named = order.filter((k) => k !== null);
  const result = named.map((k) => ({ room: k, beds: map.get(k) }));
  if (map.has(null)) result.push({ room: null, beds: map.get(null) });
  return result;
}

/**
 * Is a patient in this bed of this ward? Names are compared without regard to capital letters or
 * spaces at the ends, the same way the database does.
 *
 * @param {Array<{wardId: string, bedNo: string}>} admissions - current active admissions, in the
 *   shape the screen keeps them in
 */
export function isBedOccupied(admissions, wardId, bedNo) {
  return admissions.some((a) => a.wardId === wardId && sameBed(a.bedNo, bedNo));
}

/**
 * The message to show for a bed chosen / typed at the moment of admission or move, or null when
 * it is fine. `wards` are the wards as returned by buildWardWithBeds.
 */
export function validateBedNo(value, wardId, wards, admissions) {
  if (!value.trim()) return 'Bed number is required';
  const ward = wards.find((w) => w.id === wardId);
  if (ward && ward.hasBedList && !ward.beds.some((b) => sameBed(b.bedNo, value))) {
    return 'This is not a bed of this ward — please choose a bed from the list';
  }
  const bed = ward && ward.hasBedList ? ward.beds.find((b) => sameBed(b.bedNo, value)) : null;
  if (bed && bed.hold) {
    return bed.hold.kind === 'reserved'
      ? `This bed is reserved (${bed.hold.note}) — release the reservation first or choose another bed`
      : `This bed is out of service (${bed.hold.note}) — please choose another bed`;
  }
  if (ward && isBedOccupied(admissions, wardId, value)) {
    return 'This bed is already occupied — please choose another';
  }
  return null;
}
