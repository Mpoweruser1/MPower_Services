// shared/useLoadData.js
import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';

export function useLoadData(fetchFn, deps = []) {
  const { tenant } = useTenant();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!tenant?.appId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn(tenant);
      setData(result);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenant?.appId, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function handleFocus() { load(); }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [load]);

  return { data, loading, error, reload: load };
}

export function withBranchFilter(query, tenant) {
  if (tenant?.branchId) {
    return query.eq('branch_id', tenant.branchId);
  }
  return query;
}