// shared/deleteWithAlert.js
import { supabase } from '../lib/supabaseClient';

export async function deleteWithAlert({ tenant, moduleCode, table, recordId, recordSummary }) {
  // 1. Log to the audit trail, regardless of whether anyone is configured to be notified
  await supabase.from('delete_audit_log').insert({
    app_id: tenant.appId,
    module_code: moduleCode,
    record_id: recordId,
    record_summary: recordSummary,
    deleted_by: tenant.userRowId,
  });

  // 2. Find who should be notified for this module
  const { data: recipients } = await supabase
    .from('delete_alert_recipients')
    .select('notify_user_id')
    .eq('app_id', tenant.appId)
    .eq('module_code', moduleCode);

  // 3. Notify each configured recipient (reuses the same WhatsApp pipeline)
  if (recipients && recipients.length > 0) {
    for (const r of recipients) {
      await supabase.functions.invoke('send-whatsapp', {
        body: {
          type: 'delete_alert',
          userRowId: r.notify_user_id,
          moduleCode,
          recordSummary,
          deletedByName: tenant.fullName,
        },
      });
    }
  }

  // 4. Finally, perform the actual delete
  const { error } = await supabase.from(table).delete().eq('id', recordId);
  return { error };
}