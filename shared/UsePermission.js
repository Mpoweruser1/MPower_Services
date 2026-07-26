// shared/usePermission.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

const OWNER_ROLES = ['principal', 'doctor'];

export function usePermission(moduleCode) {
  const { tenant } = useTenant();
  const [permission, setPermission] = useState({
    can_view: false,
    can_create: false,
    can_edit: false,
    can_delete: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!tenant) { setLoading(false); return; }

      if (OWNER_ROLES.includes(tenant.role)) {
        setPermission({ can_view: true, can_create: true, can_edit: true, can_delete: true });
        setLoading(false);
        return;
      }

      const { data: override } = await supabase
        .from('user_permission_overrides')
        .select('can_view, can_create, can_edit, can_delete')
        .eq('user_id', tenant.userRowId)
        .eq('module_code', moduleCode)
        .maybeSingle();

      if (override) {
        setPermission({
          can_view: override.can_view ?? false,
          can_create: override.can_create ?? false,
          can_edit: override.can_edit ?? false,
          can_delete: override.can_delete ?? false,
        });
        setLoading(false);
        return;
      }

      const { data: roleDefault } = await supabase
        .from('role_permissions')
        .select('can_view, can_create, can_edit, can_delete')
        .eq('app_id', tenant.appId)
        .eq('role', tenant.role)
        .eq('module_code', moduleCode)
        .maybeSingle();

      setPermission({
        can_view: roleDefault?.can_view ?? false,
        can_create: roleDefault?.can_create ?? false,
        can_edit: roleDefault?.can_edit ?? false,
        can_delete: roleDefault?.can_delete ?? false,
      });
      setLoading(false);
    }
    load();
  }, [tenant, moduleCode]);

  return { ...permission, loading };
}