// shared/useRazorpay.js — FINAL
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function useRazorpay() {
  const [paying, setPaying] = useState(false);
  const [error, setError]   = useState('');

  async function initiatePayment({
    amount, purpose, clientId, invoiceId, modRequestId,
    customerName, customerPhone, customerEmail,
    description, onSuccess, onFailure,
  }) {
    setError(''); setPaying(true);

    try {
      await loadRazorpayScript();

      const { data, error: fnErr } = await supabase.functions.invoke('razorpay-create-order', {
        body: { amount, purpose, clientId, invoiceId, modRequestId },
      });

      if (fnErr || !data?.orderId) {
        setError('Failed to initiate payment. Please try again.');
        setPaying(false);
        onFailure?.('order_creation_failed');
        return;
      }

      const options = {
        key:         data.keyId,
        amount:      data.amount,
        currency:    data.currency,
        name:        'MPower',
        description: description || `MPower ${purpose}`,
        order_id:    data.orderId,
        prefill:     { name: customerName || '', contact: customerPhone || '', email: customerEmail || '' },
        theme:       { color: '#E8A020' },
        modal: {
          ondismiss: () => { setPaying(false); onFailure?.('payment_dismissed'); },
        },
        handler: async (response) => {
          const { data: verifyData, error: verifyErr } = await supabase.functions.invoke('razorpay-verify-payment', {
            body: {
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              purpose, clientId, invoiceId, modRequestId,
            },
          });
          setPaying(false);
          if (verifyErr || !verifyData?.verified) {
            setError('Payment verification failed. Contact support with ID: ' + response.razorpay_payment_id);
            onFailure?.('verification_failed');
            return;
          }
          onSuccess?.(response.razorpay_payment_id);
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        setPaying(false);
        setError(`Payment failed: ${resp.error.description}`);
        onFailure?.(resp.error.code);
      });
      rzp.open();

    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
      setPaying(false);
      onFailure?.('unexpected_error');
    }
  }

  return { initiatePayment, paying, error };
}