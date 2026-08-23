// hospital/OpdAppointments.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import PatientSelector from '../shared/PatientSelector';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', width: '100%' },
  select: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
};

export default function OpdAppointments() {
  const { tenant } = useTenant();
  const [days, setDays]         = useState([]);
  const [doctors, setDoctors]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [slots, setSlots]       = useState({});
  const [sending, setSending]   = useState(false);
  const [message, setMessage]   = useState('');
  const [checkingInSlot, setCheckingInSlot] = useState(null);
  const [checkInPatient, setCheckInPatient] = useState(null);

  const [form, setForm] = useState({
    doctor_id: '', appointment_date: new Date().toISOString().slice(0, 10),
    start_time: '09:00', slot_minutes: '15', slot_count: '16',
  });

  useEffect(() => {
    if (tenant?.appId) { loadDays(); loadDoctors(); }
  }, [tenant?.appId]);

  async function loadDoctors() {
    const { data } = await supabase.from('doctors').select('id, designation, users(full_name)').eq('app_id', tenant.appId);
    setDoctors(data || []);
    if (data?.length > 0) setForm((f) => ({ ...f, doctor_id: data[0].id }));
  }

  async function loadDays() {
    setLoading(true);
    const { data } = await supabase
      .from('opd_appointment_days').select('id, appointment_date, doctor_id, doctors(designation, users(full_name))')
      .eq('app_id', tenant.appId).order('appointment_date', { ascending: false });
    setDays(data || []);
    setLoading(false);
  }

  async function loadSlots(dayId) {
    const { data } = await supabase
      .from('opd_appointment_slots').select('id, slot_time, status, booked_name, booked_phone, reason, patient_id')
      .eq('appointment_day_id', dayId).order('slot_time');
    setSlots((prev) => ({ ...prev, [dayId]: data || [] }));
  }

  function toggleExpand(dayId) {
    if (expandedId === dayId) { setExpandedId(null); return; }
    setExpandedId(dayId);
    if (!slots[dayId]) loadSlots(dayId);
  }

  async function createDay() {
    if (!form.doctor_id) { setMessage('Select a doctor first.'); return; }
    const count = parseInt(form.slot_count);
    const duration = parseInt(form.slot_minutes);
    if (isNaN(count) || count < 1 || isNaN(duration) || duration < 1) {
      setMessage('Enter valid slot count and duration.');
      return;
    }

    const { data: day, error } = await supabase.from('opd_appointment_days').insert({
      app_id: tenant.appId,
      doctor_id: form.doctor_id,
      appointment_date: form.appointment_date,
      created_by: tenant.userRowId,
    }).select().single();

    if (error) { setMessage('Failed to create appointment day.'); return; }

    const [h, m] = form.start_time.split(':').map(Number);
    const rows = Array.from({ length: count }, (_, i) => {
      const totalMinutes = h * 60 + m + i * duration;
      const slotDate = new Date(`${form.appointment_date}T00:00:00`);
      slotDate.setMinutes(totalMinutes);
      return { appointment_day_id: day.id, slot_time: slotDate.toISOString(), status: 'open' };
    });
    await supabase.from('opd_appointment_slots').insert(rows);

    setShowCreate(false);
    setMessage(`✅ Clinic day created with ${count} slots.`);
    loadDays();
  }

  async function completeCheckIn(dayId, slotId) {
    if (!checkInPatient) { setMessage('Select or register the patient first.'); return; }
    await supabase.from('opd_appointment_slots')
      .update({ status: 'completed', patient_id: checkInPatient.id })
      .eq('id', slotId);
    setCheckingInSlot(null);
    setCheckInPatient(null);
    setMessage(`✅ Checked in — linked to ${checkInPatient.full_name}`);
    loadSlots(dayId);
  }

  async function shareLink(day) {
    const bookingUrl = `${window.location.origin}/opd-appointment/${day.id}`;
    setSending(true);
    setMessage('');
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setMessage(`✅ Link copied: ${bookingUrl} — share via WhatsApp broadcast, notice board, or your own channels.`);
    } catch {
      setMessage(`Booking link: ${bookingUrl}`);
    }
    setSending(false);
  }

  const doctorName = (d) => `${d.users?.full_name || 'Unknown'}${d.designation ? ` (${d.designation})` : ''}`;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>OPD · అపాయింట్‌మెంట్</p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>OPD Appointments</h1>
          </div>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
            + New clinic day
          </button>
        </div>

        {message && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#6AAA90', wordBreak: 'break-all' }}>
            {message}
          </div>
        )}

        {doctors.length === 0 && !showCreate && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#E8A020' }}>No doctor profiles found — set one up in Manage Doctors first.</p>
          </div>
        )}

        {showCreate && (
          <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
            <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>New clinic day</p>
            <div style={{ marginBottom: 10 }}>
              <label style={S.label}>Doctor</label>
              <select value={form.doctor_id} onChange={(e) => setForm((f) => ({ ...f, doctor_id: e.target.value }))} style={S.select}>
                {doctors.map((d) => <option key={d.id} value={d.id}>{doctorName(d)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={S.label}>Date</label>
              <input type="date" value={form.appointment_date} onChange={(e) => setForm((f) => ({ ...f, appointment_date: e.target.value }))} style={S.input} />
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
              <button onClick={createDay}
                style={{ flex: 2, padding: 11, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                Create clinic day + slots
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 32 }}>Loading...</p>
        ) : days.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#161618', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>📅</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No clinic days scheduled yet.</p>
          </div>
        ) : (
          days.map((day) => {
            const daySlots = slots[day.id] || [];
            const bookedCount = daySlots.filter((s) => s.status === 'booked').length;
            const isExpanded = expandedId === day.id;
            return (
              <div key={day.id} style={S.card}>
                <div onClick={() => toggleExpand(day.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{doctorName(day.doctors || {})}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      {new Date(day.appointment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {isExpanded && ` · ${bookedCount}/${daySlots.length} booked`}
                    </p>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button onClick={() => shareLink(day)} disabled={sending}
                      style={{ width: '100%', padding: 10, marginBottom: 12, border: '1px solid rgba(106,170,144,0.3)', borderRadius: 8, background: 'rgba(106,170,144,0.08)', color: '#6AAA90', cursor: sending ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                      🔗 Copy booking link to share
                    </button>
                    {daySlots.map((slot) => (
                      <div key={slot.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)' }}>{new Date(slot.slot_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                          {slot.status === 'open' && <span style={{ color: 'rgba(255,255,255,0.25)' }}>Open</span>}
                          {slot.status === 'completed' && <span style={{ color: '#6AAA90' }}>✓ Checked in</span>}
                          {slot.status === 'booked' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: '#E8A020' }}>{slot.booked_name} · {slot.booked_phone}</span>
                              <button onClick={() => { setCheckingInSlot(checkingInSlot === slot.id ? null : slot.id); setCheckInPatient(null); }}
                                style={{ padding: '4px 10px', border: '1px solid rgba(90,154,223,0.3)', borderRadius: 6, background: 'rgba(90,154,223,0.08)', color: '#5A9ADF', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                                Check in
                              </button>
                            </div>
                          )}
                        </div>
                        {checkingInSlot === slot.id && (
                          <div style={{ marginTop: 10, padding: 12, background: '#111113', borderRadius: 8 }}>
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                              Link to their patient record — search by phone ({slot.booked_phone}) if they've visited before, or register them as new first.
                            </p>
                            <PatientSelector
                              selectedPatient={checkInPatient}
                              onSelect={setCheckInPatient}
                              onClear={() => setCheckInPatient(null)}
                              label="Find patient"
                            />
                            {checkInPatient && (
                              <button onClick={() => completeCheckIn(day.id, slot.id)}
                                style={{ width: '100%', marginTop: 10, padding: 9, border: 'none', borderRadius: 7, background: '#6AAA90', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                                ✓ Confirm check-in
                              </button>
                            )}
                            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                              Not found? <a href="/hospital/patients/new" style={{ color: '#5A9ADF' }}>Register them as a new patient</a>, then come back and check in.
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

      </div>
      <HospitalNav />
      <BugReporter screenName="opd_appointments" />
    </div>
  );
}
