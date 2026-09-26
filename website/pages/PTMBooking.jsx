// website/pages/PTMBooking.jsx — NEW
// Public page, no login — matches PayFee.jsx's pattern exactly, since
// there's no parent portal anywhere in this app. The session_id in
// the URL (a real UUID, shared only via WhatsApp) is the access
// control, same idea as fee_payment_links' link_token.
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 480, margin: '0 auto', padding: '32px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16 },
  input: { width: '100%', padding: '12px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 15, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
};

export default function PTMBooking() {
  const { sessionId } = useParams();
  const [session, setSession]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [slots, setSlots]       = useState([]);
  const [booked, setBooked]     = useState(null);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (sessionId) loadSession();
  }, [sessionId]);

  async function loadSession() {
    setLoading(true);
    const { data } = await supabase
      .from('ptm_sessions').select('id, title, session_date, class_id, app_id, classes(class_name)')
      .eq('id', sessionId).maybeSingle();
    setSession(data || null);
    if (data) loadSlots();
    setLoading(false);
  }

  async function loadSlots() {
    const { data } = await supabase
      .from('ptm_slots_public').select('id, slot_time, status')
      .eq('session_id', sessionId).eq('status', 'open').order('slot_time');
    setSlots(data || []);
  }

  async function searchStudent(q) {
    setQuery(q);
    setSelectedStudent(null);
    if (q.trim().length < 3 || !session) { setStudents([]); return; }
    // Was a direct read of the students table, which needed a policy
    // letting ANYONE logged out read EVERY student in EVERY school.
    // ptm_search_students() only searches this session's school (and
    // class), needs 3+ letters, returns at most 6 names — nothing else.
    const { data, error: searchErr } = await supabase.rpc('ptm_search_students', {
      p_session_id: sessionId,
      p_query: q.trim(),
    });
    if (searchErr) console.error('Student search failed:', searchErr);
    setStudents(data || []);
  }

  async function bookSlot(slotId) {
    setError('');
    // Was relying on `count: 'exact'` to tell success from failure —
    // confirmed unreliable: a genuine, verified-successful booking
    // (proven directly in the database) was still reported as failed
    // on every later attempt, for any student or slot, with no
    // database-side cause found (RLS, grants, constraints, and
    // triggers all checked and confirmed correct). Asking for the
    // updated row back with .select() and checking whether a row
    // actually came back is the standard, reliable way to tell a
    // real update apart from one that matched zero rows — this row
    // is already covered by the same UPDATE policy that permits the
    // write itself, so no separate SELECT permission is needed.
    // Booking goes through book_ptm_slot(), which only books an OPEN
    // slot for a student who really belongs to this session's school
    // and class. The old direct update needed a policy letting anyone
    // logged out edit any open slot. Returns nothing if the slot was
    // already taken — same "someone else got there first" check below.
    const { data: bookedSlot, error: bookErr } = await supabase
      .rpc('book_ptm_slot', { p_slot_id: slotId, p_student_id: selectedStudent.id })
      .maybeSingle();

    if (bookErr) {
      console.error('Booking slot failed:', bookErr);
      setError(`Could not book this slot: ${bookErr.message || 'please try again.'}`);
      loadSlots();
      return;
    }
    if (!bookedSlot) {
      // A real "someone else got there first" — the row genuinely
      // didn't match (status was no longer 'open'), not a reporting
      // glitch.
      setError('That slot was just taken by someone else — please pick another.');
      loadSlots();
      return;
    }
    setBooked(bookedSlot);
  }

  if (loading) return <div style={S.page}><p style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>Loading...</p></div>;
  if (!session) return <div style={S.page}><div style={S.inner}><p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>This meeting link isn't valid or has expired.</p></div></div>;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase' }}>Parent-Teacher Meeting</p>
          <h1 style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 600 }}>{session.title}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {session.classes?.class_name || 'Whole school'} · {new Date(session.session_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {booked ? (
          <div style={{ ...S.card, textAlign: 'center', border: '1px solid rgba(106,170,144,0.3)' }}>
            <p style={{ fontSize: 32, marginBottom: 10 }}>✅</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#6AAA90', margin: 0 }}>Slot booked!</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
              {new Date(booked.slot_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} on {new Date(session.session_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}
            </p>
          </div>
        ) : !selectedStudent ? (
          <div style={S.card}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>Find your child to see available times</p>
            <input id="ptm-book-query" name="ptm-book-query" value={query} onChange={(e) => searchStudent(e.target.value)} placeholder="Type at least 3 letters of name or admission no." style={S.input} autoFocus />
            {students.map((s) => (
              <div key={s.id} onClick={() => { setSelectedStudent(s); setQuery(''); setStudents([]); }}
                style={{ padding: '10px 4px', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ margin: 0, fontSize: 14, color: '#fff' }}>{s.full_name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{s.sid}</p>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{selectedStudent.full_name}</p>
              <button onClick={() => setSelectedStudent(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.5)', padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Change</button>
            </div>

            {error && (
              <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                {error}
              </div>
            )}

            {slots.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: 20 }}>No open slots left — please contact the school directly.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {slots.map((slot) => (
                  <button key={slot.id} onClick={() => bookSlot(slot.id)}
                    style={{ padding: 12, border: '1px solid rgba(232,160,32,0.3)', borderRadius: 8, background: 'rgba(232,160,32,0.08)', color: '#E8A020', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>
                    {new Date(slot.slot_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
