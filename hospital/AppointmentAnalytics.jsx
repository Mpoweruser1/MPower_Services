// hospital/AppointmentAnalytics.jsx — NEW
// No-show detection is genuinely computed, not stored — confirmed
// real: opd_appointment_slots only has 'open'/'booked'/'completed'
// statuses, no explicit no-show state. A slot is a real no-show when
// its slot_time has passed while still 'booked' (never checked in).
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import TierGate from '../shared/TierGate';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

function AppointmentAnalyticsContent() {
  const { tenant } = useTenant();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const { data: days } = await supabase
      .from('opd_appointment_days').select('id, doctor_id, doctors(designation, users(full_name))')
      .eq('app_id', tenant.appId).gte('appointment_date', cutoff.toISOString().slice(0, 10));
    const dayIds = (days || []).map((d) => d.id);
    const dayMap = Object.fromEntries((days || []).map((d) => [d.id, d]));

    if (dayIds.length === 0) { setSlots([]); setLoading(false); return; }

    const { data: slotRows } = await supabase
      .from('opd_appointment_slots').select('id, slot_time, status, booked_name, appointment_day_id')
      .in('appointment_day_id', dayIds).eq('status', 'booked')
      .lt('slot_time', new Date().toISOString()); // only slots whose time has already passed

    setSlots((slotRows || []).map((s) => ({ ...s, doctor: dayMap[s.appointment_day_id] })));
    setLoading(false);
  }

  const byDoctor = {};
  slots.forEach((s) => {
    const name = s.doctor?.doctors?.users?.full_name || 'Unknown';
    if (!byDoctor[name]) byDoctor[name] = 0;
    byDoctor[name]++;
  });

  function exportCsv() {
    const rows = [
      ['Doctor', 'Slot time', 'Booked name'],
      ...slots.map((s) => [s.doctor?.doctors?.users?.full_name || 'Unknown', new Date(s.slot_time).toISOString(), s.booked_name || '']),
    ].map((r) => r.join(',')).join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `appointment_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (loading) return <div style={{ ...S.page, textAlign: 'center', paddingTop: 60 }}><p style={{ color: 'rgba(255,255,255,0.3)' }}>Loading...</p></div>;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 6 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Analytics</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Appointment Analytics</h1>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>Last 30 days &middot; no-show = booked slot whose time passed with no check-in</p>

        <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#E05A5A' }}>{slots.length}</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>No-shows in the last 30 days</p>
        </div>

        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>By doctor</p>
          {Object.entries(byDoctor).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13 }}>
              <span style={{ color: '#fff' }}>{name}</span>
              <span style={{ color: '#E05A5A', fontWeight: 600 }}>{count} no-shows</span>
            </div>
          ))}
          {slots.length === 0 && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>No no-shows detected in this period.</p>}
        </div>

        <button onClick={exportCsv}
          style={{ width: '100%', marginTop: 12, padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          &#128229; Export as CSV
        </button>

      </div>
      <HospitalNav />
      <BugReporter screenName="appointment_analytics" />
    </div>
  );
}

export default function AppointmentAnalytics() {
  return (
    <TierGate requiredTier="advanced" featureName="Appointment Analytics" NavComponent={HospitalNav}>
      <AppointmentAnalyticsContent />
    </TierGate>
  );
}
