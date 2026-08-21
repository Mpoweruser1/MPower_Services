// supabase/functions/razorpay-create-order/index.ts
//
// Creates a Razorpay Order server-side — the client never talks to
// Razorpay's Orders API directly, and never decides the amount that
// actually gets charged; this function is the sole source of truth
// for that.
//
// Amount convention: callers pass plain rupees, matching PayFee.jsx's
// client-fee-payment function elsewhere in this codebase. Conversion
// to paise happens here, and only here — no caller should ever
// pre-multiply by 100.
//
// Deploy: supabase functions deploy razorpay-create-order
// Secrets needed (set once):
//   supabase secrets set RAZORPAY_KEY_ID=xxx RAZORPAY_KEY_SECRET=xxx

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';

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

    const { amount, purpose, clientId, invoiceId, modRequestId } = await req.json();

    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      return json({ error: 'A valid, positive amount is required' }, 400);
    }
    if (!purpose) {
      return json({ error: 'purpose is required' }, 400);
    }

    // The one and only place rupees become paise.
    const amountPaise = Math.round(amountNum * 100);

    // Razorpay caps receipt at 40 chars.
    const receipt = `${purpose}_${modRequestId || invoiceId || clientId || 'na'}`.slice(0, 40);

    const authHeader = 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: {
          purpose,
          clientId: clientId || '',
          invoiceId: invoiceId || '',
          modRequestId: modRequestId || '',
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
      amount: orderData.amount, // paise — this is what Razorpay's checkout widget expects directly
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