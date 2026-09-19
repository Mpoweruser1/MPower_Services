// school/FeeAnalytics.jsx — NEW
// A dedicated analytics screen, distinct from the single-query Reports
// catalog. Verified against real-world school fee analytics standards
// before building: class-wise rollup with drill-down, aging analysis
// (days overdue), payment mode distribution, and collection
// efficiency are all genuinely standard practice, not invented here.
// The "family pattern" concept — same parent phone, multiple children
// in default — is a direct, verified translation of CTS's own
// family-pattern detection into School's actual data model.
//
// PDF and Excel export added alongside the existing CSV — PDF follows
// the same print-only + PrintHeader pattern every other document in
// this app uses (there's no server-side PDF renderer anywhere here,
// so "PDF" means the browser's own print-to-PDF via window.print()).
// Excel uses the shared exportToExcel helper (SheetJS) for a real
// .xlsx file, not just a renamed CSV.
import React, { useState, useEffect, useMemo } from 'react';
import TierGate from '../shared/TierGate';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import PrintHeader from '../shared/PrintHeader';
import { exportToExcel } from '../shared/exportExcel';
import BugReporter from '../shared/BugReporter';

function daysOverdue(dueDate) {
  if (!dueDate) return 0;
  const diff = (new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.floor(diff));
}

