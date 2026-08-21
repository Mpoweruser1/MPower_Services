// supabase/functions/client-fee-payment/index.ts
//
// Creates a Razorpay Order for a parent paying a school fee via a
// WhatsApp payment link. Same amount convention as
// razorpay-create-order: callers pass plain rupees (PayFee.jsx passes
// payLink.amount directly, no ×100), converted to paise here.
//
// This is a PUBLICLY callable function — no login, matching PayFee.jsx
// being a public /pay/:token page for parents. linkToken is checked
// against a real, not-already-paid, not-expired fee_payment_links row
// before creating an order, so this can't be used to spin up arbitrary
// orders unrelated to a real link.
//
// Deploy: supabase functions deploy client-fee-payment
// Secrets: reuses RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET already set
// for razorpay-create-order — no need to set them again.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!;
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

    const { appId, dueIds, studentId, amount, purpose, linkToken } = await req.json();

    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      return json({ error: 'A valid, positive amount is required' }, 400);
    }
    if (!linkToken) {
      return json({ error: 'linkToken is required' }, 400);
    }

    // Confirm this is a real, still-payable link before creating an
    // order for it — this function has no auth, so it must not trust
    // the caller's own claim that a link is valid.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: payLink, error: linkErr } = await adminClient
      .from('fee_payment_links')
      .select('status, expires_at')
      .eq('link_token', linkToken)
      .maybeSingle();

    if (linkErr || !payLink) {
      return json({ error: 'Payment link not found' }, 404);
    }
    if (payLink.status === 'paid') {
      return json({ error: 'This fee has already been paid' }, 409);
    }
    if (payLink.expires_at && new Date(payLink.expires_at) < new Date()) {
      return json({ error: 'This payment link has expired' }, 410);
    }

    // The one and only place rupees become paise.
    const amountPaise = Math.round(amountNum * 100);
    const receipt = `school_fee_${(studentId || linkToken)}`.slice(0, 40);

    const authHeader = 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: {
          purpose: purpose || 'school_fee',
          appId: appId || '',
          studentId: studentId || '',
          dueIds: Array.isArray(dueIds) ? dueIds.join(',') : '',
          linkToken,
        },
      }),
    });

    const orderData = await orderRes.json();

    if (!orderRes.ok || !orderData?.id) {
      console.error('Razorpay order creation failed:', orderData);
      return json({ error: 'Failed to create payment order' }, 502);
    }

    return json({
      orderId: orderData.id,
      amount: orderData.amount, // paise
      currency: orderData.currency,
      keyId: RAZORPAY_KEY_ID,
    });
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