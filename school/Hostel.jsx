// school/Hostel.jsx — FINAL (Supabase wired)
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';
import PermissionGate from '../shared/PermissionGate';

const MEALS = ['Breakfast', 'Lunch', 'Dinner'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  textarea: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' },
};

function HostelScreen() {
  const { tenant } = useTenant();
  const [tab, setTab]               = useState('meals');
  const [meal, setMeal]             = useState('Dinner');
  const [hostelStudents, setHostelStudents] = useState([]);
  const [mealAttendance, setMealAttendance] = useState({});
  const [outings, setOutings]       = useState([]);
  const [medicalLog, setMedicalLog] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [savingMeal, setSavingMeal] = useState(false);
  const [showAddOuting, setShowAddOuting]   = useState(false);
  const [showAddMedical, setShowAddMedical] = useState(false);
  const [newOuting, setNewOuting]   = useState({ student_id: '', reason: '', return_expected: '' });
  const [newMedical, setNewMedical] = useState({ student_id: '', issue: '', action_taken: '' });
  const [saving, setSaving]         = useState(false);
  const [outingError, setOutingError]   = useState('');
  const [medicalError, setMedicalError] = useState('');

  // Rooms, who is in them, and the hostel fee rate for each room type + sharing.
  // Sharing = number of beds in the room. Only the principal can change rates.
  const [rooms, setRooms]               = useState([]);
  const [allocations, setAllocations]   = useState([]);
  const [rates, setRates]               = useState([]);
  const [newRoom, setNewRoom]           = useState({ room_no: '', total_beds: '2', room_type: '' });
  const [newRate, setNewRate]           = useState({ room_type: '', sharing: '2', amount: '' });
  const [editingRoom, setEditingRoom]   = useState(null); // { id, total_beds, room_type }
  const [alloc, setAlloc]               = useState({ student_id: '', room_id: '', bed: '' });
  const [roomMsg, setRoomMsg]           = useState('');
  const [roomErr, setRoomErr]           = useState('');
  const canEditRates = tenant?.role === 'principal';

  useEffect(() => {
    if (tenant?.appId) loadAll();
  }, [tenant?.appId]);

  async function loadAll() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    // Load hostel students
    const { data: students } = await supabase
      .from('students')
      .select('id, full_name, sid, section')
      .eq('app_id', tenant.appId)
      .eq('student_type', 'hostel')
      .eq('status', 'active')
      .order('full_name');

    setHostelStudents(students || []);

    // Load today's meal attendance
    // meal_date, not date — confirmed real column (and real unique
    // constraint: meal_attendance_student_id_meal_date_meal_type_key).
    // This was silently failing before, since 'date' isn't a real
    // column on this table at all.
    const { data: mealData, error: mealErr } = await supabase
      .from('meal_attendance')
      .select('student_id, meal_type, present')
      .eq('meal_date', today)
      .in('student_id', (students || []).map((s) => s.id));
    if (mealErr) console.error('Loading meal attendance failed:', mealErr);

    const mealMap = {};
    (mealData || []).forEach((m) => {
      mealMap[`${m.student_id}_${m.meal_type}`] = m.present;
    });
    setMealAttendance(mealMap);

    // Load outings
    const { data: outingData } = await supabase
      .from('hostel_outings')
      .select('*, students(full_name, sid)')
      .in('student_id', (students || []).map((s) => s.id))
      .eq('status', 'out')
      .order('out_date', { ascending: false });

    setOutings(outingData || []);

    // Load medical log
    const { data: medData } = await supabase
      .from('hostel_medical_log')
      .select('*, students(full_name)')
      .in('student_id', (students || []).map((s) => s.id))
      .order('reported_at', { ascending: false })
      .limit(20);

    setMedicalLog(medData || []);
    await loadRooms();
    setLoading(false);
  }

  async function loadRooms() {
    const [roomRes, rateRes] = await Promise.all([
      supabase.from('hostel_rooms').select('id, room_no, total_beds, room_type').eq('app_id', tenant.appId).order('room_no'),
      supabase.from('hostel_room_rates').select('id, room_type, sharing, amount, active').eq('app_id', tenant.appId).order('room_type').order('sharing'),
    ]);
    if (roomRes.error) console.error('Loading hostel rooms failed:', roomRes.error);
    if (rateRes.error) console.error('Loading hostel rates failed:', rateRes.error);
    const roomList = roomRes.data || [];
    setRooms(roomList);
    setRates(rateRes.data || []);
    if (roomList.length === 0) { setAllocations([]); return; }
    const { data: allocData, error: allocErr } = await supabase.from('hostel_allocations')
      .select('student_id, room_id, bed_label').in('room_id', roomList.map((r) => r.id));
    if (allocErr) console.error('Loading hostel allocations failed:', allocErr);
    setAllocations(allocData || []);
  }

  function flashRoom(setter, text) { setter(text); setTimeout(() => setter(''), 5000); }

  function rateFor(room) {
    if (!room.room_type) return null;
    return rates.find((r) => r.active && r.room_type.trim().toLowerCase() === room.room_type.trim().toLowerCase() && Number(r.sharing) === Number(room.total_beds)) || null;
  }

  async function addRoom() {
    const beds = parseInt(newRoom.total_beds, 10);
    if (!newRoom.room_no.trim()) { flashRoom(setRoomErr, 'Room number is required.'); return; }
    if (isNaN(beds) || beds < 1 || beds > 50) { flashRoom(setRoomErr, 'Enter the number of beds (1–50).'); return; }
    if (rooms.some((r) => r.room_no.trim().toLowerCase() === newRoom.room_no.trim().toLowerCase())) { flashRoom(setRoomErr, `Room ${newRoom.room_no.trim()} already exists.`); return; }
    setSaving(true);
    const { error } = await supabase.from('hostel_rooms').insert({
      app_id: tenant.appId, room_no: newRoom.room_no.trim(), total_beds: beds, room_type: newRoom.room_type.trim() || null,
    });
    setSaving(false);
    if (error) { console.error('Adding hostel room failed:', error); flashRoom(setRoomErr, error.message || 'Could not add the room.'); return; }
    setNewRoom({ room_no: '', total_beds: newRoom.total_beds, room_type: newRoom.room_type });
    flashRoom(setRoomMsg, '✅ Room added');
    loadRooms();
  }

  async function saveRoomEdit() {
    const beds = parseInt(editingRoom.total_beds, 10);
    const inRoom = allocations.filter((a) => a.room_id === editingRoom.id).length;
    if (isNaN(beds) || beds < 1 || beds > 50) { flashRoom(setRoomErr, 'Enter the number of beds (1–50).'); return; }
    if (beds < inRoom) { flashRoom(setRoomErr, `${inRoom} student${inRoom === 1 ? ' is' : 's are'} in this room — move them out before reducing the beds.`); return; }
    const { error } = await supabase.from('hostel_rooms')
      .update({ total_beds: beds, room_type: editingRoom.room_type.trim() || null }).eq('id', editingRoom.id);
    if (error) { console.error('Editing hostel room failed:', error); flashRoom(setRoomErr, error.message || 'Could not save the room.'); return; }
    setEditingRoom(null);
    flashRoom(setRoomMsg, '✅ Room saved');
    loadRooms();
  }

  async function allocateBed() {
    if (!alloc.student_id || !alloc.room_id) { flashRoom(setRoomErr, 'Choose a student and a room.'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('allocate_hostel_bed', { p_student: alloc.student_id, p_room: alloc.room_id, p_bed: alloc.bed });
    setSaving(false);
    if (error) { console.error('Allocating hostel bed failed:', error); flashRoom(setRoomErr, error.message || 'Could not allocate the room.'); return; }
    setAlloc({ student_id: '', room_id: '', bed: '' });
    flashRoom(setRoomMsg, '✅ Room allocated');
    loadRooms();
  }

  async function removeAllocation(studentId, name) {
    if (!window.confirm(`Take ${name} out of their room? Their hostel fee will not be worked out until they are in a room again.`)) return;
    const { error } = await supabase.from('hostel_allocations').delete().eq('student_id', studentId);
    if (error) { console.error('Removing hostel allocation failed:', error); flashRoom(setRoomErr, error.message || 'Could not remove.'); return; }
    loadRooms();
  }

  async function addRate() {
    const sharing = parseInt(newRate.sharing, 10);
    if (!newRate.room_type.trim()) { flashRoom(setRoomErr, 'Room type is required (for example AC or Non-AC).'); return; }
    if (isNaN(sharing) || sharing < 1) { flashRoom(setRoomErr, 'Enter the sharing (beds per room).'); return; }
    if (newRate.amount === '' || Number(newRate.amount) < 0) { flashRoom(setRoomErr, 'Enter the fee amount.'); return; }
    setSaving(true);
    const { error } = await supabase.from('hostel_room_rates').insert({
      app_id: tenant.appId, room_type: newRate.room_type.trim(), sharing, amount: Number(newRate.amount),
    });
    setSaving(false);
    if (error) {
      console.error('Adding hostel rate failed:', error);
      flashRoom(setRoomErr, error.code === '23505' ? 'A rate for this room type and sharing already exists.'
        : /row-level security/i.test(error.message || '') ? 'Only the principal can change hostel rates.' : (error.message || 'Could not add the rate.'));
      return;
    }
    setNewRate({ room_type: newRate.room_type, sharing: '2', amount: '' });
    flashRoom(setRoomMsg, '✅ Rate added');
    loadRooms();
  }

  async function updateRate(rate, patch) {
    const { error } = await supabase.from('hostel_room_rates').update(patch).eq('id', rate.id);
    if (error) { console.error('Updating hostel rate failed:', error); flashRoom(setRoomErr, /row-level security/i.test(error.message || '') ? 'Only the principal can change hostel rates.' : (error.message || 'Could not update the rate.')); return; }
    loadRooms();
  }

  function isMealPresent(studentId) {
    const key = `${studentId}_${meal}`;
    // Default is present — only absent if explicitly marked
    return mealAttendance[key] !== false;
  }

  async function toggleMealAttendance(studentId) {
    const key      = `${studentId}_${meal}`;
    const today    = new Date().toISOString().slice(0, 10);
    const current  = isMealPresent(studentId);
    const newValue = !current;

    setMealAttendance((prev) => ({ ...prev, [key]: newValue }));

    // meal_date, not date — same fix as the read side above. Also
    // previously had no error check at all: if this upsert failed
    // (as it always would have, given the wrong column), the toggle
    // still showed as successfully changed on screen with nothing
    // actually saved. Now reverts the optimistic update on failure.
    const { error } = await supabase.from('meal_attendance').upsert({
      student_id: studentId,
      meal_date:  today,
      meal_type:  meal,
      present:    newValue,
      marked_by:  tenant.userRowId,
    }, { onConflict: 'student_id,meal_date,meal_type' });

    if (error) {
      console.error('Saving meal attendance failed:', error);
      setMealAttendance((prev) => ({ ...prev, [key]: current })); // revert
    }
  }

  async function addOuting() {
    setOutingError('');
    if (!newOuting.student_id) { setOutingError('Select a student.'); return; }
    if (!newOuting.reason.trim()) { setOutingError('Reason is required.'); return; }
    if (!newOuting.return_expected) { setOutingError('Expected return date/time required.'); return; }

    if (new Date(newOuting.return_expected) <= new Date()) {
      setOutingError('Expected return must be in the future.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('hostel_outings').insert({
      student_id:       newOuting.student_id,
      reason:           newOuting.reason.trim(),
      out_date:         new Date().toISOString().slice(0, 10),
      out_time:         new Date().toTimeString().slice(0, 5),
      return_expected:  newOuting.return_expected,
      approved_by:      tenant.userRowId,
      status:           'out',
    });

    if (error) { setOutingError('Failed to log outing.'); setSaving(false); return; }

    setNewOuting({ student_id: '', reason: '', return_expected: '' });
    setShowAddOuting(false);
    setSaving(false);
    loadAll();
  }

  async function markReturned(outingId) {
    const { error: retErr } = await supabase.from('hostel_outings').update({ status: 'returned' }).eq('id', outingId);
    if (retErr) { console.error('Marking outing returned failed:', retErr); alert(`Could not mark as returned: ${retErr.message || 'please try again.'}`); return; }
    loadAll();
  }

  async function addMedical() {
    setMedicalError('');
    if (!newMedical.student_id)          { setMedicalError('Select a student.'); return; }
    if (!newMedical.issue.trim())         { setMedicalError('Issue is required.'); return; }
    if (!newMedical.action_taken.trim())  { setMedicalError('Action taken is required.'); return; }

    setSaving(true);
    const { data: inserted, error } = await supabase.from('hostel_medical_log').insert({
      student_id:    newMedical.student_id,
      issue:         newMedical.issue.trim(),
      action_taken:  newMedical.action_taken.trim(),
      reported_at:   new Date().toISOString(),
      notified_parent: false,
    }).select().single();

    if (error) { setMedicalError('Failed to log incident.'); setSaving(false); return; }

    // WhatsApp to parent
    await supabase.functions.invoke('send-whatsapp', {
      body: {
        type:       'hostel_medical_alert',
        studentId:  newMedical.student_id,
        issue:      newMedical.issue,
        actionTaken: newMedical.action_taken,
      },
    });

    // Update by this specific row's id — order()/limit() are not valid
    // on an UPDATE request, so the previous version silently marked
    // notified_parent on every past incident for this student, not
    // just this one.
    const { error: notifyErr } = await supabase.from('hostel_medical_log')
      .update({ notified_parent: true })
      .eq('id', inserted.id);
    // Non-blocking: the incident itself is already saved and the
    // parent message already sent — but a failed flag update would
    // make it look like the parent was never told.
    if (notifyErr) console.error('Updating notified_parent flag failed:', notifyErr);

    setNewMedical({ student_id: '', issue: '', action_taken: '' });
    setShowAddMedical(false);
    setSaving(false);
    loadAll();
  }

  const absentees = hostelStudents.filter((s) => !isMealPresent(s.id));

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Hostel · హాస్టల్
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Hostel Management</h1>
          {!loading && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' }}>
              {hostelStudents.length} hostel students
            </p>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { k: 'meals',   l: 'Meal attendance' },
            { k: 'outings', l: `Outings (${outings.length})` },
            { k: 'medical', l: 'Medical log' },
            { k: 'rooms',   l: 'Rooms & rates' },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        ) : (
          <>
            {/* Meal attendance */}
            {tab === 'meals' && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                  {MEALS.map((m) => (
                    <button key={m} onClick={() => setMeal(m)}
                      style={{ padding: '7px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: meal === m ? 'none' : '1px solid rgba(255,255,255,0.1)', background: meal === m ? '#5A9ADF' : 'transparent', color: meal === m ? '#fff' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: meal === m ? 600 : 400 }}>
                      {m}
                    </button>
                  ))}
                </div>

                <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#6AAA90' }}>
                    Default: all {hostelStudents.length} students present for {meal}.
                    Tap a name only if they did NOT eat.
                  </p>
                </div>

                {absentees.length > 0 && (
                  <div style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
                      {absentees.length} absent for {meal} today
                    </p>
                  </div>
                )}

                {hostelStudents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                      No hostel students found. Students with type "Hostel" will appear here.
                    </p>
                  </div>
                ) : (
                  hostelStudents.map((student) => {
                    const present = isMealPresent(student.id);
                    return (
                      <div key={student.id} onClick={() => toggleMealAttendance(student.id)}
                        style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: `1px solid ${present ? 'rgba(255,255,255,0.07)' : 'rgba(224,90,90,0.2)'}`, background: present ? '#161618' : 'rgba(224,90,90,0.05)' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{student.full_name}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{student.sid}{student.section ? ` · ${student.section}` : ''}</p>
                        </div>
                        <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 500, background: present ? 'rgba(106,170,144,0.12)' : 'rgba(224,90,90,0.12)', color: present ? '#6AAA90' : '#E05A5A' }}>
                          {present ? 'Present' : 'Absent — tap to undo'}
                        </span>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* Outings */}
            {tab === 'outings' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  <button onClick={() => setShowAddOuting(true)}
                    style={{ padding: '8px 16px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                    + Log outing
                  </button>
                </div>

                {outings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>No students currently out.</p>
                  </div>
                ) : (
                  outings.map((o) => (
                    <div key={o.id} style={S.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{o.students?.full_name}</p>
                          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                            {o.reason} · Out: {o.out_date} {o.out_time}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                            Expected return: {new Date(o.return_expected).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(232,160,32,0.12)', color: '#E8A020', fontWeight: 500 }}>
                          Out
                        </span>
                      </div>
                      <button onClick={() => markReturned(o.id)}
                        style={{ width: '100%', padding: '8px 0', background: '#6AAA90', color: '#111113', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                        ✓ Mark returned
                      </button>
                    </div>
                  ))
                )}
              </>
            )}

            {/* Medical log */}
            {tab === 'medical' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  <button onClick={() => setShowAddMedical(true)}
                    style={{ padding: '8px 16px', background: '#E05A5A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                    + Log medical incident
                  </button>
                </div>

                {medicalLog.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>No medical incidents logged.</p>
                  </div>
                ) : (
                  medicalLog.map((m) => (
                    <div key={m.id} style={S.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{m.students?.full_name} — {m.issue}</p>
                        {m.notified_parent && (
                          <span style={{ fontSize: 12, color: '#6AAA90', flexShrink: 0 }}>✓ Parent notified</span>
                        )}
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{m.action_taken}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{new Date(m.reported_at).toLocaleString('en-IN')}</p>
                    </div>
                  ))
                )}
              </>
            )}
            {/* Rooms & rates */}
            {tab === 'rooms' && (() => {
              const allocatedIds = new Set(allocations.map((a) => a.student_id));
              const unallocated = hostelStudents.filter((s) => !allocatedIds.has(s.id));
              const nameOf = (id) => hostelStudents.find((s) => s.id === id)?.full_name || 'Student';
              const typeSuggestions = [...new Set([...rooms.map((r) => r.room_type), ...rates.map((r) => r.room_type)].filter(Boolean))];
              return (
                <>
                  {roomErr && <div role="alert" style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>⚠ {roomErr}</div>}
                  {roomMsg && <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>{roomMsg}</div>}

                  {unallocated.length > 0 && rooms.length > 0 && (
                    <div style={{ background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#E8A020' }}>
                      {unallocated.length} hostel student{unallocated.length === 1 ? ' has' : 's have'} no room yet — their hostel fee cannot be worked out until they are in a room.
                    </div>
                  )}

                  {/* Allocate */}
                  <div style={S.card}>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#E8A020', fontWeight: 600 }}>Put a student in a room</p>
                    <div style={{ display: 'grid', gap: 10 }}>
                      <select aria-label="Hostel student" value={alloc.student_id} onChange={(e) => setAlloc((a) => ({ ...a, student_id: e.target.value }))} style={{ ...S.input, cursor: 'pointer' }}>
                        <option value="">-- Select student --</option>
                        {hostelStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.sid}){allocatedIds.has(s.id) ? ' — has a room' : ''}</option>)}
                      </select>
                      <select aria-label="Room" value={alloc.room_id} onChange={(e) => setAlloc((a) => ({ ...a, room_id: e.target.value }))} style={{ ...S.input, cursor: 'pointer' }}>
                        <option value="">-- Select room --</option>
                        {rooms.map((r) => {
                          const used = allocations.filter((a) => a.room_id === r.id).length;
                          return <option key={r.id} value={r.id} disabled={used >= r.total_beds}>Room {r.room_no}{r.room_type ? ` · ${r.room_type}` : ''} · {r.total_beds}-sharing · {used}/{r.total_beds}{used >= r.total_beds ? ' (full)' : ''}</option>;
                        })}
                      </select>
                      <input aria-label="Bed label" value={alloc.bed} onChange={(e) => setAlloc((a) => ({ ...a, bed: e.target.value }))} placeholder="Bed label (optional), e.g. B2" style={S.input} />
                      <button onClick={allocateBed} disabled={saving}
                        style={{ padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        {saving ? 'Saving...' : 'Allocate room'}
                      </button>
                    </div>
                  </div>

                  {/* Rooms */}
                  {rooms.length === 0 ? (
                    <div style={{ ...S.card, textAlign: 'center' }}><p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>No rooms yet. Add your first room below.</p></div>
                  ) : rooms.map((r) => {
                    const here = allocations.filter((a) => a.room_id === r.id);
                    const rate = rateFor(r);
                    return (
                      <div key={r.id} style={S.card}>
                        {editingRoom?.id === r.id ? (
                          <div>
                            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Room {r.room_no}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, marginBottom: 8 }}>
                              <input aria-label="Room type" list="hostel-room-types" value={editingRoom.room_type} onChange={(e) => setEditingRoom((x) => ({ ...x, room_type: e.target.value }))} placeholder="Room type, e.g. AC" style={S.input} />
                              <input aria-label="Beds" inputMode="numeric" value={editingRoom.total_beds} onChange={(e) => setEditingRoom((x) => ({ ...x, total_beds: e.target.value.replace(/\D/g, '') }))} style={S.input} />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => setEditingRoom(null)} style={{ flex: 1, padding: 9, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Cancel</button>
                              <button onClick={saveRoomEdit} style={{ flex: 2, padding: 9, border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Save</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                              <div>
                                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>Room {r.room_no}</p>
                                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                                  {r.room_type || 'No room type'} · {r.total_beds}-sharing · {here.length}/{r.total_beds} occupied
                                </p>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                {rate
                                  ? <span style={{ fontSize: 13, color: '#E8A020', fontWeight: 600 }}>₹{Number(rate.amount).toLocaleString('en-IN')}</span>
                                  : <span style={{ fontSize: 11, color: '#E8A020' }}>{r.room_type ? 'No rate set' : 'Set room type'}</span>}
                                <br />
                                <button onClick={() => setEditingRoom({ id: r.id, total_beds: String(r.total_beds), room_type: r.room_type || '' })}
                                  style={{ marginTop: 4, padding: '2px 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>Edit</button>
                              </div>
                            </div>
                            {here.map((a) => (
                              <div key={a.student_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.75)' }}>
                                <span>{nameOf(a.student_id)}{a.bed_label ? ` · bed ${a.bed_label}` : ''}</span>
                                <button onClick={() => removeAllocation(a.student_id, nameOf(a.student_id))} aria-label={`Remove ${nameOf(a.student_id)} from room`}
                                  style={{ background: 'none', border: 'none', color: 'rgba(224,90,90,0.7)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })}

                  <datalist id="hostel-room-types">{typeSuggestions.map((t) => <option key={t} value={t} />)}</datalist>

                  {/* Add room */}
                  <div style={S.card}>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#E8A020', fontWeight: 600 }}>Add a room</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8, marginBottom: 10 }}>
                      <input aria-label="Room number" value={newRoom.room_no} onChange={(e) => setNewRoom((r) => ({ ...r, room_no: e.target.value }))} placeholder="Room no" style={S.input} />
                      <input aria-label="New room type" list="hostel-room-types" value={newRoom.room_type} onChange={(e) => setNewRoom((r) => ({ ...r, room_type: e.target.value }))} placeholder="Type (AC / Non-AC)" style={S.input} />
                      <input aria-label="New room beds" inputMode="numeric" value={newRoom.total_beds} onChange={(e) => setNewRoom((r) => ({ ...r, total_beds: e.target.value.replace(/\D/g, '') }))} placeholder="Beds" style={S.input} />
                    </div>
                    <button onClick={addRoom} disabled={saving}
                      style={{ width: '100%', padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#6AAA90', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>+ Add room</button>
                  </div>

                  {/* Rates */}
                  <div style={S.card}>
                    <p style={{ margin: '0 0 4px', fontSize: 12, color: '#E8A020', fontWeight: 600 }}>Hostel fee by room type & sharing</p>
                    <p style={{ margin: '0 0 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      Used by a hostel fee set to "By hostel room type & sharing" on the Fee Structure screen.{!canEditRates && ' Only the principal can change these.'}
                    </p>
                    {rates.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 10px' }}>No rates yet.</p>}
                    {rates.map((rt) => (
                      <div key={rt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: rt.active ? 1 : 0.5 }}>
                        <span>{rt.room_type} · {rt.sharing}-sharing{!rt.active && ' (off)'}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: '#E8A020', fontWeight: 600 }}>₹{Number(rt.amount).toLocaleString('en-IN')}</span>
                          {canEditRates && (
                            <>
                              <button onClick={() => { const v = window.prompt(`New fee for ${rt.room_type}, ${rt.sharing}-sharing:`, rt.amount); if (v !== null && v.trim() !== '' && !isNaN(Number(v)) && Number(v) >= 0) updateRate(rt, { amount: Number(v) }); }}
                                style={{ padding: '2px 8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>Edit</button>
                              <button onClick={() => updateRate(rt, { active: !rt.active })}
                                style={{ padding: '2px 8px', border: `1px solid ${rt.active ? 'rgba(224,90,90,0.3)' : 'rgba(106,170,144,0.3)'}`, borderRadius: 6, background: 'transparent', color: rt.active ? '#E05A5A' : '#6AAA90', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>{rt.active ? 'Off' : 'On'}</button>
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                    {canEditRates && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 8, marginBottom: 10 }}>
                          <input aria-label="Rate room type" list="hostel-room-types" value={newRate.room_type} onChange={(e) => setNewRate((r) => ({ ...r, room_type: e.target.value }))} placeholder="Type (AC / Non-AC)" style={S.input} />
                          <input aria-label="Rate sharing" inputMode="numeric" value={newRate.sharing} onChange={(e) => setNewRate((r) => ({ ...r, sharing: e.target.value.replace(/\D/g, '') }))} placeholder="Sharing" style={S.input} />
                          <input aria-label="Rate amount" inputMode="numeric" value={newRate.amount} onChange={(e) => setNewRate((r) => ({ ...r, amount: e.target.value.replace(/\D/g, '') }))} placeholder="Fee ₹" style={S.input} />
                        </div>
                        <button onClick={addRate} disabled={saving}
                          style={{ width: '100%', padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>+ Add rate</button>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </>
        )}
      </div>

      {/* Add outing modal */}
      {showAddOuting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif' }}>
            <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Log student outing</p>

            {outingError && <p style={{ fontSize: 12, color: '#E05A5A', marginBottom: 10 }}>⚠ {outingError}</p>}

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label htmlFor="outing-student" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Student *</label>
                <select id="outing-student" name="outing-student" value={newOuting.student_id} onChange={(e) => setNewOuting((o) => ({ ...o, student_id: e.target.value }))}
                  style={{ ...S.input, cursor: 'pointer' }}>
                  <option value="">-- Select student --</option>
                  {hostelStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.sid})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="outing-reason" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Reason *</label>
                <input id="outing-reason" name="outing-reason" value={newOuting.reason} onChange={(e) => setNewOuting((o) => ({ ...o, reason: e.target.value }))}
                  placeholder="e.g. Family visit, medical appointment" style={S.input} />
              </div>
              <div>
                <label htmlFor="outing-return-expected" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Expected return *</label>
                <input id="outing-return-expected" name="outing-return-expected" type="datetime-local" value={newOuting.return_expected}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(e) => setNewOuting((o) => ({ ...o, return_expected: e.target.value }))}
                  style={S.input} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowAddOuting(false); setOutingError(''); }}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={addOuting} disabled={saving}
                style={{ flex: 2, padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Log outing →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add medical modal */}
      {showAddMedical && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif' }}>
            <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Log medical incident</p>

            {medicalError && <p style={{ fontSize: 12, color: '#E05A5A', marginBottom: 10 }}>⚠ {medicalError}</p>}

            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label htmlFor="medical-student" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Student *</label>
                <select id="medical-student" name="medical-student" value={newMedical.student_id} onChange={(e) => setNewMedical((m) => ({ ...m, student_id: e.target.value }))}
                  style={{ ...S.input, cursor: 'pointer' }}>
                  <option value="">-- Select student --</option>
                  {hostelStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name} ({s.sid})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="medical-issue" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Issue / complaint *</label>
                <input id="medical-issue" name="medical-issue" value={newMedical.issue} onChange={(e) => setNewMedical((m) => ({ ...m, issue: e.target.value }))}
                  placeholder="e.g. Fever, stomach pain, injury" style={S.input} />
              </div>
              <div>
                <label htmlFor="medical-action-taken" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Action taken *</label>
                <textarea id="medical-action-taken" name="medical-action-taken" value={newMedical.action_taken} onChange={(e) => setNewMedical((m) => ({ ...m, action_taken: e.target.value }))}
                  placeholder="Medicine given, doctor consulted, parent called..." rows={3}
                  style={S.textarea} />
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>
              Parent will be notified via WhatsApp automatically on save.
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={() => { setShowAddMedical(false); setMedicalError(''); }}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={addMedical} disabled={saving}
                style={{ flex: 2, padding: 11, background: saving ? 'rgba(255,255,255,0.08)' : '#E05A5A', color: saving ? 'rgba(255,255,255,0.3)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Log incident & notify parent →'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SchoolNav />
      <BugReporter screenName="hostel" />
    </div>
  );
}

// PILOT — first screen wired to the granular permission system.
// Only 'warden' has an explicit hostel permission in role_permissions;
// owner roles (principal/doctor/developer/support) bypass the check
// entirely via usePermission's OWNER_ROLES. Any other staff role sees
// the access-denied screen, WITH navigation so they aren't stranded.
//
// If this pilot behaves correctly, the same one-line wrapper pattern
// applies to other screens using their own module_code.
export default function Hostel() {
  return (
    <PermissionGate moduleCode="hostel" nav={<SchoolNav />}>
      <HostelScreen />
    </PermissionGate>
  );
}
