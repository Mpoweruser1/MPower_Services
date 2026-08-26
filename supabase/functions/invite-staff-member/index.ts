// supabase/functions/invite-staff-member/index.ts
//
// The actual gap this closes: nothing anywhere in the app can create
// a second staff login. Registration.jsx only ever creates ONE
// account (the owner, at signup) - there was no way to add a
// teacher, fee clerk, or second doctor afterward.
//
// Uses Supabase's admin inviteUserByEmail - creates the auth account
// and emails them a link to set their own password (never a
// transmitted temp password). Requires the service role, so this
// MUST run here, never client-side.
//
// Authorization is enforced here, not by RLS - the service role
// bypasses RLS entirely, so this function is the only thing standing
// between "any authenticated request" and "creates a real login."

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const INVITABLE_SCHOOL_ROLES = ['teacher', 'fee_clerk'];
const INVITABLE_HOSPITAL_ROLES = ['nurse', 'receptionist', 'pharmacist'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const { email, fullName, phone, role } = await req.json();
    if (!email || !fullName || !role) {
      return json({ error: 'email, fullName, and role are required' }, 400);
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) return json({ error: 'Could not identify caller' }, 401);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerRow, error: callerRowErr } = await adminClient
      .from('users')
      .select('app_id, role')
      .eq('auth_id', caller.id)
      .maybeSingle();

    if (callerRowErr || !callerRow) return json({ error: 'Caller has no staff profile' }, 403);
    if (!['principal', 'doctor'].includes(callerRow.role)) {
      return json({ error: 'Only the principal or doctor account can invite staff' }, 403);
    }

    const allValidRoles = [...INVITABLE_SCHOOL_ROLES, ...INVITABLE_HOSPITAL_ROLES];
    if (!allValidRoles.includes(role)) {
      return json({ error: 'That role cannot be invited through this flow' }, 400);
    }

    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName, invited_role: role },
    });

    if (inviteErr) {
      return json({ error: inviteErr.message || 'Failed to send invite' }, 502);
    }

    const { error: userRowErr } = await adminClient.from('users').insert({
      app_id: callerRow.app_id,
      auth_id: inviteData.user.id,
      role,
      full_name: fullName,
      phone: phone || null,
    });

    if (userRowErr) {
      console.error('users row insert failed after successful invite:', userRowErr);
      return json({ error: 'Invite sent, but failed to link the account - contact support.' }, 500);
    }

    return json({ invited: true, email });
  } catch (err) {
    console.error(err);
    return json({ error: err.message || 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}