// supabase/functions/razorpay-verify-payment/index.ts
//
// Verifies a Razorpay payment on the server.
//
// MODIFICATION REQUESTS (purpose = 'modification_request' or a modRequestId):
//   The payment is recorded here, by the server — never by the browser.
//   A payment is accepted only when ALL of these hold:
//     1. the caller is signed in and belongs to the organisation that owns
//        the request;
//     2. the Razorpay signature is genuine (skipped for 'reconcile', where
//        the truth is read straight from Razorpay instead);
//     3. Razorpay itself (asked with our secret key) says the order is paid,
//        the payment is captured, nothing is refunded, currency is INR;
//     4. the order is one this system created for THIS request;
//     5. the amount paid equals the saved quote to the paisa;
//     6. the request is still waiting for payment (quote_sent).
//   One Razorpay payment can be recorded only once (database-enforced).
//   Money that arrives but cannot be matched safely is NOT marked paid; it
//   is written to payment_issues for the team.
//
//   reconcile: { modRequestId, reconcile: true } — used when a customer paid
//   but closed the page before it finished. Looks up our recorded orders for
//   that request, asks Razorpay whether one was paid, and records it.
//
// OTHER PURPOSES: unchanged (signature check only).
//
// Deploy: supabase functions deploy razorpay-verify-payment
// Secrets needed: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!;
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
      purpose, clientId, invoiceId, modRequestId, reconcile,
    } = await req.json();

    const isModPayment = purpose === 'modification_request' || !!modRequestId;

    // ── Everything except modification requests: unchanged ───────────
    if (!isModPayment) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return json({ error: 'Missing Razorpay payment fields' }, 400);
      }
      const expectedSignature = await hmacSha256Hex(
        `${razorpay_order_id}|${razorpay_payment_id}`, RAZORPAY_KEY_SECRET
      );
      if (!timingSafeEqual(expectedSignature, razorpay_signature)) {
        console.error('Razorpay signature mismatch', { razorpay_order_id, razorpay_payment_id, purpose, clientId, invoiceId });
        return json({ verified: false }, 400);
      }
      return json({ verified: true, paymentId: razorpay_payment_id });
    }

    // ── Modification request: strict path ────────────────────────────
    if (purpose !== 'modification_request' || !modRequestId) {
      return json({ error: 'A modification payment needs purpose and modRequestId together' }, 400);
    }

    const caller = await getCaller(req);
    if (!caller) return json({ error: 'Please sign in again.' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: request } = await admin
      .from('modification_requests')
      .select('id, client_id, status, quote_amount, paid_at, payment_id')
      .eq('id', modRequestId).maybeSingle();
    if (!request) return json({ verified: false, error: 'Request not found' }, 404);

    const { data: client } = await admin
      .from('crm_clients').select('id, app_id').eq('id', request.client_id).maybeSingle();
    if (!client?.app_id || !caller.app_id || client.app_id !== caller.app_id) {
      return json({ verified: false, error: 'You cannot verify payment for this request' }, 403);
    }

    // Already recorded? Then there is nothing to do.
    if (request.payment_id && (!reconcile ? request.payment_id === razorpay_payment_id : true)) {
      return json({ verified: true, paymentId: request.payment_id, alreadyRecorded: true });
    }

    if (reconcile) {
      // Find an order of ours for this request that Razorpay says is paid.
      const { data: orders } = await admin
        .from('modification_payment_orders')
        .select('order_id').eq('request_id', request.id).limit(10);
      for (const o of orders || []) {
        const rzOrder = await rzGet(`/orders/${o.order_id}`);
        if (rzOrder?.status !== 'paid') continue;
        const pays = await rzGet(`/orders/${o.order_id}/payments`);
        const captured = (pays?.items || []).find((p: any) => p.status === 'captured');
        if (!captured) continue;
        return await finalize(admin, request, o.order_id, captured.id);
      }
      return json({ verified: false, pending: true });
    }

    // Normal path: browser reports a finished payment.
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: 'Missing Razorpay payment fields' }, 400);
    }
    const expectedSignature = await hmacSha256Hex(
      `${razorpay_order_id}|${razorpay_payment_id}`, RAZORPAY_KEY_SECRET
    );
    if (!timingSafeEqual(expectedSignature, razorpay_signature)) {
      console.error('Razorpay signature mismatch', { razorpay_order_id, razorpay_payment_id, modRequestId });
      return json({ verified: false }, 400);
    }
    return await finalize(admin, request, razorpay_order_id, razorpay_payment_id);
  } catch (err) {
    console.error(err);
    return json({ error: err.message || 'Unexpected error' }, 500);
  }
});

