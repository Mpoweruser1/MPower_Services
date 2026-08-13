// controlpanel/ManageAccess.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import ControlPanelNav from '../shared/ControlPanelNav';
import NextActions from '../shared/NextActions';
import { ScreenVideoButton } from '../shared/HelpWidget';
import BugReporter from '../shared/BugReporter';

const ROLES_BY_APP_TYPE = {
  school: ['teacher', 'clerk', 'warden'],
  hospital: ['nurse', 'receptionist', 'pharmacist'],
  grievance: ['staff'],
};

export default function ManageAccess() {
  const { tenant } = useTenant();
  const isDevOrSupport = ['developer', 'support'].includes(tenant?.role);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loadingClients, setLoadingClients] = useState(false);
  const [appType, setAppType] = useState(null);
  const [modules, setModules] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Developer/support has no "own" org to manage — they need to pick
  // which client's access they're configuring first. Principal/doctor
  // skip this entirely and go straight to their own org, exactly as
  // before.
  useEffect(() => {
    async function loadClients() {
      if (!isDevOrSupport) return;
      setLoadingClients(true);
      const { data } = await supabase
        .from('crm_clients')
        .select('id, org_name, district, apps(id, app_type)')
        .order('org_name');
      setClients(data || []);
      setLoadingClients(false);
    }
    loadClients();
  }, [isDevOrSupport]);

  const effectiveAppId = isDevOrSupport ? selectedClient?.apps?.id : tenant?.appId;

  useEffect(() => {
    async function init() {
      if (isDevOrSupport && !selectedClient) { setLoading(false); return; }
      if (!effectiveAppId) { setLoading(false); return; }
      const { data: appRow } = await supabase.from('apps').select('app_type').eq('id', effectiveAppId).single();
      setAppType(appRow?.app_type);

      const { data: moduleRows } = await supabase
        .from('permission_modules').select('module_code, module_label').eq('app_type', appRow?.app_type);
      setModules(moduleRows || []);

      const defaultRole = ROLES_BY_APP_TYPE[appRow?.app_type]?.[0] || '';
      setSelectedRole(defaultRole);
      setLoading(false);
    }
    init();
  }, [effectiveAppId, selectedClient, isDevOrSupport]);

  useEffect(() => {
    async function loadPermissions() {
      if (!selectedRole || !effectiveAppId) return;
      const { data } = await supabase
        .from('role_permissions').select('module_code, can_view, can_create, can_edit, can_delete')
        .eq('app_id', effectiveAppId).eq('role', selectedRole);
      const map = {};
      (data || []).forEach((row) => { map[row.module_code] = row; });
      setPermissions(map);
    }
    loadPermissions();
  }, [selectedRole, effectiveAppId]);

  function togglePermission(moduleCode, action) {
    setSaved(false);
    setPermissions((prev) => ({
      ...prev,
      [moduleCode]: { ...prev[moduleCode], module_code: moduleCode, [action]: !prev[moduleCode]?.[action] },
    }));
  }

  async function saveAll() {
    setSaving(true);
    const rows = Object.values(permissions).map((p) => ({
      app_id: effectiveAppId,
      role: selectedRole,
      module_code: p.module_code,
      can_view: p.can_view || false,
      can_create: p.can_create || false,
      can_edit: p.can_edit || false,
      can_delete: p.can_delete || false,
      updated_by: tenant.userRowId,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('role_permissions').upsert(rows, { onConflict: 'app_id,role,module_code' });
    setSaving(false);
    if (error) { console.error(error); alert('Failed to save permissions.'); return; }
    setSaved(true);
  }

  if (isDevOrSupport && loadingClients) return <div style={{ padding: 16, fontSize: 13, color: '#888' }}>Loading clients...</div>;

  if (isDevOrSupport && !selectedClient) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', fontFamily: 'sans-serif', padding: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>Manage Access</h2>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Select which client's access you're configuring.</p>
        {clients.length === 0 ? (
          <p style={{ fontSize: 13, color: '#aaa' }}>No clients found.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {clients.filter((c) => c.apps?.id).map((c) => (
              <button key={c.id} onClick={() => setSelectedClient(c)}
                style={{ textAlign: 'left', padding: '12px 14px', border: '1px solid #eee', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{c.org_name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>{c.apps?.app_type} {c.district ? `· ${c.district}` : ''}</p>
              </button>
            ))}
          </div>
        )}
        <ControlPanelNav />
        <BugReporter screenName="manage_access" />
      </div>
    );
  }

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: '#888' }}>Loading...</div>;

  const availableRoles = ROLES_BY_APP_TYPE[appType] || [];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', fontFamily: 'sans-serif', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Manage Access</h2>
        <ScreenVideoButton screenCode="manage_access" />
      </div>
      {isDevOrSupport && selectedClient && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F4F1E8', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Configuring: {selectedClient.org_name}</span>
          <button onClick={() => setSelectedClient(null)} style={{ fontSize: 12, color: '#185FA5', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            Switch client
          </button>
        </div>
      )}
      <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
        Control what each role can see and do. Owner role (principal/doctor) always has full access.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Select role to configure</label>
        <select value={selectedRole} onChange={(e) => { setSelectedRole(e.target.value); setSaved(false); }} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}>
          {availableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {modules.length === 0 ? (
        <p style={{ fontSize: 13, color: '#aaa' }}>No modules configured for this app type.</p>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 12px', background: '#f7f7f7', fontSize: 12, fontWeight: 600, color: '#666' }}>
            <span>Module</span><span>View</span><span>Create</span><span>Edit</span><span>Delete</span>
          </div>
          {modules.map((m) => {
            const p = permissions[m.module_code] || {};
            return (
              <div key={m.module_code} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 12px', borderTop: '1px solid #eee', alignItems: 'center', fontSize: 13 }}>
                <span>{m.module_label}</span>
                {['can_view', 'can_create', 'can_edit', 'can_delete'].map((action) => (
                  <input key={action} type="checkbox" checked={!!p[action]} onChange={() => togglePermission(m.module_code, action)} style={{ cursor: 'pointer' }} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {!saved ? (
        <button onClick={saveAll} disabled={saving || modules.length === 0} style={{ width: '100%', padding: 12, background: saving ? '#ccc' : '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving...' : `Save permissions for ${selectedRole}`}
        </button>
      ) : (
        <>
          <div style={{ background: '#E1F5EE', borderRadius: 8, padding: 12, textAlign: 'center', marginBottom: 4 }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#085041' }}>✓ Permissions saved for {selectedRole}</p>
          </div>
          <NextActions
            title="Access configured — what next?"
            actions={[
              { icon: '🔒', label: 'Configure another role', description: 'Set permissions for a different role', onClick: () => setSaved(false), color: '#185FA5' },
            ]}
            secondaryActions={[
              { icon: '🏢', label: 'Clients', href: '/control/clients' },
              { icon: '🏠', label: 'Dashboard', href: '/portal/dashboard' },
            ]}
          />
        </>
      )}

      <ControlPanelNav />
      <BugReporter screenName="manage_access" />
    </div>
  );
}