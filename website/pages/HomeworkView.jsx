// website/pages/HomeworkView.jsx — NEW
// Public, no-login — same trust model as PTMBooking.jsx: the class_id
// in the URL is a real, unguessable UUID shared only via WhatsApp.
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 480, margin: '0 auto', padding: '32px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 },
};

export default function HomeworkView() {
  const { classId } = useParams();
  const [entries, setEntries] = useState([]);
  const [className, setClassName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (classId) load();
  }, [classId]);

  async function load() {
    setLoading(true);
    const { data: cls } = await supabase.from('classes').select('class_name').eq('id', classId).maybeSingle();
    setClassName(cls?.class_name || '');

    const { data } = await supabase
      .from('homework_entries')
      .select('subject, homework_date, due_date, description, section')
      .eq('class_id', classId)
      .order('homework_date', { ascending: false })
      .limit(30);
    setEntries(data || []);
    setLoading(false);
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>
        <div style={{ marginBottom: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase' }}>Homework Diary</p>
          <h1 style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 600 }}>{className}</h1>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Loading...</p>
        ) : entries.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No homework posted yet.</p>
        ) : (
          entries.map((e, i) => (
            <div key={i} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#E8A020' }}>{e.subject} · Sec {e.section}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  {new Date(e.homework_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {e.due_date && ` · Due ${new Date(e.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>{e.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
