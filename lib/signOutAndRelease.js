// src/lib/signOutAndRelease.js   (NEW file — add, don't replace; 12-10-2026)
//
// The one correct way to sign a portal/staff user out: first tell the server
// to free this session's single-session lock (so signing straight back in on
// any device never hits "already signed in elsewhere"), then clear the saved
// session token, then sign out of Supabase.
//
//  - The release step is capped at 5 seconds, so a slow or failing server can
//    never trap someone in a signed-in state.
//  - The token is sent along, so a late sign-out from an OLD device can't wipe
//    the lock of a device that has since taken over.
//  - Safe to call for anyone, including people who never claimed a session.
//
// Usage:  await signOutAndRelease();   // then redirect / let the guard redirect
import { supabase } from './supabaseClient';

export const SESSION_TOKEN_KEY = 'mpower_session_token';

export async function signOutAndRelease() {
  let token = null;
  try { token = sessionStorage.getItem(SESSION_TOKEN_KEY); } catch { /* storage blocked */ }

  // Always asked, even with no saved token: a staff login made before the
  // token existed still has a lock row that must be freed. (Harmless for a
  // person who never claimed a session: there is simply nothing to delete.)
  try {
    await Promise.race([
      supabase.functions.invoke('check-and-claim-session', { body: token ? { action: 'release', sessionToken: token } : { action: 'release' } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
  } catch { /* never block sign-out */ }
  try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch { /* ignore */ }
  await supabase.auth.signOut();
}
