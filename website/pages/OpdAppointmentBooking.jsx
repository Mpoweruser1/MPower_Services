// website/pages/OpdAppointmentBooking.jsx — NEW
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 480, margin: '0 auto', padding: '32px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16 },
  input: { width: '100%', padding: '12px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 15, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 10 },
};

export default function OpdAppointmentBooking() {
  const { dayId } = useParams();
  const [day, setDay]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [booked, setBooked] = useState(null);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (dayId) load();
  }, [dayId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('opd_appointment_days')
      .select('id, appointment_date, doctors(designation, users(full_name))')
      .eq('id', dayId).maybeSingle();
    setDay(data || null);
    if (data) {
      const { data: slotRows } = await supabase
        .from('opd_appointment_slots').select('id, slot_time, status')
        .eq('appointment_day_id', dayId).eq('status', 'open').order('slot_time');
      setSlots(slotRows || []);
    }
    setLoading(false);
  }

  async function book() {
    setError('');
    if (!name.trim() || !phone.trim()) { setError('Enter your name and phone number.'); return; }

    const { data, error: bookErr } = await supabase
      .from('opd_appointment_slots')
      .update({ status: 'booked', booked_name: name.trim(), booked_phone: phone.trim(), reason: reason.trim() || null, booked_at: new Date().toISOString() })
      .eq('id', selectedSlot.id)
      .eq('status', 'open')
      .select()
      .maybeSingle();

    if (bookErr || !data) {
      setError('That slot was just taken — please pick another.');
      setSelectedSlot(null);
      load();
      return;
    }
    setBooked(data);
  }

  if (loading) return <div style={S.page}><p style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>Loading...</p></div>;
  if (!day) return <div style={S.page}><div style={S.inner}><p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>This appointment link isn't valid or has expired.</p></div></div>;

  const doctorLabel = `${day.doctors?.users?.full_name || 'Doctor'}${day.doctors?.designation ? ` — ${day.doctors.designation}` : ''}`;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase' }}>OPD Appointment</p>
          <h1 style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 600 }}>{doctorLabel}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {new Date(day.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {booked ? (
          <div style={{ ...S.card, textAlign: 'center', border: '1px solid rgba(106,170,144,0.3)' }}>
            <p style={{ fontSize: 32, marginBottom: 10 }}>✅</p>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#6AAA90', margin: 0 }}>Appointment booked!</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
              {new Date(booked.slot_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {doctorLabel}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
              Please arrive 10 minutes early. Bring any previous prescriptions or reports.
            </p>
          </div>
        ) : !selectedSlot ? (
          <div style={S.card}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>Choose an available time</p>
            {slots.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14, padding: 20 }}>No open slots left for this day.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {slots.map((slot) => (
                  <button key={slot.id} onClick={() => setSelectedSlot(slot)}
                    style={{ padding: 12, border: '1px solid rgba(232,160,32,0.3)', borderRadius: 8, background: 'rgba(232,160,32,0.08)', color: '#E8A020', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>
                    {new Date(slot.slot_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#E8A020' }}>
                {new Date(selectedSlot.slot_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <button onClick={() => setSelectedSlot(null)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.5)', padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>Change time</button>
            </div>

            {error && (
              <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                {error}
              </div>
            )}

            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" style={S.input} autoFocus />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" style={S.input} />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for visit (optional)" style={S.input} />
            <button onClick={book}
              style={{ width: '100%', padding: 13, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
              Confirm appointment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
