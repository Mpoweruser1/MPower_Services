// supabase/functions/notify-registration/index.ts
//
// Sends a real notification email to MPower's team via Google Workspace
// SMTP whenever someone submits a new office registration request —
// previously there was NO notification at all; staff had to manually
// check the Verification Queue to know a new request existed.
//
// Called from RequestStaffAccess.jsx right after the successful insert
// into staff_access_requests. Deliberately fire-and-forget from the
// caller's side (like send-whatsapp elsewhere in this project) — a
// failed notification should never block or fail the citizen's actual
// registration, which has already succeeded by the time this runs.
//
// Uses denomailer (a Deno-native SMTP client) with Gmail/Google
// Workspace's SMTP server directly — no third-party email service
// needed, since the user already owns Google Workspace for
// mpowerind.in.
//
// Deploy: supabase functions deploy notify-registration
// Secrets needed (set these BEFORE deploying, via the Supabase CLI —
// never commit these to git, never put them directly in code):
//   supabase secrets set GMAIL_SENDER=surya@mpowerind.in
//   supabase secrets set GMAIL_APP_PASSWORD=<the 16-character app password>
//   supabase secrets set NOTIFY_EMAIL_TO=surya@mpowerind.in

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { officeName, constituencyName, roleRequested, contactPerson, phone, email, stateSlug } = await req.json();

    const sender = Deno.env.get('GMAIL_SENDER')!;
    const appPassword = Deno.env.get('GMAIL_APP_PASSWORD')!;
    const notifyTo = Deno.env.get('NOTIFY_EMAIL_TO')!;

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: sender, password: appPassword },
      },
    });

    await client.send({
      from: sender,
      to: notifyTo,
      subject: `New office registration: ${officeName}`,
      content: 'text/plain',
      html: `
        <h3>New MLA/MP/MLC office registration submitted</h3>
        <p><strong>Office:</strong> ${officeName}</p>
        <p><strong>Role:</strong> ${roleRequested}</p>
        <p><strong>Constituency:</strong> ${constituencyName}</p>
        <p><strong>Contact person:</strong> ${contactPerson}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Email:</strong> ${email || '(not provided)'}</p>
        <p><strong>State:</strong> ${stateSlug}</p>
        <p style="margin-top:20px;">
          <a href="https://mpowerind.in/grievance/${stateSlug}/admin">Open Verification Queue →</a>
        </p>
      `,
    });

    await client.close();

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Never let a notification failure surface as an error to the
    // citizen/office submitting the form — their registration already
    // succeeded by the time this runs. Logged server-side for MPower
    // to notice via Supabase's own function logs if delivery is
    // silently failing.
    console.error('notify-registration failed:', err);
    return new Response(JSON.stringify({ sent: false, error: String(err) }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});