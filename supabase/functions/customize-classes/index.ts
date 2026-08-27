// supabase/functions/customize-classes/index.ts
//
// Replaces save-classes.ts entirely — that function assumed nothing
// existed yet, but the seed_default_client_data trigger already
// creates 12 real classes (LKG through Class 10) the moment a school
// registers. This applies the principal's actual edits — renamed,
// added, or removed classes — on top of what the trigger already
// created, rather than creating from scratch and risking scrambling
// the trigger's own class_order values.

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

    // classes: the full, final list the principal wants — each item
    // either { id, class_name, medium } for an edited existing class,
    // or { class_name, medium } (no id) for a genuinely new one.
    // removedIds: ids of trigger-created classes the principal chose
    // to remove.
    const { classes, removedIds } = await req.json();
    if (!Array.isArray(classes)) return json({ error: 'A class list is required' }, 400);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userRow, error: userError } = await adminClient
      .from('users').select('app_id, branch_id').eq('auth_id', user.id).maybeSingle();
    if (userError || !userRow?.app_id) {
      return json({ error: 'Could not find your account. Please contact support.' }, 404);
    }

    if (Array.isArray(removedIds) && removedIds.length > 0) {
      const { error: deleteError } = await adminClient
        .from('classes').delete().in('id', removedIds).eq('app_id', userRow.app_id);
      if (deleteError) return json({ error: 'Failed to remove classes.' }, 500);
    }

    for (const [index, cls] of classes.entries()) {
      if (cls.id) {
        const { error: updateError } = await adminClient
          .from('classes')
          .update({ class_name: cls.class_name, medium: cls.medium, class_order: index + 1 })
          .eq('id', cls.id).eq('app_id', userRow.app_id);
        if (updateError) return json({ error: `Failed to update ${cls.class_name}.` }, 500);
      } else {
        const { error: insertError } = await adminClient
          .from('classes')
          .insert({ app_id: userRow.app_id, branch_id: userRow.branch_id, class_name: cls.class_name, medium: cls.medium, class_order: index + 1 });
        if (insertError) return json({ error: `Failed to add ${cls.class_name}.` }, 500);
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