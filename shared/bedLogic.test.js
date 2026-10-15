// shared/bedLogic.test.js — UPDATED
import { describe, it, expect } from 'vitest';
import { generateBedNumber, buildWardWithBeds, groupBedsByRoom, isBedOccupied, validateBedNo, isHoldActive } from './bedLogic';

describe('generateBedNumber (only used for wards that have no bed rows yet)', () => {
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

describe('buildWardWithBeds — ward without bed rows (before the database script)', () => {
  const ward = { id: 'ward-1', ward_type: 'General', total_beds: 3 };
  it('a ward with no admissions shows all beds available', () => {
    const result = buildWardWithBeds(ward, []);
    expect(result.occupied).toBe(0);
    expect(result.available).toBe(3);
    expect(result.hasBedList).toBe(false);
    expect(result.beds.every((b) => !b.occupied)).toBe(true);
  });
  it('correctly marks only the specific occupied bed, not the whole ward', () => {
    const bedNo = generateBedNumber(ward, 0);
    const result = buildWardWithBeds(ward, [{ ward_id: 'ward-1', bed_no: bedNo }]);
    expect(result.occupied).toBe(1);
    expect(result.available).toBe(2);
    expect(result.beds.find((b) => b.bedNo === bedNo).occupied).toBe(true);
  });
  it('an admission in a DIFFERENT ward does not affect this ward occupancy', () => {
    const result = buildWardWithBeds(ward, [{ ward_id: 'some-other-ward', bed_no: generateBedNumber(ward, 0) }]);
    expect(result.occupied).toBe(0);
    expect(result.available).toBe(3);
  });
  it('a ward with zero configured beds produces an empty grid, not a crash', () => {
    const result = buildWardWithBeds({ id: 'ward-2', ward_type: 'ICU', total_beds: 0 }, []);
    expect(result.beds).toEqual([]);
    expect(result.available).toBe(0);
  });
});

describe('buildWardWithBeds — with the real bed list', () => {
  const ward = { id: 'w1', ward_type: 'Semi-Private', total_beds: 99 };
  const rows = [
    { id: 'b3', ward_id: 'w1', room: 'Room 2', label: 'R2-1', seq: 3 },
    { id: 'b1', ward_id: 'w1', room: 'Room 1', label: 'R1-1', seq: 1 },
    { id: 'b2', ward_id: 'w1', room: 'Room 1', label: 'R1-2', seq: 2 },
    { id: 'x1', ward_id: 'other', room: null, label: 'OTHER-1', seq: 1 },
  ];
  it('uses the bed rows of this ward only, in order, and the real count (not total_beds)', () => {
    const r = buildWardWithBeds(ward, [], rows);
    expect(r.beds.map((b) => b.bedNo)).toEqual(['R1-1', 'R1-2', 'R2-1']);
    expect(r.total_beds).toBe(3);
    expect(r.available).toBe(3);
    expect(r.hasBedList).toBe(true);
    expect(r.beds[0]).toMatchObject({ id: 'b1', room: 'Room 1', occupied: false });
  });
  it('marks occupancy by bed name regardless of capital letters', () => {
    const r = buildWardWithBeds(ward, [{ ward_id: 'w1', bed_no: 'r1-2' }], rows);
    expect(r.beds.find((b) => b.bedNo === 'R1-2').occupied).toBe(true);
    expect(r.occupied).toBe(1);
    expect(r.available).toBe(2);
  });
  it('a patient in a different ward with the same bed name does not occupy this bed', () => {
    const r = buildWardWithBeds(ward, [{ ward_id: 'other', bed_no: 'R1-2' }], rows);
    expect(r.beds.every((b) => !b.occupied)).toBe(true);
  });
  it('available never goes below zero', () => {
    const r = buildWardWithBeds(ward, [
      { ward_id: 'w1', bed_no: 'R1-1' }, { ward_id: 'w1', bed_no: 'R1-2' }, { ward_id: 'w1', bed_no: 'R2-1' }, { ward_id: 'w1', bed_no: 'strange' },
    ], rows);
    expect(r.available).toBe(0);
  });
});

describe('groupBedsByRoom', () => {
  it('groups by room in order of first appearance, beds with no room last', () => {
    const beds = [
      { bedNo: 'a', room: null }, { bedNo: 'b', room: 'Room 2' }, { bedNo: 'c', room: 'Room 1' }, { bedNo: 'd', room: 'Room 2' }, { bedNo: 'e', room: null },
    ];
    const g = groupBedsByRoom(beds);
    expect(g.map((x) => x.room)).toEqual(['Room 2', 'Room 1', null]);
    expect(g[0].beds.map((b) => b.bedNo)).toEqual(['b', 'd']);
    expect(g[2].beds.map((b) => b.bedNo)).toEqual(['a', 'e']);
  });
  it('handles no beds', () => { expect(groupBedsByRoom([])).toEqual([]); expect(groupBedsByRoom(undefined)).toEqual([]); });
});

describe('isBedOccupied — client-side friendly check (the database enforces it for real)', () => {
  const admissions = [{ wardId: 'ward-1', bedNo: 'GC03A-5' }];
  it('detects a real conflict on the exact same ward and bed', () => { expect(isBedOccupied(admissions, 'ward-1', 'GC03A-5')).toBe(true); });
  it('does NOT flag the same bed label in a different ward', () => { expect(isBedOccupied(admissions, 'ward-2', 'GC03A-5')).toBe(false); });
  it('trims whitespace before comparing', () => { expect(isBedOccupied(admissions, 'ward-1', 'GC03A-5 ')).toBe(true); });
  it('ignores capital letters, like the database', () => { expect(isBedOccupied(admissions, 'ward-1', 'gc03a-5')).toBe(true); });
  it('a genuinely free bed in the same ward is correctly not flagged', () => { expect(isBedOccupied(admissions, 'ward-1', 'GC03A-6')).toBe(false); });
});

describe('validateBedNo — the validation used at the moment of admission or move', () => {
  const legacyWards = [{ id: 'ward-1', ward_type: 'General', total_beds: 8, hasBedList: false, beds: [] }];
  const listWards = [{ id: 'ward-1', ward_type: 'General', hasBedList: true, beds: [{ bedNo: 'A-1' }, { bedNo: 'A-2' }] }];
  const admissions = [{ wardId: 'ward-1', bedNo: 'A-1' }];
  it('rejects an empty bed number', () => { expect(validateBedNo('', 'ward-1', listWards, admissions)).toMatch(/required/i); });
  it('rejects an occupied bed', () => { expect(validateBedNo('A-1', 'ward-1', listWards, admissions)).toMatch(/already occupied/i); });
  it('rejects a name that is not a bed of a ward that has a bed list', () => {
    expect(validateBedNo('Z-9', 'ward-1', listWards, admissions)).toMatch(/not a bed of this ward/i);
  });
  it('accepts a free bed of the list (any capital letters)', () => {
    expect(validateBedNo('a-2', 'ward-1', listWards, admissions)).toBeNull();
  });
  it('a ward without a bed list still accepts a typed name that is not occupied', () => {
    expect(validateBedNo('GC03A-6', 'ward-1', legacyWards, [{ wardId: 'ward-1', bedNo: 'GC03A-5' }])).toBeNull();
  });
});

describe('isHoldActive', () => {
  it('no hold -> false', () => { expect(isHoldActive(null, null, '2026-10-15')).toBe(false); expect(isHoldActive(undefined, undefined)).toBe(false); });
  it('out of service is always in force', () => { expect(isHoldActive('out_of_service', null, '2026-10-15')).toBe(true); });
  it('a reservation without a date is in force', () => { expect(isHoldActive('reserved', null, '2026-10-15')).toBe(true); });
  it('a reservation is in force through its until date', () => { expect(isHoldActive('reserved', '2026-10-15', '2026-10-15')).toBe(true); });
  it('a reservation is over the day after its until date', () => { expect(isHoldActive('reserved', '2026-10-14', '2026-10-15')).toBe(false); });
  it('without a today date a reservation is taken as in force', () => { expect(isHoldActive('reserved', '2020-01-01')).toBe(true); });
});

describe('buildWardWithBeds — beds on hold', () => {
  const ward = { id: 'w1', ward_type: 'Private', total_beds: 4 };
  const rows = [
    { id: 'b1', ward_id: 'w1', room: 'R1', label: 'R1-1', seq: 1 },
    { id: 'b2', ward_id: 'w1', room: 'R1', label: 'R1-2', seq: 2, hold_kind: 'reserved', hold_note: 'For Mr Rao', hold_until: '2026-10-20' },
    { id: 'b3', ward_id: 'w1', room: 'R2', label: 'R2-1', seq: 3, hold_kind: 'out_of_service', hold_note: 'Broken cot' },
    { id: 'b4', ward_id: 'w1', room: 'R2', label: 'R2-2', seq: 4, hold_kind: 'reserved', hold_note: 'Old reservation', hold_until: '2026-10-10' },
  ];
  it('held beds carry their hold and do not count as available', () => {
    const r = buildWardWithBeds(ward, [], rows, '2026-10-15');
    expect(r.beds.find((b) => b.bedNo === 'R1-2').hold).toEqual({ kind: 'reserved', note: 'For Mr Rao', until: '2026-10-20' });
    expect(r.beds.find((b) => b.bedNo === 'R2-1').hold).toMatchObject({ kind: 'out_of_service', note: 'Broken cot' });
    expect(r.held).toBe(2);
    expect(r.total_beds).toBe(4);
    expect(r.available).toBe(2);
  });
  it('an expired reservation is free again', () => {
    const r = buildWardWithBeds(ward, [], rows, '2026-10-15');
    expect(r.beds.find((b) => b.bedNo === 'R2-2').hold).toBeNull();
  });
  it('a bed with a patient is counted once (as occupied, not as held)', () => {
    const r = buildWardWithBeds(ward, [{ ward_id: 'w1', bed_no: 'r1-2' }], rows, '2026-10-15');
    expect(r.held).toBe(1);
    expect(r.occupied).toBe(1);
    expect(r.available).toBe(2);
  });
  it('rows without hold columns (script not run) behave as before', () => {
    const r = buildWardWithBeds(ward, [], [{ id: 'b1', ward_id: 'w1', room: null, label: 'A-1', seq: 1 }], '2026-10-15');
    expect(r.held).toBe(0);
    expect(r.available).toBe(1);
    expect(r.beds[0].hold).toBeNull();
  });
  it('a ward without a bed list has no holds', () => {
    const r = buildWardWithBeds({ id: 'w9', ward_type: 'ICU', total_beds: 2 }, [], [], '2026-10-15');
    expect(r.held).toBe(0);
    expect(r.available).toBe(2);
  });
});

describe('validateBedNo — beds on hold', () => {
  const listWards = [{ id: 'w1', hasBedList: true, beds: [
    { bedNo: 'A-1', hold: null },
    { bedNo: 'A-2', hold: { kind: 'reserved', note: 'For Mr Rao', until: null } },
    { bedNo: 'A-3', hold: { kind: 'out_of_service', note: 'Broken cot', until: null } },
  ] }];
  it('refuses a reserved bed and says why', () => { expect(validateBedNo('a-2', 'w1', listWards, [])).toMatch(/reserved \(For Mr Rao\)/); });
  it('refuses an out-of-service bed and says why', () => { expect(validateBedNo('A-3', 'w1', listWards, [])).toMatch(/out of service \(Broken cot\)/); });
  it('accepts a bed without a hold', () => { expect(validateBedNo('A-1', 'w1', listWards, [])).toBeNull(); });
});
