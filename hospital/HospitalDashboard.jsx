// hospital/HospitalDashboard.jsx — FINAL (Supabase wired)
// Beds on hold (reserved / out of service) are no longer counted as free: "available" = beds − occupied − on hold,
// the same figure the Admissions screen and the Bed occupancy report show.
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import HospitalNav from '../shared/HospitalNav';
import { FeedbackWidget } from '../shared/FeedbackWidget';
import BugReporter from '../shared/BugReporter';
import { istToday, addDays, istDayStart, fetchAllRows } from './hospitalUtils';
import { isHoldActive } from '../shared/bedLogic';

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

// Who sees the scheme-claims reminder (the same people who can record a received claim).
const CLAIM_ROLES = ['principal', 'doctor', 'billing_clerk'];

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
  // true when any figure below could not be loaded (it is then shown as —, not as 0).
  const [loadFailed, setLoadFailed] = useState(false);

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
    setLoadFailed(false);
    const appId = tenant.appId;
    // Indian calendar day: from 00:00 today to 00:00 tomorrow IST.
    const today      = istToday();
    const dayStart   = istDayStart(today);
    const dayEnd     = istDayStart(addDays(today, 1));
    const seesClaims = CLAIM_ROLES.includes(tenant?.role);

    // Records are tied to the hospital through their patient (patients!inner) or their own
    // app_id — not through a long list of patient ids, which stopped working beyond a few
    // hundred patients.
    const wardsRes = await supabase.from('wards').select('id, total_beds').eq('app_id', appId);
    const wardList = wardsRes.error ? null : (wardsRes.data || []);
    if (wardsRes.error) console.error('Dashboard: loading wards failed:', wardsRes.error);

    const results = await Promise.allSettled([
      // 0 OPD visits today
      supabase.from('opd_visits')
        .select('id, patients!inner(app_id)', { count: 'exact', head: true })
        .eq('patients.app_id', appId)
        .eq('visit_date', today),

      // 1 Revenue today (what patients paid on bills made today; cancelled bills are not counted)
      fetchAllRows(() => supabase.from('billing_invoices')
        .select('id, total_amount')
        .eq('app_id', appId)
        .eq('status', 'paid')
        .gte('created_at', dayStart)
        .lt('created_at', dayEnd)
        .order('id')),

      // 2 New registrations today
      supabase.from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('app_id', appId)
        .gte('created_at', dayStart)
        .lt('created_at', dayEnd),

      // 3 ABHA linked patients
      supabase.from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('app_id', appId)
        .eq('abha_linked', true),

      // 4 Total patients
      supabase.from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('app_id', appId),

      // 5 Current admissions
      wardList && wardList.length > 0
        ? supabase.from('ipd_admissions')
            .select('id', { count: 'exact', head: true })
            .is('discharge_date', null)
            .in('ward_id', wardList.map((w) => w.id))
        : Promise.resolve({ count: 0, error: wardList ? null : { message: 'wards not loaded' } }),

      // 6 Pending lab results
      supabase.from('lab_tests')
        .select('id', { count: 'exact', head: true })
        .eq('app_id', appId)
        .eq('status', 'pending'),

      // 7 Scheme / insurance claims still to be received (owner and billing roles only)
      seesClaims
        ? fetchAllRows(() => supabase.from('billing_invoices')
            .select('id, covered_amount')
            .eq('app_id', appId)
            .eq('claim_status', 'pending')
            .neq('status', 'cancelled')
            .order('id'))
        : Promise.resolve([]),
    ]);

    // Beds on hold today and not occupied. Without the bed-hold script there are no holds (0, not a failure).
    let held = 0;
    let heldFailed = false;
    try {
      const holdRows = await fetchAllRows(() => supabase.from('ward_beds')
        .select('id, ward_id, label, hold_kind, hold_until')
        .eq('app_id', appId).not('hold_kind', 'is', null).order('id'));
      const inForce = holdRows.filter((b) => isHoldActive(b.hold_kind, b.hold_until, today));
      if (inForce.length > 0) {
        const active = await fetchAllRows(() => supabase.from('ipd_admissions')
          .select('id, ward_id, bed_no').is('discharge_date', null)
          .in('ward_id', [...new Set(inForce.map((b) => b.ward_id))]).order('id'));
        const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
        held = inForce.filter((b) => !active.some((a) => a.ward_id === b.ward_id && same(a.bed_no, b.label))).length;
      }
    } catch (e) {
      if (!['42703', '42P01', 'PGRST205'].includes(e?.code)) { console.error('Dashboard: loading bed holds failed:', e); heldFailed = true; }
    }

    // A failed query gives null (shown as —) instead of a silent 0.
    let failed = !wardList || heldFailed;
    const read = (res, pick) => {
      if (res.status !== 'fulfilled') { console.error('Dashboard query failed:', res.reason); failed = true; return null; }
      const v = res.value;
      if (v && !Array.isArray(v) && v.error) { console.error('Dashboard query failed:', v.error); failed = true; return null; }
      return pick(v);
    };
    const opdCount         = read(results[0], (v) => v.count || 0);
    const revenue          = read(results[1], (rows) => rows.reduce((s, r) => s + Number(r.total_amount || 0), 0));
    const newRegistrations = read(results[2], (v) => v.count || 0);
    const abhaCount        = read(results[3], (v) => v.count || 0);
    const totalPatients    = read(results[4], (v) => v.count || 0);
    const admitted         = read(results[5], (v) => v.count || 0);
    const labPending       = read(results[6], (v) => v.count || 0);
    const claimRows        = read(results[7], (rows) => rows);
    const totalBeds        = wardList ? wardList.reduce((s, w) => s + (w.total_beds || 0), 0) : null;

    const occupancyPct = totalBeds != null && admitted != null && totalBeds > 0 ? Math.round((admitted / totalBeds) * 100) : null;
    // beds that cannot be given to a patient: occupied + on hold
    const availableBeds = totalBeds != null && admitted != null ? Math.max(0, totalBeds - admitted - held) : null;
    const busyPct = totalBeds != null && admitted != null && totalBeds > 0 ? Math.round(((admitted + held) / totalBeds) * 100) : null;
    const abhaPct      = totalPatients != null && abhaCount != null ? (totalPatients > 0 ? Math.round((abhaCount / totalPatients) * 100) : 0) : null;

    setStats({
      opdCount, revenue, newRegistrations,
      abhaPct, totalPatients,
      totalBeds, admitted, occupancyPct, held, availableBeds, busyPct,
      labPending,
      claimsCount: seesClaims && claimRows ? claimRows.length : 0,
      claimsAmount: seesClaims && claimRows ? claimRows.reduce((s, r) => s + Number(r.covered_amount || 0), 0) : 0,
    });
    setLoadFailed(failed);
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
            value={stats?.revenue != null ? `₹${stats.revenue.toLocaleString('en-IN')}` : '—'}
            label="Revenue today" labelTe="నేటి ఆదాయం"
            color="#6AAA90" loading={loading}
          />
          <StatCard
            value={stats?.newRegistrations ?? '—'}
            label="New registrations" labelTe="కొత్త నమోదులు"
            color="#5A9ADF" loading={loading}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
          <StatCard
            value={stats && stats.admitted != null && stats.totalBeds != null ? `${stats.admitted}/${stats.totalBeds}` : '—'}
            label={stats?.held > 0 ? `Beds occupied · ${stats.held} on hold` : 'Beds occupied'} labelTe="బెడ్లు ఆక్రమించబడ్డాయి"
            color={stats?.busyPct > 85 ? '#E05A5A' : '#E8A020'}
            alert={stats?.busyPct > 85} loading={loading}
          />
          <StatCard
            value={stats?.labPending ?? '—'}
            label="Lab pending" labelTe="లాబ్ పెండింగ్"
            color="#E8A020" alert={stats?.labPending > 0} loading={loading}
          />
          <StatCard
            value={stats?.abhaPct != null ? `${stats.abhaPct}%` : '—'}
            label="ABHA linked" labelTe="ABHA లింక్"
            color="#6AAA90" loading={loading}
          />
        </div>

        {/* Alerts */}
        {!loading && loadFailed && (
          <div role="alert" style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
              ⚠️ Some figures could not be loaded and are shown as —.
            </p>
            <button onClick={loadStats} style={{ marginTop: 6, padding: 0, background: 'none', border: 'none', fontSize: 12, color: '#E05A5A', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
              Try again
            </button>
          </div>
        )}
        {!loading && stats && (
          <>
            {stats.busyPct > 85 && (
              <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
                  🛏️ Bed occupancy critical — {stats.busyPct}%{stats.held > 0 ? ` (${stats.held} on hold)` : ''} · only {stats.availableBeds} beds available
                </p>
              </div>
            )}
            {stats.claimsCount > 0 && (
              <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#E8A020', fontWeight: 500 }}>
                  💳 {stats.claimsCount} scheme / insurance claim{stats.claimsCount > 1 ? 's' : ''} still to be received · ₹{stats.claimsAmount.toLocaleString('en-IN')}
                </p>
                <Link to="/hospital/billing" state={{ tab: 'bills', filter: 'claims' }} style={{ fontSize: 12, color: '#E8A020', textDecoration: 'none', fontWeight: 500 }}>
                  View claims →
                </Link>
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
        {!loading && stats && stats.totalPatients != null && (
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 500, color: '#fff' }}>
              Total registered patients: {stats.totalPatients.toLocaleString('en-IN')}
            </p>
            {stats.abhaPct != null && (
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                {stats.abhaPct}% linked with ABHA Health ID
              </p>
            )}
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