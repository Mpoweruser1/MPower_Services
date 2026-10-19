// context/TenantContext.jsx — FINAL
// Key fix from other chat: authChecked flag prevents race condition
// on full page load/refresh that caused redirect to /login even
// when a valid session was about to arrive a moment later.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [session, setSession]           = useState(null);
  const [tenant, setTenant]             = useState(null);
  const [loading, setLoading]           = useState(true);
  const [authChecked, setAuthChecked]   = useState(false);
  // Bumped by refreshTenant() to reload the profile/business details after a
  // screen saves them (e.g. Business Details), without a full page reload.
  const [reloadTick, setReloadTick]     = useState(0);
  // authChecked: true only once getSession() has actually resolved.
  // Without this the tenant-loading effect fires once with null session
  // (before getSession resolves) and prematurely marks loading=false,
  // causing RequireAuth to redirect to /portal/login on every page
  // refresh even when the user IS logged in. Only showed up on full
  // page load (typing a URL directly, or refreshing) — client-side
  // navigation between screens never remounts TenantProvider so it
  // never hit the race before.

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthChecked(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authChecked) return; // wait for real check before deciding anything
    if (!session) {
      setTenant(null);
      setLoading(false);
      return;
    }
    // Anonymous sessions (signInAnonymously()) are always citizens in
    // this app — staff always sign in with a real email or phone-based
    // account, never anonymously. Without this check, every single
    // citizen login triggered a guaranteed-to-fail lookup here (a
    // citizen's auth_id never has a matching users row, by design),
    // harmlessly but needlessly — a wasted request and a 406 in the
    // console on every citizen page load.
    if (session.user.is_anonymous) {
      setTenant(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadTenant() {
      // A dropped connection used to look exactly like "no staff record" and
      // sent the person to the wrong page. Try up to 3 times, but only when
      // the failure is not the genuine "no such row" answer (PGRST116).
      let data = null;
      let error = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await supabase
          .from('users')
          .select('id, app_id, branch_id, role, full_name, phone, photo_url, alternate_phone')
          .eq('auth_id', session.user.id)
          .single();
        data = res.data;
        error = res.error;
        if (data || (error && error.code === 'PGRST116')) break;
        if (cancelled) return;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
      if (cancelled) return;

      if (error || !data) {
        setLoading(false);
        return;
      }

      // A school or hospital owner who has no branch yet (sign-up does not make
      // one; the setup wizard does, and it can be skipped) gets one made here, so
      // Business Details, printed headers and the school-year setting always have
      // somewhere to live. The database function does nothing for anyone else and
      // is safe to run more than once. A failure here must not stop the login.
      if (!data.branch_id && (data.role === 'principal' || data.role === 'doctor')) {
        const { data: newBranchId, error: branchErr } = await supabase.rpc('ensure_my_branch');
        if (branchErr) console.error('Creating the missing branch failed:', branchErr);
        else if (newBranchId) data = { ...data, branch_id: newBranchId };
        if (cancelled) return;
      }

      // Fetch app row separately — embedded join caused 406 for some
      // accounts due to RLS interaction between users and apps tables.
      // Same fix pattern confirmed working in school module.
      const { data: appRow } = await supabase
        .from('apps')
        .select('subscription_tier, app_type, org_name, school_type, board_type')
        .eq('id', data.app_id)
        .maybeSingle();

      // Resolve the matching crm_clients row for this app_id —
      // needed for support tickets, bug reports, modification requests.
      const { data: clientRow } = await supabase
        .from('crm_clients')
        .select('id, status, trial_ended_at')
        .eq('app_id', data.app_id)
        .maybeSingle();

      // Branch address/district/business details — for the org-identity
      // banner and invoice header shown across School/Hospital. Only
      // queried if a branch actually exists yet (a very fresh signup,
      // before FirstTimeSetup's branch-creation step runs, won't have
      // one). city/pincode existed on this table all along but were
      // never actually selected here until now; phone/gstin/pan/
      // registration_no are new columns for real invoice compliance.
      const { data: branchRow } = data.branch_id
        ? await supabase.from('branches').select('address, city, district, pincode, phone, gstin, pan, registration_no, academic_year_start_month, academic_year_start_day').eq('id', data.branch_id).maybeSingle()
        : { data: null };

      if (cancelled) return;

      setTenant({
        // IDs
        appId:         data.app_id,
        branchId:      data.branch_id,
        userRowId:     data.id,
        userId:        session.user.id,
        clientId:      clientRow?.id || null,
        // Profile
        role:          data.role,
        fullName:      data.full_name,
        phone:         data.phone,
        photoUrl:      data.photo_url || null,
        alternatePhone: data.alternate_phone || null,
        // App info
        orgName:       appRow?.org_name || '',
        appType:       appRow?.app_type || null,
        schoolType:    appRow?.school_type || null,
        boardType:     appRow?.board_type || 'state_board',
        tier:          appRow?.subscription_tier || 'basic',
        address:       branchRow?.address || null,
        city:          branchRow?.city || null,
        district:      branchRow?.district || null,
        pincode:       branchRow?.pincode || null,
        businessPhone: branchRow?.phone || null,
        gstin:         branchRow?.gstin || null,
        pan:           branchRow?.pan || null,
        registrationNo: branchRow?.registration_no || null,
        // School year start (default 1 June; set in Business Details)
        academicYearStartMonth: branchRow?.academic_year_start_month || 6,
        academicYearStartDay:   branchRow?.academic_year_start_day || 1,
        // Client status
        clientStatus:  clientRow?.status || 'trial',
        trialEndsAt:   clientRow?.trial_ended_at || null,
      });

      setLoading(false);
    }

    loadTenant();
    return () => { cancelled = true; };
  }, [session, authChecked, reloadTick]);

  function refreshTenant() { setReloadTick((n) => n + 1); }

  return (
    <TenantContext.Provider value={{ session, tenant, loading, refreshTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside TenantProvider');
  return ctx;
}