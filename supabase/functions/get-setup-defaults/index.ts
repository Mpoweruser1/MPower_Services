// supabase/functions/get-setup-defaults/index.ts
//
// Fetches the classes (School) or wards (Hospital) already created by
// the seed_default_client_data trigger at registration, so
// FirstTimeSetup's Step 2 can show them for the principal/doctor to
// customize — rename, add, or remove — rather than creating from
// scratch, which would either duplicate or scramble what the trigger
// already set up correctly.

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

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userRow, error: userError } = await adminClient
      .from('users').select('app_id').eq('auth_id', user.id).maybeSingle();
    if (userError || !userRow?.app_id) {
      return json({ error: 'Could not find your account. Please contact support.' }, 404);
    }

    const { data: appRow } = await adminClient
      .from('apps').select('app_type').eq('id', userRow.app_id).maybeSingle();

    if (appRow?.app_type === 'school') {
      const { data: classes, error: classError } = await adminClient
        .from('classes').select('id, class_name, class_order, medium')
        .eq('app_id', userRow.app_id).order('class_order');
      if (classError) return json({ error: classError.message }, 500);
      return json({ appType: 'school', classes: classes || [] });
    }

    if (appRow?.app_type === 'hospital') {
      const { data: wards, error: wardError } = await adminClient
        .from('wards').select('id, ward_type, total_beds')
        .eq('app_id', userRow.app_id).order('ward_type');
      if (wardError) return json({ error: wardError.message }, 500);
      return json({ appType: 'hospital', wards: wards || [] });
    }

    return json({ error: 'Unrecognized account type' }, 400);
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