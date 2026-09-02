// shared/bedLogic.test.js — NEW
import { describe, it, expect } from 'vitest';
import { generateBedNumber, buildWardWithBeds, isBedOccupied, validateBedNo } from './bedLogic';

describe('generateBedNumber', () => {
  it('matches the real confirmed format from the app (e.g. GC03A-5)', () => {
    const ward = { ward_type: 'General', id: 'c03a1234-aaaa-bbbb-cccc-000000000000' };
    expect(generateBedNumber(ward, 4)).toBe('GC03A-5');
  });

  it('bed index is 1-based in the label even though the array index is 0-based', () => {
    const ward = { ward_type: 'ICU', id: 'aaaa1111-0000-0000-0000-000000000000' };
    expect(generateBedNumber(ward, 0)).toBe('IAAAA-1');
  });

  it('falls back to "W" if ward_type is somehow missing, rather than crashing', () => {
    const ward = { ward_type: null, id: 'aaaa1111-0000-0000-0000-000000000000' };
    expect(generateBedNumber(ward, 0)).toBe('WAAAA-1');
  });
});

describe('buildWardWithBeds', () => {
  const ward = { id: 'ward-1', ward_type: 'General', total_beds: 3 };

  it('a ward with no admissions shows all beds available', () => {
    const result = buildWardWithBeds(ward, []);
    expect(result.occupied).toBe(0);
    expect(result.available).toBe(3);
    expect(result.beds.every((b) => !b.occupied)).toBe(true);
  });

  it('correctly marks only the specific occupied bed, not the whole ward', () => {
    const bedNo = generateBedNumber(ward, 0);
    const admissions = [{ ward_id: 'ward-1', bed_no: bedNo }];
    const result = buildWardWithBeds(ward, admissions);
    expect(result.occupied).toBe(1);
    expect(result.available).toBe(2);
    expect(result.beds.find((b) => b.bedNo === bedNo).occupied).toBe(true);
    expect(result.beds.filter((b) => !b.occupied)).toHaveLength(2);
  });

  it('an admission in a DIFFERENT ward does not affect this ward occupancy — the exact bug that would happen without the ward_id filter', () => {
    const admissions = [{ ward_id: 'some-other-ward', bed_no: generateBedNumber(ward, 0) }];
    const result = buildWardWithBeds(ward, admissions);
    expect(result.occupied).toBe(0);
    expect(result.available).toBe(3);
  });

  it('a ward with zero configured beds produces an empty grid, not a crash', () => {
    const emptyWard = { id: 'ward-2', ward_type: 'ICU', total_beds: 0 };
    const result = buildWardWithBeds(emptyWard, []);
    expect(result.beds).toEqual([]);
    expect(result.available).toBe(0);
  });
});

describe('isBedOccupied — the only real safeguard against double-booking a physical bed', () => {
  const admissions = [{ wardId: 'ward-1', bedNo: 'GC03A-5' }];

  it('detects a real conflict on the exact same ward and bed', () => {
    expect(isBedOccupied(admissions, 'ward-1', 'GC03A-5')).toBe(true);
  });

  it('does NOT flag the same bed label in a different ward as a conflict — that is a genuinely different physical bed', () => {
    expect(isBedOccupied(admissions, 'ward-2', 'GC03A-5')).toBe(false);
  });

  it('trims whitespace before comparing, so a trailing space still matches the real conflict', () => {
    expect(isBedOccupied(admissions, 'ward-1', 'GC03A-5 ')).toBe(true);
  });

  it('a genuinely free bed in the same ward is correctly not flagged', () => {
    expect(isBedOccupied(admissions, 'ward-1', 'GC03A-6')).toBe(false);
  });
});

describe('validateBedNo — the full validation path used at the moment of admission', () => {
  const wards = [{ id: 'ward-1', ward_type: 'General', total_beds: 8 }];
  const admissions = [{ wardId: 'ward-1', bedNo: 'GC03A-5' }];

  it('rejects an empty bed number before even checking occupancy', () => {
    expect(validateBedNo('', 'ward-1', wards, admissions)).toMatch(/required/i);
  });

  it('rejects a genuinely occupied bed with a clear message', () => {
    expect(validateBedNo('GC03A-5', 'ward-1', wards, admissions)).toMatch(/already occupied/i);
  });

  it('accepts a genuinely free bed — returns null, meaning no error', () => {
    expect(validateBedNo('GC03A-6', 'ward-1', wards, admissions)).toBeNull();
  });
});