// The server-side truth check + the one and only place a payment is recorded.
async function finalize(admin: any, request: any, orderId: string, paymentId: string) {
  const issue = async (reason: string, detail: Record<string, unknown> = {}) => {
    console.error('PAYMENT ISSUE', reason, { requestId: request.id, orderId, paymentId, ...detail });
    await admin.from('payment_issues').insert({
      request_id: request.id, razorpay_order_id: orderId, razorpay_payment_id: paymentId,
      reason, detail,
    });
  };

  // 4. Must be an order we created for THIS request.
  const { data: ourOrder } = await admin
    .from('modification_payment_orders')
    .select('order_id, request_id, amount_paise').eq('order_id', orderId).maybeSingle();
  if (!ourOrder || ourOrder.request_id !== request.id) {
    await issue('order_not_for_this_request');
    return json({ verified: false, error: 'This payment does not belong to this request. Contact support with payment ID: ' + paymentId }, 400);
  }

  // 3. Ask Razorpay directly (with our secret key) what really happened.
  const rzOrder = await rzGet(`/orders/${orderId}`);
  const rzPay = await rzGet(`/payments/${paymentId}`);
  if (!rzOrder?.id || !rzPay?.id) {
    return json({ verified: false, error: 'Could not confirm the payment with Razorpay. If money was deducted it will be reconciled; contact support with payment ID: ' + paymentId }, 502);
  }

  const expectedPaise = Math.round(Number(request.quote_amount) * 100);

  const problems: string[] = [];
  if (rzPay.order_id !== orderId) problems.push('payment_not_for_order');
  if (rzOrder.status !== 'paid') problems.push('order_not_paid');
  if (rzPay.status !== 'captured') problems.push('payment_not_captured');
  if (Number(rzPay.amount_refunded || 0) > 0) problems.push('payment_refunded');
  if (rzOrder.currency !== 'INR' || rzPay.currency !== 'INR') problems.push('wrong_currency');
  // 5. Amount must equal the quote, and the order we created for it.
  if (!expectedPaise || expectedPaise <= 0) problems.push('no_valid_quote');
  if (Number(rzPay.amount) !== expectedPaise) problems.push('amount_differs_from_quote');
  if (Number(rzOrder.amount) !== expectedPaise) problems.push('order_amount_differs_from_quote');
  if (Number(rzOrder.amount_paid) !== expectedPaise) problems.push('amount_paid_differs_from_quote');
  if (Number(ourOrder.amount_paise) !== expectedPaise) problems.push('quote_changed_after_order');

  if (problems.length > 0) {
    await issue(problems.join(','), {
      quoteRupees: request.quote_amount, orderAmount: rzOrder.amount, paymentAmount: rzPay.amount,
      orderStatus: rzOrder.status, paymentStatus: rzPay.status,
    });
    // Not a failure of the customer's money — a mismatch we must look at.
    return json({ verified: false, error: 'The payment could not be matched to this quote. Do not pay again. Contact support with payment ID: ' + paymentId }, 400);
  }

  // 6 + record. Conditional update: only if still waiting for payment and unpaid.
  const { data: updated, error: updErr } = await admin
    .from('modification_requests')
    .update({
      status: 'in_development',
      paid_at: new Date().toISOString(),
      payment_id: paymentId,
      paid_amount: Number(request.quote_amount),
      started_at: new Date().toISOString(),
    })
    .eq('id', request.id)
    .eq('status', 'quote_sent')
    .is('payment_id', null)
    .select('id');

  if (updErr) {
    // e.g. this payment id is already recorded against another request.
    await issue('record_failed', { message: updErr.message });
    return json({ verified: false, error: 'Payment received but could not be recorded. Contact support with payment ID: ' + paymentId }, 500);
  }

  if (!updated || updated.length === 0) {
    // Someone/something got there first. If it is this same payment, fine.
    const { data: now } = await admin
      .from('modification_requests').select('payment_id, status').eq('id', request.id).maybeSingle();
    if (now?.payment_id === paymentId) {
      return json({ verified: true, paymentId, alreadyRecorded: true });
    }
    // A second, different payment for an already-paid request: money taken twice.
    await issue('duplicate_or_late_payment', { currentStatus: now?.status, recordedPayment: now?.payment_id });
    return json({ verified: false, error: 'This request was already paid. Your extra payment will be refunded; contact support with payment ID: ' + paymentId }, 409);
  }

  return json({ verified: true, paymentId });
}

// Read from Razorpay with our secret key.
async function rzGet(path: string) {
  try {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      headers: { Authorization: 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`) },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Who is calling? Uses the caller's own session token, verified by Supabase.
async function getCaller(req: Request): Promise<{ id: string; app_id: string | null; role: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user || user.is_anonymous) return null;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: row } = await admin
    .from('users').select('id, app_id, role').eq('auth_id', user.id).maybeSingle();
  if (!row) return null;
  return row;
}

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
