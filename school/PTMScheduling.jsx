// school/PTMScheduling.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', width: '100%' },
  select: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
};

export default function PTMScheduling() {
  const { tenant } = useTenant();
  const [sessions, setSessions] = useState([]);
  const [classes, setClasses]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [slots, setSlots]       = useState({});
  const [sending, setSending]   = useState(false);
  const [message, setMessage]   = useState('');

  const [form, setForm] = useState({
    title: '', class_id: '', session_date: new Date().toISOString().slice(0, 10),
    start_time: '15:00', slot_minutes: '10', slot_count: '20',
  });

  useEffect(() => {
    if (tenant?.appId) { loadSessions(); loadClasses(); }
  }, [tenant?.appId]);

  async function loadClasses() {
    const { data } = await supabase.from('classes').select('id, class_name').eq('app_id', tenant.appId).order('class_order');
    setClasses(data || []);
  }

  async function loadSessions() {
    setLoading(true);
    const { data } = await supabase
      .from('ptm_sessions').select('id, title, session_date, class_id, classes(class_name)')
      .eq('app_id', tenant.appId).order('session_date', { ascending: false });
    setSessions(data || []);
    setLoading(false);
  }

  async function loadSlots(sessionId) {
    const { data } = await supabase
      .from('ptm_slots').select('id, slot_time, status, student_id, students(full_name, sid)')
      .eq('session_id', sessionId).order('slot_time');
    setSlots((prev) => ({ ...prev, [sessionId]: data || [] }));
  }

  function toggleExpand(sessionId) {
    if (expandedId === sessionId) { setExpandedId(null); return; }
    setExpandedId(sessionId);
    if (!slots[sessionId]) loadSlots(sessionId);
  }

  async function createSession() {
    if (!form.title.trim()) { setMessage('Enter a title first.'); return; }
    const count = parseInt(form.slot_count);
    const duration = parseInt(form.slot_minutes);
    if (isNaN(count) || count < 1 || isNaN(duration) || duration < 1) {
      setMessage('Enter valid slot count and duration.');
      return;
    }

    const { data: session, error } = await supabase.from('ptm_sessions').insert({
      app_id: tenant.appId,
      class_id: form.class_id || null,
      title: form.title.trim(),
      session_date: form.session_date,
      created_by: tenant.userRowId,
    }).select().single();

    if (error) { setMessage('Failed to create session.'); return; }

    const [h, m] = form.start_time.split(':').map(Number);
    const rows = Array.from({ length: count }, (_, i) => {
      const totalMinutes = h * 60 + m + i * duration;
      const slotDate = new Date(`${form.session_date}T00:00:00`);
      slotDate.setMinutes(totalMinutes);
      return { session_id: session.id, slot_time: slotDate.toISOString(), status: 'open' };
    });
    await supabase.from('ptm_slots').insert(rows);

    setShowCreate(false);
    setForm({ title: '', class_id: '', session_date: new Date().toISOString().slice(0, 10), start_time: '15:00', slot_minutes: '10', slot_count: '20' });
    setMessage(`✅ Session created with ${count} slots.`);
    loadSessions();
  }

  async function sendInvites(session) {
    setSending(true);
    setMessage('');

    let query = supabase.from('students').select('id, full_name, parent_phone').eq('app_id', tenant.appId).eq('status', 'active');
    if (session.class_id) query = query.eq('class_id', session.class_id);
    const { data: students } = await query;

    const bookingUrl = `${window.location.origin}/ptm/${session.id}`;
    let sent = 0;
    for (const s of (students || [])) {
      if (!s.parent_phone) continue;
      try {
        await supabase.functions.invoke('send-whatsapp', {
          body: {
            type: 'ptm_invite',
            phone: s.parent_phone,
            studentName: s.full_name,
            sessionTitle: session.title,
            bookingUrl,
          },
        });
        sent++;
      } catch { /* one failure shouldn't block the rest */ }
    }
    setSending(false);
    setMessage(`✅ Sent invites to ${sent} parent${sent !== 1 ? 's' : ''}.`);
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>PTM · తల్లిదండ్రుల సమావేశం</p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Parent-Teacher Meetings</h1>
          </div>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
            + New session
          </button>
        </div>

        {message && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>
            {message}
          </div>
        )}

        {showCreate && (
          <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
            <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>New PTM session</p>
            <div style={{ marginBottom: 10 }}>
              <label style={S.label}>Title</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Term 1 PTM" style={S.input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={S.label}>Class (optional)</label>
                <select value={form.class_id} onChange={(e) => setForm((f) => ({ ...f, class_id: e.target.value }))} style={S.select}>
                  <option value="">Whole school</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Date</label>
                <input type="date" value={form.session_date} onChange={(e) => setForm((f) => ({ ...f, session_date: e.target.value }))} style={S.input} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={S.label}>Start time</label>
                <input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Minutes/slot</label>
                <input type="number" value={form.slot_minutes} onChange={(e) => setForm((f) => ({ ...f, slot_minutes: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Number of slots</label>
                <input type="number" value={form.slot_count} onChange={(e) => setForm((f) => ({ ...f, slot_count: e.target.value }))} style={S.input} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowCreate(false)}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={createSession}
                style={{ flex: 2, padding: 11, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Create session + slots
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 32 }}>Loading...</p>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#161618', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🗓️</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No PTM sessions yet.</p>
          </div>
        ) : (
          sessions.map((session) => {
            const sessionSlots = slots[session.id] || [];
            const bookedCount = sessionSlots.filter((s) => s.status === 'booked').length;
            const isExpanded = expandedId === session.id;
            return (
              <div key={session.id} style={S.card}>
                <div onClick={() => toggleExpand(session.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{session.title}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      {session.classes?.class_name || 'Whole school'} · {new Date(session.session_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {isExpanded && ` · ${bookedCount}/${sessionSlots.length} booked`}
                    </p>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button onClick={() => sendInvites(session)} disabled={sending}
                      style={{ width: '100%', padding: 10, marginBottom: 12, border: '1px solid rgba(106,170,144,0.3)', borderRadius: 8, background: 'rgba(106,170,144,0.08)', color: '#6AAA90', cursor: sending ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                      {sending ? 'Sending...' : '💬 Send WhatsApp invites to parents'}
                    </button>
                    {sessionSlots.map((slot) => (
                      <div key={slot.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{new Date(slot.slot_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span style={{ color: slot.status === 'booked' ? '#6AAA90' : 'rgba(255,255,255,0.25)' }}>
                          {slot.status === 'booked' ? `✓ ${slot.students?.full_name}` : 'Open'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

      </div>
      <SchoolNav />
      <BugReporter screenName="ptm_scheduling" />
    </div>
  );
}
