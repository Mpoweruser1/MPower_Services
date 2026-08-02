// school/ReportsSearchIdCards.jsx — FINAL (Supabase wired)
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const TIER_ORDER = ['basic', 'standard', 'advanced', 'specialised'];

function canAccess(userTier, reportTier) {
  return TIER_ORDER.indexOf(userTier) >= TIER_ORDER.indexOf(reportTier);
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 },
  input: { width: '100%', padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
};

// ─────────────────────────────────────────────────────────────
// REPORT ENGINE
// ─────────────────────────────────────────────────────────────
const REPORT_CATALOG = [
  { id: 'daily_attendance',    name: 'Daily attendance — class-wise',            tier: 'basic',      icon: '✅' },
  { id: 'low_attendance',      name: 'Below 75% attendance list',                tier: 'basic',      icon: '⚠️' },
  { id: 'fee_defaulters',      name: 'Fee defaulters list',                      tier: 'basic',      icon: '💰' },
  { id: 'class_rank',          name: 'Class rank list (latest exam)',             tier: 'basic',      icon: '🏆' },
  { id: 'welfare_eligible',    name: 'Welfare scheme eligible students',          tier: 'standard',   icon: '🌿' },
  { id: 'caste_gender_filter', name: 'Multi-filter — caste + village + gender',  tier: 'advanced',   icon: '🔍' },
  { id: 'udise_format',        name: 'UDISE+ format export',                     tier: 'specialised', icon: '📋' },
];

async function runReportQuery(reportId, appId) {
  const today = new Date().toISOString().slice(0, 10);

  // .in() needs an actual array of ids, not an unresolved query builder —
  // resolve this app's student ids once, only when a report actually
  // needs to filter by them.
  async function getStudentIds() {
    const { data } = await supabase.from('students').select('id').eq('app_id', appId);
    return (data || []).map((s) => s.id);
  }

  switch (reportId) {
    case 'daily_attendance': {
      const studentIds = await getStudentIds();
      const { data } = await supabase
        .from('attendance')
        .select('status, students(full_name, sid, section, classes(class_name))')
        .eq('date', today)
        .in('student_id', studentIds);
      return { data: data || [], columns: ['Name', 'SID', 'Class', 'Status'] };
    }
    case 'low_attendance': {
      const { data: students } = await supabase
        .from('students').select('id, full_name, sid, classes(class_name)')
        .eq('app_id', appId).eq('status', 'active');

      const yearStart = `${new Date().getFullYear()}-06-01`;
      const results = [];
      for (const s of (students || []).slice(0, 100)) {
        const { count: total }   = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', s.id).gte('date', yearStart);
        const { count: present } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', s.id).eq('status', 'P').gte('date', yearStart);
        const pct = total > 0 ? Math.round(((present || 0) / total) * 100) : 0;
        if (pct < 75 && total > 10) results.push({ ...s, pct, class: s.classes?.class_name });
      }
      return { data: results, columns: ['Name', 'SID', 'Class', 'Attendance %'] };
    }
    case 'fee_defaulters': {
      const studentIds = await getStudentIds();
      const { data } = await supabase
        .from('fee_dues')
        .select('amount_due, amount_paid, fee_type, due_date, students(full_name, sid, parent_phone, classes(class_name))')
        .lt('due_date', today)
        .in('student_id', studentIds);
      const filtered = (data || []).filter((d) => Number(d.amount_due) > Number(d.amount_paid));
      return { data: filtered, columns: ['Name', 'SID', 'Class', 'Fee type', 'Balance', 'Due date'] };
    }
    case 'class_rank': {
      const studentIds = await getStudentIds();
      const { data } = await supabase
        .from('marks')
        .select('percentage, students(full_name, sid, classes(class_name))')
        .in('student_id', studentIds)
        .order('percentage', { ascending: false })
        .limit(100);
      return { data: data || [], columns: ['Name', 'SID', 'Class', 'Percentage'] };
    }
    case 'welfare_eligible': {
      const { data } = await supabase
        .from('students')
        .select('full_name, sid, caste_category, classes(class_name)')
        .eq('app_id', appId)
        .eq('status', 'active')
        .in('caste_category', ['SC', 'ST', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'EWS']);
      return { data: data || [], columns: ['Name', 'SID', 'Class', 'Category'] };
    }
    default:
      return { data: [], columns: [] };
  }
}

