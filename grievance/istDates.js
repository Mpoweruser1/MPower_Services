// grievance/istDates.js — NEW (add this file; it replaces nothing)
// Dates in Indian time for the CTS screens.
//
// Why: `new Date().toISOString().slice(0, 10)` is the UTC date, which is still
// "yesterday" between midnight and 5:30 am in India. Worse, a date built at
// local midnight (new Date(year, month, 1)) and then turned into a UTC date
// lands on the PREVIOUS day on an Indian-time device -- the "This month"
// filter began on the last day of the previous month. And a plain 'YYYY-MM-DD'
// compared with a stored timestamp is read as UTC midnight (5:30 am in India),
// so complaints filed in the first 5½ hours of the "from" day were left out and
// the "to" day ran into the next morning.
//
// Everything here works on plain 'YYYY-MM-DD' strings (calendar dates) and
// turns them into exact Indian-time boundaries only when a query needs them.

const IST = 'Asia/Kolkata';

// Today's date in India as YYYY-MM-DD.
export function istToday(from = new Date()) {
  return from.toLocaleDateString('en-CA', { timeZone: IST });
}

// The Indian calendar date (YYYY-MM-DD) of a stored timestamp.
export function istDateOf(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: IST });
}

// A YYYY-MM-DD date moved by a number of days (pure calendar arithmetic).
export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The first moment and the last moment of an Indian day, as timestamps the
// database understands (for created_at ranges).
export function istDayStart(dateStr) {
  return `${dateStr}T00:00:00+05:30`;
}
export function istDayEnd(dateStr) {
  return `${dateStr}T23:59:59.999+05:30`;
}

// First day of the month, and the Sunday that starts the week, of a YYYY-MM-DD date.
export function monthStart(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}
export function weekStart(dateStr) {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, -day);
}

// The ready-made periods of the "More filters" box. All in Indian time.
export const PERIOD_PRESETS = ['Today', 'This week', 'This month', 'All time'];
export function presetRange(label, today = istToday()) {
  switch (label) {
    case 'Today': return { from: today, to: today };
    case 'This week': return { from: weekStart(today), to: today };
    case 'This month': return { from: monthStart(today), to: today };
    default: return { from: '', to: '' };
  }
}

// Display helpers -- always Indian time, whatever the device's own setting.
export function fmtIstDate(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleDateString('en-IN', { timeZone: IST }) : '';
}
export function fmtIstDateTime(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString('en-IN', { timeZone: IST }) : '';
}
