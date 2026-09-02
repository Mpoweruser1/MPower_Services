// shared/dbHelpers.test.js — NEW
import { describe, it, expect, vi } from 'vitest';
import { unwrap, unwrapEdgeFunction } from './dbHelpers';

describe('unwrap', () => {
  it('returns data when there is no error', () => {
    const result = unwrap({ data: { id: '123', name: 'Aarav Reddy' }, error: null });
    expect(result).toEqual({ id: '123', name: 'Aarav Reddy' });
  });

  it('throws the real Postgres message when error is present', () => {
    const result = { data: null, error: { message: "Could not find the 'medium' column of 'students'" } };
    expect(() => unwrap(result, 'saving student')).toThrow(
      "Could not find the 'medium' column of 'students'"
    );
  });

  it('falls back to a generic message only when the error has none', () => {
    const result = { data: null, error: {} };
    expect(() => unwrap(result, 'saving student')).toThrow('Something went wrong (saving student).');
  });

  it('logs the real error to console for debugging, not just the thrown message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const realError = { message: 'column "app_id" does not exist' };
    expect(() => unwrap({ data: null, error: realError })).toThrow();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Supabase error'), realError);
    spy.mockRestore();
  });
});

describe('unwrapEdgeFunction', () => {
  it('returns data on a clean 2xx response', async () => {
    const result = await unwrapEdgeFunction(
      Promise.resolve({ data: { success: true }, error: null })
    );
    expect(result).toEqual({ success: true });
  });

  it('reads the real error from a 2xx response with an error field', async () => {
    await expect(
      unwrapEdgeFunction(Promise.resolve({ data: { error: 'Email already invited' }, error: null }))
    ).rejects.toThrow('Email already invited');
  });

  it('extracts the real message from error.context on a non-2xx response — the exact bug that hid the true invite-staff-member failure reason', async () => {
    const fakeError = {
      message: 'Edge Function returned a non-2xx status code', // the generic wrapper message
      context: { json: async () => ({ error: 'Role fee_clerk is not a valid role.' }) },
    };
    await expect(
      unwrapEdgeFunction(Promise.resolve({ data: null, error: fakeError }))
    ).rejects.toThrow('Role fee_clerk is not a valid role.');
  });

  it('falls back gracefully when error.context body is not valid JSON', async () => {
    const fakeError = {
      message: 'Edge Function returned a non-2xx status code',
      context: { json: async () => { throw new Error('not json'); } },
    };
    await expect(
      unwrapEdgeFunction(Promise.resolve({ data: null, error: fakeError }))
    ).rejects.toThrow('Edge Function returned a non-2xx status code');
  });
});