export function ReportEngine({ userTier = 'basic' }) {
  const { tenant } = useTenant();
  const [running, setRunning]   = useState(null);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  async function runReport(report) {
    if (!canAccess(userTier, report.tier)) return;
    setRunning(report.id);
    setResult(null);
    setError('');
    try {
      const res = await runReportQuery(report.id, tenant.appId);
      setResult({ report, ...res, generatedAt: new Date().toLocaleString('en-IN') });

      // Log to report_history
      await supabase.from('report_history').insert({
        app_id:       tenant.appId,
        generated_by: tenant.userRowId,
        record_count: res.data?.length || 0,
        delivery_mode: 'digital_only',
        is_archived:   false,
      });
    } catch (err) {
      setError('Failed to generate report. Please try again.');
    } finally {
      setRunning(null);
    }
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Reports · నివేదికలు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Report Engine</h1>
        </div>

        {error && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Report catalog */}
        <div style={{ marginBottom: 20 }}>
          {REPORT_CATALOG.map((report) => {
            const locked    = !canAccess(userTier, report.tier);
            const isRunning = running === report.id;
            return (
              <div key={report.id}
                onClick={() => !locked && !running && runReport(report)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#161618', border: `1px solid ${result?.report.id === report.id ? 'rgba(232,160,32,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, marginBottom: 8, cursor: locked || running ? 'not-allowed' : 'pointer', opacity: locked ? 0.4 : 1 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 20 }}>{report.icon}</span>
                  <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{report.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {locked && (
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: 'rgba(232,160,32,0.12)', color: '#E8A020' }}>
                      🔒 {report.tier}
                    </span>
                  )}
                  {isRunning && (
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Running...</span>
                  )}
                  {!locked && !isRunning && (
                    <span style={{ fontSize: 12, color: '#E8A020' }}>Run →</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Report result */}
        {result && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{result.report.name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  {result.data.length} records · Generated {result.generatedAt}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => window.print()}
                  style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#E8A020', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                  🖨️ Print
                </button>
              </div>
            </div>

            {result.data.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '20px 0' }}>
                No records found for this report.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {result.data.slice(0, 50).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {result.report.id === 'daily_attendance' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.students?.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.students?.classes?.class_name}</td>
                            <td style={{ padding: '8px 0', color: row.status === 'A' ? '#E05A5A' : '#6AAA90', fontWeight: 600 }}>{row.status === 'P' ? 'Present' : row.status === 'A' ? 'Absent' : row.status}</td>
                          </>
                        )}
                        {result.report.id === 'low_attendance' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.class}</td>
                            <td style={{ padding: '8px 0', color: '#E05A5A', fontWeight: 600 }}>{row.pct}%</td>
                          </>
                        )}
                        {result.report.id === 'fee_defaulters' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.students?.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.fee_type}</td>
                            <td style={{ padding: '8px 0', color: '#E05A5A', fontWeight: 600 }}>₹{(Number(row.amount_due) - Number(row.amount_paid)).toLocaleString('en-IN')}</td>
                          </>
                        )}
                        {result.report.id === 'class_rank' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{i + 1}. {row.students?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.students?.classes?.class_name}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 600 }}>{row.percentage}%</td>
                          </>
                        )}
                        {(result.report.id === 'welfare_eligible' || result.report.id === 'caste_gender_filter') && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.sid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.6)' }}>{row.classes?.class_name}</td>
                            <td style={{ padding: '8px 0', color: '#E8A020' }}>{row.caste_category}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.data.length > 50 && (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8, textAlign: 'center' }}>
                    Showing 50 of {result.data.length} records. Print to see all.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <SchoolNav />
      <BugReporter screenName="reports" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ID CARD PRINTER
