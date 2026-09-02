// shared/promotionLogic.test.js — NEW
import { describe, it, expect } from 'vitest';
import { isFailLike, computeDecision, nextAcademicYear } from './promotionLogic';

describe('isFailLike', () => {
  it('recognizes a plain "F"', () => {
    expect(isFailLike('F')).toBe(true);
    expect(isFailLike('f')).toBe(true);
  });

  it('recognizes "Fail" in any casing, with surrounding whitespace', () => {
    expect(isFailLike('Fail')).toBe(true);
    expect(isFailLike('FAIL')).toBe(true);
    expect(isFailLike('  fail  ')).toBe(true);
  });

  it('does NOT treat "Pass" or a real grade like "A2" as a fail', () => {
    expect(isFailLike('Pass')).toBe(false);
    expect(isFailLike('A2')).toBe(false);
    expect(isFailLike('B1')).toBe(false);
  });

  it('treats missing/empty pass_fail as not-a-fail, not a crash', () => {
    expect(isFailLike(null)).toBe(false);
    expect(isFailLike(undefined)).toBe(false);
    expect(isFailLike('')).toBe(false);
  });
});

describe('computeDecision — the actual year-end promotion rule', () => {
  it('a student in the highest class always graduates, even with failing marks — there is no next class to retain them into', () => {
    const result = computeDecision({ isHighest: true, marksCount: 5, failCount: 3 });
    expect(result.decision).toBe('graduated');
  });

  it('a student with zero recorded marks is promoted but flagged for manual review, not silently skipped or auto-failed', () => {
    const result = computeDecision({ isHighest: false, marksCount: 0, failCount: 0 });
    expect(result.decision).toBe('promoted');
    expect(result.reason).toContain('No exam marks recorded');
  });

  it('any failed subject means retained, regardless of how many subjects passed', () => {
    const result = computeDecision({ isHighest: false, marksCount: 6, failCount: 1 });
    expect(result.decision).toBe('retained');
    expect(result.reason).toBe('Failed 1 of 6 subjects.');
  });

  it('reason text uses singular "subject" for exactly one subject total', () => {
    const result = computeDecision({ isHighest: false, marksCount: 1, failCount: 1 });
    expect(result.reason).toBe('Failed 1 of 1 subject.');
  });

  it('a student who passed everything is promoted with no warning reason', () => {
    const result = computeDecision({ isHighest: false, marksCount: 6, failCount: 0 });
    expect(result.decision).toBe('promoted');
    expect(result.reason).toBe('');
  });
});

describe('nextAcademicYear', () => {
  it('rolls a standard "YYYY-YY" label forward by one year', () => {
    expect(nextAcademicYear('2025-26')).toBe('2026-27');
  });

  it('returns an empty string rather than throwing on an unparseable input', () => {
    expect(nextAcademicYear('not a year')).toBe('');
    expect(nextAcademicYear(null)).toBe('');
    expect(nextAcademicYear(undefined)).toBe('');
  });
});
