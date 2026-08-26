// hospital/HospitalReports.jsx — NEW
// Mirrors school/ReportsSearchIdCards.jsx's ReportEngine structure —
// same catalog/lock-by-tier pattern, same print-safe CSS, same fix
// for the "print to see all" bug (all rows always in the DOM, screen
// just scrolls, print releases the cap).
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import PrintHeader from '../shared/PrintHeader';
import ReportRemark from '../shared/ReportRemark';
import BugReporter from '../shared/BugReporter';

const TIER_ORDER = ['basic', 'standard', 'advanced', 'specialised'];
function canAccess(userTier, reportTier) {
  return TIER_ORDER.indexOf(userTier) >= TIER_ORDER.indexOf(reportTier);
}

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 },
};

const REPORT_CATALOG = [
  { id: 'daily_opd',        name: "Today's OPD visits",         tier: 'basic',    icon: '🩺' },
  { id: 'lab_pending',      name: 'Pending lab tests',           tier: 'basic',    icon: '🔬' },
  { id: 'lab_tests_completed', name: 'Completed lab tests',      tier: 'basic',    icon: '✅' },
  { id: 'new_registrations',name: 'New patient registrations',   tier: 'basic',    icon: '🆕' },
  { id: 'doctor_wise_opd',  name: 'OPD visits by doctor',        tier: 'standard', icon: '👨‍⚕️' },
  { id: 'ipd_admission_history', name: 'IPD admission history',  tier: 'standard', icon: '📋' },
  { id: 'bed_occupancy',    name: 'Bed occupancy by ward',       tier: 'standard', icon: '🛏️' },
  { id: 'monthly_revenue_trend', name: 'Monthly revenue trend',      tier: 'standard', icon: '📈' },
  { id: 'opd_appointment_engagement', name: 'OPD appointment engagement', tier: 'standard', icon: '📅' },
  { id: 'avg_length_of_stay', name: 'Average IPD length of stay',    tier: 'standard', icon: '⏱️' },
  { id: 'most_prescribed_medicines', name: 'Most prescribed medicines', tier: 'standard', icon: '💊' },
  { id: 'gender_distribution',   name: 'Patient gender distribution', tier: 'standard', icon: '👥' },
  { id: 'abha_consent_status',   name: 'ABHA consent status',         tier: 'standard', icon: '📋' },
  { id: 'revenue_by_mode',  name: 'Revenue by payment mode',     tier: 'standard', icon: '📊' },
  { id: 'abha_linked',      name: 'ABHA-linked patients',        tier: 'standard', icon: '🔗' },
];

