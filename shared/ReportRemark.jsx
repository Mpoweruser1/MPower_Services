// shared/ReportRemark.jsx — NEW
// Drop into any report row: <ReportRemark reportId="fee_defaulters" rowKey={row.id} />
// Self-contained — loads its own existing remark (if any) and saves
// inline, no parent wiring needed beyond reportId/rowKey.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';

export default function ReportRemark({ reportId, rowKey }) {
  const { tenant } = useTenant();
  const [remark, setRemark]     = useState(null);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (tenant?.appId && reportId && rowKey) loadRemark();
  }, [tenant?.appId, reportId, rowKey]);

  async function loadRemark() {
    const { data } = await supabase
      .from('report_remarks')
      .select('remark')
      .eq('app_id', tenant.appId)
      .eq('report_id', reportId)
      .eq('row_key', String(rowKey))
      .maybeSingle();
    setRemark(data?.remark || null);
  }

  function startEdit() {
    setDraft(remark || '');
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const trimmed = draft.trim();

    if (!trimmed) {
      await supabase.from('report_remarks')
        .delete()
        .eq('app_id', tenant.appId).eq('report_id', reportId).eq('row_key', String(rowKey));
      setRemark(null);
    } else {
      await supabase.from('report_remarks').upsert({
        app_id: tenant.appId, report_id: reportId, row_key: String(rowKey),
        remark: trimmed, created_by: tenant.userRowId, updated_at: new Date().toISOString(),
      }, { onConflict: 'app_id,report_id,row_key' });
      setRemark(trimmed);
    }
    setSaving(false);
    setEditing(false);
  }

  if (!rowKey) return null;

  if (editing) {
    return (
      <span className="no-print" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="Add remark..."
          style={{ fontSize: 11, padding: '3px 6px', background: '#111113', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: '#fff', outline: 'none', fontFamily: 'inherit', width: 140 }}
        />
        <button onClick={save} disabled={saving} style={{ fontSize: 11, background: 'none', border: 'none', color: '#6AAA90', cursor: 'pointer', padding: 0 }}>✓</button>
        <button onClick={() => setEditing(false)} style={{ fontSize: 11, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0 }}>✕</button>
      </span>
    );
  }

  if (remark) {
    // A saved remark should actually appear on the printed page too —
    // only the click-to-edit affordance is screen-only.
    return (
      <span onClick={startEdit} style={{ fontSize: 11, color: '#E8A020', cursor: 'pointer' }} title="Click to edit remark">
        {remark}
      </span>
    );
  }

  return (
    <span onClick={startEdit} className="no-print" style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontStyle: 'italic' }} title="Click to add a remark">
      + remark
    </span>
  );
}