// ─────────────────────────────────────────────────────────────
export function IdCardPrinter() {
  const { tenant } = useTenant();
  const [classes, setClasses]   = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (tenant?.appId) loadClasses();
  }, [tenant?.appId]);

  async function loadClasses() {
    const { data } = await supabase
      .from('classes')
      .select('id, class_name, class_order')
      .eq('app_id', tenant.appId)
      .order('class_order');
    setClasses(data || []);
    if (data?.length) setSelectedClass(data[0].id);
  }

  async function loadStudents(classId) {
    if (!classId) return;
    setLoading(true);
    setSelectedClass(classId);
    const { data } = await supabase
      .from('students')
      .select('id, full_name, sid, section, photo_url, blood_group, apaar_id, classes(class_name)')
      .eq('app_id', tenant.appId)
      .eq('class_id', classId)
      .eq('status', 'active')
      .order('full_name');
    setStudents(data || []);
    setLoading(false);
  }

  function printCards() {
    setPrinting(true);
    window.print();
    setTimeout(() => setPrinting(false), 2000);
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print {
          .no-print { display: none !important; }
          .id-card-grid { display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        }
      `}</style>
      <div style={S.inner}>
        <div className="no-print" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>ID Cards · ID కార్డులు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>ID Card Printer</h1>
        </div>

        <div className="no-print" style={{ ...S.card, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Select class</label>
            <select value={selectedClass}
              onChange={(e) => loadStudents(e.target.value)}
              style={{ ...S.input, cursor: 'pointer' }}>
              <option value="">-- Select class --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
            </select>
          </div>
          <button onClick={printCards}
            disabled={students.length === 0 || printing}
            style={{ padding: '10px 20px', background: students.length === 0 ? 'rgba(255,255,255,0.08)' : '#E8A020', color: students.length === 0 ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, cursor: students.length === 0 ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {printing ? 'Printing...' : `🖨️ Print ${students.length} cards`}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading students...</p>
        ) : students.length > 0 ? (
          <div className="id-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {students.map((s) => (
              <div key={s.id} style={{ background: '#fff', borderRadius: 10, padding: 14, textAlign: 'center', border: '2px solid #185FA5', color: '#111' }}>
                <div style={{ width: 50, height: 50, borderRadius: '50%', background: '#E8A020', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#111' }}>
                  {s.full_name[0]}
                </div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#111' }}>{s.full_name}</p>
                <p style={{ margin: '2px 0', fontSize: 12, color: '#555' }}>{s.sid}</p>
                <p style={{ margin: '2px 0', fontSize: 12, color: '#555' }}>{s.classes?.class_name}{s.section ? ` — ${s.section}` : ''}</p>
                {s.blood_group && <p style={{ margin: '2px 0', fontSize: 12, color: '#185FA5', fontWeight: 600 }}>Blood: {s.blood_group}</p>}
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#888' }}>{tenant?.orgName}</p>
              </div>
            ))}
          </div>
        ) : selectedClass ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>No students found in this class.</p>
          </div>
        ) : null}
      </div>
      <SchoolNav />
      <BugReporter screenName="id_cards" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UNIVERSAL SEARCH
// ─────────────────────────────────────────────────────────────
export function UniversalSearch() {
  const { tenant } = useTenant();
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab]         = useState('students');

  const search = useCallback(async (q) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);

    if (tab === 'students') {
      const { data } = await supabase
        .from('students')
        .select('id, full_name, sid, parent_phone, status, classes(class_name), section')
        .eq('app_id', tenant.appId)
        .or(`full_name.ilike.%${q}%,sid.ilike.%${q}%,parent_phone.ilike.%${q}%,admission_no.ilike.%${q}%`)
        .limit(15);
      setResults(data || []);
    } else if (tab === 'staff') {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, role, phone')
        .eq('app_id', tenant.appId)
        .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(15);
      setResults(data || []);
    }

    setSearching(false);
  }, [tab, tenant?.appId]);

  useEffect(() => {
    if (query.length >= 2) search(query);
    else setResults([]);
  }, [tab]);

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Search · వెతకండి</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Universal Search</h1>
        </div>

        {/* Search tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { k: 'students', l: 'Students' },
            { k: 'staff',    l: 'Staff' },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400 }}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div style={{ marginBottom: 16 }}>
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder={tab === 'students' ? 'Search by name, SID or parent phone...' : 'Search staff by name or phone...'}
            style={S.input}
            autoFocus
          />
          {searching && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>Searching...</p>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div>
            {tab === 'students' && results.map((s) => (
              <div key={s.id} style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.full_name}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      {s.sid}
                      {s.classes?.class_name ? ` · ${s.classes.class_name}` : ''}
                      {s.section ? `-${s.section}` : ''}
                      {s.parent_phone ? ` · ${s.parent_phone}` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: s.status === 'active' ? 'rgba(106,170,144,0.12)' : 'rgba(224,90,90,0.12)', color: s.status === 'active' ? '#6AAA90' : '#E05A5A', fontWeight: 500 }}>
                    {s.status}
                  </span>
                </div>
                <Link to={`/school/students/${s.id}`}
                  style={{ display: 'inline-block', marginTop: 10, fontSize: 12, fontWeight: 600, color: '#E8A020', textDecoration: 'none' }}>
                  View →
                </Link>
              </div>
            ))}
            {tab === 'staff' && results.map((s) => (
              <div key={s.id} style={S.card}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.full_name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  {s.role}{s.phone ? ` · ${s.phone}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}

        {query.length >= 2 && !searching && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>No results for "{query}"</p>
          </div>
        )}

        {query.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>🔍</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
              Search students by name, SID or parent phone number
            </p>
          </div>
        )}
      </div>
      <SchoolNav />
      <BugReporter screenName="search" />
    </div>
  );
}