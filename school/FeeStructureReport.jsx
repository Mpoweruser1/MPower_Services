// school/FeeStructureReport.jsx — UPDATED
// Every fee defined, rolled up: how many students were billed, the list value, any concessions
// given, what was actually billed, collected and still owed. Works for fixed fees and for fees priced
// by hostel room or by distance (the amount comes from each student's own due, not the fee's amount).
// Turned-off fees are hidden unless asked for. For room / distance fees it also says how many
// students still cannot be billed because their room or distance is not set up.
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import PrintHeader from '../shared/PrintHeader';
import { exportToExcel } from '../shared/exportExcel';
import TierGate from '../shared/TierGate';
import BugReporter from '../shared/BugReporter';
import { fetchAllIn, istToday } from '../shared/schoolDates';

function currency(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }

const CATEGORY_LABEL = {
  tuition: 'Tuition', admission: 'Admission', hostel: 'Hostel', transport: 'Transport', computer: 'Computer lab',
  exam: 'Exam', books_uniform: 'Books & uniform', activities: 'Activities', other: 'Other',
};
const PRICING_LABEL = { fixed: 'Fixed amount', hostel_room: 'By room', transport_distance: 'By distance' };

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

function FeeStructureReportContent() {
  const { tenant } = useTenant();
  const [rows, setRows] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [showOff, setShowOff] = useState(false);

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    setLoadError('');
    const { data: structures, error: sErr } = await supabase
      .from('fee_structure')
      .select('id, fee_type, amount, academic_year, class_id, category, pricing, active, classes(class_name)')
      .eq('app_id', tenant.appId).order('created_at', { ascending: false });
    if (sErr) { console.error('Loading fee structures failed:', sErr); setLoadError(sErr.message || 'Could not load fees.'); setLoading(false); return; }

    const { data: gapRows } = await supabase.rpc('school_fee_setup_gaps');
    setGaps(gapRows || []);

    const structureIds = (structures || []).map((s) => s.id);
    if (structureIds.length === 0) { setRows([]); setLoading(false); return; }

    // Read page by page: the database returns at most 1,000 rows per request,
    // and a school with several fees per student passes that quickly.
    let allDues;
    try {
      allDues = await fetchAllIn(structureIds, (chunk, from, to) => supabase
        .from('fee_dues')
        .select('id, fee_structure_id, amount_due, list_amount, concession_amount, student_id, students(full_name, sid, status), fee_payments(amount)')
        .in('fee_structure_id', chunk)
        .order('id').range(from, to));
    } catch (dErr) { console.error('Loading fee dues failed:', dErr); setLoadError(dErr.message || 'Could not load fee dues.'); setLoading(false); return; }

    const dues = (allDues || []).filter((d) => d.students?.status === 'active');

    const enriched = (structures || []).map((structure) => {
      const structureDues = dues.filter((d) => d.fee_structure_id === structure.id);
      const withPaid = structureDues.map((d) => ({ ...d, paid: (d.fee_payments || []).reduce((s, p) => s + Number(p.amount), 0) }));
      const studentCount = withPaid.length;
      const billed = withPaid.reduce((s, d) => s + Number(d.amount_due), 0);
      // Dues made before concessions existed have no list amount: their list value is what they were billed.
      const concession = withPaid.reduce((s, d) => s + Number(d.concession_amount || 0), 0);
      const listValue = billed + concession;
      const collected = withPaid.reduce((s, d) => s + d.paid, 0);
      const outstanding = Math.max(0, billed - collected);
      const pct = billed > 0 ? Math.round((collected / billed) * 100) : 0;
      const unpaidStudents = withPaid.filter((d) => d.paid < Number(d.amount_due));
      return { ...structure, studentCount, listValue, concession, billed, collected, outstanding, pct, unpaidStudents };
    });

    setRows(enriched);
    setLoading(false);
  }

  const shown = rows.filter((r) => showOff || r.active !== false);
  const offCount = rows.filter((r) => r.active === false).length;
  const totals = shown.reduce((t, r) => ({
    billed: t.billed + r.billed, concession: t.concession + r.concession, collected: t.collected + r.collected, outstanding: t.outstanding + r.outstanding,
  }), { billed: 0, concession: 0, collected: 0, outstanding: 0 });

  function gapsFor(r) {
    if (r.pricing === 'hostel_room') return gaps.filter((g) => g.kind === 'hostel');
    if (r.pricing === 'transport_distance') return gaps.filter((g) => g.kind === 'transport');
    return [];
  }

  const exportHeaders = ['Fee type', 'Category', 'Pricing', 'Class', 'Academic year', 'Status', 'Students billed', 'List value', 'Concessions', 'Billed', 'Collected', 'Outstanding', '% collected'];
  const exportRows = shown.map((r) => [
    r.fee_type, CATEGORY_LABEL[r.category] || 'Other', PRICING_LABEL[r.pricing] || 'Fixed amount', r.classes?.class_name || 'All classes',
    r.academic_year, r.active === false ? 'Turned off' : 'Active', r.studentCount, r.listValue, r.concession, r.billed, r.collected, r.outstanding, `${r.pct}%`,
  ]);

  function exportCsv() {
    const csvRows = [exportHeaders, ...exportRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fee_structure_report_${istToday()}.csv`;
    a.click();
  }

  function exportExcelFile() {
    exportToExcel(`fee_structure_report_${istToday()}`, [
      { name: 'Fee Structure Report', headers: exportHeaders, rows: exportRows },
    ]);
  }

  if (loading) return <div style={{ ...S.page, textAlign: 'center', paddingTop: 60 }}><p style={{ color: 'rgba(255,255,255,0.3)' }}>Loading...</p><SchoolNav /></div>;

  if (loadError) return (
    <div style={{ ...S.page, paddingTop: 40 }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 20 }}>
        <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#E05A5A' }}>⚠️ {loadError}</div>
      </div>
      <SchoolNav />
    </div>
  );

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
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>Every fee you have set up — how much was billed, how much of it was given as concession, collected and still owed</p>
        </div>

        {shown.length > 0 && (
          <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              ['Billed', totals.billed, '#fff'],
              ['Concessions given', totals.concession, '#9A8AE0'],
              ['Collected', totals.collected, '#6AAA90'],
              ['Outstanding', totals.outstanding, '#E05A5A'],
            ].map(([l, v, c]) => (
              <div key={l} style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: c }}>{currency(v)}</p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{l}</p>
              </div>
            ))}
          </div>
        )}

        {offCount > 0 && (
          <div className="no-print" style={{ marginBottom: 12 }}>
            <button onClick={() => setShowOff((v) => !v)}
              style={{ padding: '6px 14px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: showOff ? 'rgba(255,255,255,0.08)' : 'transparent', color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit' }}>
              {showOff ? 'Hide' : 'Show'} {offCount} turned-off fee{offCount === 1 ? '' : 's'}
            </button>
          </div>
        )}

        <div className="no-print">
        {shown.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#161618', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{rows.length === 0 ? 'No fee structures created yet.' : 'No active fees. Use the button above to see turned-off fees.'}</p>
          </div>
        ) : (
          shown.map((r) => {
            const isExpanded = expanded === r.id;
            const g = gapsFor(r);
            return (
              <div key={r.id} style={{ ...S.card, opacity: r.active === false ? 0.6 : 1 }}>
                <button onClick={() => setExpanded(isExpanded ? null : r.id)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#fff', textAlign: 'left' }}>{isExpanded ? '▼' : '▶'} {r.fee_type}{r.active === false && <span style={{ fontSize: 11, color: '#E8A020', fontWeight: 500 }}> (turned off)</span>}</span>
                  <span style={{ fontSize: 13, color: '#E8A020', fontWeight: 600 }}>{r.pct}%</span>
                </button>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>
                  {CATEGORY_LABEL[r.category] || 'Other'} · {PRICING_LABEL[r.pricing] || 'Fixed amount'} · {r.classes?.class_name || 'All classes'} · {r.academic_year} · {r.studentCount} student{r.studentCount === 1 ? '' : 's'} billed
                </p>
                <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', background: '#6AAA90', width: `${Math.min(r.pct, 100)}%` }} />
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                  {currency(r.collected)} collected of {currency(r.billed)} billed · {currency(r.outstanding)} owed
                </p>
                {r.concession > 0 && (
                  <p style={{ fontSize: 11, color: '#9A8AE0', margin: '4px 0 0' }}>List value {currency(r.listValue)} − concessions {currency(r.concession)} = billed {currency(r.billed)}</p>
                )}
                {g.length > 0 && (
                  <p style={{ fontSize: 11, color: '#E8A020', margin: '6px 0 0' }}>
                    ⚠ {g.length} {r.pricing === 'hostel_room' ? 'hostel' : 'transport'} student{g.length === 1 ? '' : 's'} in the school cannot be billed yet (missing {r.pricing === 'hostel_room' ? 'room or rate' : 'distance or band'}). Fix on the <Link to={r.pricing === 'hostel_room' ? '/school/hostel' : '/school/transport'} style={{ color: '#5A9ADF' }}>{r.pricing === 'hostel_room' ? 'Hostel' : 'Transport'}</Link> screen, then use "Update dues" on the Fee Structure screen.
                  </p>
                )}

                {isExpanded && r.unpaidStudents.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>Not fully paid ({r.unpaidStudents.length})</p>
                    {r.unpaidStudents.map((d) => (
                      <div key={d.student_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                        <span style={{ color: '#fff' }}>{d.students?.full_name}{Number(d.concession_amount) > 0 && <span style={{ color: '#9A8AE0' }}> · concession {currency(d.concession_amount)}</span>}</span>
                        <span style={{ color: '#E05A5A' }}>{currency(Number(d.amount_due) - d.paid)} owed</span>
                      </div>
                    ))}
                  </div>
                )}
                {isExpanded && r.unpaidStudents.length === 0 && (
                  <p style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#6AAA90' }}>
                    {r.studentCount === 0 ? 'No dues have been created for this fee yet. Use "Update dues" on the Fee Structure screen.' : 'Fully collected — no one owes anything on this fee.'}
                  </p>
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>{['Fee', 'Category', 'Class', 'Year', 'Students', 'List value', 'Concessions', 'Billed', 'Collected', 'Owed', '%'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '5px 6px', borderBottom: '2px solid #000' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{r.fee_type}{r.active === false ? ' (off)' : ''}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{CATEGORY_LABEL[r.category] || 'Other'}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{r.classes?.class_name || 'All classes'}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{r.academic_year}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{r.studentCount}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{currency(r.listValue)}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{currency(r.concession)}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{currency(r.billed)}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{currency(r.collected)}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{currency(r.outstanding)}</td>
                  <td style={{ padding: '4px 6px', borderBottom: '1px solid #ddd' }}>{r.pct}%</td>
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
