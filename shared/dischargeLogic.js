// shared/dischargeLogic.js — NEW
//
// validateDischargeSummary() is pulled directly from IPDManagement.jsx
// — the actual gate on every real patient's clinical discharge
// record.
//
// computeLengthOfStay() is NEW, not extracted — while checking this
// file for testable logic, no length-of-stay calculation existed
// anywhere in IPDManagement.jsx at all. That's a standard field on
// any real hospital discharge summary (used for billing, quality
// reporting, and clinical review), currently just missing rather than
// broken. Adding it here as a small, tested utility rather than
// silently leaving the gap once it was noticed.

/**
 * @param {string} text
 * @returns {string|null} an error message, or null if valid
 */
export function validateDischargeSummary(text) {
  if (!text.trim()) return 'Discharge summary is required.';
  if (text.trim().length < 10) return 'Discharge summary is too short — please provide more detail.';
  return null;
}

/**
 * Whole days between admission and discharge. Uses date-only
 * comparison (not full timestamps) since admission_date and the
 * discharge date this app records are both plain dates, not
 * date-times — a patient admitted and discharged on the same
 * calendar date is a real, valid 0-day stay (e.g. day-care
 * procedures), not an error.
 *
 * @param {string} admissionDate - 'YYYY-MM-DD'
 * @param {string} dischargeDate - 'YYYY-MM-DD'
 * @returns {number} whole days, minimum 0
 */
export function computeLengthOfStay(admissionDate, dischargeDate) {
  const admitted = new Date(admissionDate + 'T00:00:00');
  const discharged = new Date(dischargeDate + 'T00:00:00');
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.round((discharged - admitted) / msPerDay);
  return Math.max(0, days);
}
