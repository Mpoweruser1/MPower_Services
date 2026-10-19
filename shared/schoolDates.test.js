// shared/schoolDates.test.js — NEW (School Round 1)
import { describe, it, expect } from 'vitest';
import {
  istDateOf, addDays, istDayStart, istDayEnd, fmtIstDate, academicYearFor, academicYearFromLabel,
  academicYearStartingIn, tenantAcademicYear, fetchAllPages, fetchAllIn,
} from './schoolDates';

describe('IST dates', () => {
  it('00:30 IST is still the same IST day (19:00Z the day before)', () => {
    expect(istDateOf('2026-10-14T19:00:00Z')).toBe('2026-10-15');
  });
  it('plain dates pass through; invalid is null', () => {
    expect(istDateOf('2026-10-16')).toBe('2026-10-16');
    expect(istDateOf('nope')).toBeNull();
    expect(istDateOf(null)).toBeNull();
  });
  it('addDays handles month, year and leap day', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('day boundaries are the right instants', () => {
    expect(new Date(istDayStart('2026-10-15')).toISOString()).toBe('2026-10-14T18:30:00.000Z');
    expect(new Date(istDayEnd('2026-10-15')).toISOString()).toBe('2026-10-15T18:29:59.999Z');
  });
  it('shows dates as DD-MM-YYYY', () => {
    expect(fmtIstDate('2026-10-14T19:00:00Z')).toBe('15-10-2026');
    expect(fmtIstDate('')).toBe('');
  });
});

describe('school year', () => {
  it('defaults to 1 June', () => {
    expect(academicYearFor('2026-10-16')).toEqual({ startYear: 2026, label: '2026-27', start: '2026-06-01', end: '2027-05-31' });
    expect(academicYearFor('2026-05-31').label).toBe('2025-26');
    expect(academicYearFor('2026-06-01').label).toBe('2026-27');
    expect(academicYearFor('2027-03-10').label).toBe('2026-27');
  });
  it('uses the IST date: 19:00Z on 31 May is already 1 June in India', () => {
    expect(academicYearFor('2026-05-31T19:00:00Z').label).toBe('2026-27');
  });
  it('honours the school\'s own start date', () => {
    expect(academicYearFor('2026-03-31', 4, 1).label).toBe('2025-26');
    expect(academicYearFor('2026-04-01', 4, 1).label).toBe('2026-27');
    const y = academicYearFor('2026-06-14', 6, 15);
    expect(y.label).toBe('2025-26');
    expect(y.end).toBe('2026-06-14');
    expect(tenantAcademicYear({ academicYearStartMonth: 4, academicYearStartDay: 1 }, '2026-04-02').label).toBe('2026-27');
  });
  it('labels round-trip and bad labels are rejected', () => {
    expect(academicYearStartingIn(2099).label).toBe('2099-00');
    expect(academicYearFromLabel('2026-27').start).toBe('2026-06-01');
    expect(academicYearFromLabel('2026-28')).toBeNull();
    expect(academicYearFromLabel('x')).toBeNull();
  });
});

describe('paging', () => {
  it('reads past the 1,000-row limit', async () => {
    const all = Array.from({ length: 2300 }, (_, i) => ({ id: i }));
    let calls = 0;
    const rows = await fetchAllPages(async (from, to) => { calls++; return { data: all.slice(from, to + 1), error: null }; });
    expect(rows.length).toBe(2300);
    expect(calls).toBe(3);
  });
  it('throws on an error and refuses to return a partial list when it runs away', async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom');
    await expect(fetchAllPages(async () => ({ data: new Array(10).fill(1), error: null }), 10, 3)).rejects.toThrow(/partial/);
  });
  it('fetchAllIn sends ids in groups of 150, de-duplicated, and makes no request for an empty list', async () => {
    const ids = [...Array.from({ length: 400 }, (_, i) => 's' + i), 's1', 's2', null];
    const sizes = [];
    const rows = await fetchAllIn(ids, async (chunk, from) => {
      if (from === 0) sizes.push(chunk.length);
      return { data: from === 0 ? chunk.map((c) => ({ c })) : [], error: null };
    });
    expect(sizes).toEqual([150, 150, 100]);
    expect(rows.length).toBe(400);
    let n = 0;
    await fetchAllIn([], async () => { n++; return { data: [], error: null }; });
    expect(n).toBe(0);
  });
});
