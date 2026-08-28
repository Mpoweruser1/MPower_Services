// supabase/functions/suggest-village/index.ts
//
// Replaces the direct client-side insert into villages, which relied
// on an RLS policy checking current_app_id() — something that can
// never resolve for a citizen (no users row exists for anonymous
// sessions), and villages has no app_id column of its own to check
// directly anyway (the state link only exists via mandal ->
// constituency -> app_id). This verifies that link server-side
// instead. Accepts appId directly rather than a state slug — the
// calling hook (useGeographyPicker) already has appId, legitimately
// resolved earlier via fetchAppIdBySlug; the real protection here is
// verifying server-side that the mandal genuinely belongs to
// whatever app_id is claimed, not which parameter name carries it.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { appId, mandalId, name, suggestedBy } = await req.json();
    const trimmedName = (name || '').trim();
    if (!appId || !mandalId || !trimmedName) {
      return json({ error: 'App, mandal, and village name are all required' }, 400);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify the mandal genuinely belongs to a constituency under
    // THIS app_id — the real check the old RLS policy was trying to
    // do, just done safely here instead. Using plain, separate
    // queries rather than a PostgREST !inner join-filter — no file
    // in this codebase has ever proven that syntax works here, so
    // staying consistent with the same caution applied earlier this
    // session rather than risk an unverified pattern.
    const { data: mandalRow, error: mandalError } = await adminClient
      .from('mandals').select('id, constituency_id').eq('id', mandalId).maybeSingle();
    if (mandalError || !mandalRow) return json({ error: 'That mandal could not be found.' }, 400);

    const { data: constituencyRow, error: constituencyError } = await adminClient
      .from('constituencies').select('app_id').eq('id', mandalRow.constituency_id).maybeSingle();
    if (constituencyError || !constituencyRow || constituencyRow.app_id !== appId) {
      return json({ error: 'This mandal does not belong to the selected state.' }, 400);
    }

    // Same duplicate-avoidance the client already did before this
    // move — a village with this name may already exist under this
    // mandal.
    const { data: existing } = await adminClient
      .from('villages').select('id, name, user_suggested')
      .eq('mandal_id', mandalId).ilike('name', trimmedName).maybeSingle();
    if (existing) return json({ village: existing });

    const { data: newVillage, error: insertError } = await adminClient
      .from('villages')
      .insert({ mandal_id: mandalId, name: trimmedName, user_suggested: true, suggested_by: suggestedBy || null })
      .select().single();
    if (insertError) return json({ error: 'Failed to save the village. Please try again.' }, 500);

    return json({ village: newVillage });
  } catch (err) {
    console.error(err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}