// website/pages/PayFee.jsx — FINAL
// Public payment page — parent pays school fee from WhatsApp link
// URL: /pay/:token
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function PayFee() {
  const { token } = useParams();
  const [payLink, setPayLink]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [paying, setPaying]     = useState(false);
  const [paid, setPaid]         = useState(false);

  useEffect(() => {
    if (token) loadPayLink();
  }, [token]);

  async function loadPayLink() {
    setLoading(true);
    const { data: result, error: err } = await supabase.functions.invoke('get-fee-payment-link', {
      body: { linkToken: token },
    });

    if (err || result?.error || !result?.payLink) { setError(result?.error || 'Payment link not found or has expired.'); setLoading(false); return; }
    const data = result.payLink;
    if (data.status === 'paid') { setPaid(true); setLoading(false); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setError('This payment link has expired. Please contact the school.'); setLoading(false); return; }

    setPayLink(data);
    setLoading(false);
  }

  async function pay() {
    if (!payLink) return;
    setPaying(true);

    try {
      await loadRazorpay();

      const { data: orderData } = await supabase.functions.invoke('client-fee-payment', {
        body: {
          appId:     payLink.app_id,
          dueIds:    payLink.due_ids,
          studentId: payLink.student_id,
          amount:    payLink.amount,
          purpose:   'school_fee',
          linkToken: token,
        },
      });

      if (!orderData?.orderId) {
        setError('Payment gateway not available. Please contact the school.');
        setPaying(false);
        return;
      }

      const options = {
        key:         orderData.keyId,
        amount:      orderData.amount,
        currency:    orderData.currency,
        name:        'MPower School',
        description: `Fee payment — ${payLink.students?.full_name}`,
        order_id:    orderData.orderId,
        theme:       { color: '#E8A020' },
        handler: async (response) => {
          const { data: verifyData } = await supabase.functions.invoke('client-fee-verify', {
            body: {
              ...response,
              appId:     payLink.app_id,
              studentId: payLink.student_id,
              dueIds:    payLink.due_ids,
              amount:    payLink.amount,
              linkToken: token,
            },
          });

          if (verifyData?.verified) {
            // client-fee-verify already marked this link as paid,
            // server-side, right after confirming the signature was
            // genuine — no client-side update needed or wanted here.
            setPaid(true);
          } else {
            setError(`Payment received but verification pending. Payment ID: ${response.razorpay_payment_id}. Contact school.`);
          }
          setPaying(false);
        },
        modal: { ondismiss: () => setPaying(false) },
      };

      new window.Razorpay(options).open();
    } catch (err) {
      console.error(err);
      setError('Payment failed. Please try again or contact the school.');
      setPaying(false);
    }
  }

  const S = {
    page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '32px 28px', maxWidth: 420, width: '100%' },
  };

  if (loading) return (
    <div style={S.page}>
      <div style={S.card}>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading payment details...</p>
      </div>
    </div>
  );

  if (paid) return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={{ ...S.card, textAlign: 'center' }}>
        <p style={{ fontSize: 52, marginBottom: 16 }}>✅</p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#6AAA90', margin: '0 0 8px' }}>Payment successful!</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px', lineHeight: 1.7 }}>
          Thank you for paying the fee. A receipt has been sent to your WhatsApp.
        </p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>ఫీజు విజయవంతంగా చెల్లించబడింది · రశీదు WhatsApp కి పంపబడింది</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={{ ...S.card, textAlign: 'center' }}>
        <p style={{ fontSize: 36, marginBottom: 12 }}>⚠️</p>
        <p style={{ fontSize: 15, color: '#E05A5A', fontWeight: 500 }}>{error}</p>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+Telugu:wght@400;600&display=swap');`}</style>
      <div style={S.card}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 18 }}>M</div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>MPower School</p>
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Fee payment · ఫీజు చెల్లింపు</p>
          </div>
        </div>

        {/* Student info */}
        <div style={{ background: '#111113', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
          <p style={{ margin: '0 0 3px', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>STUDENT · విద్యార్థి</p>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>{payLink?.students?.full_name}</p>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            {payLink?.students?.sid}
            {payLink?.students?.section ? ` · Section ${payLink.students.section}` : ''}
          </p>
        </div>

        {/* Amount */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, margin: '0 0 8px' }}>AMOUNT DUE · చెల్లించవలసిన మొత్తం</p>
          <p style={{ fontSize: 40, fontWeight: 700, color: '#E8A020', margin: 0 }}>
            ₹{Number(payLink?.amount || 0).toLocaleString('en-IN')}
          </p>
        </div>

        {/* Security note */}
        <div style={{ background: 'rgba(106,170,144,0.06)', border: '1px solid rgba(106,170,144,0.15)', borderRadius: 8, padding: '8px 12px', marginBottom: 18, display: 'flex', gap: 8 }}>
          <span>🔒</span>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
            Secure payment via Razorpay · UPI, Cards, Net Banking accepted · Receipt via WhatsApp
          </p>
        </div>

        {/* Pay button */}
        <button onClick={pay} disabled={paying}
          style={{ width: '100%', padding: 15, background: paying ? 'rgba(255,255,255,0.08)' : '#E8A020', color: paying ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: paying ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {paying ? 'Opening payment...' : `Pay ₹${Number(payLink?.amount || 0).toLocaleString('en-IN')} →`}
        </button>

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
          Powered by MPower · mpowerind.in<br />
          మీ payment సురక్షితంగా Razorpay ద్వారా process అవుతుంది
        </p>
      </div>
    </div>
  );
}