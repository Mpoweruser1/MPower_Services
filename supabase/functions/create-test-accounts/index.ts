// supabase/functions/create-test-accounts/index.ts
//
// One-time setup helper — creates a full set of real, working test
// accounts across School, Hospital, and CTS, so every module can
// actually be logged into and tested end to end, not just built.
//
// SECURITY: protected by a setup secret so this can't be called by
// anyone who stumbles on the URL. DELETE THIS FUNCTION after you've
// created your test accounts — a publicly-reachable "create accounts
// with known passwords" endpoint is a real risk to leave live
// indefinitely, even with the secret.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Change this to your own value before deploying — do not leave the
// default in place.
const SETUP_SECRET = 'change-me-before-deploying';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TEST_PASSWORD = 'TestPass123!';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { secret } = await req.json().catch(() => ({}));
    if (secret !== SETUP_SECRET) return json({ error: 'Invalid setup secret' }, 401);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const results: Record<string, unknown> = {};

    // ── School ──────────────────────────────────────────────
    const { data: schoolApp, error: schoolAppErr } = await adminClient
      .from('apps').insert({ app_type: 'school', org_name: 'Test School' }).select().single();
    if (schoolAppErr) return json({ error: `School app: ${schoolAppErr.message}` }, 500);

    const { data: schoolAuth, error: schoolAuthErr } = await adminClient.auth.admin.createUser({
      email: 'test.principal@mpowerind.in', password: TEST_PASSWORD, email_confirm: true,
    });
    if (schoolAuthErr) return json({ error: `School auth: ${schoolAuthErr.message}` }, 500);

    const { error: schoolUserErr } = await adminClient.from('users').insert({
      auth_id: schoolAuth.user.id, app_id: schoolApp.id, role: 'principal', full_name: 'Test Principal',
    });
    if (schoolUserErr) return json({ error: `School user: ${schoolUserErr.message}` }, 500);

    results.school = { email: 'test.principal@mpowerind.in', password: TEST_PASSWORD, role: 'principal', appId: schoolApp.id };

    // ── Hospital ────────────────────────────────────────────
    const { data: hospApp, error: hospAppErr } = await adminClient
      .from('apps').insert({ app_type: 'hospital', org_name: 'Test Hospital' }).select().single();
    if (hospAppErr) return json({ error: `Hospital app: ${hospAppErr.message}` }, 500);

    const { data: hospAuth, error: hospAuthErr } = await adminClient.auth.admin.createUser({
      email: 'test.doctor@mpowerind.in', password: TEST_PASSWORD, email_confirm: true,
    });
    if (hospAuthErr) return json({ error: `Hospital auth: ${hospAuthErr.message}` }, 500);

    const { error: hospUserErr } = await adminClient.from('users').insert({
      auth_id: hospAuth.user.id, app_id: hospApp.id, role: 'doctor', full_name: 'Test Doctor',
    });
    if (hospUserErr) return json({ error: `Hospital user: ${hospUserErr.message}` }, 500);

    results.hospital = { email: 'test.doctor@mpowerind.in', password: TEST_PASSWORD, role: 'doctor', appId: hospApp.id };

    // ── CTS staff ───────────────────────────────────────────
    // Uses whichever CTS/grievance app already exists, rather than
    // creating a new one — CTS geography (constituencies, mandals)
    // is real, seeded data tied to a specific state, not something
    // to duplicate for a test run.
    const { data: ctsApp } = await adminClient
      .from('apps').select('id, org_name').in('app_type', ['grievance', 'government']).limit(1).maybeSingle();

    if (ctsApp) {
      const { data: ctsAuth, error: ctsAuthErr } = await adminClient.auth.admin.createUser({
        email: 'test.staff@mpowerind.in', password: TEST_PASSWORD, email_confirm: true,
      });
      if (ctsAuthErr) return json({ error: `CTS auth: ${ctsAuthErr.message}`, results }, 500);

      const { error: ctsUserErr } = await adminClient.from('users').insert({
        auth_id: ctsAuth.user.id, app_id: ctsApp.id, role: 'grievance_admin', full_name: 'Test CTS Admin',
      });
      if (ctsUserErr) return json({ error: `CTS user: ${ctsUserErr.message}`, results }, 500);

      results.cts = { email: 'test.staff@mpowerind.in', password: TEST_PASSWORD, role: 'grievance_admin', appId: ctsApp.id, usingExistingApp: ctsApp.org_name };
    } else {
      results.cts = { skipped: true, reason: 'No existing CTS/grievance app found to attach a staff account to.' };
    }

    // ── Control Panel (developer) ──────────────────────────
    // Control Panel access is governed by role alone
    // (RequireRole roles={['developer','support']}), not by which
    // tenant this row is attached to — attaching to the School app
    // just created, purely to satisfy the foreign key if app_id is
    // required, not because it's meaningful which one.
    const { data: devAuth, error: devAuthErr } = await adminClient.auth.admin.createUser({
      email: 'test.admin@mpowerind.in', password: TEST_PASSWORD, email_confirm: true,
    });
    if (devAuthErr) return json({ error: `Control Panel auth: ${devAuthErr.message}`, results }, 500);

    const { error: devUserErr } = await adminClient.from('users').insert({
      auth_id: devAuth.user.id, app_id: schoolApp.id, role: 'developer', full_name: 'Test Admin',
    });
    if (devUserErr) return json({ error: `Control Panel user: ${devUserErr.message}`, results }, 500);

    results.controlPanel = { email: 'test.admin@mpowerind.in', password: TEST_PASSWORD, role: 'developer', note: 'Full access to /control/* — clients, tickets, billing, security, everything.' };

    results.note = 'Citizens log in via phone OTP, not a password — this creates staff/admin accounts only. Delete this function now that you have your test accounts.';

    return json(results);
  } catch (err) {
    console.error(err);
    return json({ error: 'Unexpected error', detail: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}