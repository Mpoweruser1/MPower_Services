// school/Transport.jsx — FINAL (Supabase wired)
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { sanitize } from '../shared/useFormValidation';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
  badge: (color, bg) => ({ fontSize: 11, padding: '3px 10px', borderRadius: 20, fontWeight: 500, color, background: bg }),
};

const STATUS_CONFIG = {
  on_time: { label: 'On time',        color: '#6AAA90', bg: 'rgba(106,170,144,0.12)' },
  delayed: { label: 'Delayed',        color: '#E8A020', bg: 'rgba(232,160,32,0.12)' },
  absent:  { label: 'Not running',    color: '#E05A5A', bg: 'rgba(224,90,90,0.12)' },
};

export default function Transport() {
  const { tenant } = useTenant();
  const [tab, setTab]             = useState('routes');
  const [routes, setRoutes]       = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [message, setMessage] = useState('');

  const [newRoute, setNewRoute] = useState({
    route_no: '', driver_name: '', driver_phone: '', vehicle_no: '',
  });
  const [routeErrors, setRouteErrors] = useState({});

  useEffect(() => {
    if (tenant?.appId) loadAll();
  }, [tenant?.appId]);

  async function loadAll() {
    setLoading(true);
    setSubmitError('');
    const today = new Date().toISOString().slice(0, 10);

    const [routesRes, maintenanceRes] = await Promise.allSettled([
      supabase.from('transport_routes')
        .select(`*, transport_stops(id, stop_name, arrival_time, student_count)`)
        .eq('app_id', tenant.appId)
        .order('route_no'),

      supabase.from('transport_maintenance')
        .select('*')
        .eq('app_id', tenant.appId)
        .order('due_date'),
    ]);

    // Previously: Promise.allSettled only checks whether the promise
    // itself rejected — but a Supabase query never rejects on a query
    // error, it resolves with { data: null, error: {...} }. So a
    // genuinely failed query (bad column, RLS issue, whatever) was
    // silently treated as "fulfilled" and fell back to an empty list
    // with zero indication anything went wrong. A real failure and
    // "you just have no routes yet" looked identical.
    if (routesRes.status === 'rejected' || routesRes.value?.error) {
      const err = routesRes.status === 'rejected' ? routesRes.reason : routesRes.value.error;
      console.error('Loading transport routes failed:', err);
      setSubmitError(err?.message || 'Failed to load transport routes.');
    }
    if (maintenanceRes.status === 'rejected' || maintenanceRes.value?.error) {
      console.error('Loading transport maintenance failed:', maintenanceRes.status === 'rejected' ? maintenanceRes.reason : maintenanceRes.value.error);
    }

    setRoutes(routesRes.status === 'fulfilled' ? (routesRes.value.data || []) : []);
    setMaintenance(maintenanceRes.status === 'fulfilled' ? (maintenanceRes.value.data || []) : []);
    setLoading(false);
  }

  async function markStatus(routeId, status) {
    // transport_routes has no status_updated_at column — confirmed via
    // real schema (only last_gps_update exists, for GPS pings
    // specifically, not general status changes). Every status update
    // has been failing because of this outright, predating even the
    // earlier fix that made this failure visible instead of silent.
    const { error } = await supabase
      .from('transport_routes')
      .update({ status })
      .eq('id', routeId);

    // Previously: if (error) return; — a failed status update showed
    // absolutely nothing to the user, no message, no console log.
    if (error) {
      console.error('Route status update failed:', error);
      setSubmitError(error.message || 'Failed to update route status. Please try again.');
      return;
    }

    // If bus not running — mark all students on this route absent
    if (status === 'absent') {
      const route = routes.find((r) => r.id === routeId);
      if (route) {
        const { data: transportStudents } = await supabase
          .from('transport_students')
          .select('student_id')
          .eq('route_id', routeId);

        if (transportStudents && transportStudents.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const attendanceRows = transportStudents.map((ts) => ({
            student_id: ts.student_id,
            date:       today,
            status:     'A',
            marked_by:  tenant.userRowId,
            marked_via: 'manual',
          }));

          await supabase.from('attendance').upsert(attendanceRows, {
            onConflict: 'student_id,date',
          });

          // WhatsApp alert to parents
          await supabase.functions.invoke('send-whatsapp', {
            body: {
              type:       'bus_not_running',
              studentIds: transportStudents.map((ts) => ts.student_id),
              routeNo:    route.route_no,
            },
          });
        }
      }
    }

    loadAll();
  }

  function validateNewRoute() {
    const errors = {};
    if (!newRoute.route_no.trim())     errors.route_no     = 'Route number required';
    if (!newRoute.driver_name.trim())  errors.driver_name  = 'Driver name required';
    if (!newRoute.vehicle_no.trim())   errors.vehicle_no   = 'Vehicle number required';
    if (newRoute.driver_phone && newRoute.driver_phone.replace(/\D/g, '').length !== 10) {
      errors.driver_phone = 'Enter valid 10-digit phone';
    }
    setRouteErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function addRoute() {
    if (!validateNewRoute()) return;
    setSaving(true);
    setSubmitError('');

    const { error } = await supabase.from('transport_routes').insert({
      app_id:       tenant.appId,
      route_no:     newRoute.route_no.trim(),
      driver_name:  newRoute.driver_name.trim(),
      driver_phone: newRoute.driver_phone.trim() || null,
      vehicle_no:   newRoute.vehicle_no.trim(),
      status:       'on_time',
    });

    if (error) {
      console.error('Route creation failed:', error);
      setSubmitError(error.message || 'Failed to add route. Please try again.');
      setSaving(false);
      return;
    }

    // Previously: form just reset and closed with zero confirmation —
    // a successful add looked identical to nothing happening at all.
    setNewRoute({ route_no: '', driver_name: '', driver_phone: '', vehicle_no: '' });
    setRouteErrors({});
    setShowAddRoute(false);
    setSaving(false);
    setMessage(`✅ Route ${newRoute.route_no.trim()} added.`);
    loadAll();
  }

  const totalStudents = routes.reduce((sum, r) => {
    return sum + (r.transport_stops || []).reduce((s, stop) => s + (stop.student_count || 0), 0);
  }, 0);

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; }
          @page { size: A4 portrait; margin: 15mm 18mm; }
        }
        .print-only { display: none; }
      `}</style>
      <div className="no-print">
      <div style={S.inner}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Transport · రవాణా
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Transport Management</h1>
          {!loading && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
              {routes.length} routes · {totalStudents} students
            </p>
          )}
        </div>

        {message && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#6AAA90' }}>
            {message}
          </div>
        )}
        {submitError && !showAddRoute && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#E05A5A' }}>
            ⚠ {submitError}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { k: 'routes',      l: `Routes (${routes.length})` },
            { k: 'maintenance', l: `Maintenance (${maintenance.length})` },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
          <button onClick={() => setShowAddRoute(true)}
            style={{ marginLeft: 'auto', padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: 'none', background: '#6AAA90', color: '#111113', fontFamily: 'inherit', fontWeight: 600 }}>
            + Add route
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        ) : (
          <>
            {/* Routes tab */}
            {tab === 'routes' && (
              routes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 32, marginBottom: 12 }}>🚌</p>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No routes added yet.</p>
                  <button onClick={() => setShowAddRoute(true)}
                    style={{ marginTop: 12, padding: '10px 20px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Add first route →
                  </button>
                </div>
              ) : (
                routes.map((route) => {
                  const statusCfg   = STATUS_CONFIG[route.status] || STATUS_CONFIG.on_time;
                  const isExpanded  = expandedId === route.id;
                  const stopCount   = (route.transport_stops || []).length;
                  const studentCount = (route.transport_stops || []).reduce((s, st) => s + (st.student_count || 0), 0);

                  return (
                    <div key={route.id} style={S.card}>
                      <div onClick={() => setExpandedId(isExpanded ? null : route.id)}
                        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>
                            {route.route_no} — {route.vehicle_no}
                          </p>
                          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                            {route.driver_name}
                            {route.driver_phone ? ` · ${route.driver_phone}` : ''}
                            {stopCount > 0 ? ` · ${stopCount} stops · ${studentCount} students` : ''}
                          </p>
                        </div>
                        <span style={S.badge(statusCfg.color, statusCfg.bg)}>{statusCfg.label}</span>
                      </div>

                      {isExpanded && (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          {(route.transport_stops || []).length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                              {route.transport_stops.map((stop) => (
                                <div key={stop.id}
                                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                  <span style={{ color: '#fff' }}>{stop.stop_name}</span>
                                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                                    {stop.arrival_time} · {stop.student_count || 0} students
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button onClick={() => markStatus(route.id, 'on_time')}
                              style={{ padding: '7px 12px', border: '1px solid rgba(106,170,144,0.3)', color: '#6AAA90', background: 'rgba(106,170,144,0.08)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                              ✓ On time
                            </button>
                            <button onClick={() => markStatus(route.id, 'delayed')}
                              style={{ padding: '7px 12px', border: '1px solid rgba(232,160,32,0.3)', color: '#E8A020', background: 'rgba(232,160,32,0.08)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                              ⏰ Mark delayed
                            </button>
                            <button onClick={() => {
                              if (window.confirm(`Mark "${route.route_no}" as not running today? All students on this route will be marked absent and parents will be notified via WhatsApp.`)) {
                                markStatus(route.id, 'absent');
                              }
                            }}
                              style={{ padding: '7px 12px', border: '1px solid rgba(224,90,90,0.3)', color: '#E05A5A', background: 'rgba(224,90,90,0.08)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                              🚫 Bus not running
                            </button>
                            <button onClick={() => window.print()}
                              style={{ padding: '7px 12px', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', background: 'transparent', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                              🖨️ Print route sheet
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )
            )}

            {/* Maintenance tab */}
            {tab === 'maintenance' && (
              maintenance.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No maintenance records yet.</p>
                </div>
              ) : (
                maintenance.map((m) => {
                  const isOverdue = new Date(m.due_date) < new Date();
                  return (
                    <div key={m.id} style={{ ...S.card, border: `1px solid ${isOverdue ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.07)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{m.vehicle_no} — {m.maintenance_type}</p>
                          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Due: {m.due_date}</p>
                        </div>
                        <span style={S.badge(isOverdue ? '#E05A5A' : '#E8A020', isOverdue ? 'rgba(224,90,90,0.12)' : 'rgba(232,160,32,0.12)')}>
                          {isOverdue ? 'Overdue' : 'Upcoming'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </>
        )}
      </div>

      {/* Add route modal */}
      {showAddRoute && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif' }}>
            <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Add new route</p>

            {submitError && (
              <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#E05A5A' }}>
                ⚠ {submitError}
              </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
              {[
                { key: 'route_no',     label: 'Route number *',   placeholder: 'e.g. Route 1' },
                { key: 'vehicle_no',   label: 'Vehicle number *',  placeholder: 'e.g. AP16 TB 4521' },
                { key: 'driver_name',  label: 'Driver name *',     placeholder: 'Full name' },
                { key: 'driver_phone', label: 'Driver phone',      placeholder: '10-digit number', type: 'phone' },
              ].map((field) => (
                <div key={field.key}>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                    {field.label}
                  </label>
                  <input
                    value={newRoute[field.key]}
                    onChange={(e) => {
                      const v = field.type === 'phone' ? sanitize.phone(e.target.value) : e.target.value;
                      setNewRoute((r) => ({ ...r, [field.key]: v }));
                      setRouteErrors((er) => ({ ...er, [field.key]: null }));
                    }}
                    placeholder={field.placeholder}
                    inputMode={field.type === 'phone' ? 'numeric' : 'text'}
                    style={S.input(!!routeErrors[field.key])}
                  />
                  {routeErrors[field.key] && (
                    <p style={{ fontSize: 11, color: '#E05A5A', marginTop: 4 }}>⚠ {routeErrors[field.key]}</p>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowAddRoute(false); setRouteErrors({}); setSubmitError(''); }}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={addRoute} disabled={saving}
                style={{ flex: 2, padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Save route →'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Print-only route sheet — hidden on screen, shown only when printing */}
      {expandedId && (() => {
        const route = routes.find((r) => r.id === expandedId);
        if (!route) return null;
        return (
          <div className="print-only" style={{ background: '#fff', color: '#000', padding: '32px 40px', fontFamily: 'serif', maxWidth: 640, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 24, borderBottom: '2px solid #000', paddingBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{tenant?.orgName || 'School'}</h2>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 0', textTransform: 'uppercase', letterSpacing: 2 }}>Transport Route Sheet</h3>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 20 }}>
              <span>Route: <strong>{route.route_no}</strong></span>
              <span>Date: <strong>{new Date().toLocaleDateString('en-IN')}</strong></span>
            </div>

            <div style={{ marginBottom: 20, fontSize: 13, lineHeight: 1.8 }}>
              <div>Vehicle No: <strong>{route.vehicle_no}</strong></div>
              <div>Driver: <strong>{route.driver_name}</strong>{route.driver_phone ? ` · ${route.driver_phone}` : ''}</div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #000' }}>Stop</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #000' }}>Arrival</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #000' }}>Students</th>
                </tr>
              </thead>
              <tbody>
                {(route.transport_stops || []).map((stop) => (
                  <tr key={stop.id}>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{stop.stop_name}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{stop.arrival_time}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid #eee' }}>{stop.student_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #000', paddingTop: 8, width: 180 }}>
                  Transport In-Charge Signature<br />
                  <span style={{ fontSize: 11, color: '#555' }}>{tenant?.orgName || 'School'}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20, padding: '6px 10px', background: '#f5f5f5', borderRadius: 4, fontSize: 10, color: '#888', fontFamily: 'monospace' }}>
              Generated: {new Date().toLocaleString('en-IN')} · MPower
            </div>
          </div>
        );
      })()}

      <SchoolNav />
      <BugReporter screenName="transport" />
    </div>
  );
}