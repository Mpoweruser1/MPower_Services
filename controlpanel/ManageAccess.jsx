// controlpanel/ManageAccess.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import ControlPanelNav from '../shared/ControlPanelNav';
import NextActions from '../shared/NextActions';
import { ScreenVideoButton } from '../shared/HelpWidget';
import BugReporter from '../shared/BugReporter';

// Verified against real role strings actually checked elsewhere
// (TopNav.jsx's ROLE_TO_MODULE, StaffDashboard.jsx's role branches).
// 'clerk' and 'staff' here previously didn't match any role a real
// user could actually hold (fee_clerk / grievance_staff etc.), so
// permissions configured under those names would never have applied
// to anyone. grievance_admin excluded — owner role, always full
// access, same convention as principal/doctor not needing configurable
// permissions. 'warden' left as-is: no evidence for or against it
// existing as a real assignable role anywhere reviewed so far.
const ROLES_BY_APP_TYPE = {
  school: ['teacher', 'fee_clerk', 'warden'],
  // Matches the roles the hospital staff screen can actually invite
  // (ManageHospitalStaff.jsx). 'pharmacist' removed: it could not be
  // invited and there is no pharmacy module.
  hospital: ['nurse', 'receptionist', 'lab_technician', 'billing_clerk'],
  grievance: ['grievance_staff', 'representative', 'authority'],
};

const ROLE_LABELS = {
  teacher: 'Teacher',
  fee_clerk: 'Fee Clerk',
  warden: 'Warden',
  nurse: 'Nurse',
  receptionist: 'Receptionist',
  lab_technician: 'Lab Technician',
  billing_clerk: 'Billing Clerk',
  grievance_staff: 'Grievance Staff',
  representative: 'Representative',
  authority: 'Authority',
};
const roleLabel = (r) => ROLE_LABELS[r] || r;

// Modules shown by default for each role (module_code values from the
// permission_modules table). A role with no entry here — e.g. the
// grievance roles — simply shows every module, as before. "Show all
// modules" always brings the full list back.
const DEFAULT_MODULES = {
  school: {
    teacher:   ['attendance', 'marks_entry', 'homework', 'timetable', 'ptm'],
    fee_clerk: ['fee_collection', 'admission', 'certificates'],
    warden:    ['hostel', 'attendance'],
  },
  hospital: {
    nurse:          ['patient_registration', 'opd_visit', 'ipd_management', 'appointments'],
    receptionist:   ['patient_registration', 'appointments', 'billing'],
    lab_technician: ['lab_reports'],
    billing_clerk:  ['billing'],
  },
};

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  muted: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  select: { width: '100%', padding: '10px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 14, fontFamily: 'inherit' },
};

