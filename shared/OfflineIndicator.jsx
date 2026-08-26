// shared/OfflineIndicator.jsx — NEW
// Small persistent banner so staff always know their actual
// connection state — never leave them guessing whether their save
// really went through.
import React, { useState, useEffect } from 'react';
import { isUsingLocalServer } from '../lib/supabaseClient';

export default function OfflineIndicator() {
  const [status, setStatus] = useState('online'); // 'online' | 'local' | 'offline'

  useEffect(() => {
    function updateStatus() {
      if (!navigator.onLine) { setStatus('offline'); return; }
      setStatus(isUsingLocalServer() ? 'local' : 'online');
    }
    updateStatus();
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    const interval = setInterval(updateStatus, 5000);
    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      clearInterval(interval);
    };
  }, []);

  if (status === 'online') return null; // Normal state — no banner needed

  const config = {
    local: { bg: 'rgba(90,154,223,0.12)', color: '#5A9ADF', text: '📡 Working on local server — syncs automatically when internet returns' },
    offline: { bg: 'rgba(224,90,90,0.12)', color: '#E05A5A', text: '⚠️ No connection — entries will not save until you reconnect' },
  }[status];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, background: config.bg, color: config.color, textAlign: 'center', padding: '8px 12px', fontSize: 12, fontWeight: 600, fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {config.text}
    </div>
  );
}
