// shared/attendanceLogic.test.js — NEW
import { describe, it, expect } from 'vitest';
import { computeAttendanceStats, CHRONIC_THRESHOLD, MIN_TRACKED_DAYS } from './attendanceLogic';

function days(pattern) {
  // pattern like 'PPAPP' -> 5 records, oldest first; dates auto-generated
  return pattern.split('').map((status, i) => ({
    status,
    date: new Date(2026, 0, i + 1).toISOString().slice(0, 10),
  }));
}

describe('computeAttendanceStats — chronic absenteeism threshold', () => {
  it('flags a student right at the 10% threshold with enough tracked days', () => {
    // 2 absences out of 20 days = exactly 10%
    const records = days('P'.repeat(18) + 'AA');
    const stats = computeAttendanceStats(records);
    expect(stats.absentRate).toBeCloseTo(0.10);
    expect(stats.isChronic).toBe(true);
  });

  it('does NOT flag a student just under the threshold', () => {
    // 1 absence out of 20 days = 5%, well under 10%
    const records = days('P'.repeat(19) + 'A');
    const stats = computeAttendanceStats(records);
    expect(stats.isChronic).toBe(false);
  });

  it('does NOT flag a student who happens to be at a high absence rate but has too few tracked days — the minimum-days guard exists specifically to avoid flagging a brand-new student on day 2 who missed one day', () => {
    // 1 absence out of 3 days = 33% — high rate, but MIN_TRACKED_DAYS not met
    const records = days('PPA');
    const stats = computeAttendanceStats(records);
    expect(stats.totalDays).toBeLessThan(MIN_TRACKED_DAYS);
    expect(stats.isChronic).toBe(false);
  });

  it('a student with zero tracked days never gets flagged, and never divides by zero', () => {
    const stats = computeAttendanceStats([]);
    expect(stats.absentRate).toBe(0);
    expect(stats.isChronic).toBe(false);
  });
});

describe('computeAttendanceStats — consecutive absence streak', () => {
  it('counts a current streak correctly, most-recent-day first', () => {
    // oldest to newest: P P A A A -> streak should be 3 (the most recent 3 are absent)
    const records = days('PPAAA');
    const stats = computeAttendanceStats(records);
    expect(stats.streak).toBe(3);
  });

  it('streak resets to 0 the moment the most recent day is Present', () => {
    // oldest to newest: A A A P -> most recent day is Present, streak is 0
    // even though there were 3 absences right before it
    const records = days('AAAP');
    const stats = computeAttendanceStats(records);
    expect(stats.streak).toBe(0);
  });

  it('streak does not care about input order — always sorts by date first', () => {
    const outOfOrder = [
      { status: 'A', date: '2026-01-03' },
      { status: 'P', date: '2026-01-01' },
      { status: 'A', date: '2026-01-02' },
    ];
    const stats = computeAttendanceStats(outOfOrder);
    // Most recent is 01-03 (A), then 01-02 (A), then 01-01 (P) — streak = 2
    expect(stats.streak).toBe(2);
  });
});
