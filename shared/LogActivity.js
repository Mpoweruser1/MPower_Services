// shared/logActivity.js — FINAL
import { supabase } from '../lib/supabaseClient';

export async function logActivity(tenant, action, severity = 'info', metadata = {}) {
  try {
    await supabase.from('activity_log').insert({
      app_id:   tenant?.appId || null,
      user_id:  tenant?.userRowId || null,
      action,
      severity,
      metadata: {
        ...metadata,
        role:      tenant?.role,
        timestamp: new Date().toISOString(),
      },
      flagged: severity === 'critical',
    });
  } catch (err) {
    console.error('Activity log failed:', err);
  }
}