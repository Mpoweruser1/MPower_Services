// shared/ReportFooter.jsx — NEW
// The bottom of every printed report: notes that explain how the figures are worked out, optional
// signature lines, and an end-of-report line (record count, when it was generated, who printed it).
// Put it INSIDE the report's print area (the card that is printed), straight after the table:
//
//   <ReportFooter notes={['...']} recordCount={rows.length} generatedAt={generatedAt} signatures />
//
// - Notes show on screen and in print.
// - Signature lines show only in print, and only when `signatures` is set and there is something
//   to sign (recordCount > 0). Use them on reports that carry money.
// - `light` (CTS, 15-10-2026): for pages with a LIGHT background. Without it the notes use the pale
//   text of the dark Hospital / School pages, which would be invisible on a light page. Default is
//   unchanged, so every existing (dark) screen looks exactly as before.
// - Page numbers are not drawn here: the shared PrintHeader asks the browser for "Page x of y",
//   which not every browser honours; the browser's own "Headers and footers" print option always works.
import React from 'react';
import { useTenant } from '../context/TenantContext';

export default function ReportFooter({ notes = [], recordCount = null, generatedAt = '', signatures = false, light = false }) {
  const { tenant } = useTenant();
  const who = tenant?.fullName || '';
  const role = tenant?.role ? String(tenant.role).replace(/_/g, ' ') : '';
  const printedBy = [who, role && who ? `(${role})` : role].filter(Boolean).join(' ');
  const hasRows = recordCount === null || recordCount > 0;
  const ink = light
    ? { line: '#e2e8f0', head: '#475569', body: '#64748b', end: '#64748b' }
    : { line: 'rgba(255,255,255,0.08)', head: 'rgba(255,255,255,0.5)', body: 'rgba(255,255,255,0.45)', end: 'rgba(255,255,255,0.4)' };

  return (
    <div className="report-footer" style={{ marginTop: 14 }}>
      <style>{`
        .rf-print-only { display: none; }
        @media print {
          .rf-print-only { display: block !important; }
          .report-footer { page-break-inside: avoid; }
        }
      `}</style>

      {notes.length > 0 && (
        <div style={{ borderTop: `1px solid ${ink.line}`, paddingTop: 10 }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: ink.head }}>Notes</p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, lineHeight: 1.5, color: ink.body }}>
            {notes.map((n, i) => <li key={i}>{n}</li>)}
          </ol>
        </div>
      )}

      {signatures && hasRows && (
        <div className="rf-print-only" style={{ marginTop: 34 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
            {['Prepared by', 'Checked by', 'Authorised signatory'].map((label) => (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 11 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 10, color: ink.end }}>
        — End of report{recordCount !== null ? ` · ${recordCount} record${recordCount === 1 ? '' : 's'}` : ''}
        {generatedAt ? ` · Generated ${generatedAt}` : ''}
        {printedBy ? ` · Printed by ${printedBy}` : ''} —
      </p>
    </div>
  );
}
