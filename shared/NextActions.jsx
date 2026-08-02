// shared/NextActions.jsx — FINAL
import React from 'react';
import { Link } from 'react-router-dom';

export default function NextActions({ title, actions = [], secondaryActions = [] }) {
  return (
    <div style={{ marginTop: 16 }}>
      {title && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 12 }}>
          {title}
        </p>
      )}

      {actions.map((action) => (
        action.href ? (
          <Link
            key={action.label}
            to={action.href}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: '#161618', border: `1px solid ${action.color || '#E8A020'}30`, borderRadius: 10, textDecoration: 'none', marginBottom: 8 }}
          >
            <span style={{ fontSize: 20 }}>{action.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{action.label}</p>
              {action.description && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{action.description}</p>}
            </div>
            <span style={{ color: action.color || '#E8A020', fontSize: 14 }}>→</span>
          </Link>
        ) : (
          <button
            key={action.label}
            onClick={action.onClick}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: '#161618', border: `1px solid ${action.color || '#E8A020'}30`, borderRadius: 10, width: '100%', cursor: 'pointer', marginBottom: 8, fontFamily: 'Inter, sans-serif', textAlign: 'left' }}
          >
            <span style={{ fontSize: 20 }}>{action.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{action.label}</p>
              {action.description && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{action.description}</p>}
            </div>
            <span style={{ color: action.color || '#E8A020', fontSize: 14 }}>→</span>
          </button>
        )
      ))}

      {secondaryActions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {secondaryActions.map((action) =>
            action.href ? (
              <Link
                key={action.label}
                to={action.href}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, textDecoration: 'none', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}
              >
                <span>{action.icon}</span> {action.label}
              </Link>
            ) : (
              <button
                key={action.label}
                onClick={action.onClick}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter, sans-serif' }}
              >
                <span>{action.icon}</span> {action.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}