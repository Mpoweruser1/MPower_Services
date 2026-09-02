// shared/dbHelpers.js — NEW
//
// WHY THIS EXISTS
// Across this whole codebase, the single most common real bug this
// session was some version of: a Supabase write's error was never
// checked, or was checked but shown as a generic message that hid
// the real cause. It happened independently in School, Hospital, CTS,
// and Control Panel — dozens of times, in files that had no other
// connection to each other. That pattern means it's not a one-off
// mistake, it's a missing convention. These two small helpers exist
// to make the correct behavior the easy, obvious behavior, so it
// stops being something every developer has to remember every time.
//
// This is NOT a rewrite of how the app talks to Supabase — every
// existing `supabase.from(...).select(...)` call still works exactly
// as before. These are optional wrappers you reach for at write time,
// starting with new code and high-stakes screens, not a forced
// migration of the whole app at once.

/**
 * Wraps a Supabase query result and throws a real Error if it failed,
 * with the actual Postgres/PostgREST message intact — instead of
 * silently returning null or requiring the caller to remember to
 * check `.error` themselves.
 *
 * BEFORE (the pattern that caused most bugs this session):
 *   const { data, error } = await supabase.from('students').insert({...});
 *   if (error) { setError('Failed to save.'); return; }  // <- easy to forget
 *
 * AFTER:
 *   try {
 *     const student = unwrap(await supabase.from('students').insert({...}).select().single());
 *   } catch (err) {
 *     setError(err.message);  // <- always the real message, never generic
 *   }
 *
 * @param {{data: any, error: any}} result - the raw Supabase response
 * @param {string} [context] - optional label included in the thrown
 *   error and the console log, e.g. 'saving student', 'issuing TC'
 * @returns {any} result.data, if there was no error
 * @throws {Error} if result.error is set
 */
export function unwrap(result, context) {
  if (result?.error) {
    const label = context ? ` (${context})` : '';
    console.error(`Supabase error${label}:`, result.error);
    throw new Error(result.error.message || `Something went wrong${label}.`);
  }
  return result?.data;
}

/**
 * Same idea, specifically for Supabase Edge Function calls
 * (supabase.functions.invoke). This one is worth having separately
 * because edge functions have their own failure mode that isn't just
 * "check .error" — a non-2xx response does NOT populate `data`, and
 * the real error message lives inside `error.context` (a raw Response
 * object), not in `error.message` (which is just a generic wrapper
 * string like "Edge Function returned a non-2xx status code"). This
 * exact gap caused a real, confirmed bug this session (ManageStaff.jsx's
 * invite flow) where the true reason for a failed invite was
 * completely invisible to the user for a long time.
 *
 * Usage:
 *   try {
 *     const result = await unwrapEdgeFunction(
 *       supabase.functions.invoke('invite-staff-member', { body: {...} })
 *     );
 *   } catch (err) {
 *     setError(err.message);
 *   }
 */
export async function unwrapEdgeFunction(invokePromise, context) {
  const { data, error } = await invokePromise;
  const label = context ? ` (${context})` : '';

  if (error || data?.error) {
    let message = data?.error;
    if (!message && error?.context) {
      try {
        const body = await error.context.json();
        message = body?.error;
      } catch {
        // Response body wasn't JSON — fall through to whatever we have
      }
    }
    console.error(`Edge function error${label}:`, error || data?.error);
    throw new Error(message || error?.message || `Something went wrong${label}.`);
  }
  return data;
}
