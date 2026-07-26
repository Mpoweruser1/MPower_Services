// shared/PrintStamp.jsx
import React from 'react';

export default function PrintStamp({ stampText }) {
  if (!stampText) return null;
  return (
    <pre style={{ fontFamily: 'monospace', fontSize: 10, color: '#666', background: '#f7f7f7', borderRadius: 6, padding: '8px 10px', marginTop: 12, whiteSpace: 'pre-wrap' }}>
      {stampText}
    </pre>
  );
}