// school/HostelWelfareReport.jsx — NEW
// Built for a real, verified government requirement: G.O.Ms.No.89
// names welfare scheme monitoring as a core MEO duty.
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

const WELFARE_CATEGORIES = ['SC', 'ST', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'EWS'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

function HostelWelfareReportContent() {
  const { tenant } = useTenant();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('students')
      .select('id, full_name, sid, caste_category, class_id, classes(class_name, class_order)')
      .eq('app_id', tenant.appId).eq('status', 'active').eq('student_type', 'hostel');
    setStudents(data || []);

    const { data: classRows } = await supabase.from('classes').select('id, class_name').eq('app_id', tenant.appId).order('class_order');
    setClasses(classRows || []);
    setLoading(false);
  }

  const eligible = students.filter((s) => WELFARE_CATEGORIES.includes(s.caste_category));
  const totalHostel = students.length;
  const totalEligible = eligible.length;
  const schoolPct = totalHostel > 0 ? Math.round((totalEligible / totalHostel) * 100) : 0;

  const byClass = classes.map((c) => {
    const classHostelStudents = students.filter((s) => s.class_id === c.id);
    const classEligible = classHostelStudents.filter((s) => WELFARE_CATEGORIES.includes(s.caste_category));
    return { class: c, hostelCount: classHostelStudents.length, eligibleCount: classEligible.length, eligible: classEligible };
  }).filter((row) => row.hostelCount > 0);

  const exportHeaders = ['Name', 'SID', 'Class', 'Category', 'Welfare eligible'];
  const exportRows = students.map((s) => [s.full_name, s.sid, s.classes?.class_name || '', s.caste_category || 'Not specified', WELFARE_CATEGORIES.includes(s.caste_category) ? 'Yes' : 'No']);

  function exportCsv() {
    const rows = [exportHeaders, ...exportRows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hostel_welfare_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function exportExcelFile() {
    exportToExcel(`hostel_welfare_report_${new Date().toISOString().slice(0, 10)}`, [
      { name: 'Hostel Welfare Report', headers: exportHeaders, rows: exportRows },
    ]);
  }

  if (loading) return <div style={{ ...S.page, textAlign: 'center', paddingTop: 60 }}><p style={{ color: 'rgba(255,255,255,0.3)' }}>Loading...</p><SchoolNav /></div>;

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print { .no-print { display: none !important; } }
      `}</style>
      <div style={S.inner}>

        <div className="no-print" style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Reports</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Hostel Welfare Eligibility</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>Hostel students, by class, showing who qualifies for welfare schemes (SC/ST/BC/EWS)</p>
        </div>

        <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#fff' }}>{totalHostel}</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Hostel students</p>
          </div>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#9A8AE0' }}>{totalEligible}</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Welfare eligible</p>
          </div>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#E8A020' }}>{schoolPct}%</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>School-wide</p>
          </div>
        </div>

        <div className="no-print">
        {byClass.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#161618', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No hostel students recorded yet.</p>
          </div>
        ) : (
          byClass.map((row) => {
            const isExpanded = expanded === row.class.id;
            const pct = row.hostelCount > 0 ? Math.round((row.eligibleCount / row.hostelCount) * 100) : 0;
            return (
              <div key={row.class.id} style={S.card}>
                <button onClick={() => setExpanded(isExpanded ? null : row.class.id)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{isExpanded ? '\u25bc' : '\u25b6'} {row.class.class_name}</span>
                  <span style={{ fontSize: 13, color: '#9A8AE0', fontWeight: 600 }}>{row.eligibleCount}/{row.hostelCount} eligible</span>
                </button>
                <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#9A8AE0', width: `${pct}%` }} />
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {row.eligible.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>No welfare-eligible students in this class's hostel group.</p>
                    ) : (
                      row.eligible.map((s) => (
                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                          <span style={{ color: '#fff' }}>{s.full_name} ({s.sid})</span>
                          <span style={{ color: '#9A8AE0' }}>{s.caste_category}</span>
                        </div>
                      ))
                    )}
                  </div>
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
          <PrintHeader documentTitle="Hostel Welfare Eligibility Report" />
          <p style={{ fontSize: 12, marginBottom: 16 }}>Hostel students: <strong>{totalHostel}</strong> · Welfare eligible: <strong>{totalEligible}</strong> ({schoolPct}%)</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>{exportHeaders.map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #000' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.full_name}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.sid}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.classes?.class_name}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{s.caste_category || 'Not specified'}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{WELFARE_CATEGORIES.includes(s.caste_category) ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
      <SchoolNav />
      <BugReporter screenName="hostel_welfare_report" />
    </div>
  );
}

export default function HostelWelfareReport() {
  return (
    <TierGate requiredTier="advanced" featureName="Hostel Welfare Eligibility Report">
      <HostelWelfareReportContent />
    </TierGate>
  );
}
