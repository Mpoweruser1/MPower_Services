// shared/promotionLogic.js — NEW
//
// Pulled directly from PromoteStudents.jsx — this is the exact logic
// that decides whether a real student gets promoted, retained, or
// graduated at year-end. This was the single most severe finding in
// the whole audit: the bulk operation using this logic had zero
// error-checking on the actual database writes (already fixed
// separately). This file addresses the other half of the risk — the
// DECISION itself silently being wrong for some student due to an
// edge case nobody thought to check by hand.

/**
 * A pass_fail value from the marks table can arrive in several forms
 * depending on how it was entered — this normalizes all of them.
 */
export function isFailLike(passFail) {
  if (!passFail) return false;
  const v = passFail.trim().toLowerCase();
  return v === 'f' || v.includes('fail');
}

/**
 * The core year-end decision. Order matters: a student in the
 * highest class always graduates, even if they'd otherwise be
 * retained for failing a subject — that's a deliberate real-world
 * rule (there's no "next class" to retain them into), not an
 * oversight.
 *
 * @param {{isHighest: boolean, marksCount: number, failCount: number}} input
 * @returns {{decision: 'graduated'|'promoted'|'retained', reason: string}}
 */
export function computeDecision({ isHighest, marksCount, failCount }) {
  if (isHighest) {
    return { decision: 'graduated', reason: '' };
  }
  if (marksCount === 0) {
    return { decision: 'promoted', reason: 'No exam marks recorded for this exam — review before confirming.' };
  }
  if (failCount > 0) {
    return { decision: 'retained', reason: `Failed ${failCount} of ${marksCount} subject${marksCount > 1 ? 's' : ''}.` };
  }
  return { decision: 'promoted', reason: '' };
}

/**
 * "2025-26" -> "2026-27". Used to suggest the next academic year
 * label when starting a new promotion batch.
 */
export function nextAcademicYear(current) {
  const match = current?.match(/(\d{4})/);
  if (!match) return '';
  const startYear = parseInt(match[1], 10);
  return `${startYear + 1}-${String(startYear + 2).slice(-2)}`;
}
