// shared/appointmentLogic.js — NEW
//
// Pulled from AppointmentAnalytics.jsx. The no-show rule is currently
// expressed as a Supabase query filter (.eq('status', 'booked')
// .lt('slot_time', now)) rather than a standalone function — this
// extracts the equivalent as a pure predicate so the RULE itself can
// be tested independent of a live database, and so it can be reused
// anywhere slot data is already in hand without a fresh query.
//
// Confirmed real, not invented: opd_appointment_slots only has
// 'open'/'booked'/'completed' statuses — there is no explicit
// no-show state in the schema. A no-show is genuinely computed:
// a slot that's still 'booked' after its own slot_time has passed
// (the patient never got checked in).

/**
 * @param {{status: string, slot_time: string}} slot
 * @param {Date} [now] - injectable for testing; defaults to real "now"
 */
export function isNoShow(slot, now = new Date()) {
  return slot.status === 'booked' && new Date(slot.slot_time) < now;
}

/**
 * @param {Array} slots - slots already confirmed to be no-shows
 * @param {(slot: object) => string} getDoctorName - resolves a slot to
 *   its doctor's display name (kept as a function, not baked in, since
 *   the real join path — day -> doctor -> users -> full_name — is a
 *   detail of how the data was fetched, not of the counting rule
 *   itself)
 * @returns {Record<string, number>} count of no-shows per doctor name
 */
export function countNoShowsByDoctor(slots, getDoctorName) {
  const counts = {};
  slots.forEach((s) => {
    const name = getDoctorName(s) || 'Unknown';
    counts[name] = (counts[name] || 0) + 1;
  });
  return counts;
}
