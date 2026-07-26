// context/TenantContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [session, setSession] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  // Tracks whether the initial session check has actually completed —
  // without this, the tenant-loading effect below fires once with the
  // still-null initial `session` state (before getSession() has resolved)
  // and prematurely marks loading as false, causing RequireAuth to
  // redirect to /portal/login even when a valid session is about to
  // arrive a moment later. This only showed up on a full page load
  // (typing a URL directly, or refreshing) — client-side navigation
  // between screens never remounts this provider, so it never hit the
  // race before.
  const [authChecked, setAuthChecked] = useState(false);

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
    if (!authChecked) return; // wait for the real check before deciding anything
    if (!session) {
      setLoading(false);
      return;
    }
    async function loadTenant() {
      const { data, error } = await supabase
        .from('users')
        .select('id, app_id, branch_id, role, full_name, apps(subscription_tier)')
        .eq('auth_id', session.user.id)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      const { data: clientRow } = await supabase
        .from('crm_clients')
        .select('id')
        .eq('app_id', data.app_id)
        .maybeSingle();

      setTenant({
        appId: data.app_id,
        branchId: data.branch_id,
        role: data.role,
        fullName: data.full_name,
        tier: data.apps?.subscription_tier || 'basic',
        userId: session.user.id,
        userRowId: data.id,
        clientId: clientRow?.id || null,
      });
      setLoading(false);
    }
    loadTenant();
  }, [session, authChecked]);

  return (
    <TenantContext.Provider value={{ session, tenant, loading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
