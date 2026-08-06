// grievance/useCitizenAuth.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchCitizenProfile, createCitizenProfile } from '../lib/grievanceApi';

export function useCitizenAuth(appId) {
  const [session, setSession] = useState(null);
  const [citizen, setCitizen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [otpSent, setOtpSent] = useState(false);
  const [pendingPhone, setPendingPhone] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setCitizen(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchCitizenProfile(session.user.id)
      .then(setCitizen)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session]);

  // TEMPORARY TEST BYPASS — added 1-8-2026, remove or re-verify before
  // any production use. Twilio's WhatsApp account is currently in
  // Sandbox mode (error 63015), which blocks OTP delivery to any real
  // citizen who hasn't manually joined the Sandbox — this exists only
  // to unblock local testing of everything else in CTS while that
  // Twilio/WhatsApp production-access decision is still pending.
  // Gated by TWO separate conditions, both required:
  //   1. import.meta.env.DEV — true only for `npm run dev`; Vite
  //      forces this false in any production build automatically, so
  //      this can never be active on a real deployed site by accident.
  //   2. VITE_SKIP_OTP=true — must be explicitly set in a local
  //      .env.local file (not committed to git), so it's off by
  //      default even in local dev unless deliberately turned on.
  const OTP_BYPASS_ACTIVE = import.meta.env.DEV && import.meta.env.VITE_SKIP_OTP === 'true';

  // Step 1: send OTP via custom WhatsApp edge function
  const requestOtp = useCallback(async (phone) => {
    setError(null);

    if (OTP_BYPASS_ACTIVE) {
      setPendingPhone(phone);
      setOtpSent(true);
      return true;
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ phone, purpose: 'citizen_login' }),
        }
      );
      const data = await res.json();
      if (!data?.sent) {
        setError(data?.error || 'Failed to send OTP. Please try again.');
        return false;
      }
      setPendingPhone(phone);
      setOtpSent(true);
      return true;
    } catch (err) {
      setError('Failed to send OTP. Please try again.');
      return false;
    }
  }, []);

  // Step 2: verify OTP via custom edge function, then create anonymous session
  const verifyOtp = useCallback(async (phone, token) => {
    setError(null);

    if (OTP_BYPASS_ACTIVE) {
      const { error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) {
        setError('Login failed. Please try again.');
        return false;
      }
      await supabase.auth.updateUser({ data: { phone, verified_phone: phone } });
      return true;
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ phone, otp: token, purpose: 'citizen_login' }),
        }
      );
      const data = await res.json();
      if (!data?.verified) {
        setError('Invalid or expired OTP. Please try again.');
        return false;
      }

      const { error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr) {
        setError('Login failed. Please try again.');
        return false;
      }

      await supabase.auth.updateUser({
        data: { phone, verified_phone: phone },
      });

      return true;
    } catch (err) {
      setError('Verification failed. Please try again.');
      return false;
    }
  }, []);
  // Step 3: create citizen profile on first login
  const registerProfile = useCallback(
    async (profile) => {
      if (!session) return null;
      const phone = pendingPhone || session.user?.user_metadata?.phone;
      const created = await createCitizenProfile({
        auth_id: session.user.id,
        app_id: appId,
        phone,
        ...profile,
      });
      setCitizen(created);
      return created;
    },
    [session, appId, pendingPhone]
  );

  // Lets the person go back to the phone-entry screen if they typed the
  // wrong number, or need to fully re-enter to trigger a resend — there
  // was previously no way back at all once the code screen showed.
  const resetOtp = useCallback(() => {
    setOtpSent(false);
    setPendingPhone(null);
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setCitizen(null);
    setSession(null);
    setPendingPhone(null);
  }, []);

  return {
    session,
    citizen,
    loading,
    otpSent,
    error,
    isAuthenticated: !!session,
    needsProfile: !!session && !citizen && !loading,
    otpBypassActive: OTP_BYPASS_ACTIVE,
    requestOtp,
    verifyOtp,
    resetOtp,
    registerProfile,
    signOut,
  };
}