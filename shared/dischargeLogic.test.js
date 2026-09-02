// shared/dischargeLogic.test.js — NEW
import { describe, it, expect } from 'vitest';
import { validateDischargeSummary, computeLengthOfStay } from './dischargeLogic';

describe('validateDischargeSummary', () => {
  it('rejects an empty summary', () => {
    expect(validateDischargeSummary('')).toMatch(/required/i);
  });

  it('rejects whitespace-only input — trimming matters, spaces alone are not real content', () => {
    expect(validateDischargeSummary('     ')).toMatch(/required/i);
  });

  it('rejects a summary under the 10-character minimum', () => {
    expect(validateDischargeSummary('Fine now.')).toMatch(/too short/i);
  });

  it('accepts a genuinely adequate summary', () => {
    expect(validateDischargeSummary('Patient recovered well, advised follow-up in 5 days.')).toBeNull();
  });

  it('a summary at exactly 10 characters after trimming is accepted, not rejected off-by-one', () => {
    expect(validateDischargeSummary('1234567890')).toBeNull();
    expect(validateDischargeSummary('123456789')).toMatch(/too short/i);
  });

  it('leading/trailing whitespace does not count toward the minimum length', () => {
    expect(validateDischargeSummary('   123456789   ')).toMatch(/too short/i);
  });
});

describe('computeLengthOfStay', () => {
  it('a multi-day stay counts whole days correctly', () => {
    expect(computeLengthOfStay('2026-08-28', '2026-09-01')).toBe(4);
  });

  it('same-day admission and discharge is a valid 0-day stay, not an error — real for day-care procedures', () => {
    expect(computeLengthOfStay('2026-09-01', '2026-09-01')).toBe(0);
  });

  it('never returns a negative number even if dates are somehow reversed — clamps to 0 rather than showing "-3 days" on a real record', () => {
    expect(computeLengthOfStay('2026-09-05', '2026-09-01')).toBe(0);
  });

  it('correctly spans a month boundary', () => {
    expect(computeLengthOfStay('2026-08-30', '2026-09-02')).toBe(3);
  });

  it('correctly spans a year boundary', () => {
    expect(computeLengthOfStay('2025-12-30', '2026-01-02')).toBe(3);
  });
});
