// controlpanel/SecurityMonitor.jsx — FINAL
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import ControlPanelNav from '../shared/ControlPanelNav';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  stat: { background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' },
};

const SEVERITY_CONFIG = {
  info:     { color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.06)',   label: 'Info' },
  warning:  { color: '#E8A020', bg: 'rgba(232,160,32,0.12)',                  label: 'Warning' },
  critical: { color: '#E05A5A', bg: 'rgba(224,90,90,0.12)',                   label: 'Critical' },
};

export default function SecurityMonitor() {
  const { tenant } = useTenant();
  const [activityLog, setActivityLog]   = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [tab, setTab]                   = useState('activity');
  const [filterSeverity, setFilterSeverity] = useState('');

  useEffect(() => {
    if (tenant?.appId) loadAll();
  }, [tenant?.appId]);

  async function loadAll() {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [actRes, loginRes] = await Promise.allSettled([
      supabase.from('activity_log').select('*')
        .eq('app_id', tenant.appId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('auth.sessions').select('created_at, user_id').limit(50),
    ]);

    setActivityLog(actRes.status === 'fulfilled' ? (actRes.value.data || []) : []);
    setLoginHistory(loginRes.status === 'fulfilled' ? (loginRes.value.data || []) : []);
    setLoading(false);
  }

  const stats = useMemo(() => ({
    total:    activityLog.length,
    critical: activityLog.filter((a) => a.severity === 'critical').length,
    warning:  activityLog.filter((a) => a.severity === 'warning').length,
    flagged:  activityLog.filter((a) => a.flagged).length,
  }), [activityLog]);

  const filtered = useMemo(() => {
    if (!filterSeverity) return activityLog;
    return activityLog.filter((a) => a.severity === filterSeverity);
  }, [activityLog, filterSeverity]);

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>Security Monitor</p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Activity log · last 30 days</p>
        </div>
        <button onClick={loadAll} style={{ padding: '7px 14px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>↻ Refresh</button>
      </nav>

      <div style={S.inner}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { value: stats.total,    label: 'Total events', color: '#fff',    alert: false },
            { value: stats.warning,  label: 'Warnings',     color: '#E8A020', alert: stats.warning > 5 },
            { value: stats.critical, label: 'Critical',     color: '#E05A5A', alert: stats.critical > 0 },
            { value: stats.flagged,  label: 'Flagged',      color: '#E05A5A', alert: stats.flagged > 0 },
          ].map((s) => (
            <div key={s.label} style={{ ...S.stat, border: `1px solid ${s.alert ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
              <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: s.alert ? '#E05A5A' : s.color }}>{s.value}</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '3px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Critical alerts */}
        {stats.critical > 0 && (
          <div style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
              🔴 {stats.critical} critical security event{stats.critical > 1 ? 's' : ''} detected in the last 30 days. Review immediately.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[{ k: 'activity', l: 'Activity log' }, { k: 'sessions', l: 'Login history' }].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Filter */}
        {tab === 'activity' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['', 'critical', 'warning', 'info'].map((s) => (
              <button key={s} onClick={() => setFilterSeverity(s)}
                style={{ padding: '6px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: filterSeverity === s ? 'none' : '1px solid rgba(255,255,255,0.1)', background: filterSeverity === s ? '#E8A020' : 'transparent', color: filterSeverity === s ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
                {s === '' ? 'All' : SEVERITY_CONFIG[s]?.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        ) : (
          <>
            {/* Activity log */}
            {tab === 'activity' && (
              filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 22, marginBottom: 10 }}>🔒</p>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>No activity events found</p>
                </div>
              ) : (
                filtered.map((event) => {
                  const sevCfg = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG.info;
                  return (
                    <div key={event.id} style={{ ...S.card, border: `1px solid ${event.severity === 'critical' ? 'rgba(224,90,90,0.25)' : event.severity === 'warning' ? 'rgba(232,160,32,0.15)' : 'rgba(255,255,255,0.07)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5 }}>
                            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: sevCfg.bg, color: sevCfg.color, fontWeight: 500 }}>{sevCfg.label}</span>
                            {event.flagged && (
                              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: 'rgba(224,90,90,0.12)', color: '#E05A5A', fontWeight: 600 }}>🚩 Flagged</span>
                            )}
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{new Date(event.created_at).toLocaleString('en-IN')}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: 14, color: '#fff', fontWeight: 400 }}>{event.action}</p>
                          {event.metadata && Object.keys(event.metadata).length > 0 && (
                            <div style={{ marginTop: 6, padding: '6px 10px', background: '#111113', borderRadius: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>
                              {Object.entries(event.metadata).filter(([k]) => k !== 'timestamp').map(([k, v]) => (
                                <span key={k} style={{ marginRight: 12 }}>{k}: {String(v)}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            )}

            {/* Login history */}
            {tab === 'sessions' && (
              loginHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>No session data available</p>
                </div>
              ) : (
                <div style={S.card}>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, margin: '0 0 12px' }}>RECENT LOGIN SESSIONS</p>
                  {loginHistory.map((session, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>Session #{i + 1}</span>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{new Date(session.created_at).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}

        {/* Security tips */}
        <div style={{ background: '#111113', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginTop: 8 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, margin: '0 0 10px' }}>SECURITY TIPS</p>
          {[
            'Review critical events immediately — they indicate unusual access patterns',
            'Remove inactive users from Manage Access to reduce attack surface',
            'Staff should use strong passwords and not share login credentials',
            'Monitor flagged events — they are automatically detected anomalies',
          ].map((tip) => (
            <p key={tip} style={{ margin: '0 0 6px', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
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