export default function ManageAccess() {
  const { tenant, loading: tenantLoading } = useTenant();
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
  const [showAll, setShowAll] = useState(false);
  // Modules the person actually ticked/unticked in this session — these
  // are always saved, even if "Show all modules" was switched off again.
  const [touched, setTouched] = useState({});

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
      setShowAll(false);
      setTouched({});
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
    setTouched((t) => ({ ...t, [moduleCode]: true }));
    setPermissions((prev) => ({
      ...prev,
      [moduleCode]: { ...prev[moduleCode], module_code: moduleCode, [action]: !prev[moduleCode]?.[action] },
    }));
  }

  // Which modules to list for the chosen role. Falls back to the full
  // list when there is no default list for the role, or when none of
  // its default modules exist for this client (never show a blank table).
  const defaultCodes = DEFAULT_MODULES[appType]?.[selectedRole];
  const filtered = defaultCodes ? modules.filter((m) => defaultCodes.includes(m.module_code)) : modules;
  const canFilter = !!defaultCodes && filtered.length > 0 && filtered.length < modules.length;
  const visibleModules = (showAll || !canFilter) ? modules : filtered;
  const visibleCodes = new Set(visibleModules.map((m) => m.module_code));

  async function saveAll() {
    // Save what is on screen plus anything changed in this session.
    // Rows for modules that are hidden and untouched are left exactly
    // as they were in the database.
    const rows = Object.values(permissions).filter((p) => visibleCodes.has(p.module_code) || touched[p.module_code]).map((p) => ({
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

    if (rows.length === 0) {
      alert('Nothing to save — no modules are loaded for this role yet.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('role_permissions').upsert(rows, { onConflict: 'app_id,role,module_code' });
      if (error) {
        console.error(error);
        alert(`Failed to save permissions: ${error.message || 'please try again.'}`);
        return;
      }
      setSaved(true);
    } catch (err) {
      console.error(err);
      alert('Something went wrong while saving. Please try again.');
    } finally {
      // Always runs, even if something above threw — the button
      // should never get stuck showing "Saving..." forever with no
      // error or success shown, which is what a missing try/catch
      // here would look like from the outside.
      setSaving(false);
    }
  }

  // Wait for the tenant before deciding anything — before this, the
  // screen could briefly act as if the person were neither staff nor
  // owner and load the wrong thing.
  if (tenantLoading) return <div style={S.page}><div style={S.inner}><p style={S.muted}>Loading…</p></div><ControlPanelNav /></div>;
  if (!tenant) return <div style={S.page}><div style={S.inner}><p style={S.muted}>Please sign in again.</p></div><ControlPanelNav /></div>;

  if (isDevOrSupport && loadingClients) return <div style={S.page}><div style={S.inner}><p style={S.muted}>Loading clients...</p></div><ControlPanelNav /></div>;

  if (isDevOrSupport && !selectedClient) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>Manage Access</h2>
          <p style={{ ...S.muted, marginBottom: 16 }}>Select which client's access you're configuring.</p>
          {clients.filter((c) => c.apps?.id).length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>No clients found.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {clients.filter((c) => c.apps?.id).map((c) => (
                <button key={c.id} onClick={() => setSelectedClient(c)}
                  style={{ textAlign: 'left', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, background: '#161618', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{c.org_name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{c.apps?.app_type === 'grievance' ? 'CTS' : c.apps?.app_type} {c.district ? `· ${c.district}` : ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        <ControlPanelNav />
        <BugReporter screenName="manage_access" />
      </div>
    );
  }

  if (loading) return <div style={S.page}><div style={S.inner}><p style={S.muted}>Loading...</p></div><ControlPanelNav /></div>;

  const availableRoles = ROLES_BY_APP_TYPE[appType] || [];

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Manage Access</h2>
          <ScreenVideoButton screenCode="manage_access" />
        </div>
        {isDevOrSupport && selectedClient && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 14px', margin: '8px 0 12px' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Configuring: {selectedClient.org_name}</span>
            <button onClick={() => { setSelectedClient(null); setPermissions({}); setSaved(false); }} style={{ fontSize: 12, color: '#E8A020', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Switch client
            </button>
          </div>
        )}
        <p style={{ ...S.muted, marginBottom: 16 }}>
          Control what each role can see and do. Owner role (principal/doctor) always has full access.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="access-selected-role" style={{ ...S.muted, display: 'block', marginBottom: 4 }}>Select role to configure</label>
          <select id="access-selected-role" name="access-selected-role" value={selectedRole} onChange={(e) => { setSelectedRole(e.target.value); setSaved(false); setShowAll(false); setTouched({}); }} style={S.select}>
            {availableRoles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </div>

        {canFilter && (
          <label htmlFor="access-show-all" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
            <input id="access-show-all" name="access-show-all" type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <span>Show all modules <span style={S.muted}>({showAll ? `showing all ${modules.length}` : `showing ${visibleModules.length} of ${modules.length} for ${roleLabel(selectedRole)}`})</span></span>
          </label>
        )}

        {modules.length === 0 ? (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>No modules configured for this app type.</p>
        ) : (
          <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden', marginBottom: 16, background: '#161618' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 12px', background: '#111113', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
              <span>Module</span><span>View</span><span>Create</span><span>Edit</span><span>Delete</span>
            </div>
            {visibleModules.map((m) => {
              const p = permissions[m.module_code] || {};
              return (
                <div key={m.module_code} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', alignItems: 'center', fontSize: 13 }}>
                  <span>{m.module_label}</span>
                  {['can_view', 'can_create', 'can_edit', 'can_delete'].map((action) => (
                    <input id={`access-${m.module_code}-${action}`} name={`access-${m.module_code}-${action}`} aria-label={`${m.module_label} ${action.replace('can_', '')}`} key={action} type="checkbox" checked={!!p[action]} onChange={() => togglePermission(m.module_code, action)} style={{ cursor: 'pointer', width: 18, height: 18 }} />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {!saved ? (
          <button onClick={saveAll} disabled={saving || visibleModules.length === 0} style={{ width: '100%', padding: 12, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving...' : `Save permissions for ${roleLabel(selectedRole)}`}
          </button>
        ) : (
          <>
            <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: 12, textAlign: 'center', marginBottom: 4 }}>
              <p style={{ margin: 0, fontWeight: 600, color: '#6AAA90' }}>✓ Permissions saved for {roleLabel(selectedRole)}</p>
            </div>
            <NextActions
              title="Access configured — what next?"
              actions={[
                { icon: '🔒', label: 'Configure another role', description: 'Set permissions for a different role', onClick: () => setSaved(false), color: '#E8A020' },
              ]}
              secondaryActions={[
                { icon: '🏢', label: 'Clients', href: '/control/clients' },
                { icon: '🏠', label: 'Dashboard', href: '/portal/dashboard' },
              ]}
            />
          </>
        )}
      </div>

      <ControlPanelNav />
      <BugReporter screenName="manage_access" />
    </div>
  );
}
