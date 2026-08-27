// supabase/functions/save-branch-details/index.ts
//
// Moved off a direct client-side insert after a real, reported
// failure: "Failed to save address/district" on FirstTimeSetup,
// right after fresh registration. The RLS policy on branches
// requires app_id = current_app_id() to hold at the exact moment of
// insert — and this is the very first screen after signup, where a
// client-side value (tenant.appId) or the RLS helper's own lookup
// could plausibly be briefly stale. Rather than debug an exact race
// condition, this sidesteps it entirely: the server freshly looks up
// which app this authenticated user actually belongs to, using their
// real access token, and performs the write with the service role.

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    // Verify the caller's real, current identity from their own token
    // — not trusting anything the client claims about which app they
    // belong to.
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid session' }, 401);

    const { address, district } = await req.json();
    if (!address?.trim() || !district) return json({ error: 'Address and district are required' }, 400);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Fresh, direct lookup — this is the actual source of truth for
    // which app this user belongs to, not a client-supplied value or
    // an RLS helper that could theoretically be evaluated at a
    // moment before this user's row was fully visible to it.
    const { data: userRow, error: userError } = await adminClient
      .from('users').select('app_id, branch_id').eq('auth_id', user.id).maybeSingle();
    if (userError || !userRow?.app_id) {
      return json({ error: 'Could not find your account. Please contact support.' }, 404);
    }

    let branchId = userRow.branch_id;

    if (branchId) {
      const { error: updateError } = await adminClient
        .from('branches').update({ address: address.trim(), district }).eq('id', branchId);
      if (updateError) return json({ error: updateError.message }, 500);
    } else {
      const { data: newBranch, error: insertError } = await adminClient
        .from('branches')
        .insert({ app_id: userRow.app_id, address: address.trim(), district })
        .select().single();
      if (insertError) return json({ error: insertError.message }, 500);

      branchId = newBranch.id;
      const { error: linkError } = await adminClient
        .from('users').update({ branch_id: branchId }).eq('auth_id', user.id);
      if (linkError) return json({ error: linkError.message }, 500);
    }

    return json({ success: true, branchId });
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