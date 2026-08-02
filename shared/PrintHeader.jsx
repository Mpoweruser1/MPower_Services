// shared/PrintHeader.jsx — FINAL
// Renders only when printing — invisible on screen
import React from 'react';
import { useTenant } from '../context/TenantContext';

export default function PrintHeader({ documentTitle }) {
  const { tenant } = useTenant();

  return (
    <div className="print-only" style={{ display: 'none' }}>
      <style>{`
        @media print {
          .print-only { display: block !important; }
          .no-print { display: none !important; }
          body { background: #fff !important; color: #000 !important; }
          @page { size: A4 portrait; margin: 15mm 18mm; }
        }
      `}</style>
      <div style={{ borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 14, fontFamily: 'Times New Roman, serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{tenant?.orgName || 'MPower'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#444' }}>Powered by MPower · mpowerapp.in</p>
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