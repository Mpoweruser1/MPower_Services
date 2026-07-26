// shared/printAuditStamp.js
import { supabase } from '../lib/supabaseClient';

async function hashContent(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateVerifyToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export async function recordPrintAudit({
  tenant, printedByName, documentType, module, reportId, recordCount = 1, contentSummary, isDemoData = false,
}) {
  const contentHash = await hashContent(contentSummary);
  const verifyToken = generateVerifyToken();
  const printTime = new Date();

  let deviceName = 'Unknown device';
  let browserInfo = 'Unknown browser';
  if (typeof navigator !== 'undefined') {
    browserInfo = navigator.userAgent.split(' ').slice(-2).join(' ');
    deviceName = /Android|iPhone/i.test(navigator.userAgent) ? 'Mobile device' : 'Desktop/Laptop';
  }

  const { error } = await supabase.from('print_audit_log').insert({
    app_id: tenant.appId, printed_by: tenant.userRowId, print_time: printTime.toISOString(),
    document_type: documentType, report_id: reportId, module, record_count: recordCount,
    device_name: deviceName, browser_info: browserInfo, content_hash: contentHash,
    verify_token: verifyToken, is_demo_data: isDemoData,
  });

  if (error) console.error('Failed to log print audit:', error);

  return {
    stampText: buildStampText({ printedByName, printTime, module, reportId, recordCount, verifyToken, isDemoData }),
    verifyToken,
  };
}

function buildStampText({ printedByName, printTime, module, reportId, recordCount, verifyToken, isDemoData }) {
  const lines = [
    '─────────────────────────────────────────',
    isDemoData ? 'SAMPLE DATA — FOR DEMONSTRATION ONLY' : 'MPOWER PRINT AUDIT TRAIL',
    '─────────────────────────────────────────',
    `PRINTED BY  : ${printedByName}`,
    `DATE / TIME : ${printTime.toLocaleString('en-IN')}`,
    `MODULE      : ${module}`,
    `REPORT ID   : ${reportId}`,
    `RECORDS     : ${recordCount}`,
    `VERIFY AT   : mpowerapp.in/verify?token=${verifyToken}`,
    '─────────────────────────────────────────',
  ];
  return lines.join('\n');
}