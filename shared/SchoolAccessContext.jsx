// shared/SchoolAccessContext.jsx — NEW (School Round 1, 16-10-2026)
//
// Loads the signed-in person's School permissions ONCE (two small queries)
// and shares them with the menu and the route guard. Without this, the menu
// and every guarded screen would each ask the database separately on every
// page change.
//
// Owners (principal / doctor, plus developer / support) skip the queries.
// If the permission lookup itself fails, access is refused (fails closed)
// and `loadError` lets the screen offer a retry — a network hiccup never
// opens a screen to someone who should not see it.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { buildAccess, OWNER_ROLES } from './schoolAccess';

const SchoolAccessContext = createContext(null);

const COLS = 'module_code, can_view, can_create, can_edit, can_delete';

export function SchoolAccessProvider({ children }) {
  const { tenant } = useTenant();
  const role = tenant?.role || null;
  const appId = tenant?.appId || null;
  const userRowId = tenant?.userRowId || null;

  const [rows, setRows] = useState({ role: [], override: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!role || !appId) { setLoading(false); return; }
      if (OWNER_ROLES.includes(role)) {
        setRows({ role: [], override: [] });
        setLoadError(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(false);
      const [roleRes, overrideRes] = await Promise.all([
        supabase.from('role_permissions').select(COLS).eq('app_id', appId).eq('role', role),
        supabase.from('user_permission_overrides').select(COLS).eq('user_id', userRowId),
      ]);
      if (cancelled) return;

      if (roleRes.error || overrideRes.error) {
        setRows({ role: [], override: [] });
        setLoadError(true);
      } else {
        setRows({ role: roleRes.data || [], override: overrideRes.data || [] });
      }
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [role, appId, userRowId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(() => {
    const { isOwner, can } = buildAccess(role, rows.role, rows.override);
    return { isOwner, can, loading, loadError, retry };
  }, [role, rows, loading, loadError, retry]);

  return <SchoolAccessContext.Provider value={value}>{children}</SchoolAccessContext.Provider>;
}

/** Returns null outside the provider (e.g. a screen rendered on its own). */
export function useSchoolAccess() {
  return useContext(SchoolAccessContext);
}
