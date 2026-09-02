// shared/feeStructureLogic.js — NEW
//
// Pulled from ManageFeeStructure.jsx. Two pieces of real logic here
// that are easy to get subtly wrong and hard to notice when you have:
//
// 1. Duplicate-fee detection — this is what stops a school office
//    from accidentally re-creating the same term's tuition fee twice
//    (e.g. re-entering "Term 1 Tuition" for 2026-27 a second time by
//    mistake), which would double-bill every matching student. The
//    database's own unique constraint only catches a duplicate due for
//    the SAME fee_structure_id — it can't catch a brand new
//    fee_structure row that happens to describe the same real-world
//    fee. This check exists specifically to catch that before it
//    happens.
//
// 2. Due-row generation — turning a fee definition into one row per
//    matching student. A silently wrong amount or a lost due_date here
//    means real families get billed the wrong amount, or a fee with no
//    deadline.

/**
 * Case-insensitive, treats a missing class_id consistently (both
 * "applies to all classes") — a naive strict-equality check on
 * class_id would treat `null` and `undefined` as different classes
 * and fail to catch a real duplicate.
 *
 * @param {Array} structures - existing fee_structure rows already loaded
 * @param {{fee_type: string, class_id: string|null, academic_year: string}} form
 * @returns {object|undefined} the matching existing structure, if any
 */
export function findDuplicateFeeStructure(structures, form) {
  return structures.find((s) =>
    s.fee_type.trim().toLowerCase() === form.fee_type.trim().toLowerCase() &&
    (s.class_id || null) === (form.class_id || null) &&
    s.academic_year === form.academic_year
  );
}

/**
 * @param {Array<{id: string}>} students - matching active students
 * @param {string} structureId - the newly created fee_structure.id
 * @param {{fee_type: string, amount: string|number, due_date: string|null}} form
 * @returns {Array} rows ready for fee_dues upsert
 */
export function buildDueRows(students, structureId, form) {
  return students.map((s) => ({
    student_id: s.id,
    fee_structure_id: structureId,
    fee_type: form.fee_type.trim(),
    amount_due: Number(form.amount),
    due_date: form.due_date || null,
    status: 'pending',
  }));
}
