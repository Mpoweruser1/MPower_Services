// grievance/useCitizenAuth.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchCitizenProfile, createCitizenProfile } from './grievanceApi';

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

  // Step 1: send OTP via custom WhatsApp edge function
  const requestOtp = useCallback(async (phone) => {
    setError(null);
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
    requestOtp,
    verifyOtp,
    registerProfile,
    signOut,
  };
}