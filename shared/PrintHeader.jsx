// shared/PrintHeader.jsx — FINAL
// Renders only when printing — invisible on screen
import React from 'react';
import { useTenant } from '../context/TenantContext';

export default function PrintHeader({ documentTitle }) {
  const { tenant } = useTenant();

  // Full address line — was previously address + district only,
  // silently dropping city/pincode even though both existed on the
  // branches table all along. Now includes everything that's set.
  const addressLine = [tenant?.address, tenant?.city, tenant?.district, tenant?.pincode]
    .filter(Boolean).join(', ');

  // Business detail line — phone/GSTIN/PAN/registration number are
  // genuinely new fields (added specifically so invoices carry the
  // details a real hospital/school invoice needs, not previously
  // captured anywhere in the app). Only shown if actually set, so an
  // org that hasn't filled these in yet doesn't print a row of blanks.
  const businessDetails = [
    tenant?.businessPhone ? `Ph: ${tenant.businessPhone}` : null,
    tenant?.gstin ? `GSTIN: ${tenant.gstin}` : null,
    tenant?.pan ? `PAN: ${tenant.pan}` : null,
    tenant?.registrationNo ? `Reg. No: ${tenant.registrationNo}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="print-only" style={{ display: 'none' }}>
      <style>{`
        @media print {
          .print-only { display: block !important; }
          .no-print { display: none !important; }
          body { background: #fff !important; color: #000 !important; }
          @page {
            size: A4 portrait;
            margin: 15mm 18mm;
            /* Real auto-incrementing page numbers via CSS counters —
               Firefox's print engine honors this reasonably well.
               Chrome's print engine does NOT reliably support @page
               margin-box counters, so this silently does nothing
               there. For Chrome specifically, the browser's own print
               dialog → "More settings" → "Headers and footers" adds
               page numbers natively and more reliably than any CSS
               here can guarantee — that's the actual recommended path
               for most users, not a workaround. */
            @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 10px; color: #888; }
          }
          /* Confirmed missing anywhere in the codebase before this —
             without it, a table row can print with its top half on
             one page and the rest on the next, which is exactly the
             kind of "unnecessary gap" that makes a printed report look
             unprofessional and harder to read. */
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
      `}</style>
      <div style={{ borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 14, fontFamily: 'Times New Roman, serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Generic MPower brand mark — schools/hospitals don't
                currently have their own logo upload anywhere in the
                app, so this is the MPower mark, not the institution's
                own emblem. A real per-school logo would need a new
                upload feature (storage bucket + settings screen) —
                a separate, bigger addition if wanted. */}
            <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 15, flexShrink: 0 }}>M</div>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{tenant?.orgName || 'MPower'}</p>
              {addressLine && (
                <p style={{ margin: '1px 0 0', fontSize: 11, color: '#555' }}>{addressLine}</p>
              )}
              {businessDetails && (
                <p style={{ margin: '1px 0 0', fontSize: 11, color: '#555' }}>{businessDetails}</p>
              )}
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#444' }}>Powered by MPower · mpowerind.in</p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{documentTitle}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#666' }}>
              Printed: {new Date().toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
