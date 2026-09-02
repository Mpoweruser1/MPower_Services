// shared/feeStructureLogic.test.js — NEW
import { describe, it, expect } from 'vitest';
import { findDuplicateFeeStructure, buildDueRows } from './feeStructureLogic';

describe('findDuplicateFeeStructure', () => {
  const existing = [
    { fee_type: 'Term 1 Tuition', class_id: null, academic_year: '2026-27' },
    { fee_type: 'Transport Fee', class_id: 'class-8-id', academic_year: '2026-27' },
  ];

  it('catches an exact re-entry of the same fee', () => {
    const form = { fee_type: 'Term 1 Tuition', class_id: null, academic_year: '2026-27' };
    expect(findDuplicateFeeStructure(existing, form)).toBeDefined();
  });

  it('catches a duplicate regardless of casing — a real office worker will not always type it identically', () => {
    const form = { fee_type: '  TERM 1 TUITION  ', class_id: null, academic_year: '2026-27' };
    expect(findDuplicateFeeStructure(existing, form)).toBeDefined();
  });

  it('does NOT flag a genuinely different fee type as a duplicate', () => {
    const form = { fee_type: 'Term 2 Tuition', class_id: null, academic_year: '2026-27' };
    expect(findDuplicateFeeStructure(existing, form)).toBeUndefined();
  });

  it('does NOT flag the same fee name for a different academic year — re-billing next year is expected, not a mistake', () => {
    const form = { fee_type: 'Term 1 Tuition', class_id: null, academic_year: '2027-28' };
    expect(findDuplicateFeeStructure(existing, form)).toBeUndefined();
  });

  it('treats null and undefined class_id as the same "applies to all classes" — the exact bug a naive === check would miss', () => {
    const form = { fee_type: 'Term 1 Tuition', class_id: undefined, academic_year: '2026-27' };
    expect(findDuplicateFeeStructure(existing, form)).toBeDefined();
  });

  it('a fee scoped to one class is not confused with the same-named fee for all classes', () => {
    const form = { fee_type: 'Transport Fee', class_id: null, academic_year: '2026-27' };
    expect(findDuplicateFeeStructure(existing, form)).toBeUndefined();
  });
});

describe('buildDueRows', () => {
  const students = [{ id: 'stu-1' }, { id: 'stu-2' }, { id: 'stu-3' }];
  const form = { fee_type: 'Term 1 Tuition', amount: '15000', due_date: '2026-07-15' };

  it('creates exactly one due row per matched student', () => {
    const rows = buildDueRows(students, 'structure-1', form);
    expect(rows).toHaveLength(3);
  });

  it('every row carries the correct fee_structure_id — this is what links the due back to its definition', () => {
    const rows = buildDueRows(students, 'structure-1', form);
    rows.forEach((r) => expect(r.fee_structure_id).toBe('structure-1'));
  });

  it('amount is coerced to a real number, not left as the form string — a string "15000" would break downstream sum/aggregate math', () => {
    const rows = buildDueRows(students, 'structure-1', form);
    expect(typeof rows[0].amount_due).toBe('number');
    expect(rows[0].amount_due).toBe(15000);
  });

  it('every new due starts as pending, never pre-marked paid', () => {
    const rows = buildDueRows(students, 'structure-1', form);
    rows.forEach((r) => expect(r.status).toBe('pending'));
  });

  it('a fee created with no due date produces null, not the string "undefined" or an empty string', () => {
    const rows = buildDueRows(students, 'structure-1', { ...form, due_date: '' });
    expect(rows[0].due_date).toBeNull();
  });

  it('an empty matching-student list produces an empty row set, not an error', () => {
    expect(buildDueRows([], 'structure-1', form)).toEqual([]);
  });
});
