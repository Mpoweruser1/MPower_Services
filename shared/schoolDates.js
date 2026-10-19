// shared/schoolDates.js — NEW (School Round 1, 16-10-2026)
//
// Small shared helpers for every School screen. Nothing uses them yet — the
// screens move over one round at a time (fees, records, academics), each
// replacing its own copy of the same trap:
//
//   1. DATES. new Date().toISOString().slice(0, 10) is the UTC date. In India
//      that is yesterday between 00:00 and 05:30. Everything here works in IST.
//   2. SCHOOL YEAR. One definition (a start month + day, default 1 June,
//      set per school in Business Details) instead of three different ones.
//   3. 1,000-ROW LIMIT. The database silently returns at most 1,000 rows per
//      request. Reports that read "all students" or "all attendance" must
//      page, or they quietly drop rows. fetchAllPages / fetchAllIn do that.
//   4. LONG .in() LISTS. A list of several hundred ids in one request can
//      exceed the URL limit and fail. fetchAllIn sends them in groups of 150.

const IST_OFFSET_MS = 330 * 60 * 1000;
const pad2 = (n) => String(n).padStart(2, '0');

/** Date (or ISO string, or 'YYYY-MM-DD') -> 'YYYY-MM-DD' as seen in India. null if invalid. */
export function istDateOf(input) {
  if (input === null || input === undefined || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istToday() {
  return istDateOf(new Date());
}

/** 'YYYY-MM-DD' plus n days (n may be negative) -> 'YYYY-MM-DD'. Pure calendar arithmetic. */
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Start / end of an IST calendar day, as timestamps the database understands. */
export function istDayStart(ymd) {
  return `${ymd}T00:00:00+05:30`;
}
export function istDayEnd(ymd) {
  return `${ymd}T23:59:59.999+05:30`;
}

/** Shown to people as DD-MM-YYYY. Returns '' for missing/invalid input. */
export function fmtIstDate(input) {
  const ymd = istDateOf(input);
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * The school year a date falls in.
 *   academicYearFor('2026-10-16')            -> { label: '2026-27', start: '2026-06-01', end: '2027-05-31', startYear: 2026 }
 *   academicYearFor('2026-03-10')            -> { label: '2025-26', ... }
 * startMonth / startDay come from the school's setting (default 1 June).
 */
export function academicYearFor(dateInput, startMonth = 6, startDay = 1) {
  const ymd = istDateOf(dateInput) || istToday();
  const [y, m, d] = ymd.split('-').map(Number);
  const startYear = (m > startMonth || (m === startMonth && d >= startDay)) ? y : y - 1;
  return academicYearStartingIn(startYear, startMonth, startDay);
}

/** The school year that begins in the given calendar year. */
export function academicYearStartingIn(startYear, startMonth = 6, startDay = 1) {
  const start = `${startYear}-${pad2(startMonth)}-${pad2(startDay)}`;
  const end = addDays(`${startYear + 1}-${pad2(startMonth)}-${pad2(startDay)}`, -1);
  return {
    startYear,
    label: `${startYear}-${pad2((startYear + 1) % 100)}`,
    start,
    end,
  };
}

/** Same, using the signed-in school's setting from useTenant().tenant. */
export function tenantAcademicYear(tenant, dateInput) {
  return academicYearFor(
    dateInput,
    tenant?.academicYearStartMonth || 6,
    tenant?.academicYearStartDay || 1,
  );
}

/** '2026-27' -> that year's start / end for the school's setting; null if the label is malformed. */
export function academicYearFromLabel(label, startMonth = 6, startDay = 1) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(label || '').trim());
  if (!m) return null;
  const startYear = Number(m[1]);
  if ((startYear + 1) % 100 !== Number(m[2])) return null;
  return academicYearStartingIn(startYear, startMonth, startDay);
}

/**
 * Reads every row of a query, 1,000 at a time.
 *   const rows = await fetchAllPages((from, to) =>
 *     supabase.from('students').select('*').eq('app_id', appId).order('id').range(from, to));
 * The query MUST have a stable .order(...) — without it, pages can overlap or skip rows.
 */
export async function fetchAllPages(build, pageSize = 1000, maxPages = 200) {
  const rows = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    if (data && data.length) rows.push(...data);
    if (!data || data.length < pageSize) return rows;
  }
  throw new Error(`fetchAllPages stopped after ${maxPages} pages — refusing to return a partial list.`);
}

/**
 * Like fetchAllPages, for "rows whose column is in this list of ids". Ids are
 * de-duplicated and sent in groups of 150; each group is itself paged.
 *   const rows = await fetchAllIn(studentIds, (chunk, from, to) =>
 *     supabase.from('attendance').select('*').in('student_id', chunk).order('id').range(from, to));
 */
export async function fetchAllIn(ids, build, chunkSize = 150) {
  const unique = [...new Set((ids || []).filter((v) => v !== null && v !== undefined))];
  const out = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const part = await fetchAllPages((from, to) => build(chunk, from, to));
    out.push(...part);
  }
  return out;
}
