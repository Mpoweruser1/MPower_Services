// src/hooks/useCitizenAuth.js
//
// Citizen identity — phone OTP login/registration. Deliberately separate
// from TenantContext: citizens aren't in `users` (staff-only), so they
// need their own session -> profile resolution path.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchCitizenProfile, createCitizenProfile } from './grievanceApi';

export function useCitizenAuth(appId) {
  const [session, setSession] = useState(null);
  const [citizen, setCitizen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [otpSent, setOtpSent] = useState(false);
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

  // Step 1: request an OTP be sent to a phone number.
  const requestOtp = useCallback(async (phone) => {
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    if (otpError) {
      setError(otpError.message);
      return false;
    }
    setOtpSent(true);
    return true;
  }, []);

  // Step 2: verify the code the citizen received via SMS. On success,
  // Supabase Auth creates the session automatically (picked up by the
  // onAuthStateChange listener above).
  const verifyOtp = useCallback(async (phone, token) => {
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
    if (verifyError) {
      setError(verifyError.message);
      return false;
    }
    return true;
  }, []);

  // Step 3 (first login only): create the citizens row. Needed because
  // phone verification alone only proves phone ownership — it doesn't
  // capture name/address/constituency, which the citizen supplies once,
  // right after their first successful OTP verification.
  const registerProfile = useCallback(
    async (profile) => {
      if (!session) return null;
      const created = await createCitizenProfile({
        auth_id: session.user.id,
        app_id: appId,
        ...profile,
      });
      setCitizen(created);
      return created;
    },
    [session, appId]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setCitizen(null);
    setSession(null);
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
