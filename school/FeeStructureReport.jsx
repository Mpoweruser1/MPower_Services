// school/FeeStructureReport.jsx — NEW
// Genuinely missing: Fee Analytics covers collection over time, but
// nothing rolls up BY fee structure specifically — "Term 1 Tuition:
// 45 students, ₹6,75,000 expected, 82% collected." Built on the real,
// verified schema: fee_structure(id, app_id, class_id, fee_type,
// amount, due_date, academic_year); fee_dues(fee_structure_id,
// student_id, amount_due, fee_payments(amount)).
//
// PDF and Excel export added alongside the existing CSV — see
// FeeAnalytics.jsx for the rationale.
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import PrintHeader from '../shared/PrintHeader';
import { exportToExcel } from '../shared/exportExcel';
import TierGate from '../shared/TierGate';
import BugReporter from '../shared/BugReporter';

function currency(n) { return `\u20b9${Number(n || 0).toLocaleString('en-IN')}`; }

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

function FeeStructureReportContent() {
  const { tenant } = useTenant();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    const { data: structures } = await supabase
      .from('fee_structure')
      .select('id, fee_type, amount, academic_year, class_id, classes(class_name)')
      .eq('app_id', tenant.appId).order('created_at', { ascending: false });

    const structureIds = (structures || []).map((s) => s.id);
    if (structureIds.length === 0) { setRows([]); setLoading(false); return; }

    const { data: allDues } = await supabase
      .from('fee_dues')
      .select('fee_structure_id, amount_due, student_id, students(full_name, sid, status), fee_payments(amount)')
      .in('fee_structure_id', structureIds);

    const dues = (allDues || []).filter((d) => d.students?.status === 'active');

    const enriched = (structures || []).map((structure) => {
      const structureDues = (dues || []).filter((d) => d.fee_structure_id === structure.id);
      const studentCount = structureDues.length;
      const totalExpected = structureDues.reduce((s, d) => s + Number(d.amount_due), 0);
      const totalCollected = structureDues.reduce((s, d) => s + (d.fee_payments || []).reduce((s2, p) => s2 + Number(p.amount), 0), 0);
      const pct = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;
      const unpaidStudents = structureDues
        .map((d) => ({ ...d, paid: (d.fee_payments || []).reduce((s, p) => s + Number(p.amount), 0) }))
        .filter((d) => d.paid < Number(d.amount_due));
      return { ...structure, studentCount, totalExpected, totalCollected, pct, unpaidStudents };
    });

    setRows(enriched);
    setLoading(false);
  }

  const exportHeaders = ['Fee type', 'Class', 'Academic year', 'Students', 'Expected', 'Collected', '% collected'];
  const exportRows = rows.map((r) => [r.fee_type, r.classes?.class_name || 'All classes', r.academic_year, r.studentCount, r.totalExpected, r.totalCollected, `${r.pct}%`]);

  function exportCsv() {
    const csvRows = [exportHeaders, ...exportRows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fee_structure_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function exportExcelFile() {
    exportToExcel(`fee_structure_report_${new Date().toISOString().slice(0, 10)}`, [
      { name: 'Fee Structure Report', headers: exportHeaders, rows: exportRows },
    ]);
  }

  if (loading) return <div style={{ ...S.page, textAlign: 'center', paddingTop: 60 }}><p style={{ color: 'rgba(255,255,255,0.3)' }}>Loading...</p></div>;

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print { .no-print { display: none !important; } }
      `}</style>
      <div style={S.inner}>

        <div className="no-print" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Reports</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Fee Structure Report</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>Every fee defined, rolled up by term and class \u2014 not just by date</p>
        </div>

        <div className="no-print">
        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#161618', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No fee structures created yet.</p>
          </div>
        ) : (
          rows.map((r) => {
            const isExpanded = expanded === r.id;
            return (
              <div key={r.id} style={S.card}>
                <button onClick={() => setExpanded(isExpanded ? null : r.id)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{isExpanded ? '\u25bc' : '\u25b6'} {r.fee_type}</span>
                  <span style={{ fontSize: 13, color: '#E8A020', fontWeight: 600 }}>{r.pct}%</span>
                </button>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>{r.classes?.class_name || 'All classes'} \u00b7 {r.academic_year} \u00b7 {r.studentCount} students</p>
                <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', background: '#6AAA90', width: `${Math.min(r.pct, 100)}%` }} />
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{currency(r.totalCollected)} of {currency(r.totalExpected)} collected</p>

                {isExpanded && r.unpaidStudents.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>Not fully paid ({r.unpaidStudents.length})</p>
                    {r.unpaidStudents.map((d) => (
                      <div key={d.student_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                        <span style={{ color: '#fff' }}>{d.students?.full_name}</span>
                        <span style={{ color: '#E05A5A' }}>{currency(Number(d.amount_due) - d.paid)} owed</span>
                      </div>
                    ))}
                  </div>
                )}
                {isExpanded && r.unpaidStudents.length === 0 && (
                  <p style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#6AAA90' }}>Fully collected \u2014 no one owes anything on this fee.</p>
                )}
              </div>
            );
          })
        )}
        </div>

        <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          <button onClick={() => window.print()}
            style={{ padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            🖨️ PDF
          </button>
          <button onClick={exportExcelFile}
            style={{ padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            📊 Excel
          </button>
          <button onClick={exportCsv}
            style={{ padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            &#128229; CSV
          </button>
        </div>

        {/* Print-only formatted table */}
        <div className="print-only" style={{ display: 'none', background: '#fff', color: '#000', padding: '32px 40px' }}>
          <PrintHeader documentTitle="Fee Structure Report" />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>{exportHeaders.map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #000' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{r.fee_type}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{r.classes?.class_name || 'All classes'}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{r.academic_year}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{r.studentCount}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{currency(r.totalExpected)}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{currency(r.totalCollected)}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{r.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
      <SchoolNav />
      <BugReporter screenName="fee_structure_report" />
    </div>
  );
}

export default function FeeStructureReport() {
  return (
    <TierGate requiredTier="advanced" featureName="Fee Structure Report">
      <FeeStructureReportContent />
    </TierGate>
  );
}
