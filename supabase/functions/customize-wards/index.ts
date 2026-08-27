// supabase/functions/customize-wards/index.ts
//
// Replaces save-ward-details.ts entirely — same reasoning as
// customize-classes.ts. The trigger already creates 4 real wards
// (General Ward, ICU, Emergency, Maternity) at registration. This
// applies the doctor's actual edits on top of what already exists,
// rather than risking a name mismatch creating a duplicate ward
// (confirmed real risk: the old code upserted 'General', but the
// trigger's real ward is named 'General Ward' — these would never
// have matched).

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

    const { wards, removedIds } = await req.json();
    if (!Array.isArray(wards)) return json({ error: 'A ward list is required' }, 400);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userRow, error: userError } = await adminClient
      .from('users').select('app_id').eq('auth_id', user.id).maybeSingle();
    if (userError || !userRow?.app_id) {
      return json({ error: 'Could not find your account. Please contact support.' }, 404);
    }

    if (Array.isArray(removedIds) && removedIds.length > 0) {
      const { error: deleteError } = await adminClient
        .from('wards').delete().in('id', removedIds).eq('app_id', userRow.app_id);
      if (deleteError) return json({ error: 'Failed to remove wards.' }, 500);
    }

    for (const ward of wards) {
      const bedCount = parseInt(ward.total_beds);
      if (isNaN(bedCount) || bedCount < 1) return json({ error: `Enter a valid bed count for ${ward.ward_type}.` }, 400);

      if (ward.id) {
        const { error: updateError } = await adminClient
          .from('wards')
          .update({ ward_type: ward.ward_type, total_beds: bedCount })
          .eq('id', ward.id).eq('app_id', userRow.app_id);
        if (updateError) return json({ error: `Failed to update ${ward.ward_type}.` }, 500);
      } else {
        const { error: insertError } = await adminClient
          .from('wards')
          .insert({ app_id: userRow.app_id, ward_type: ward.ward_type, total_beds: bedCount });
        if (insertError) return json({ error: `Failed to add ${ward.ward_type}.` }, 500);
      }
    }

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