async function runReportQuery(reportId, appId) {
  const today = new Date().toISOString().slice(0, 10);

  switch (reportId) {
    case 'daily_opd': {
      const { data: appPatients } = await supabase.from('patients').select('id').eq('app_id', appId);
      const ids = (appPatients || []).map((p) => p.id);
      if (ids.length === 0) return { data: [], columns: ['Patient', 'UID', 'Doctor', 'Visit date', 'Remarks'] };
      const { data } = await supabase
        .from('opd_visits')
        .select('id, visit_date, patients(full_name, patient_uid), doctors(designation, users(full_name))')
        .eq('visit_date', today)
        .in('patient_id', ids);
      return { data: data || [], columns: ['Patient', 'UID', 'Doctor', 'Visit date', 'Remarks'] };
    }
    case 'lab_pending': {
      const { data: appPatients } = await supabase.from('patients').select('id').eq('app_id', appId);
      const ids = (appPatients || []).map((p) => p.id);
      if (ids.length === 0) return { data: [], columns: ['Patient', 'UID', 'Test', 'Status', 'Remarks'] };
      const { data } = await supabase
        .from('lab_tests')
        .select('id, test_name, status, patients(full_name, patient_uid)')
        .eq('app_id', appId)
        .eq('status', 'pending')
        .in('patient_id', ids);
      return { data: data || [], columns: ['Patient', 'UID', 'Test', 'Status', 'Remarks'] };
    }
    case 'lab_tests_completed': {
      const { data: appPatients } = await supabase.from('patients').select('id').eq('app_id', appId);
      const ids = (appPatients || []).map((p) => p.id);
      if (ids.length === 0) return { data: [], columns: ['Patient', 'UID', 'Test', 'Status', 'Remarks'] };
      const { data } = await supabase
        .from('lab_tests')
        .select('id, test_name, status, patients(full_name, patient_uid)')
        .eq('app_id', appId)
        .eq('status', 'completed')
        .in('patient_id', ids);
      return { data: data || [], columns: ['Patient', 'UID', 'Test', 'Status', 'Remarks'] };
    }
    case 'new_registrations': {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const { data } = await supabase
        .from('patients')
        .select('id, full_name, patient_uid, phone, created_at')
        .eq('app_id', appId)
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false });
      return { data: data || [], columns: ['Patient', 'UID', 'Phone', 'Registered', 'Remarks'] };
    }
    case 'doctor_wise_opd': {
      const { data: appPatients } = await supabase.from('patients').select('id').eq('app_id', appId);
      const ids = (appPatients || []).map((p) => p.id);
      if (ids.length === 0) return { data: [], columns: ['Doctor', 'Designation', 'OPD visits', 'Remarks'] };
      const { data: visits } = await supabase.from('opd_visits').select('doctor_id').in('patient_id', ids);
      const { data: doctors } = await supabase.from('doctors').select('id, designation, users(full_name)').eq('app_id', appId);
      const counts = {};
      (visits || []).forEach((v) => { if (v.doctor_id) counts[v.doctor_id] = (counts[v.doctor_id] || 0) + 1; });
      const rows = (doctors || []).map((d) => ({ id: d.id, doctor_name: d.users?.full_name || 'Unknown', designation: d.designation, count: counts[d.id] || 0 }))
        .sort((a, b) => b.count - a.count);
      return { data: rows, columns: ['Doctor', 'Designation', 'OPD visits', 'Remarks'] };
    }
    case 'ipd_admission_history': {
      const { data: appPatients } = await supabase.from('patients').select('id').eq('app_id', appId);
      const ids = (appPatients || []).map((p) => p.id);
      if (ids.length === 0) return { data: [], columns: ['Patient', 'UID', 'Ward', 'Admitted', 'Discharged', 'Remarks'] };
      const { data } = await supabase
        .from('ipd_admissions')
        .select('id, admission_date, discharge_date, patients(full_name, patient_uid), wards(ward_type)')
        .in('patient_id', ids)
        .order('admission_date', { ascending: false });
      return { data: data || [], columns: ['Patient', 'UID', 'Ward', 'Admitted', 'Discharged', 'Remarks'] };
    }
    case 'bed_occupancy': {
      const { data: wardRows } = await supabase
        .from('wards').select('id, ward_type, total_beds').eq('app_id', appId);
      const wardIds = (wardRows || []).map((w) => w.id);
      const { data: admissionRows } = wardIds.length
        ? await supabase.from('ipd_admissions').select('ward_id').is('discharge_date', null).in('ward_id', wardIds)
        : { data: [] };
      const occupiedByWard = {};
      (admissionRows || []).forEach((a) => { occupiedByWard[a.ward_id] = (occupiedByWard[a.ward_id] || 0) + 1; });
      const rows = (wardRows || []).map((w) => ({
        id: w.id,
        ward_type: w.ward_type,
        total_beds: w.total_beds,
        occupied: occupiedByWard[w.id] || 0,
        available: w.total_beds - (occupiedByWard[w.id] || 0),
      }));
      return { data: rows, columns: ['Ward', 'Total beds', 'Occupied', 'Available', 'Remarks'] };
    }
    case 'opd_appointment_engagement': {
      const { data: days } = await supabase.from('opd_appointment_days').select('id, appointment_date, doctors(designation, users(full_name))').eq('app_id', appId).order('appointment_date', { ascending: false });
      const dayIds = (days || []).map((d) => d.id);
      const { data: slots } = dayIds.length
        ? await supabase.from('opd_appointment_slots').select('appointment_day_id, status').in('appointment_day_id', dayIds)
        : { data: [] };
      const rows = (days || []).map((d) => {
        const daySlots = (slots || []).filter((s) => s.appointment_day_id === d.id);
        const booked = daySlots.filter((s) => s.status === 'booked' || s.status === 'completed').length;
        const completed = daySlots.filter((s) => s.status === 'completed').length;
        return { id: d.id, doctor: d.doctors?.users?.full_name || 'Unknown', date: d.appointment_date, total: daySlots.length, booked, completed };
      });
      return { data: rows, columns: ['Doctor', 'Date', 'Total slots', 'Booked', 'Checked in', 'Remarks'] };
    }
    case 'avg_length_of_stay': {
      const { data: appPatients } = await supabase.from('patients').select('id').eq('app_id', appId);
      const ids = (appPatients || []).map((p) => p.id);
      if (ids.length === 0) return { data: [], columns: ['Metric', 'Value', 'Remarks'] };
      const { data } = await supabase.from('ipd_admissions').select('admission_date, discharge_date').in('patient_id', ids).not('discharge_date', 'is', null);
      const stays = (data || []).map((a) => (new Date(a.discharge_date) - new Date(a.admission_date)) / (1000 * 60 * 60 * 24));
      const avg = stays.length ? (stays.reduce((s, v) => s + v, 0) / stays.length) : 0;
      const rows = [
        { id: 'avg', metric: 'Average length of stay', value: `${avg.toFixed(1)} days` },
        { id: 'count', metric: 'Completed admissions (discharged)', value: stays.length },
        { id: 'max', metric: 'Longest stay', value: stays.length ? `${Math.max(...stays).toFixed(0)} days` : '—' },
      ];
      return { data: rows, columns: ['Metric', 'Value', 'Remarks'] };
    }
    case 'most_prescribed_medicines': {
      const { data: appPatients } = await supabase.from('patients').select('id').eq('app_id', appId);
      const ids = (appPatients || []).map((p) => p.id);
      if (ids.length === 0) return { data: [], columns: ['Medicine', 'Times prescribed', 'Remarks'] };
      const { data } = await supabase.from('prescriptions').select('medicines').in('patient_id', ids);
      const counts = {};
      (data || []).forEach((p) => {
        (p.medicines || []).forEach((m) => {
          const name = m.medicine?.trim();
          if (name) counts[name] = (counts[name] || 0) + 1;
        });
      });
      const rows = Object.entries(counts).map(([medicine, count]) => ({ id: medicine, medicine, count }))
        .sort((a, b) => b.count - a.count);
      return { data: rows, columns: ['Medicine', 'Times prescribed', 'Remarks'] };
    }
    case 'monthly_revenue_trend': {
      const { data } = await supabase.from('billing_invoices').select('total_amount, created_at').eq('app_id', appId).eq('status', 'paid');
      const byMonth = {};
      (data || []).forEach((inv) => {
        const month = new Date(inv.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        byMonth[month] = (byMonth[month] || 0) + Number(inv.total_amount || 0);
      });
      const rows = Object.entries(byMonth).map(([month, total]) => ({ id: month, month, total }))
        .sort((a, b) => new Date(a.month) - new Date(b.month));
      return { data: rows, columns: ['Month', 'Total revenue', 'Remarks'] };
    }
    case 'gender_distribution': {
      const { data } = await supabase.from('patients').select('id, gender').eq('app_id', appId);
      const counts = {};
      (data || []).forEach((p) => { const g = p.gender || 'Unspecified'; counts[g] = (counts[g] || 0) + 1; });
      const rows = Object.entries(counts).map(([gender, count]) => ({ id: gender, gender, count }));
      return { data: rows, columns: ['Gender', 'Count', 'Remarks'] };
    }
    case 'abha_consent_status': {
      const { data: appPatients } = await supabase.from('patients').select('id').eq('app_id', appId);
      const ids = (appPatients || []).map((p) => p.id);
      if (ids.length === 0) return { data: [], columns: ['Patient', 'UID', 'Consent type', 'OTP verified', 'Remarks'] };
      const { data } = await supabase
        .from('abha_consent_log')
        .select('id, consent_type, otp_verified, patients(full_name, patient_uid)')
        .in('patient_id', ids);
      return { data: data || [], columns: ['Patient', 'UID', 'Consent type', 'OTP verified', 'Remarks'] };
    }
    case 'revenue_by_mode': {
      const { data } = await supabase
        .from('billing_invoices')
        .select('payment_mode, total_amount')
        .eq('app_id', appId)
        .eq('status', 'paid');
      const byMode = {};
      (data || []).forEach((inv) => {
        const mode = inv.payment_mode || 'Unknown';
        byMode[mode] = (byMode[mode] || 0) + Number(inv.total_amount || 0);
      });
      const rows = Object.entries(byMode).map(([mode, total]) => ({ mode, total }));
      return { data: rows, columns: ['Payment mode', 'Total collected', 'Remarks'] };
    }
    case 'abha_linked': {
      const { data } = await supabase
        .from('patients')
        .select('id, full_name, patient_uid, abha_linked')
        .eq('app_id', appId)
        .order('full_name');
      return { data: data || [], columns: ['Patient', 'UID', 'ABHA status', 'Remarks'] };
    }
    default:
      return { data: [], columns: [] };
  }
}

