// shared/bedLogic.js — NEW
//
// Pulled from IPDManagement.jsx. isBedOccupied() is the single
// highest-stakes function in this whole test suite: there is no
// database-level unique constraint on (ward_id, bed_no) — confirmed
// during the schema audit earlier this session. This client-side
// check is the ONLY thing standing between the system and two real
// patients both being recorded in the same physical bed at once. A
// silent bug here has real-world, not just data-integrity,
// consequences.

/**
 * The exact bed-numbering scheme used everywhere in IPDManagement —
 * e.g. ward_type "General", ward.id starting "e1752e80..." produces
 * "GE175-1", "GE175-2", etc. Kept as its own function specifically so
 * the bed grid and the occupancy check can never drift apart from
 * generating the format two different ways.
 */
export function generateBedNumber(ward, index) {
  const prefix = (ward.ward_type || 'W').slice(0, 1).toUpperCase();
  const wardCode = ward.id.slice(0, 4).toUpperCase();
  return `${prefix}${wardCode}-${index + 1}`;
}

/**
 * Builds the full bed grid for one ward plus its occupancy summary.
 *
 * @param {{id: string, ward_type: string, total_beds: number}} ward
 * @param {Array<{ward_id: string, bed_no: string}>} activeAdmissions -
 *   admissions with discharge_date null, already filtered to this
 *   query's result set
 */
export function buildWardWithBeds(ward, activeAdmissions) {
  const occupiedBedNos = activeAdmissions.filter((a) => a.ward_id === ward.id).map((a) => a.bed_no);
  const totalBeds = ward.total_beds || 0;
  const beds = Array.from({ length: totalBeds }, (_, i) => {
    const bedNo = generateBedNumber(ward, i);
    return { bedNo, occupied: occupiedBedNos.includes(bedNo) };
  });
  return {
    ...ward,
    beds,
    occupied: occupiedBedNos.length,
    available: totalBeds - occupiedBedNos.length,
  };
}

/**
 * The actual safeguard against double-booking a bed. Scoped to the
 * specific ward — the same bed LABEL (e.g. "-1") legitimately exists
 * in multiple different wards, since the ward code is baked into the
 * label itself, but this still checks ward_id explicitly rather than
 * relying on that alone, since two different wards' generated codes
 * could theoretically collide on a very short ward.id prefix.
 *
 * @param {Array<{wardId: string, bedNo: string}>} admissions - current
 *   active admissions, in the shape the UI already keeps them in
 */
export function isBedOccupied(admissions, wardId, bedNo) {
  const trimmed = bedNo.trim();
  return admissions.some((a) => a.wardId === wardId && a.bedNo === trimmed);
}

export function validateBedNo(value, wardId, wards, admissions) {
  if (!value.trim()) return 'Bed number is required';
  if (value.trim().length < 1) return 'Bed number too short';
  const ward = wards.find((w) => w.id === wardId);
  if (ward && isBedOccupied(admissions, wardId, value)) {
    return 'This bed is already occupied — please choose another';
  }
  return null;
}
