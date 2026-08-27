// supabase/functions/save-org-details/index.ts
//
// Fixes a fourth instance of the same root cause found across this
// registration flow: apps.update().eq('id', tenant?.appId) had error
// checking, but no .select().single() chained — meaning if
// tenant.appId were stale at this exact moment (the same
// right-after-registration timing risk as branches/wards/classes),
// the WHERE clause would match zero rows silently. Supabase does not
// treat "matched nothing" as an error by default, so appErr would be
// null and the code would proceed believing org_name, school_type,
// and board_type were saved, when nothing was actually written.

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

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid session' }, 401);

    const { orgName, schoolType, boardType } = await req.json();
    if (!orgName?.trim()) return json({ error: 'Organisation name is required' }, 400);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userRow, error: userError } = await adminClient
      .from('users').select('app_id').eq('auth_id', user.id).maybeSingle();
    if (userError || !userRow?.app_id) {
      return json({ error: 'Could not find your account. Please contact support.' }, 404);
    }

    const appUpdate: Record<string, unknown> = { org_name: orgName.trim() };
    if (schoolType !== undefined) appUpdate.school_type = schoolType || null;
    if (boardType !== undefined) appUpdate.board_type = boardType || 'state_board';

    // .select().single() here is deliberate — this is what was
    // missing before. If the update matches zero rows, this makes
    // that a real, visible error instead of a silent no-op.
    const { error: updateError } = await adminClient
      .from('apps').update(appUpdate).eq('id', userRow.app_id).select().single();
    if (updateError) return json({ error: 'Failed to save organisation details.' }, 500);

    return json({ success: true });
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