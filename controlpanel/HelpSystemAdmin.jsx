// controlpanel/HelpSystemAdmin.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import ControlPanelNav from '../shared/ControlPanelNav';
import { ScreenVideoButton } from '../shared/HelpWidget';
import BugReporter from '../shared/BugReporter';

const MODULE_FILTERS = ['All modules', 'School', 'Hospital', 'CTS', 'HRMS'];

export default function HelpSystemAdmin() {
  const [videos, setVideos] = useState([]);
  const [fieldHelps, setFieldHelps] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [tab, setTab] = useState('videos');
  const [moduleFilter, setModuleFilter] = useState('All modules');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const { data: videoRows } = await supabase.from('help_content').select('*').order('updated_at', { ascending: false });
    setVideos(videoRows || []);

    const { data: fieldRows } = await supabase.from('field_help').select('*');
    setFieldHelps(fieldRows || []);

    const { data: analyticsRows } = await supabase
      .from('help_analytics').select('screen_code, help_type').limit(100);
    setAnalytics(analyticsRows || []);
    setLoading(false);
  }

  async function toggleActive(id, current) {
    await supabase.from('help_content').update({ is_active: !current }).eq('id', id);
    setVideos((prev) => prev.map((v) => v.id === id ? { ...v, is_active: !current } : v));
  }

  async function updateVideoId(id, videoId) {
    await supabase.from('help_content').update({ video_id: videoId, is_active: true, updated_at: new Date().toISOString() }).eq('id', id);
    setVideos((prev) => prev.map((v) => v.id === id ? { ...v, video_id: videoId, is_active: true } : v));
    alert('Video updated. All clients will see the new video immediately.');
  }

  const analyticsMap = useMemo(() => {
    return analytics.reduce((acc, a) => {
      acc[a.screen_code] = (acc[a.screen_code] || 0) + 1;
      return acc;
    }, {});
  }, [analytics]);

  const screensWithoutVideo = useMemo(() => {
    const withVideo = new Set(videos.filter((v) => v.is_active && v.video_id).map((v) => v.screen_code));
    return [...new Set(fieldHelps.map((f) => f.screen_code))].filter((s) => !withVideo.has(s));
  }, [videos, fieldHelps]);

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: '#888' }}>Loading help system...</div>;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', fontFamily: 'sans-serif', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Help System Admin</h2>
        <ScreenVideoButton screenCode="help_admin" />
      </div>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Internal tool — manage videos, tooltips, and analytics.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['videos', 'fields', 'analytics'].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: tab === t ? 'none' : '1px solid #ccc', background: tab === t ? '#185FA5' : '#fff', color: tab === t ? '#fff' : '#666' }}>
            {{ videos: 'Screen videos', fields: 'Field tooltips', analytics: 'Analytics' }[t]}
          </button>
        ))}
      </div>

      {tab === 'videos' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {MODULE_FILTERS.map((m) => (
              <button key={m} onClick={() => setModuleFilter(m)} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 16, cursor: 'pointer', border: moduleFilter === m ? 'none' : '1px solid #ccc', background: moduleFilter === m ? '#534AB7' : '#fff', color: moduleFilter === m ? '#fff' : '#666' }}>
                {m}
              </button>
            ))}
          </div>
          {videos.length === 0 ? (
            <p style={{ fontSize: 13, color: '#aaa' }}>No help videos configured yet.</p>
          ) : (
            videos.map((v) => (
              <div key={v.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>{v.title || v.screen_code}</p>
                    <p style={{ margin: '2px 0', fontSize: 12, color: '#888' }}>{v.screen_code} · {v.language} {v.video_duration_secs ? `· ${v.video_duration_secs}s` : ''}</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#666' }}>👁 {v.views || 0} views</p>
                  </div>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: v.is_active ? '#E1F5EE' : '#f0f0f0', color: v.is_active ? '#085041' : '#999' }}>
                    {v.is_active ? 'Active' : v.video_id ? 'Draft' : 'No video'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { const vid = prompt('Paste YouTube/Cloudflare video ID:', v.video_id || ''); if (vid !== null) updateVideoId(v.id, vid); }} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #185FA5', color: '#185FA5', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                    {v.video_id ? 'Replace video' : 'Upload video'}
                  </button>
                  {v.video_id && (
                    <button onClick={() => toggleActive(v.id, v.is_active)} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #ccc', color: '#666', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                      {v.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {tab === 'fields' && (
        fieldHelps.length === 0 ? <p style={{ fontSize: 13, color: '#aaa' }}>No field tooltips configured.</p> :
        fieldHelps.map((f) => (
          <div key={f.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>{f.field_name} <span style={{ color: '#888', fontWeight: 400 }}>· {f.screen_code}</span></p>
              <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: '#E6F1FB', color: '#0C447C' }}>{f.help_type}</span>
            </div>
            <p style={{ fontSize: 12, color: '#666', margin: '4px 0' }}>{f.help_text}</p>
            <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>{f.language} · {f.trigger_condition} · 👁 {f.views || 0}</p>
          </div>
        ))
      )}

      {tab === 'analytics' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div style={{ background: '#f7f7f7', borderRadius: 8, padding: 12 }}>
              <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Total help views</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0' }}>{analytics.length}</p>
            </div>
            <div style={{ background: '#f7f7f7', borderRadius: 8, padding: 12 }}>
              <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Screens missing video</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0', color: screensWithoutVideo.length > 0 ? '#A32D2D' : '#1D9E75' }}>{screensWithoutVideo.length}</p>
            </div>
          </div>
          {screensWithoutVideo.length > 0 && (
            <div style={{ background: '#FCEBEB', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12, color: '#791F1F' }}>
              <strong>Action needed:</strong> {screensWithoutVideo.join(', ')} — no active help video.
            </div>
          )}
          <p style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 8 }}>Most viewed screens</p>
          {Object.entries(analyticsMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([screen, count]) => (
            <div key={screen} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #eee', fontSize: 12 }}>
              <span>{screen}</span>
              <span style={{ fontWeight: 600 }}>{count} views</span>
            </div>
          ))}
        </>
      )}

      <ControlPanelNav />
      <BugReporter screenName="help_admin" />
    </div>
  );
}