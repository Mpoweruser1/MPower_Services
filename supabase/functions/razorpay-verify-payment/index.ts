// supabase/functions/razorpay-verify-payment/index.ts
//
// Verifies a Razorpay payment signature server-side. This is the step
// that actually proves a payment is genuine — Razorpay's checkout
// widget calling the success handler client-side only means the
// checkout FLOW completed, not that the payment is real or that the
// amount wasn't tampered with. Only this HMAC check, done here with
// the secret key the client never has access to, actually confirms it.
//
// Deploy: supabase functions deploy razorpay-verify-payment
// Secrets needed: RAZORPAY_KEY_SECRET (same one used by
// razorpay-create-order — no need to set it twice, Supabase secrets
// are shared project-wide)

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';

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
      purpose, clientId, invoiceId, modRequestId,
    } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: 'Missing Razorpay payment fields' }, 400);
    }

    // Razorpay's documented signature scheme:
    // HMAC_SHA256(order_id + "|" + payment_id, key_secret) must equal
    // razorpay_signature. This is the ONLY thing that actually proves
    // the payment is genuine and untampered — every other field in
    // this request is just the client repeating back values it
    // already saw in the browser.
    const expectedSignature = await hmacSha256Hex(
      `${razorpay_order_id}|${razorpay_payment_id}`,
      RAZORPAY_KEY_SECRET
    );

    const verified = timingSafeEqual(expectedSignature, razorpay_signature);

    if (!verified) {
      console.error('Razorpay signature mismatch', { razorpay_order_id, razorpay_payment_id, purpose, clientId, invoiceId, modRequestId });
      return json({ verified: false }, 400);
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

// Constant-time comparison — avoids leaking any timing signal about
// how much of the signature matched.
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