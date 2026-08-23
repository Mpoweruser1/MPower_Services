// school/HomeworkTracking.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const COMMON_SUBJECTS = ['Telugu', 'English', 'Hindi', 'Maths', 'Science', 'Social Studies'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', width: '100%' },
  select: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
};

export default function HomeworkTracking() {
  const { tenant } = useTenant();
  const [classes, setClasses]   = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [sending, setSending]   = useState(false);
  const [message, setMessage]   = useState('');

  const [form, setForm] = useState({
    subject: COMMON_SUBJECTS[0], homework_date: new Date().toISOString().slice(0, 10),
    due_date: '', description: '',
  });

  useEffect(() => {
    if (tenant?.appId) loadClasses();
  }, [tenant?.appId]);

  useEffect(() => {
    if (selectedClass) loadSections();
  }, [selectedClass]);

  useEffect(() => {
    if (selectedClass && selectedSection) loadEntries();
  }, [selectedClass, selectedSection]);

  async function loadClasses() {
    const { data } = await supabase.from('classes').select('id, class_name').eq('app_id', tenant.appId).order('class_order');
    setClasses(data || []);
    if (data?.length > 0) setSelectedClass(data[0].id);
  }

  async function loadSections() {
    const { data } = await supabase
      .from('students').select('section')
      .eq('app_id', tenant.appId).eq('class_id', selectedClass).eq('status', 'active');
    const unique = [...new Set((data || []).map((s) => s.section).filter(Boolean))].sort();
    const combined = [...new Set([...unique, 'A', 'B', 'C'])].sort();
    setSections(combined);
    if (combined.length > 0) setSelectedSection(combined[0]);
  }

  async function loadEntries() {
    setLoading(true);
    const { data } = await supabase
      .from('homework_entries')
      .select('id, subject, homework_date, due_date, description')
      .eq('app_id', tenant.appId).eq('class_id', selectedClass).eq('section', selectedSection)
      .order('homework_date', { ascending: false });
    setEntries(data || []);
    setLoading(false);
  }

  async function postHomework() {
    if (!form.description.trim()) { setMessage('Enter the homework description first.'); return; }
    setSending(true);
    setMessage('');

    const { error } = await supabase.from('homework_entries').insert({
      app_id: tenant.appId, class_id: selectedClass, section: selectedSection,
      subject: form.subject, homework_date: form.homework_date,
      due_date: form.due_date || null, description: form.description.trim(),
      created_by: tenant.userRowId,
    });

    if (error) { setMessage('Failed to save homework.'); setSending(false); return; }

    const className = classes.find((c) => c.id === selectedClass)?.class_name || '';
    const shareUrl = `${window.location.origin}/homework/${selectedClass}`;
    const { data: students } = await supabase
      .from('students').select('parent_phone').eq('app_id', tenant.appId)
      .eq('class_id', selectedClass).eq('section', selectedSection).eq('status', 'active');

    let sent = 0;
    for (const s of (students || [])) {
      if (!s.parent_phone) continue;
      try {
        await supabase.functions.invoke('send-whatsapp', {
          body: {
            type: 'homework_posted', phone: s.parent_phone,
            className, section: selectedSection, subject: form.subject,
            description: form.description.trim(), shareUrl,
          },
        });
        sent++;
      } catch { /* one failure shouldn't block the rest */ }
    }

    setForm((f) => ({ ...f, description: '' }));
    setMessage(`✅ Homework saved and sent to ${sent} parent${sent !== 1 ? 's' : ''}.`);
    setSending(false);
    loadEntries();
  }

  const className = classes.find((c) => c.id === selectedClass)?.class_name || '';

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Homework · ఇంటిపని</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Homework Diary</h1>
        </div>

        {message && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>
            {message}
          </div>
        )}

        <div style={S.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.label}>Class</label>
              <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} style={S.select}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Section</label>
              <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} style={S.select}>
                {sections.map((s) => <option key={s} value={s}>Section {s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
          <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>Post today's homework</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.label}>Subject</label>
              <select value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} style={S.select}>
                {COMMON_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Date</label>
              <input type="date" value={form.homework_date} onChange={(e) => setForm((f) => ({ ...f, homework_date: e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Due date (optional)</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} style={S.input} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>What's assigned</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Complete exercise 4.2, questions 1-10"
              rows={3}
              style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <button onClick={postHomework} disabled={sending}
            style={{ width: '100%', padding: 12, border: 'none', borderRadius: 8, background: sending ? 'rgba(255,255,255,0.08)' : '#E8A020', color: sending ? 'rgba(255,255,255,0.3)' : '#111113', fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
            {sending ? 'Sending...' : `📤 Post & notify — ${className}-${selectedSection}`}
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 20 }}>Loading...</p>
        ) : entries.length > 0 && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
              Recent homework — {className}-{selectedSection}
            </p>
            {entries.map((e) => (
              <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#E8A020' }}>{e.subject}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    {new Date(e.homework_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {e.due_date && ` · Due ${new Date(e.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{e.description}</p>
              </div>
            ))}
          </div>
        )}

      </div>
      <SchoolNav />
      <BugReporter screenName="homework_tracking" />
    </div>
  );
}
