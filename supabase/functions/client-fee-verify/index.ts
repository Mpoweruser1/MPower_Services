// supabase/functions/client-fee-verify/index.ts
//
// Verifies the Razorpay signature (the only real proof a payment
// happened), then finalizes the actual fee_dues rows referenced by
// dueIds. PayFee.jsx's own client-side code, after getting
// verified:true back, only ever updates fee_payment_links.status —
// it never touches fee_dues at all. Without this function doing it,
// a fee paid via WhatsApp link would still show as unpaid everywhere
// else in the app (Fee Collection, defaulter reports). This function
// marks each due in dueIds as fully paid (amount_paid = amount_due),
// which is what a completed payment against exactly those dues means.
//
// Deploy: supabase functions deploy client-fee-verify
// Secrets: reuses RAZORPAY_KEY_SECRET already set — no need to set it
// again.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const {
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
      appId, studentId, dueIds, amount, linkToken,
    } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: 'Missing Razorpay payment fields' }, 400);
    }

    const expectedSignature = await hmacSha256Hex(
      `${razorpay_order_id}|${razorpay_payment_id}`,
      RAZORPAY_KEY_SECRET
    );

    const verified = timingSafeEqual(expectedSignature, razorpay_signature);

    if (!verified) {
      console.error('Razorpay signature mismatch', { razorpay_order_id, razorpay_payment_id, linkToken, studentId });
      return json({ verified: false }, 400);
    }

    // Signature confirmed genuine — now actually finalize the dues.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (Array.isArray(dueIds) && dueIds.length > 0) {
      // amount_due, amount_paid confirmed as real columns (see
      // ReportsSearchIdCards.jsx's fee_defaulters report, which
      // compares them directly). supabase-js has no "set column =
      // other column" expression through .update(), so this fetches
      // each due's amount_due first, then writes amount_paid to match
      // — dues bundled into a single payment link are expected to be
      // a handful, not hundreds, so one row at a time is fine here.
      const { data: dues } = await adminClient
        .from('fee_dues')
        .select('id, amount_due')
        .in('id', dueIds);

      for (const due of dues || []) {
        await adminClient
          .from('fee_dues')
          .update({ amount_paid: due.amount_due, status: 'paid' })
          .eq('id', due.id);
      }
    }

    // WhatsApp receipt — fire and forget, matching the pattern used
    // elsewhere in this codebase (a notification failure should never
    // block or fail a payment that already succeeded).
    fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        type: 'fee_payment_receipt',
        appId, studentId, dueIds, amount,
        paymentId: razorpay_payment_id,
      }),
    }).catch((e) => console.error('WhatsApp receipt failed:', e));

    // Mark the payment link itself as paid — done here, server-side,
    // ONLY after the signature above is confirmed genuine. Previously
    // this happened via a direct client-side update, protected only
    // by an RLS policy with USING (true) — completely unrestricted.
    // Anyone bypassing the UI (a direct API call with the public anon
    // key) could mark any fee as paid without ever paying. Doing it
    // here instead, via the service role, closes that off entirely —
    // the client no longer has (or needs) any path to flip this
    // status itself.
    if (linkToken) {
      await adminClient
        .from('fee_payment_links')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('link_token', linkToken);
    }

    return json({ verified: true, paymentId: razorpay_payment_id });
  } catch (err) {
    console.error(err);
    return json({ error: err.message || 'Unexpected error' }, 500);
  }
});

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}