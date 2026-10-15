// hospital/hospitalUtils.js — NEW
// Small helpers shared by the Hospital screens (kept inside the Hospital
// module on purpose — School and CTS have their own).
//
// 1. Dates in Indian time. `new Date().toISOString().slice(0, 10)` gives the
//    UTC date, which is still "yesterday" between midnight and 5:30 am IST —
//    so an admission, a discharge or a day's collection made early in the
//    morning landed on the wrong day.
// 2. fetchAllRows — the database returns at most 1,000 rows per request and
//    stops silently; any total worked out from such a result is wrong without
//    any warning. This reads every page.

const IST = 'Asia/Kolkata';

// Today's date in India as YYYY-MM-DD.
export function istToday(from = new Date()) {
  return from.toLocaleDateString('en-CA', { timeZone: IST });
}

// The IST calendar date (YYYY-MM-DD) of a stored timestamp.
export function istDateOf(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: IST });
}

// Month key (YYYY-MM) and label ("Oct 2026") of a stored timestamp, in IST.
export function istMonthKey(timestamp) {
  return istDateOf(timestamp).slice(0, 7);
}
export function istMonthLabel(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: IST });
}

// A YYYY-MM-DD date moved by a number of days (pure calendar arithmetic).
export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Start of an IST day, and the last moment of an IST day, as timestamps the
// database understands (used for created_at ranges).
export function istDayStart(dateStr) {
  return `${dateStr}T00:00:00+05:30`;
}
export function istDayEnd(dateStr) {
  return `${dateStr}T23:59:59.999+05:30`;
}

// Reads every page of a query. `build` must return a NEW query each time it
// is called, with a stable order that ends in a unique column (for example
// .order('created_at').order('id')) so no row is skipped or repeated between
// pages.
export async function fetchAllRows(build, { pageSize = 1000, maxRows = 50000 } = {}) {
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new Error('This report has too many records to load at once. Please choose a shorter date range.');
}
