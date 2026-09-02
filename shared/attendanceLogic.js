// shared/attendanceLogic.js — NEW
//
// This is the exact chronic-absenteeism and consecutive-absence logic
// from AttendanceAnalytics.jsx, pulled out into its own file so it can
// be tested directly — without needing to render a React component,
// mock Supabase, or set up a browser environment just to check that a
// threshold comparison is correct.
//
// This matters here specifically: this exact number (10%) determines
// whether a real student gets flagged as needing intervention, and it
// was verified against real US state education department standards
// before being used. A typo turning 0.10 into 0.010, or >= into >,
// would silently change who gets flagged — and nothing would catch
// that except someone noticing wrong students in a report weeks
// later. A test catches it in under a second, every time the code
// changes, forever.

export const CHRONIC_THRESHOLD = 0.10;
export const MIN_TRACKED_DAYS = 10;

/**
 * @param {Array<{status: string, date: string}>} records - a single
 *   student's attendance records, most recent first is NOT required —
 *   this function sorts them itself.
 */
export function computeAttendanceStats(records) {
  const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalDays = sorted.length;
  const absentDays = sorted.filter((r) => r.status === 'A').length;
  const absentRate = totalDays > 0 ? absentDays / totalDays : 0;

  let streak = 0;
  for (const r of sorted) {
    if (r.status === 'A') streak++;
    else break;
  }

  return {
    totalDays,
    absentDays,
    absentRate,
    streak,
    isChronic: absentRate >= CHRONIC_THRESHOLD && totalDays >= MIN_TRACKED_DAYS,
  };
}