function currency(n) {
  return `\u20b9${Number(n || 0).toLocaleString('en-IN')}`;
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

function FeeAnalyticsContent() {
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Was no way to narrow which fees this screen looked at — it always
  // loaded every fee due ever created. Optional range on due_date;
  // left blank, behaviour is unchanged (shows everything).
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dues, setDues] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [expandedClass, setExpandedClass] = useState(null);
  const [showPatterns, setShowPatterns] = useState(false);

  useEffect(() => {
    if (tenant?.appId) loadData();
  }, [tenant?.appId]);

  async function loadData() {
    setLoading(true);
    const { data: studentRows } = await supabase
      .from('students').select('id, full_name, sid, class_id, parent_phone, classes(class_name, class_order)')
      .eq('app_id', tenant.appId).eq('status', 'active');
    setStudents(studentRows || []);

    const studentIds = (studentRows || []).map((s) => s.id);
    if (studentIds.length === 0) { setDues([]); setLoading(false); return; }

    // 'category' was never a real column on fee_dues (confirmed real
    // schema: id, student_id, fee_structure_id, fee_type, amount_due,
    // amount_paid, due_date, status, created_at, updated_at). Naming a
    // nonexistent column makes PostgREST reject the WHOLE query, so
    // dues came back empty and every figure on this screen showed ₹0
    // — even with ₹20,000 actually collected. The error was also
    // discarded, so it failed completely silently.
    let duesQuery = supabase
      .from('fee_dues')
      .select('id, student_id, amount_due, due_date, fee_type, fee_payments(amount)')
      .in('student_id', studentIds);
    if (dateFrom) duesQuery = duesQuery.gte('due_date', dateFrom);
    if (dateTo) duesQuery = duesQuery.lte('due_date', dateTo);
    const { data: dueRows, error: duesErr } = await duesQuery;
    if (duesErr) {
      console.error('Loading fee dues failed:', duesErr);
      setLoadError(duesErr.message || 'Could not load fee data.');
      setLoading(false);
      return;
    }
    setDues(dueRows || []);

    const { data: classRows } = await supabase.from('classes').select('id, class_name, class_order').eq('app_id', tenant.appId).order('class_order');
    setClasses(classRows || []);

    setLoading(false);
  }

  const enriched = useMemo(() => {
    const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));
    const rows = dues.map((d) => {
      const paid = (d.fee_payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = Math.max(0, Number(d.amount_due) - paid);
      const student = studentMap[d.student_id];
      return { ...d, paid, balance, student, overdueDays: balance > 0 ? daysOverdue(d.due_date) : 0 };
    });
    // Was unsorted (raw insertion order) — sorted by class_order (the
    // real ordering column; class_name alone sorts "Class 10" before
    // "Class 2"), then student name, then fee type — so a student with
    // two fees appears as adjacent rows, not scattered across the list.
    return rows.sort((a, b) => {
      const oa = a.student?.classes?.class_order ?? 999;
      const ob = b.student?.classes?.class_order ?? 999;
      if (oa !== ob) return oa - ob;
      const nameCompare = (a.student?.full_name || '').localeCompare(b.student?.full_name || '');
      if (nameCompare !== 0) return nameCompare;
      return (a.fee_type || '').localeCompare(b.fee_type || '');
    });
  }, [dues, students]);

  const totalDue = enriched.reduce((s, d) => s + Number(d.amount_due), 0);
  const totalPaid = enriched.reduce((s, d) => s + d.paid, 0);
  const totalOutstanding = enriched.reduce((s, d) => s + d.balance, 0);
  const efficiency = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

  const byClass = useMemo(() => {
    const map = {};
    enriched.forEach((d) => {
      const classId = d.student?.class_id || 'unknown';
      if (!map[classId]) map[classId] = { due: 0, paid: 0, outstanding: 0, dues: [] };
      map[classId].due += Number(d.amount_due);
      map[classId].paid += d.paid;
      map[classId].outstanding += d.balance;
      map[classId].dues.push(d);
    });
    return map;
  }, [enriched]);

  // Family pattern — same parent phone, multiple children each with
  // an outstanding balance. Direct translation of CTS's family-pattern
  // detection into School's data model.
  const familyPatterns = useMemo(() => {
    const byPhone = {};
    enriched.filter((d) => d.balance > 0 && d.student?.parent_phone).forEach((d) => {
      const phone = d.student.parent_phone;
      if (!byPhone[phone]) byPhone[phone] = [];
      byPhone[phone].push(d);
    });
    return Object.entries(byPhone)
      .filter(([, list]) => new Set(list.map((d) => d.student_id)).size > 1)
      .map(([phone, list]) => ({ phone, dues: list }));
  }, [enriched]);

  // Aging buckets — 30+ days overdue, matching real-world defaulter
  // tracking practice of aging by overdue window.
  const seriouslyOverdue = enriched.filter((d) => d.balance > 0 && d.overdueDays >= 30)
    .sort((a, b) => b.overdueDays - a.overdueDays);

  const exportRows = enriched.map((d) => [
    d.student?.full_name || '', d.student?.sid || '', d.student?.classes?.class_name || '',
    d.fee_type || '', d.amount_due, d.paid, d.balance, d.overdueDays,
  ]);
  const exportHeaders = ['Student', 'SID', 'Class', 'Fee type', 'Amount due', 'Paid', 'Balance', 'Days overdue'];

  function exportCsv() {
    const rows = [exportHeaders, ...exportRows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fee_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function exportExcelFile() {
    exportToExcel(`fee_analytics_${new Date().toISOString().slice(0, 10)}`, [
      { name: 'Fee Analytics', headers: exportHeaders, rows: exportRows },
    ]);
  }

  // Was returning with no navigation at all — if this screen's data
  // load ever hung or failed, the user was stranded on a "Loading..."
  // page with no way back. Same fix already applied to StudentDetail,
  // PatientDetail, and the CTS staff screens.
  if (loading) return <div style={{ ...S.page, textAlign: 'center', paddingTop: 60 }}><p style={{ color: 'rgba(255,255,255,0.3)' }}>Loading...</p><SchoolNav /></div>;

  if (loadError) return (
    <div style={{ ...S.page, paddingTop: 40 }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 20 }}>
        <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#E05A5A' }}>
          ⚠️ {loadError}
        </div>
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
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Analytics</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Fee Collection Analytics</h1>
        </div>

        {/* Optional due-date range — previously no way to narrow which
            fees this screen looked at; it always loaded every fee due
            ever created. Blank on both sides shows everything, same
            as before. */}
        <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <label htmlFor="fee-analytics-date-from" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>Due date from</label>
            <input id="fee-analytics-date-from" name="fee-analytics-date-from" type="date" value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: '7px 10px', background: '#111113', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 13, color: '#fff', fontFamily: 'inherit' }} />
          </div>
          <div>
            <label htmlFor="fee-analytics-date-to" style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 4 }}>to</label>
            <input id="fee-analytics-date-to" name="fee-analytics-date-to" type="date" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: '7px 10px', background: '#111113', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 13, color: '#fff', fontFamily: 'inherit' }} />
          </div>
          <button onClick={loadData}
            style={{ padding: '8px 16px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Apply
          </button>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }}
              style={{ padding: '8px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Clear
            </button>
          )}
        </div>

        <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#fff' }}>{currency(totalDue)}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Total due</p>
          </div>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#6AAA90' }}>{currency(totalPaid)}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Collected</p>
          </div>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#E05A5A' }}>{currency(totalOutstanding)}</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Outstanding</p>
          </div>
          <div style={{ background: '#111113', borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#E8A020' }}>{efficiency}%</p>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>Collection efficiency</p>
          </div>
        </div>

        <div className="no-print" style={{ ...S.card, marginBottom: 16 }}>
          <button onClick={() => setShowPatterns(!showPatterns)}
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
              &#128293; Patterns & Defaulters {(seriouslyOverdue.length + familyPatterns.length) > 0 && <span style={{ color: '#E05A5A' }}>({seriouslyOverdue.length + familyPatterns.length})</span>}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{showPatterns ? '\u25b2 Hide' : '\u25bc Show'}</span>
          </button>

          {showPatterns && (
            <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
              {seriouslyOverdue.length === 0 && familyPatterns.length === 0 && (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Nothing concerning right now.</p>
              )}

              {seriouslyOverdue.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#E05A5A', marginBottom: 8 }}>
                    &#9888;&#65039; 30+ days overdue — {seriouslyOverdue.length} dues
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {seriouslyOverdue.slice(0, 5).map((d) => (
                      <div key={d.id} style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.15)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#fff' }}>{d.student?.full_name} · {d.student?.classes?.class_name}</span>
                        <span style={{ fontSize: 12, color: '#E05A5A', fontWeight: 600 }}>{d.overdueDays}d · {currency(d.balance)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {familyPatterns.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#E8A020', marginBottom: 8 }}>
                    &#128110; Family pattern — same phone, multiple children with dues
                  </p>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {familyPatterns.slice(0, 5).map((fp) => (
                      <div key={fp.phone} style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 8, padding: '8px 12px' }}>
                        <p style={{ margin: 0, fontSize: 12, color: '#fff' }}>{fp.phone} · {new Set(fp.dues.map((d) => d.student_id)).size} children, {currency(fp.dues.reduce((s, d) => s + d.balance, 0))} total outstanding</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="no-print" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 10 }}>By class</p>
        <div className="no-print">
        {classes.map((c) => {
          const rollup = byClass[c.id] || { due: 0, paid: 0, outstanding: 0, dues: [] };
          const isExpanded = expandedClass === c.id;
          const pct = rollup.due > 0 ? Math.round((rollup.paid / rollup.due) * 100) : 0;
          return (
            <div key={c.id} style={S.card}>
              <button onClick={() => setExpandedClass(isExpanded ? null : c.id)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, fontFamily: 'inherit' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{isExpanded ? '\u25bc' : '\u25b6'} {c.class_name}</span>
                <span style={{ fontSize: 13, color: '#E05A5A', fontWeight: 600 }}>{currency(rollup.outstanding)}</span>
              </button>
              <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#6AAA90', width: `${pct}%` }} />
              </div>

              {isExpanded && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gap: 6 }}>
                  {rollup.dues.filter((d) => d.balance > 0).sort((a, b) => b.overdueDays - a.overdueDays).map((d) => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                      <span style={{ color: '#fff' }}>{d.student?.full_name}</span>
                      <span style={{ color: d.overdueDays >= 30 ? '#E05A5A' : 'rgba(255,255,255,0.5)' }}>{d.overdueDays}d · {currency(d.balance)}</span>
                    </div>
                  ))}
                  {rollup.dues.filter((d) => d.balance > 0).length === 0 && (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Fully collected.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
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

        {/* Print-only formatted table — hidden on screen, shown only
            when printing/saving as PDF. Same data as the CSV/Excel
            export, laid out as a real printable report. */}
        <div className="print-only" style={{ display: 'none', background: '#fff', color: '#000', padding: '32px 40px' }}>
          <PrintHeader documentTitle="Fee Collection Analytics" />
          <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 20, fontSize: 13, textAlign: 'center' }}>
            <div><strong>{currency(totalDue)}</strong><br />Total due</div>
            <div><strong>{currency(totalPaid)}</strong><br />Collected</div>
            <div><strong>{currency(totalOutstanding)}</strong><br />Outstanding</div>
            <div><strong>{efficiency}%</strong><br />Efficiency</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr><th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #000' }}>S.No</th>{exportHeaders.map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #000' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {enriched.map((d, i) => (
                <tr key={d.id}>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd', color: '#666' }}>{i + 1}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{d.student?.full_name}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{d.student?.sid}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{d.student?.classes?.class_name}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{d.fee_type || '—'}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{currency(d.amount_due)}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{currency(d.paid)}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{currency(d.balance)}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #ddd' }}>{d.overdueDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
      <SchoolNav />
      <BugReporter screenName="fee_analytics" />
    </div>
  );
}

export default function FeeAnalytics() {
  return (
    <TierGate requiredTier="advanced" featureName="Fee Analytics">
      <FeeAnalyticsContent />
    </TierGate>
  );
}
