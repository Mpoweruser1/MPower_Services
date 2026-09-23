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

  // Stops — Transport had no way to actually create a stop anywhere
  // in this file: routes could be added, status marked, sheets
  // printed, but transport_stops itself was read-only. That's exactly
  // why routes like Route-2 showed "No stops defined for this route
  // yet" with no way to fix it from here.
  const [addingStopFor, setAddingStopFor] = useState(null); // route id, or null
  const [newStop, setNewStop] = useState({ stop_name: '', pickup_time: '' });
  const [stopError, setStopError] = useState('');
  const [savingStop, setSavingStop] = useState(false);
  const [removingStopId, setRemovingStopId] = useState(null);
  const [reorderingStopId, setReorderingStopId] = useState(null);

  useEffect(() => {
    if (tenant?.appId) loadAll();
  }, [tenant?.appId]);

  async function loadAll() {
    setLoading(true);
    setSubmitError('');
    const today = new Date().toISOString().slice(0, 10);

    const [routesRes, maintenanceRes] = await Promise.allSettled([
      supabase.from('transport_routes')
        .select(`*, transport_stops(id, stop_name, pickup_time, stop_order)`)
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

    // student_count was never a real column on transport_stops at
    // all — the actual per-stop count has to be computed from real
    // enrollment, the same way route-level counts already are
    // elsewhere in this app (see the transport_enrollment report).
    const rawRoutes = routesRes.status === 'fulfilled' ? (routesRes.value.data || []) : [];
    const allStopIds = rawRoutes.flatMap((r) => (r.transport_stops || []).map((s) => s.id));
    let countsByStop = {};
    if (allStopIds.length > 0) {
      const { data: enrollments, error: enrollErr } = await supabase
        .from('transport_students').select('stop_id').in('stop_id', allStopIds);
      if (enrollErr) {
        console.error('Loading transport enrollment counts failed:', enrollErr);
      } else {
        (enrollments || []).forEach((e) => {
          countsByStop[e.stop_id] = (countsByStop[e.stop_id] || 0) + 1;
        });
      }
    }
    const routesWithCounts = rawRoutes.map((r) => ({
      ...r,
      transport_stops: (r.transport_stops || []).map((s) => ({
        ...s,
        student_count: countsByStop[s.id] || 0,
      })),
    }));

    setRoutes(routesWithCounts);
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

          // Previously unchecked — if this failed, parents still got a
          // WhatsApp saying their child was marked absent, for
          // attendance that was never actually recorded.
          const { error: attErr } = await supabase.from('attendance').upsert(attendanceRows, {
            onConflict: 'student_id,date',
          });
          if (attErr) {
            console.error('Marking bus students absent failed:', attErr);
            alert(`Could not mark students absent: ${attErr.message || 'please try again.'} No parent alerts were sent.`);
            return;
          }

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

  function validateNewStop() {
    if (!newStop.stop_name.trim()) { setStopError('Stop name is required.'); return false; }
    setStopError('');
    return true;
  }

  async function addStop(routeId) {
    if (!validateNewStop()) return;
    setSavingStop(true);

    const route = routes.find((r) => r.id === routeId);
    const existingStops = route?.transport_stops || [];
    // Next order slot for this route — stops are per-route, so this
    // only needs to be unique within the route, not across all of them.
    const nextOrder = existingStops.length > 0
      ? Math.max(...existingStops.map((s) => s.stop_order || 0)) + 1
      : 1;

    const { error } = await supabase.from('transport_stops').insert({
      route_id:    routeId,
      stop_name:   newStop.stop_name.trim(),
      pickup_time: newStop.pickup_time.trim() || null,
      stop_order:  nextOrder,
    });

    setSavingStop(false);
    if (error) {
      console.error('Adding stop failed:', error);
      setStopError(error.message || 'Failed to add stop. Please try again.');
      return;
    }

    setNewStop({ stop_name: '', pickup_time: '' });
    setAddingStopFor(null);
    setMessage(`✅ Stop added.`);
    loadAll();
  }

  async function moveStop(route, stop, direction) {
    const stops = [...(route.transport_stops || [])].sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0));
    const idx = stops.findIndex((s) => s.id === stop.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= stops.length) return; // already at the end

    const other = stops[swapIdx];
    setReorderingStopId(stop.id);

    // Swap stop_order between the two — two separate updates rather
    // than one query, since Supabase's update() doesn't support
    // swapping two rows' values against each other atomically. A
    // failure partway is visible (the two stops would briefly share
    // an order value) rather than silently wrong, and loadAll()
    // afterward re-reads the real state either way.
    const [res1, res2] = await Promise.all([
      supabase.from('transport_stops').update({ stop_order: other.stop_order }).eq('id', stop.id),
      supabase.from('transport_stops').update({ stop_order: stop.stop_order }).eq('id', other.id),
    ]);

    setReorderingStopId(null);
    if (res1.error || res2.error) {
      console.error('Reordering stops failed:', res1.error || res2.error);
      setSubmitError('Failed to reorder stops. Please try again.');
      return;
    }
    loadAll();
  }

  async function removeStop(stop) {
    const studentCount = stop.student_count || 0;
    const confirmMsg = studentCount > 0
      ? `Remove "${stop.stop_name}"? ${studentCount} student${studentCount !== 1 ? 's are' : ' is'} currently assigned to this stop — they will show as "Not assigned" on their profile until reassigned.`
      : `Remove "${stop.stop_name}"?`;
    if (!window.confirm(confirmMsg)) return;

    setRemovingStopId(stop.id);

    // Un-assign affected students first — same "Not assigned" state
    // StudentDetail.jsx's Transport card already handles, not a new
    // state to build. Done before the stop itself is deleted so
    // nothing is ever left pointing at a stop_id that no longer exists.
    if (studentCount > 0) {
      const { error: unassignErr } = await supabase
        .from('transport_students')
        .update({ stop_id: null })
        .eq('stop_id', stop.id);
      if (unassignErr) {
        console.error('Un-assigning students from stop failed:', unassignErr);
        setSubmitError(unassignErr.message || 'Failed to remove stop — could not un-assign its students.');
        setRemovingStopId(null);
        return;
      }
    }

    const { error } = await supabase.from('transport_stops').delete().eq('id', stop.id);
    setRemovingStopId(null);
    if (error) {
      console.error('Removing stop failed:', error);
      setSubmitError(error.message || 'Failed to remove stop. Please try again.');
      return;
    }
    setMessage(`✅ Stop removed.${studentCount > 0 ? ` ${studentCount} student${studentCount !== 1 ? 's' : ''} unassigned.` : ''}`);
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

        {/* Header — no-print: this is the on-screen page heading, not
            part of the printed route sheet. Without this it printed at
            the top of every route sheet, wasting space and looking
            like an app screenshot rather than a document. */}
        <div className="no-print" style={{ marginBottom: 24 }}>
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
                // Previously an unbounded single-column list — with
                // many routes, that meant a very long page and a lot
                // of scrolling to get from one route to another. Now
                // a responsive grid, so more routes are visible at
                // once and it's easier to move between them. An
                // expanded card can be taller than its row's other
                // cards — a real, known tradeoff of a plain CSS grid
                // vs. a masonry layout — but still a clear improvement
                // over one long vertical stack.
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12, alignItems: 'start' }}>
                {routes.map((route) => {
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
                            <div style={{ marginBottom: 10 }}>
                              {[...route.transport_stops].sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0)).map((stop, si, sorted) => (
                                <div key={stop.id}
                                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <span style={{ color: '#fff' }}>{stop.stop_name}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                                      {' '}· {stop.pickup_time || 'Time not set'} · {stop.student_count || 0} students
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                    <button onClick={() => moveStop(route, stop, 'up')} disabled={si === 0 || reorderingStopId === stop.id}
                                      title="Move up"
                                      style={{ width: 26, height: 26, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', color: si === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)', cursor: si === 0 ? 'not-allowed' : 'pointer', fontSize: 11 }}>
                                      ▲
                                    </button>
                                    <button onClick={() => moveStop(route, stop, 'down')} disabled={si === sorted.length - 1 || reorderingStopId === stop.id}
                                      title="Move down"
                                      style={{ width: 26, height: 26, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', color: si === sorted.length - 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)', cursor: si === sorted.length - 1 ? 'not-allowed' : 'pointer', fontSize: 11 }}>
                                      ▼
                                    </button>
                                    <button onClick={() => removeStop(stop)} disabled={removingStopId === stop.id}
                                      title="Remove stop"
                                      style={{ width: 26, height: 26, border: '1px solid rgba(224,90,90,0.25)', borderRadius: 6, background: 'transparent', color: '#E05A5A', cursor: 'pointer', fontSize: 12 }}>
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {addingStopFor === route.id ? (
                            <div style={{ background: '#111113', borderRadius: 8, padding: 10, marginBottom: 14 }}>
                              {stopError && (
                                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#E05A5A' }}>⚠ {stopError}</p>
                              )}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, marginBottom: 8 }}>
                                <input id={`stop-name-${route.id}`} name={`stop-name-${route.id}`}
                                  value={newStop.stop_name}
                                  onChange={(e) => { setNewStop((s) => ({ ...s, stop_name: e.target.value })); setStopError(''); }}
                                  placeholder="Stop name" style={S.input(!!stopError)} />
                                <input id={`stop-time-${route.id}`} name={`stop-time-${route.id}`} type="time"
                                  value={newStop.pickup_time}
                                  onChange={(e) => setNewStop((s) => ({ ...s, pickup_time: e.target.value }))}
                                  style={S.input(false)} />
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { setAddingStopFor(null); setNewStop({ stop_name: '', pickup_time: '' }); setStopError(''); }}
                                  style={{ flex: 1, padding: 8, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                                  Cancel
                                </button>
                                <button onClick={() => addStop(route.id)} disabled={savingStop}
                                  style={{ flex: 2, padding: 8, border: 'none', borderRadius: 7, background: savingStop ? 'rgba(255,255,255,0.08)' : '#6AAA90', color: '#111113', cursor: savingStop ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                                  {savingStop ? 'Saving...' : 'Save stop'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setAddingStopFor(route.id)}
                              style={{ width: '100%', padding: 8, marginBottom: 14, border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 7, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                              + Add stop
                            </button>
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
                })}
                </div>
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
                  <label htmlFor={`transport-new-route-${field.key}`} style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                    {field.label}
                  </label>
                  <input id={`transport-new-route-${field.key}`} name={`transport-new-route-${field.key}`}
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
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{stop.pickup_time || '—'}</td>
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