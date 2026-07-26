// shared/BugReporter.jsx — FINAL
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

export default function BugReporter({ screenName }) {
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!description.trim()) return;
    setSubmitting(true);
    await supabase.from('bug_reports').insert({
      app_id:      tenant?.appId || null,
      reported_by: tenant?.userRowId || null,
      screen_name: screenName,
      user_note:   description,
      user_agent:  navigator.userAgent,
    });
    setSubmitting(false);
    setDone(true);
    setTimeout(() => { setOpen(false); setDone(false); setDescription(''); }, 2000);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ display: 'block', margin: '24px auto 8px', padding: '8px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif' }}
      >
        🐛 Report an issue on this screen
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif' }}>
            {done ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <p style={{ fontSize: 24, marginBottom: 8 }}>✅</p>
                <p style={{ margin: 0, fontSize: 14, color: '#6AAA90', fontWeight: 500 }}>Report sent — thank you!</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>Report an issue</p>
                  <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'rgba(255,255,255,0.4)', padding: 0 }}>✕</button>
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '0 0 12px' }}>Screen: {screenName}</p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What went wrong? What did you expect to happen?"
                  rows={3}
                  autoFocus
                  style={{ width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif', marginBottom: 12 }}
                />
                <button
                  onClick={submit}
                  disabled={submitting || !description.trim()}
                  style={{ width: '100%', padding: 11, background: submitting || !description.trim() ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: submitting || !description.trim() ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' }}
                >
                  {submitting ? 'Sending...' : 'Send report →'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}