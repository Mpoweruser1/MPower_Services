// school/ManageSubjects.jsx — NEW
// Same quick-add + custom pattern as ManageWards/ManageDoctors/
// ManageLabTests. Reuses the exact subject list already used
// consistently in Timetable.jsx and HomeworkTracking.jsx.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const COMMON_SUBJECTS = ['Telugu', 'English', 'Hindi', 'Maths', 'Science', 'Social Studies'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
};

export default function ManageSubjects() {
  const { tenant } = useTenant();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customName, setCustomName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('subjects').select('id, subject_name').eq('app_id', tenant.appId).order('subject_name');
    setSubjects(data || []);
    setLoading(false);
  }

  async function quickAdd(name) {
    if (subjects.some((s) => s.subject_name === name)) return;
    setSaving(true);
    const { error } = await supabase.from('subjects').insert({ app_id: tenant.appId, subject_name: name });
    setSaving(false);
    if (!error) { setMessage(`✅ ${name} added`); load(); }
  }

  async function addCustom() {
    if (!customName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('subjects').insert({ app_id: tenant.appId, subject_name: customName.trim() });
    setSaving(false);
    if (error) { setMessage(`"${customName}" may already exist.`); return; }
    setCustomName('');
    setMessage('✅ Subject added');
    load();
  }

  async function removeSubject(id, name) {
    if (!window.confirm(`Remove "${name}"? Existing marks for this subject will keep their record.`)) return;
    await supabase.from('subjects').delete().eq('id', id);
    load();
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Setup</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Manage Subjects</h1>
        </div>

        {message && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>
            {message}
          </div>
        )}

        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Common subjects</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COMMON_SUBJECTS.map((name) => {
              const exists = subjects.some((s) => s.subject_name === name);
              return (
                <button key={name} onClick={() => !exists && quickAdd(name)} disabled={saving || exists}
                  style={{ padding: '10px 16px', border: `1px solid ${exists ? 'rgba(106,170,144,0.3)' : 'rgba(90,154,223,0.3)'}`, color: exists ? '#6AAA90' : '#5A9ADF', background: exists ? 'rgba(106,170,144,0.08)' : 'rgba(90,154,223,0.08)', borderRadius: 8, cursor: exists ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                  {exists ? '✓ ' : '+ '}{name}
                </button>
              );
            })}
          </div>
        </div>

        <div style={S.card}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Add custom subject</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Sanskrit, Computer Science" style={S.input} />
            <button onClick={addCustom} disabled={saving}
              style={{ padding: '10px 20px', border: 'none', borderRadius: 8, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              + Add
            </button>
          </div>
        </div>

        {!loading && subjects.length > 0 && (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Your subjects ({subjects.length})</p>
            {subjects.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize: 13, color: '#fff' }}>{s.subject_name}</span>
                <button onClick={() => removeSubject(s.id, s.subject_name)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'rgba(224,90,90,0.4)' }}>✕</button>
              </div>
            ))}
          </div>
        )}

      </div>
      <SchoolNav />
      <BugReporter screenName="manage_subjects" />
    </div>
  );
}
