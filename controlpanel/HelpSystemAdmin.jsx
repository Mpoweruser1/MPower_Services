// controlpanel/HelpSystemAdmin.jsx — restyled to match the current dark-theme standard
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import ControlPanelNav from '../shared/ControlPanelNav';
import { ScreenVideoButton } from '../shared/HelpWidget';
import BugReporter from '../shared/BugReporter';

const MODULE_FILTERS = ['All modules', 'School', 'Hospital', 'CTS', 'HRMS'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 },
  stat: { background: '#111113', borderRadius: 10, padding: 14 },
};

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

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>Help System Admin</p>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Internal tool — manage videos, tooltips, and analytics</p>
        </div>
        <ScreenVideoButton screenCode="help_admin" />
      </nav>

      <div style={S.inner}>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading help system...</p>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['videos', 'fields', 'analytics'].map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t ? '#E8A020' : 'transparent', color: tab === t ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t ? 600 : 400 }}>
                  {{ videos: 'Screen videos', fields: 'Field tooltips', analytics: 'Analytics' }[t]}
                </button>
              ))}
            </div>

            {tab === 'videos' && (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                  {MODULE_FILTERS.map((m) => (
                    <button key={m} onClick={() => setModuleFilter(m)}
                      style={{ padding: '6px 14px', fontSize: 12, borderRadius: 16, cursor: 'pointer', border: moduleFilter === m ? 'none' : '1px solid rgba(255,255,255,0.1)', background: moduleFilter === m ? 'rgba(154,138,224,0.2)' : 'transparent', color: moduleFilter === m ? '#9A8AE0' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
                      {m}
                    </button>
                  ))}
                </div>
                {videos.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No help videos configured yet.</p>
                ) : (
                  videos.map((v) => (
                    <div key={v.id} style={S.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 500, fontSize: 14, color: '#fff' }}>{v.title || v.screen_code}</p>
                          <p style={{ margin: '3px 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{v.screen_code} · {v.language} {v.video_duration_secs ? `· ${v.video_duration_secs}s` : ''}</p>
                          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>👁 {v.views || 0} views</p>
                        </div>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: v.is_active ? 'rgba(106,170,144,0.12)' : 'rgba(255,255,255,0.06)', color: v.is_active ? '#6AAA90' : 'rgba(255,255,255,0.4)' }}>
                          {v.is_active ? 'Active' : v.video_id ? 'Draft' : 'No video'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { const vid = prompt('Paste YouTube/Cloudflare video ID:', v.video_id || ''); if (vid !== null) updateVideoId(v.id, vid); }}
                          style={{ fontSize: 12, padding: '6px 12px', border: '1px solid rgba(232,160,32,0.4)', color: '#E8A020', background: 'rgba(232,160,32,0.06)', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {v.video_id ? 'Replace video' : 'Upload video'}
                        </button>
                        {v.video_id && (
                          <button onClick={() => toggleActive(v.id, v.is_active)}
                            style={{ fontSize: 12, padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', background: 'transparent', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>
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
              fieldHelps.length === 0 ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No field tooltips configured.</p> :
              fieldHelps.map((f) => (
                <div key={f.id} style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: 14, color: '#fff' }}>{f.field_name} <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>· {f.screen_code}</span></p>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: 'rgba(90,154,223,0.12)', color: '#5A9ADF' }}>{f.help_type}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '4px 0' }}>{f.help_text}</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{f.language} · {f.trigger_condition} · 👁 {f.views || 0}</p>
                </div>
              ))
            )}

            {tab === 'analytics' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                  <div style={S.stat}>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Total help views</p>
                    <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 0', color: '#fff' }}>{analytics.length}</p>
                  </div>
                  <div style={{ ...S.stat, border: screensWithoutVideo.length > 0 ? '1px solid rgba(224,90,90,0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Screens missing video</p>
                    <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 0', color: screensWithoutVideo.length > 0 ? '#E05A5A' : '#6AAA90' }}>{screensWithoutVideo.length}</p>
                  </div>
                </div>
                {screensWithoutVideo.length > 0 && (
                  <div style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#E05A5A' }}>
                      <strong>Action needed:</strong> {screensWithoutVideo.join(', ')} — no active help video.
                    </p>
                  </div>
                )}
                <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 10 }}>MOST VIEWED SCREENS</p>
                {Object.entries(analyticsMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([screen, count]) => (
                  <div key={screen} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>{screen}</span>
                    <span style={{ fontWeight: 600, color: '#fff' }}>{count} views</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <ControlPanelNav />
      <BugReporter screenName="help_admin" />
    </div>
  );
}
