// lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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