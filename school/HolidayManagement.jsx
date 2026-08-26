// school/HolidayManagement.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const HOLIDAY_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'festival', label: 'Festival' },
  { value: 'exam_break', label: 'Exam break' },
];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
};

export default function HolidayManagement() {
  const { tenant } = useTenant();
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ holiday_date: '', holiday_name: '', holiday_type: 'general' });

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('school_holidays').select('id, holiday_date, holiday_name, holiday_type')
      .eq('app_id', tenant.appId)
      .gte('holiday_date', new Date().toISOString().slice(0, 10))
      .order('holiday_date');
    setHolidays(data || []);
    setLoading(false);
  }

  async function addHoliday() {
    if (!form.holiday_date || !form.holiday_name.trim()) {
      setError('Date and name are both required.');
      return;
    }
    setSaving(true);
    setError('');
    const { error: insertErr } = await supabase.from('school_holidays').insert({
      app_id: tenant.appId,
      holiday_date: form.holiday_date,
      holiday_name: form.holiday_name.trim(),
      holiday_type: form.holiday_type,
      created_by: tenant.userRowId,
    });
    setSaving(false);
    if (insertErr) {
      setError(insertErr.code === '23505' ? 'A holiday is already set for that date.' : 'Failed to add holiday.');
      return;
    }
    setForm({ holiday_date: '', holiday_name: '', holiday_type: 'general' });
    load();
  }

  async function removeHoliday(id) {
    if (!window.confirm('Remove this holiday?')) return;
    await supabase.from('school_holidays').delete().eq('id', id);
    load();
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Setup</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Holiday Management</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
            Adding a holiday here automatically defaults everyone to Holiday status on Attendance for that date — no manual bulk-marking needed.
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ ...S.card, border: '1px solid rgba(232,160,32,0.3)' }}>
          <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 14 }}>Add a holiday</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Date</label>
              <input type="date" value={form.holiday_date} onChange={(e) => setForm((f) => ({ ...f, holiday_date: e.target.value }))} style={S.input} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Type</label>
              <select value={form.holiday_type} onChange={(e) => setForm((f) => ({ ...f, holiday_type: e.target.value }))} style={{ ...S.input, cursor: 'pointer' }}>
                {HOLIDAY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' }}>Name</label>
            <input value={form.holiday_name} onChange={(e) => setForm((f) => ({ ...f, holiday_name: e.target.value }))} placeholder="e.g. Sankranti" style={S.input} />
          </div>
          <button onClick={addHoliday} disabled={saving}
            style={{ width: '100%', padding: 11, border: 'none', borderRadius: 8, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            {saving ? 'Adding...' : '+ Add holiday'}
          </button>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading...</p>
        ) : (
          <div style={S.card}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
              Upcoming holidays ({holidays.length})
            </p>
            {holidays.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>No holidays scheduled yet.</p>
            ) : (
              holidays.map((h) => (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, color: '#fff' }}>{h.holiday_name}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      {new Date(h.holiday_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {HOLIDAY_TYPES.find((t) => t.value === h.holiday_type)?.label}
                    </p>
                  </div>
                  <button onClick={() => removeHoliday(h.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'rgba(224,90,90,0.4)', padding: '4px 8px' }}>✕</button>
                </div>
              ))
            )}
          </div>
        )}

      </div>
      <SchoolNav />
      <BugReporter screenName="holiday_management" />
    </div>
  );
}
