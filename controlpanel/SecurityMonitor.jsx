// controlpanel/SecurityMonitor.jsx — v2 (staff-only, reads real tables via 3 database functions)
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import ControlPanelNav from '../shared/ControlPanelNav';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, marginBottom: 10 },
  stat: { background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' },
};

const MUTED = 'rgba(255,255,255,0.6)';
const ACTIVE_MINUTES = 15;

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN') : '—');
const who = (name, role) => (name ? `${name}${role ? ' · ' + role : ''}` : 'Unknown user');
const pretty = (s) => (s ? String(s).replace(/_/g, ' ') : '—');

export default function SecurityMonitor() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [sessions, setSessions] = useState([]);
  const [prints, setPrints]     = useState([]);
  const [bulk, setBulk]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab]           = useState('sessions');
  const [client, setClient]     = useState('');

  const isStaff = !!tenant && ['developer', 'support'].includes(tenant.role);

  useEffect(() => {
    if (isStaff) loadAll();
  }, [isStaff]);

  async function loadAll() {
    setLoading(true);
    setLoadError('');
    const [a, b, c] = await Promise.all([
      supabase.rpc('staff_security_sessions'),
      supabase.rpc('staff_security_prints'),
      supabase.rpc('staff_security_bulk'),
    ]);
    const errs = [];
    if (a.error) errs.push('Logged in: ' + a.error.message);
    if (b.error) errs.push('Prints: ' + b.error.message);
    if (c.error) errs.push('Bulk changes: ' + c.error.message);
    setSessions(a.data || []);
    setPrints(b.data || []);
    setBulk(c.data || []);
    setLoadError(errs.join(' | '));
    setLoading(false);
  }

  const clients = useMemo(() => {
    const names = new Set();
    [...sessions, ...prints, ...bulk].forEach((r) => { if (r.org_name) names.add(r.org_name); });
    return [...names].sort((x, y) => x.localeCompare(y));
  }, [sessions, prints, bulk]);

  const byClient = (rows) => (client ? rows.filter((r) => r.org_name === client) : rows);
  const fSessions = useMemo(() => byClient(sessions), [sessions, client]);
  const fPrints   = useMemo(() => byClient(prints), [prints, client]);
  const fBulk     = useMemo(() => byClient(bulk), [bulk, client]);

  const stats = useMemo(() => {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const recent = Date.now() - ACTIVE_MINUTES * 60 * 1000;
    return {
      active:  fSessions.filter((s) => s.last_seen_at && new Date(s.last_seen_at).getTime() >= recent).length,
      prints:  fPrints.filter((p) => p.print_time && new Date(p.print_time) >= midnight).length,
      bulk:    fBulk.filter((b) => b.created_at && new Date(b.created_at) >= midnight).length,
      undone:  fBulk.filter((b) => b.undone).length,
    };
  }, [fSessions, fPrints, fBulk]);

  if (tenantLoading) return <div style={S.page}><div style={S.inner}><p style={{ color: MUTED, fontSize: 13 }}>Loading…</p></div><ControlPanelNav /></div>;
  if (!isStaff) {
    return <div style={S.page}><div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Control Panel access only.</p></div><ControlPanelNav /></div>;
  }

  const empty = (text) => (
    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
      <p style={{ fontSize: 22, marginBottom: 10 }}>🔒</p>
      <p style={{ fontSize: 14, color: MUTED }}>{text}</p>
    </div>
  );

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>Security Monitor</p>
          <p style={{ margin: 0, fontSize: 12, color: MUTED }}>All clients · latest 200 per tab</p>
        </div>
        <button onClick={loadAll} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>↻ Refresh</button>
      </nav>

      <div style={S.inner}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { value: stats.active, label: `Active now (${ACTIVE_MINUTES} min)` },
            { value: stats.prints, label: 'Prints today' },
            { value: stats.bulk,   label: 'Bulk changes today' },
            { value: stats.undone, label: 'Bulk undone', alert: stats.undone > 0 },
          ].map((s) => (
            <div key={s.label} style={{ ...S.stat, border: `1px solid ${s.alert ? 'rgba(232,160,32,0.25)' : 'rgba(255,255,255,0.05)'}` }}>
              <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: s.alert ? '#E8A020' : '#fff' }}>{s.value}</p>
              <p style={{ fontSize: 12, color: MUTED, margin: '3px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {loadError && (
          <div style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>Could not load some data: {loadError}</p>
          </div>
        )}

        {/* Client filter */}
        <select value={client} onChange={(e) => setClient(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', marginBottom: 16, background: '#111113', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[{ k: 'sessions', l: 'Logged in' }, { k: 'prints', l: 'Prints' }, { k: 'bulk', l: 'Bulk changes' }].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: MUTED, fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        ) : (
          <>
            {/* Logged in */}
            {tab === 'sessions' && (
              fSessions.length === 0 ? empty('No sessions found') : fSessions.map((s, i) => {
                const live = s.last_seen_at && Date.now() - new Date(s.last_seen_at).getTime() <= ACTIVE_MINUTES * 60 * 1000;
                return (
                  <div key={i} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <p style={{ margin: 0, fontSize: 14, color: '#fff' }}>{who(s.full_name, s.role)}</p>
                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, height: 'fit-content', background: live ? 'rgba(80,200,120,0.12)' : 'rgba(255,255,255,0.06)', color: live ? '#50C878' : MUTED }}>{live ? 'Active' : 'Idle'}</span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>{s.org_name || 'No client'}{s.app_type ? ` · ${s.app_type === 'grievance' ? 'CTS' : s.app_type}` : ''}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>Last seen {fmt(s.last_seen_at)} · Started {fmt(s.session_started)}</p>
                  </div>
                );
              })
            )}

            {/* Prints */}
            {tab === 'prints' && (
              fPrints.length === 0 ? empty('No prints found') : fPrints.map((p, i) => (
                <div key={i} style={S.card}>
                  <p style={{ margin: 0, fontSize: 14, color: '#fff' }}>{pretty(p.document_type)}{p.record_count != null ? ` · ${p.record_count} record${p.record_count === 1 ? '' : 's'}` : ''}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>{who(p.printed_by_name, p.printed_by_role)} · {p.org_name || 'No client'}{p.module ? ` · ${p.module}` : ''}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>{fmt(p.print_time)}{p.device_name ? ` · ${p.device_name}` : ''}</p>
                </div>
              ))
            )}

            {/* Bulk changes */}
            {tab === 'bulk' && (
              fBulk.length === 0 ? empty('No bulk changes found') : fBulk.map((b, i) => (
                <div key={i} style={{ ...S.card, border: `1px solid ${b.undone ? 'rgba(232,160,32,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 14, color: '#fff' }}>{pretty(b.operation_type)}{b.affected_records != null ? ` · ${b.affected_records} records` : ''}</p>
                    {b.undone && <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, height: 'fit-content', background: 'rgba(232,160,32,0.12)', color: '#E8A020' }}>Undone</span>}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>{who(b.done_by_name, b.done_by_role)} · {b.org_name || 'No client'}{b.module ? ` · ${b.module}` : ''}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>
                    {fmt(b.created_at)}{b.valid_count != null ? ` · valid ${b.valid_count}` : ''}{b.error_count ? ` · errors ${b.error_count}` : ''}{b.undone_at ? ` · undone ${fmt(b.undone_at)}` : ''}
                  </p>
                </div>
              ))
            )}
          </>
        )}

        {/* Security tips */}
        <div style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginTop: 8 }}>
          <p style={{ fontSize: 12, color: MUTED, letterSpacing: 1, margin: '0 0 10px' }}>SECURITY TIPS</p>
          {[
            'Check for prints or bulk changes by someone who should not be doing them',
            'A bulk change that was undone is worth a quick call to the client',
            'Remove inactive users from Manage Access to reduce attack surface',
            'Staff should use strong passwords and not share login credentials',
          ].map((tip) => (
            <p key={tip} style={{ margin: '0 0 6px', fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              🔒 {tip}
            </p>
          ))}
        </div>
      </div>

      <ControlPanelNav />
      <BugReporter screenName="security_monitor" />
    </div>
  );
}
