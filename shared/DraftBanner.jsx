// shared/DraftBanner.jsx — FINAL
// Shows a banner when a saved draft is found
// "You have unsaved data from X minutes ago — restore or discard"

import React from 'react';

export default function DraftBanner({ lastSaved, onRestore, onDiscard }) {
  if (!lastSaved) return null;

  const minutesAgo = Math.floor((Date.now() - lastSaved.getTime()) / 60000);
  const timeLabel  = minutesAgo < 1
    ? 'just now'
    : minutesAgo < 60
    ? `${minutesAgo} minute${minutesAgo > 1 ? 's' : ''} ago`
    : `${Math.floor(minutesAgo / 60)} hour${Math.floor(minutesAgo / 60) > 1 ? 's' : ''} ago`;

  return (
    <div style={{
      background: 'rgba(232,160,32,0.08)',
      border: '1px solid rgba(232,160,32,0.25)',
      borderRadius: 10,
      padding: '12px 16px',
      marginBottom: 16,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#E8A020' }}>
          📝 Unsaved draft found
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          You were filling this form {timeLabel} — restore to continue where you left off
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={onRestore}
          style={{ padding: '7px 14px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
          Restore draft
        </button>
        <button onClick={onDiscard}
          style={{ padding: '7px 14px', background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
          Discard
        </button>
      </div>
    </div>
  );
}