export function HospitalReports({ userTier = 'basic' }) {
  const { tenant } = useTenant();
  const [running, setRunning] = useState(null);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');

  async function runReport(report) {
    if (!canAccess(userTier, report.tier)) return;
    setRunning(report.id);
    setResult(null);
    setError('');
    try {
      const res = await runReportQuery(report.id, tenant.appId);
      setResult({ report, ...res, generatedAt: new Date().toLocaleString('en-IN') });
    } catch (err) {
      setError('Failed to generate report. Please try again.');
    } finally {
      setRunning(null);
    }
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        .report-table-wrap { max-height: 600px; overflow-y: auto; }
        @media print {
          .no-print { display: none !important; }
          .print-safe, .print-safe * { background: #fff !important; color: #000 !important; border-color: #ccc !important; }
          .report-table-wrap { max-height: none !important; overflow: visible !important; }
        }
      `}</style>
      <div style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Reports · నివేదికలు</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Hospital Reports</h1>
        </div>

        {error && (
          <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Report catalog */}
        <div className="no-print" style={{ marginBottom: 20 }}>
          {REPORT_CATALOG.map((report) => {
            const locked    = !canAccess(userTier, report.tier);
            const isRunning = running === report.id;
            return (
              <div key={report.id}
                onClick={() => !locked && !running && runReport(report)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#161618', border: `1px solid ${result?.report.id === report.id ? 'rgba(90,154,223,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, marginBottom: 8, cursor: locked || running ? 'not-allowed' : 'pointer', opacity: locked ? 0.4 : 1 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 20 }}>{report.icon}</span>
                  <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{report.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {locked && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(90,154,223,0.12)', color: '#5A9ADF' }}>
                      🔒 {report.tier}
                    </span>
                  )}
                  {isRunning && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Running...</span>}
                  {!locked && !isRunning && <span style={{ fontSize: 12, color: '#5A9ADF' }}>Run →</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Report result */}
        {result && (
          <>
          <PrintHeader documentTitle={result.report.name} />
          <div className="print-safe" style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{result.report.name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  {result.data.length} records · Generated {result.generatedAt}
                </p>
              </div>
              <div className="no-print" style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => window.print()}
                  style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#5A9ADF', color: '#111113', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                  🖨️ Print
                </button>
              </div>
            </div>

            {result.data.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '20px 0' }}>
                No records found for this report.
              </p>
            ) : (
              <div className="report-table-wrap" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {result.columns.map((col) => (
                        <th key={col} style={{ padding: '8px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        {result.report.id === 'daily_opd' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.patients?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patients?.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.doctors?.users?.full_name}{row.doctors?.designation ? ` (${row.doctors.designation})` : ''}</td>
                            <td style={{ padding: '8px 0', color: 'rgba(255,255,255,0.4)' }}>{row.visit_date}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="daily_opd" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'lab_pending' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.patients?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patients?.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.test_name}</td>
                            <td style={{ padding: '8px 0', color: '#E8A020', fontWeight: 600 }}>{row.status}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="lab_pending" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'bed_occupancy' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.ward_type}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.total_beds}</td>
                            <td style={{ padding: '8px 8px', color: row.occupied > row.total_beds * 0.85 ? '#E05A5A' : 'rgba(255,255,255,0.4)' }}>{row.occupied}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 600 }}>{row.available}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="bed_occupancy" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'opd_appointment_engagement' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.doctor}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{new Date(row.date).toLocaleDateString('en-IN')}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.total}</td>
                            <td style={{ padding: '8px 8px', color: '#E8A020' }}>{row.booked}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 600 }}>{row.completed}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="opd_appointment_engagement" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'avg_length_of_stay' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.metric}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.value}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="avg_length_of_stay" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'most_prescribed_medicines' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.medicine}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="most_prescribed_medicines" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'monthly_revenue_trend' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.month}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 600 }}>₹{row.total.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="monthly_revenue_trend" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'gender_distribution' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.gender}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="gender_distribution" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'abha_consent_status' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.patients?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patients?.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.consent_type}</td>
                            <td style={{ padding: '8px 0', color: row.otp_verified ? '#6AAA90' : '#E8A020', fontWeight: 600 }}>{row.otp_verified ? '✓ Verified' : 'Pending'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="abha_consent_status" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'revenue_by_mode' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.mode}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 600 }}>₹{row.total.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="revenue_by_mode" rowKey={row.mode} /></td>
                          </>
                        )}
                        {result.report.id === 'abha_linked' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patient_uid}</td>
                            <td style={{ padding: '8px 0', color: row.abha_linked ? '#6AAA90' : 'rgba(255,255,255,0.3)', fontWeight: 600 }}>{row.abha_linked ? '✓ Linked' : 'Not linked'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="abha_linked" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'new_registrations' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.phone}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90' }}>{new Date(row.created_at).toLocaleDateString('en-IN')}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="new_registrations" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'doctor_wise_opd' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.doctor_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.designation}</td>
                            <td style={{ padding: '8px 0', color: '#5A9ADF', fontWeight: 600 }}>{row.count}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="doctor_wise_opd" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'ipd_admission_history' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.patients?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patients?.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.wards?.ward_type}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.admission_date}</td>
                            <td style={{ padding: '8px 0', color: row.discharge_date ? '#6AAA90' : '#E8A020', fontWeight: 600 }}>{row.discharge_date || 'Still admitted'}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="ipd_admission_history" rowKey={row.id} /></td>
                          </>
                        )}
                        {result.report.id === 'lab_tests_completed' && (
                          <>
                            <td style={{ padding: '8px 0', color: '#fff' }}>{row.patients?.full_name}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.patients?.patient_uid}</td>
                            <td style={{ padding: '8px 8px', color: 'rgba(255,255,255,0.4)' }}>{row.test_name}</td>
                            <td style={{ padding: '8px 0', color: '#6AAA90', fontWeight: 600 }}>{row.status}</td>
                            <td style={{ padding: '8px 8px' }}><ReportRemark reportId="lab_tests_completed" rowKey={row.id} /></td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>
        )}
      </div>
      <HospitalNav />
      <BugReporter screenName="hospital_reports" />
    </div>
  );
}
