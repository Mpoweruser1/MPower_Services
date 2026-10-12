// supabase/functions/staff-otp-login/index.ts   (NEW, 12-10-2026)
//
// Lets a CTS staff member whose login was approved BY PHONE ONLY (no email,
// so no password was ever set) sign in with a mobile OTP.
//
// It reuses the two working pieces and adds nothing new to trust:
//   1. The code is sent by the existing `send-otp` function (purpose
//      'staff_login') -- same SMS, same limits (3 per 10 min, 10 per day).
//   2. The code is checked by the existing `verify-otp` function (called from
//      here with the server key) -- same 5-tries-per-code lock, same expiry.
//   3. Only AFTER the code is verified does this function look up the staff
//      member by that phone number and hand back a ONE-TIME sign-in token
//      (Supabase "magic link" token, made without sending any email). The
//      browser exchanges it for a real session with
//      supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }).
//
// Who can use this (all must be true, otherwise a plain message is returned):
//   * the phone matches exactly ONE staff login with a grievance role
//     (representative, authority, grievance_admin, grievance_staff).
//     developer / support (MPower's own team) never sign in this way.
//   * that login is phone-only: it has no email, or its email is the hidden
//     one this function created on the first phone sign-in (flagged in
//     app_metadata.phone_login). A login that has a real email + password
//     must keep using email + password.
//
// First phone sign-in of an account adds a hidden email
// (staff-<id>@mpowerind.in, already confirmed) -- Supabase can only make a
// one-time token for an account that has an email. Nobody is ever emailed,
// it is never shown, and no password is created.
//
// Deploy: supabase functions deploy staff-otp-login
// Needs: send-otp and verify-otp deployed (they are), SUPABASE_URL,
//        SUPABASE_SERVICE_ROLE_KEY (available to every function).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const STAFF_ROLES = ['representative', 'authority', 'grievance_admin', 'grievance_staff'];
const PURPOSE = 'staff_login';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Last 10 digits, so "+91 98765 43210", "919876543210" and "9876543210" match.
function last10(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.slice(-10);
}

const NOT_STAFF = 'This mobile number is not set up for staff sign-in. Please sign in with your email and password, or contact your administrator.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const { phone, otp } = await req.json();
    if (typeof phone !== 'string' || typeof otp !== 'string' || !phone || !otp || phone.length > 20 || otp.length > 10) {
      return reply({ ok: false, error: 'Mobile number and code are required.' }, 400);
    }
    const ten = last10(phone);
    if (ten.length !== 10) return reply({ ok: false, error: 'Please enter a valid 10-digit mobile number.' }, 400);

    // 1. Check the code with the existing verify-otp (same lock + expiry rules).
    let vr: Response;
    try {
      vr = await fetch(`${SUPABASE_URL}/functions/v1/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ phone, otp, purpose: PURPOSE }),
      });
    } catch (err) {
      console.error('staff-otp-login: verify-otp unreachable', String(err));
      return reply({ ok: false, error: 'Could not check the code right now. Please try again.' }, 502);
    }
    const vbody = await vr.json().catch(() => ({}));
    if (!vr.ok || vbody?.verified !== true) {
      const status = [401, 404, 410, 429].includes(vr.status) ? vr.status : 400;
      return reply({ ok: false, error: vbody?.error || 'Incorrect or expired code.' }, status);
    }

    // 2. Find the staff login that owns this phone number.
    const { data: staffRows, error: staffErr } = await admin
      .from('users')
      .select('id, auth_id, role, phone')
      .in('role', STAFF_ROLES)
      .not('phone', 'is', null)
      .not('auth_id', 'is', null);
    if (staffErr) {
      console.error('staff-otp-login: staff lookup failed', staffErr.message);
      return reply({ ok: false, error: 'Could not sign you in right now. Please try again.' }, 500);
    }
    const matches = (staffRows || []).filter((r) => last10(r.phone) === ten);
    if (matches.length === 0) return reply({ ok: false, error: NOT_STAFF }, 403);
    if (matches.length > 1) {
      console.error('staff-otp-login: more than one staff login shares a phone', matches.length);
      return reply({ ok: false, error: 'More than one login uses this mobile number. Please sign in with your email and password.' }, 409);
    }
    const staff = matches[0];

    // 3. Phone-only accounts only.
    const { data: got, error: getErr } = await admin.auth.admin.getUserById(staff.auth_id);
    if (getErr || !got?.user) {
      console.error('staff-otp-login: auth user missing', getErr?.message);
      return reply({ ok: false, error: NOT_STAFF }, 403);
    }
    const authUser = got.user;
    const flagged = authUser.app_metadata?.phone_login === true;
    if (authUser.email && !flagged) {
      return reply({ ok: false, error: 'This login has an email and password. Please sign in with your email and password.' }, 403);
    }

    // 4. First phone sign-in: give the account its hidden email.
    let email = authUser.email as string | undefined;
    if (!email) {
      email = `staff-${authUser.id}@mpowerind.in`;
      const { error: updErr } = await admin.auth.admin.updateUserById(authUser.id, {
        email,
        email_confirm: true,
        app_metadata: { phone_login: true },
      });
      if (updErr) {
        console.error('staff-otp-login: could not prepare the account', updErr.message);
        return reply({ ok: false, error: 'Could not sign you in right now. Please try again.' }, 500);
      }
    }

    // 5. One-time token (no email is sent by generateLink).
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      console.error('staff-otp-login: could not make the sign-in token', linkErr?.message);
      return reply({ ok: false, error: 'Could not sign you in right now. Please try again.' }, 500);
    }

    return reply({ ok: true, tokenHash });
  } catch (err) {
    console.error('staff-otp-login: unexpected error', String(err));
    return reply({ ok: false, error: 'Internal error. Please try again.' }, 500);
  }
});