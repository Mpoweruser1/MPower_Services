// school/BirthdayWishes.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

function monthDay(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

export default function BirthdayWishes() {
  const { tenant } = useTenant();
  const [today, setToday] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState({});

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    const { data: students } = await supabase
      .from('students')
      .select('id, full_name, dob, parent_phone, classes(class_name), section')
      .eq('app_id', tenant.appId).eq('status', 'active');

    const now = new Date();
    const todayMD = `${now.getMonth() + 1}-${now.getDate()}`;

    const withBirthday = (students || []).filter((s) => s.dob);
    const todayList = withBirthday.filter((s) => monthDay(s.dob) === todayMD);

    const next30 = withBirthday
      .map((s) => {
        const dob = new Date(s.dob);
        const thisYear = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
        if (thisYear < now) thisYear.setFullYear(now.getFullYear() + 1);
        const daysAway = Math.ceil((thisYear - now) / (1000 * 60 * 60 * 24));
        return { ...s, daysAway, nextDate: thisYear };
      })
      .filter((s) => s.daysAway > 0 && s.daysAway <= 30)
      .sort((a, b) => a.daysAway - b.daysAway);

    const { data: logs } = await supabase
      .from('birthday_wish_log').select('student_id, status')
      .eq('app_id', tenant.appId).eq('wish_date', now.toISOString().slice(0, 10));
    const logMap = Object.fromEntries((logs || []).map((l) => [l.student_id, l.status]));

    setToday(todayList.map((s) => ({ ...s, sentStatus: logMap[s.id] || 'pending' })));
    setUpcoming(next30);
    setLoading(false);
  }

  async function sendWish(student) {
    setSending((s) => ({ ...s, [student.id]: true }));
    try {
      await supabase.functions.invoke('send-whatsapp', {
        body: {
          type: 'birthday_wish', phone: student.parent_phone,
          studentName: student.full_name, className: student.classes?.class_name,
        },
      });
      await supabase.from('birthday_wish_log').upsert({
        app_id: tenant.appId, student_id: student.id, wish_type: 'student',
        wish_date: new Date().toISOString().slice(0, 10),
        sent_at: new Date().toISOString(), status: 'sent',
      }, { onConflict: 'student_id,wish_type,wish_date' });
    } catch {
      // leave as pending, staff can retry
    }
    setSending((s) => ({ ...s, [student.id]: false }));
    load();
  }

  async function sendAllPending() {
    const pending = today.filter((s) => s.sentStatus !== 'sent');
    for (const s of pending) await sendWish(s);
  }

  if (loading) return <div style={{ ...S.page, textAlign: 'center', paddingTop: 60 }}><p style={{ color: 'rgba(255,255,255,0.3)' }}>Loading...</p></div>;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Celebrations</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>🎂 Birthday Wishes</h1>
        </div>

        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, margin: 0 }}>Today ({today.length})</p>
            {today.some((s) => s.sentStatus !== 'sent') && (
              <button onClick={sendAllPending}
                style={{ padding: '6px 14px', border: 'none', borderRadius: 7, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
                Send all pending
              </button>
            )}
          </div>
          {today.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>No birthdays today.</p>
          ) : (
            today.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, color: '#fff' }}>🎉 {s.full_name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{s.classes?.class_name}-{s.section}</p>
                </div>
                {s.sentStatus === 'sent' ? (
                  <span style={{ fontSize: 11, color: '#6AAA90', fontWeight: 600 }}>✓ Sent</span>
                ) : (
                  <button onClick={() => sendWish(s)} disabled={sending[s.id]}
                    style={{ padding: '5px 12px', border: '1px solid rgba(232,160,32,0.3)', borderRadius: 6, background: 'rgba(232,160,32,0.08)', color: '#E8A020', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                    {sending[s.id] ? 'Sending...' : 'Send wish'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div style={S.card}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Next 30 days</p>
          {upcoming.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>No birthdays in the next 30 days.</p>
          ) : (
            upcoming.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
                <span style={{ color: '#fff' }}>{s.full_name} · {s.classes?.class_name}-{s.section}</span>
                <span style={{ color: 'rgba(255,255,255,0.45)' }}>{s.nextDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · in {s.daysAway}d</span>
              </div>
            ))
          )}
        </div>

      </div>
      <SchoolNav />
      <BugReporter screenName="birthday_wishes" />
    </div>
  );
}
