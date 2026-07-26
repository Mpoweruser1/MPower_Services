// shared/HelpWidget.jsx — FINAL
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

export function FieldHelp({ screenCode, fieldName }) {
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(null);

  async function loadAndShow() {
    if (help) { setOpen((o) => !o); return; }
    const { data } = await supabase
      .from('field_help')
      .select('*')
      .eq('screen_code', screenCode)
      .eq('field_name', fieldName)
      .limit(1)
      .single();
    if (data) {
      setHelp(data);
      await supabase.from('help_analytics').insert({
        app_id: tenant?.appId,
        screen_code: screenCode,
        field_name: fieldName,
        help_type: data.help_type,
      });
    }
    setOpen(true);
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onClick={loadAndShow}
        style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(232,160,32,0.15)', color: '#E8A020', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, cursor: 'pointer', marginLeft: 4, border: '1px solid rgba(232,160,32,0.2)', flexShrink: 0 }}
      >?</span>
      {open && help && (
        <div style={{ position: 'absolute', top: 22, left: 0, zIndex: 100, background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', width: 230, fontSize: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
          {help.help_text}
          <button onClick={() => setOpen(false)} style={{ display: 'block', marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Close ✕</button>
        </div>
      )}
    </span>
  );
}

export function ScreenVideoButton({ screenCode }) {
  const { tenant } = useTenant();
  const [video, setVideo] = useState(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [checking, setChecking] = useState(false);

  async function loadAndOpen() {
    if (video) { setShowPlayer(true); return; }
    setChecking(true);
    const { data } = await supabase
      .from('help_content')
      .select('*')
      .eq('screen_code', screenCode)
      .eq('is_active', true)
      .limit(1)
      .single();
    setChecking(false);
    if (!data?.video_id) {
      alert('Help video coming soon for this screen. · త్వరలో వస్తుంది.');
      return;
    }
    setVideo(data);
    setShowPlayer(true);
    await supabase.from('help_analytics').insert({
      app_id: tenant?.appId,
      screen_code: screenCode,
      help_type: 'screen_video',
    });
  }

  return (
    <>
      <button
        onClick={loadAndOpen}
        disabled={checking}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.2)', borderRadius: 20, cursor: checking ? 'not-allowed' : 'pointer', fontSize: 12, color: '#E8A020', fontFamily: 'Inter, sans-serif' }}
      >
        {checking ? '...' : '▶ Help'}
      </button>

      {showPlayer && video && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#161618', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{video.title}</p>
              <button onClick={() => setShowPlayer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'rgba(255,255,255,0.4)' }}>✕</button>
            </div>
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 10, overflow: 'hidden' }}>
              <iframe
                src={`https://www.youtube.com/embed/${video.video_id}?autoplay=1`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={video.title}
              />
            </div>
            {video.video_duration_secs && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 10, marginBottom: 0 }}>
                Duration: {Math.floor(video.video_duration_secs / 60)}:{String(video.video_duration_secs % 60).padStart(2, '0')}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}