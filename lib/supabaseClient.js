// lib/supabaseClient.js — MERGED
//
// This is your real file, with offline-switching logic added on top —
// not a replacement written from scratch. Everything below the
// persistSession comment is unchanged from what you already have.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const LOCAL_SERVER_URL = typeof localStorage !== 'undefined'
  ? localStorage.getItem('mpower_local_server_url')
  : null;

let usingLocal = false;

export function isUsingLocalServer() {
  return usingLocal;
}

async function pingLocalServer(timeoutMs = 1500) {
  if (!LOCAL_SERVER_URL) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${LOCAL_SERVER_URL}/rest/v1/`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// persistSession: false — without this, Supabase's default behaviour
// saves the session in localStorage and keeps it valid indefinitely,
// meaning closing and reopening the browser stays logged in as
// whoever was last signed in. On a shared office computer (reception
// desks, shared school/hospital terminals), that's the next person
// walking up to a live, already-authenticated session — the same
// shared-device risk already fixed for drafts, now fixed for the
// actual login itself. Closing the browser now requires signing in
// again, same as the app already expects after the 30-minute idle
// timeout in App.jsx.
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
  },
});

// Re-evaluates which endpoint should be active. Devices with no local
// server configured (LOCAL_SERVER_URL is null) always resolve to
// cloud — today's exact behavior, completely unchanged. Uses the same
// persistSession: false option as above, for the same reason.
async function resolveEndpoint() {
  const localReachable = LOCAL_SERVER_URL && await pingLocalServer();
  usingLocal = !!localReachable;
  const targetUrl = usingLocal ? LOCAL_SERVER_URL : supabaseUrl;
  Object.assign(supabase, createClient(targetUrl, supabasePublishableKey, {
    auth: { persistSession: false },
  }));
}

if (typeof window !== 'undefined') {
  resolveEndpoint();
  window.addEventListener('online', resolveEndpoint);
  window.addEventListener('offline', resolveEndpoint);
}