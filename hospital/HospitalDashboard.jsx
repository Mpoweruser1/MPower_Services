// hospital/HospitalDashboard.jsx — FINAL (Supabase wired)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import { FeedbackWidget } from '../shared/FeedbackWidget';
import BugReporter from '../shared/BugReporter';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 640, margin: '0 auto', padding: '24px 20px' },
  stat: { background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
  quickLink: { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, textDecoration: 'none', marginBottom: 8 },
};

function StatCard({ value, label, labelTe, color = '#fff', alert = false, loading = false }) {
  return (
    <div style={{ ...S.stat, border: `1px solid ${alert ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
      {loading
        ? <div style={{ height: 28, background: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 6 }} />
        : <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: alert ? '#E05A5A' : color }}>{value}</p>
      }
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '3px 0 1px' }}>{label}</p>
      {labelTe && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', margin: 0 }}>{labelTe}</p>}
    </div>
  );
}

const QUICK_ACTIONS = [
  { to: '/hospital/patients/new', icon: '👤', en: 'Register Patient',  te: 'రోగి నమోదు' },
  { to: '/hospital/opd',          icon: '🩺', en: 'OPD Visit',         te: 'OPD విజిట్' },
  { to: '/hospital/billing',      icon: '💳', en: 'Billing',           te: 'బిల్లింగ్' },
  { to: '/hospital/ipd',          icon: '🛏️', en: 'IPD / Beds',        te: 'IPD / బెడ్స్' },
  { to: '/hospital/lab',          icon: '🔬', en: 'Lab Reports',       te: 'లాబ్ నివేదికలు' },
];

export default function HospitalDashboard() {
  const { tenant } = useTenant();
  const [showFeedback, setShowFeedback] = useState(false);
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  const [setupSteps, setSetupSteps] = useState(null);

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12)      setGreeting('Good morning · శుభోదయం');
    else if (h < 17) setGreeting('Good afternoon · శుభాహ్నం');
    else             setGreeting('Good evening · శుభసంధ్య');
  }, []);

  useEffect(() => {
    if (tenant?.appId) { loadStats(); loadSetupState(); }
  }, [tenant?.appId]);

  async function loadSetupState() {
    // Informational only, not a forced redirect — verified this
    // session that most Hospital screens genuinely work standalone
    // (Patient Registration, Billing need nothing set up first).
    // Wards is the one real hard block, but only for IPD Admission
    // specifically, handled separately on that screen itself.
    //
    // Note: FirstTimeSetup's hospital "bed count" step actually
    // upserts directly into the wards table (total_beds), not a
    // separate apps.num_beds column — confirmed by checking, not
    // assumed. So "hospital details" and "wards exist" are genuinely
    // the same action, not two separate checklist items.
    const [
      { count: staffCount },
      { count: wardCount },
      { count: doctorCount },
      { count: labTestCount },
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('app_id', tenant.appId),
      supabase.from('wards').select('id', { count: 'exact', head: true }).eq('app_id', tenant.appId),
      supabase.from('doctors').select('id', { count: 'exact', head: true }).eq('app_id', tenant.appId),
      supabase.from('master_lab_tests').select('id', { count: 'exact', head: true }).eq('app_id', tenant.appId),
    ]);

    setSetupSteps([
      { done: (staffCount || 0) > 1, label: 'Invite at least one staff member', link: '/hospital/staff' },
      { done: (wardCount || 0) > 0, label: 'Set up your wards', link: '/hospital/wards' },
      { done: (doctorCount || 0) > 0, label: 'Add your doctors', link: '/hospital/doctors' },
      { done: (labTestCount || 0) > 0, label: 'Set up lab tests', link: '/hospital/lab-tests' },
    ]);
  }

  async function loadStats() {
    setLoading(true);
    const today      = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    // .in() needs an actual array of ids, not an unresolved query builder —
    // resolve the two id lists these stats depend on before the parallel
    // batch below.
    const [patientIdsRes, wardIdsRes] = await Promise.allSettled([
      supabase.from('patients').select('id').eq('app_id', tenant.appId),
      supabase.from('wards').select('id').eq('app_id', tenant.appId),
    ]);
    const patientIds = patientIdsRes.status === 'fulfilled' ? (patientIdsRes.value.data || []).map((p) => p.id) : [];
    const wardIds    = wardIdsRes.status === 'fulfilled'    ? (wardIdsRes.value.data || []).map((w) => w.id)    : [];

    const [
      opdRes, revenueRes, pendingRes,
      abhaRes, totalPatientsRes,
      bedsRes, admissionsRes,
      labRes,
    ] = await Promise.allSettled([

      // OPD visits today
      supabase.from('opd_visits')
        .select('id', { count: 'exact', head: true })
        .eq('visit_date', today)
        .in('patient_id', patientIds),

      // Revenue today
      supabase.from('billing_invoices')
        .select('total_amount')
        .gte('created_at', today)
        .lt('created_at', new Date(new Date(today).getTime() + 86400000).toISOString().slice(0, 10))
        .eq('status', 'paid')
        .in('patient_id', patientIds),

      // Pending payments
      supabase.from('billing_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .in('patient_id', patientIds),

      // ABHA linked patients
      supabase.from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('app_id', tenant.appId)
        .eq('abha_linked', true),

      // Total patients
      supabase.from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('app_id', tenant.appId),

      // Total beds
      supabase.from('wards')
        .select('total_beds')
        .eq('app_id', tenant.appId),

      // Current admissions
      supabase.from('ipd_admissions')
        .select('id', { count: 'exact', head: true })
        .is('discharge_date', null)
        .in('ward_id', wardIds),

      // Pending lab results
      supabase.from('lab_tests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .in('patient_id', patientIds),
    ]);

    const opdCount       = opdRes.status === 'fulfilled'          ? (opdRes.value.count || 0) : 0;
    const revenue        = revenueRes.status === 'fulfilled'      ? (revenueRes.value.data || []).reduce((s, r) => s + Number(r.total_amount || 0), 0) : 0;
    const pendingCount   = pendingRes.status === 'fulfilled'      ? (pendingRes.value.count || 0) : 0;
    const abhaCount      = abhaRes.status === 'fulfilled'         ? (abhaRes.value.count || 0) : 0;
    const totalPatients  = totalPatientsRes.status === 'fulfilled'? (totalPatientsRes.value.count || 0) : 0;
    const totalBeds      = bedsRes.status === 'fulfilled'         ? (bedsRes.value.data || []).reduce((s, w) => s + (w.total_beds || 0), 0) : 0;
    const admitted       = admissionsRes.status === 'fulfilled'   ? (admissionsRes.value.count || 0) : 0;
    const labPending     = labRes.status === 'fulfilled'          ? (labRes.value.count || 0) : 0;

    const occupancyPct   = totalBeds > 0 ? Math.round((admitted / totalBeds) * 100) : 0;
    const abhaPct        = totalPatients > 0 ? Math.round((abhaCount / totalPatients) * 100) : 0;

    setStats({
      opdCount, revenue, pendingCount,
      abhaPct, totalPatients,
      totalBeds, admitted, occupancyPct,
      labPending,
    });
    setLoading(false);
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <div style={S.inner}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: '0 0 4px' }}>{greeting}</p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: '0 0 2px', letterSpacing: -0.5 }}>
              {tenant?.orgName || 'Hospital Dashboard'}
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              {tenant?.role === 'doctor' ? 'Doctor' : tenant?.role} ·{' '}
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <button onClick={() => setShowFeedback(true)} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
            💬 Feedback
          </button>
        </div>

        {/* Setup checklist — informational, not a forced redirect.
            Genuinely optional to complete in order, since verified
            this session that Patient Registration and Billing work
            standalone regardless. */}
        {setupSteps && setupSteps.some((s) => !s.done) && (
          <div style={{ background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#E8A020' }}>
              ⚠️ Setup {setupSteps.filter((s) => s.done).length}/{setupSteps.length} complete
            </p>
            {setupSteps.filter((s) => !s.done).map((s) => (
              <Link key={s.link} to={s.link} style={{ display: 'block', fontSize: 13, color: '#E8A020', textDecoration: 'none', fontWeight: 600, marginBottom: 4 }}>
                {s.label} →
              </Link>
            ))}
          </div>
        )}

        {/* Today's stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
          <StatCard
            value={stats?.opdCount ?? '—'}
            label="OPD today" labelTe="నేటి OPD"
            color="#5A9ADF" loading={loading}
          />
          <StatCard
            value={stats ? `₹${stats.revenue.toLocaleString('en-IN')}` : '—'}
            label="Revenue today" labelTe="నేటి ఆదాయం"
            color="#6AAA90" loading={loading}
          />
          <StatCard
            value={stats?.pendingCount ?? '—'}
            label="Pending bills" labelTe="పెండింగ్ బిల్లులు"
            color="#E05A5A" alert={stats?.pendingCount > 0} loading={loading}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
          <StatCard
            value={stats ? `${stats.admitted}/${stats.totalBeds}` : '—'}
            label="Beds occupied" labelTe="బెడ్లు ఆక్రమించబడ్డాయి"
            color={stats?.occupancyPct > 85 ? '#E05A5A' : '#E8A020'}
            alert={stats?.occupancyPct > 85} loading={loading}
          />
          <StatCard
            value={stats?.labPending ?? '—'}
            label="Lab pending" labelTe="లాబ్ పెండింగ్"
            color="#E8A020" alert={stats?.labPending > 0} loading={loading}
          />
          <StatCard
            value={stats ? `${stats.abhaPct}%` : '—'}
            label="ABHA linked" labelTe="ABHA లింక్"
            color="#6AAA90" loading={loading}
          />
        </div>

        {/* Alerts */}
        {!loading && stats && (
          <>
            {stats.occupancyPct > 85 && (
              <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
                  🛏️ Bed occupancy critical — {stats.occupancyPct}% · only {stats.totalBeds - stats.admitted} beds available
                </p>
              </div>
            )}
            {stats.labPending > 0 && (
              <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#E8A020', fontWeight: 500 }}>
                  🔬 {stats.labPending} lab result{stats.labPending > 1 ? 's' : ''} pending entry
                </p>
                <Link to="/hospital/lab" style={{ fontSize: 12, color: '#E8A020', textDecoration: 'none', fontWeight: 500 }}>
                  Enter results →
                </Link>
              </div>
            )}
            {stats.pendingCount > 0 && (
              <div style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.15)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
                  💳 {stats.pendingCount} unpaid bill{stats.pendingCount > 1 ? 's' : ''} pending collection
                </p>
                <Link to="/hospital/billing" style={{ fontSize: 12, color: '#E05A5A', textDecoration: 'none', fontWeight: 500 }}>
                  Go to billing →
                </Link>
              </div>
            )}
          </>
        )}

        {/* Quick actions */}
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>
          Quick actions · త్వరిత చర్యలు
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.to} to={action.to}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, textDecoration: 'none' }}>
              <span style={{ fontSize: 22 }}>{action.icon}</span>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{action.en}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{action.te}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Total patients summary */}
        {!loading && stats && (
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 500, color: '#fff' }}>
              Total registered patients: {stats.totalPatients.toLocaleString('en-IN')}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
              {stats.abhaPct}% linked with ABHA Health ID
            </p>
          </div>
        )}

        {/* Tier upgrade prompt */}
        {tenant?.tier === 'basic' && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '12px 14px', marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#E8A020', fontWeight: 500 }}>
              Upgrade to Standard for multi-branch dashboard, advanced reports and priority support
            </p>
            <Link to="/portal/account" style={{ fontSize: 12, color: '#E8A020', textDecoration: 'none', fontWeight: 600 }}>
              Upgrade now →
            </Link>
          </div>
        )}

      </div>

      {showFeedback && (
        <FeedbackWidget
          appId={tenant?.appId}
          userId={tenant?.userRowId}
          context="hospital_dashboard"
          onClose={() => setShowFeedback(false)}
        />
      )}

      <HospitalNav />
      <BugReporter screenName="hospital_dashboard" />
    </div>
  );
}