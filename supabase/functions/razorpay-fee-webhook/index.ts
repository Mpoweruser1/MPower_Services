// supabase/functions/razorpay-fee-webhook/index.ts   — NEW (School Round 2, 17-10-2026)
//
// The safety net for online fee payments. Razorpay calls this URL itself when a
// payment is captured, so the fee is recorded even if the parent's phone loses
// signal, the UPI app never returns to the page, or the browser tab is closed
// before client-fee-verify runs.
//
// It does the same recording as client-fee-verify, through the same database
// function (record_online_fee_payment). Whichever of the two arrives first
// records the payment; the other finds it already recorded and does nothing.
//
// SECURITY
//   * Razorpay signs the raw request body with the webhook secret; anything with
//     a missing or wrong signature is refused.
//   * Only the order id, payment id and amount from the signed event are used.
//   * Events for orders that are not fee-payment links (your other Razorpay
//     products share the same account) are acknowledged and ignored.
//   * A recording failure answers 500, so Razorpay retries (for up to 24 hours).
//
// Deploy WITHOUT the Supabase login check, because Razorpay does not send one:
//   supabase functions deploy razorpay-fee-webhook --no-verify-jwt
// Secrets: RAZORPAY_WEBHOOK_SECRET (new — the secret you type into the Razorpay
//          webhook screen). SUPABASE_URL / SERVICE_ROLE_KEY are already provided.
// Razorpay dashboard: Webhooks -> add the function URL, tick "payment.captured".

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')!;

serve(async (req) => {
  try {
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    if (!WEBHOOK_SECRET) {
      console.error('RAZORPAY_WEBHOOK_SECRET is not set');
      return reply({ error: 'Not configured' }, 500);
    }

    // The signature is over the exact raw text, so read it as text first.
    const raw = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const expected = await hmacSha256Hex(raw, WEBHOOK_SECRET);
    if (!signature || !timingSafeEqual(expected, signature)) {
      console.error('Webhook signature mismatch');
      return reply({ error: 'Invalid signature' }, 400);
    }

    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return reply({ error: 'Bad JSON' }, 400);
    }

    // Only captured payments matter here.
    if (event?.event !== 'payment.captured') {
      return reply({ ok: true, ignored: 'event' });
    }
    const pay = event?.payload?.payment?.entity;
    const orderId: string = pay?.order_id || '';
    const paymentId: string = pay?.id || '';
    if (!orderId || !paymentId || pay?.currency !== 'INR' || pay?.status !== 'captured') {
      return reply({ ok: true, ignored: 'payment' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Is this one of OUR fee links? If not, it is another product's payment.
    const { data: link, error: linkErr } = await admin
      .from('fee_payment_links')
      .select('id')
      .eq('razorpay_order_id', orderId)
      .maybeSingle();
    if (linkErr) {
      console.error('Link lookup failed:', linkErr);
      return reply({ error: 'Lookup failed' }, 500);
    }
    if (!link) {
      return reply({ ok: true, ignored: 'not a fee link' });
    }

    const { data: rec, error: recErr } = await admin.rpc('record_online_fee_payment', {
      p_rzp_order: orderId,
      p_rzp_payment: paymentId,
      p_amount_paise: Number(pay.amount),
    });
    if (recErr || !rec?.ok) {
      console.error('record_online_fee_payment failed:', recErr, rec);
      return reply({ error: 'Recording failed' }, 500); // Razorpay will retry
    }

    if (Number(rec.unallocated) > 0) {
      console.error('REFUND NEEDED: payment partly unplaced', {
        paymentId, unallocated: rec.unallocated, app_id: rec.app_id, student_id: rec.student_id,
      });
    }

    if (!rec.duplicate && rec.receipt_no) {
      const dueIds = Array.isArray(rec.lines) ? rec.lines.map((l: any) => l.due_id) : [];
      fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({
          type: 'fee_payment_receipt',
          appId: rec.app_id,
          studentId: rec.student_id,
          dueIds,
          amount: rec.amount,
          paymentId,
          receiptNo: rec.receipt_no,
        }),
      }).catch((e) => console.error('WhatsApp receipt failed:', e));
    }

    return reply({ ok: true, duplicate: !!rec.duplicate });
  } catch (err) {
    console.error(err);
    return reply({ error: 'Unexpected error' }, 500);
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

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}