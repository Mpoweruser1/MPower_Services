// App.jsx — FINAL
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { TenantProvider, useTenant } from './context/TenantContext';
import { VisitProvider } from './context/VisitContext';
import { supabase } from './lib/supabaseClient';
import TopNav from './shared/TopNav';

// Website
import Home from './website/pages/Home';
import PortalLogin from './website/pages/PortalLogin';
import Registration from './website/pages/Registration';
import Products from './website/pages/Products';
import Pricing from './website/pages/Pricing';
import Contact from './website/pages/Contact';
import PortalDashboard from './website/pages/PortalDashboard';
import ClientPortal from './website/pages/ClientPortal';
import FirstTimeSetup from './website/pages/FirstTimeSetup';
import PayFee from './website/pages/PayFee';
import PrivacyPolicy from './website/pages/PrivacyPolicy';
import TermsOfService from './website/pages/TermsOfService';
import RefundPolicy from './website/pages/RefundPolicy';
import GrievanceStateSelect from './website/pages/GrievanceStateSelect';

// School
import SchoolDashboard from './school/Dashboard';
import Attendance from './school/Attendance';
import FeeCollection from './school/FeeCollection';
import TransferCertificate from './school/TransferCertificate';
import Certificates from './school/Certificates';
import StudentDetail from './school/StudentDetail';
import Transport from './school/Transport';
import Hostel from './school/Hostel';
import ActivitiesCoaching from './school/ActivitiesCoaching';
import StudentAdmission from './school/StudentAdmission';
import ManageClasses from './school/ManageClasses';
import Timetable from './school/Timetable';
import PromoteStudents from './school/PromoteStudents';
import ManageStaff from './school/ManageStaff';
import FeeAnalytics from './school/FeeAnalytics';
import AttendanceAnalytics from './school/AttendanceAnalytics';
import AcademicAnalytics from './school/AcademicAnalytics';
import BirthdayWishes from './school/BirthdayWishes';
import HolidayManagement from './school/HolidayManagement';
import ActivityFinance from './school/ActivityFinance';
import ManageSubjects from './school/ManageSubjects';
import ManageFeeStructure from './school/ManageFeeStructure';
import FeeStructureReport from './school/FeeStructureReport';
import HostelWelfareReport from './school/HostelWelfareReport';
import MarksEntry from './school/MarksEntry';
import ReportCard from './school/ReportCard';
import ParentPortal from './website/pages/ParentPortal';
import OfflineIndicator from './shared/OfflineIndicator';
import PTMScheduling from './school/PTMScheduling';
import HomeworkTracking from './school/HomeworkTracking';
import HomeworkView from './website/pages/HomeworkView';
import PTMBooking from './website/pages/PTMBooking';
import { ReportEngine, IdCardPrinter, UniversalSearch } from './school/ReportsSearchIdCards';

// Hospital
import HospitalDashboard from './hospital/HospitalDashboard';
import PatientDetail from './hospital/PatientDetail';
import ManageWards from './hospital/ManageWards';
import ManageDoctors from './hospital/ManageDoctors';
import ManageHospitalStaff from './hospital/ManageHospitalStaff';
import BillingAnalytics from './hospital/BillingAnalytics';
import AppointmentAnalytics from './hospital/AppointmentAnalytics';
import ManageLabTests from './hospital/ManageLabTests';
import OpdAppointments from './hospital/OpdAppointments';
import OpdAppointmentBooking from './website/pages/OpdAppointmentBooking';
import { HospitalReports } from './hospital/HospitalReports';
import PatientRegistration from './hospital/PatientRegistration';
import OpdVisit from './hospital/OpdVisit';
import LabReports from './hospital/LabReports';
import HospitalBilling from './hospital/HospitalBilling';
import IPDManagement from './hospital/IPDManagement';

// Grievance
import CtsLanding from './grievance/CtsLanding';
import CitizenPortal from './grievance/CitizenPortal';
import StaffDashboard from './grievance/StaffDashboard';
import ReportsDashboard from './grievance/ReportsDashboard';
import AdminVerificationQueue from './grievance/AdminVerificationQueue';
import RequestStaffAccess from './grievance/RequestStaffAccess';
import ComplaintPrint from './grievance/ComplaintPrint';
import FeedbackDashboard from './grievance/FeedbackDashboard';

// Control Panel
import CrmClientView from './controlpanel/CrmClientView';
import SupportTickets from './controlpanel/SupportTickets';
import BillingTracker from './controlpanel/BillingTracker';
import OnboardingWizard from './controlpanel/OnboardingWizard';
import FeedbackOverview from './controlpanel/FeedbackOverview';
import ModificationRequestPortal from './controlpanel/ModificationRequestPortal';
import HelpSystemAdmin from './controlpanel/HelpSystemAdmin';
import ManageAccess from './controlpanel/ManageAccess';
import SecurityMonitor from './controlpanel/SecurityMonitor';

// Shared
import BugReporter from './shared/BugReporter';
import RequireRole from './shared/RequireRole';
import CorrectionApprovalQueue from './shared/CorrectionApprovalQueue';

// ─────────────────────────────────────────────────────────────
// Auth guard
// ─────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const { session, loading } = useTenant();
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#1C1C1E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading...</p>
    </div>
  );
  if (!session) return <Navigate to="/portal/login" replace />;
  return children;
}

// ─────────────────────────────────────────────────────────────
// Grievance URL wrappers — read :stateSlug from URL and pass as prop
// ─────────────────────────────────────────────────────────────
function CitizenPortalWrapper() {
  const { stateSlug } = useParams();
  return <CitizenPortal stateSlug={stateSlug} />;
}

function RequestStaffAccessWrapper() {
  const { stateSlug } = useParams();
  return <RequestStaffAccess stateSlug={stateSlug} />;
}

// OnboardingWizard takes clientId as a plain prop, not a URL param —
// CrmClientView.jsx links to /control/onboarding/:clientId to open it
// for a specific client, but no route matched that and nothing fed
// the id through, so that link 404'd to the wildcard route. Same
// wrapper pattern as CitizenPortalWrapper above.
function OnboardingWizardWrapper() {
  const { clientId } = useParams();
  return <OnboardingWizard clientId={clientId} />;
}
// Role lists kept in sync with TopNav.jsx's own ROLE_TO_MODULE map —
// same source of truth for "which roles belong to which module".
const SCHOOL_ROLES   = ['principal', 'teacher', 'fee_clerk', 'parent', 'student'];
const HOSPITAL_ROLES = ['doctor', 'nurse', 'receptionist', 'pharmacist'];

const SCREEN_NAMES = {
  '/school/dashboard': 'Dashboard', '/school/admission': 'Student admission',
  '/school/student': 'Find student',
  '/school/attendance': 'Attendance', '/school/fee-collection': 'Fee collection',
  '/school/tc': 'Transfer certificate', '/school/certificates': 'Certificates',
  '/school/transport': 'Transport', '/school/hostel': 'Hostel',
  '/school/activities': 'Activities', '/school/reports': 'Reports',
  '/school/id-cards': 'ID cards', '/school/search': 'Search',
  '/school/classes': 'Manage classes',
  '/school/timetable': 'Timetable',
  '/school/promote-students': 'Promote students',
  '/school/staff': 'Manage Staff',
  '/school/fee-analytics': 'Fee Analytics',
  '/school/attendance-analytics': 'Attendance Analytics',
  '/school/academic-analytics': 'Academic Analytics',
  '/school/birthdays': 'Birthday Wishes',
  '/school/holidays': 'Holiday Management',
  '/school/activity-finance': 'Activity Finance',
  '/school/subjects': 'Manage Subjects',
  '/school/fee-structure': 'Fee Structure',
  '/school/fee-structure-report': 'Fee Structure Report',
  '/school/hostel-welfare-report': 'Hostel Welfare Eligibility',
  '/school/marks-entry': 'Marks Entry',
  '/school/report-card': 'Report Card',
  '/school/ptm': 'Parent-Teacher Meetings',
  '/school/homework': 'Homework Diary',
  '/hospital/dashboard': 'Dashboard', '/hospital/patients/new': 'Patient registration',
  '/hospital/opd': 'OPD visit', '/hospital/lab': 'Lab reports',
  '/hospital/billing': 'Billing', '/hospital/ipd': 'IPD management',
  '/hospital/patients/find': 'Find patient', '/hospital/wards': 'Manage wards',
  '/hospital/doctors': 'Manage doctors',
  '/hospital/staff': 'Manage staff',
  '/hospital/billing-analytics': 'Billing Analytics',
  '/hospital/appointment-analytics': 'Appointment Analytics',
  '/hospital/lab-tests': 'Manage lab tests',
  '/hospital/appointments': 'OPD Appointments',
  '/hospital/reports': 'Reports',
  '/control/clients': 'Clients', '/control/tickets': 'Support tickets',
  '/control/billing': 'Billing tracker', '/control/onboarding': 'Onboarding',
  '/control/modifications': 'Modifications', '/control/help-admin': 'Help admin',
  '/control/access': 'Manage access', '/control/security': 'Security monitor',
  '/corrections': 'Correction queue',
};
// ─────────────────────────────────────────────────────────────
// App routes
// ─────────────────────────────────────────────────────────────
function AppRoutes() {
  const { tenant, session } = useTenant();
  const location = useLocation();
  const path = location.pathname;
  const showNav = session
    && !path.startsWith('/grievance')
    && !path.startsWith('/portal/login')
    && !path.startsWith('/registration')
    && path !== '/'
    && !path.startsWith('/products')
    && !path.startsWith('/pricing')
    && !path.startsWith('/contact')
    && !path.startsWith('/privacy')
    && !path.startsWith('/terms')
    && !path.startsWith('/refund')
    && !path.startsWith('/pay/')
    && !path.startsWith('/ptm/')
    && !path.startsWith('/homework/')
    && !path.startsWith('/opd-appointment/')
    && !path.startsWith('/parent-portal');

  // Active setup redirect — checks the same real 6-step state shown
  // on the dashboard banner, but instead of a passive hint, actively
  // takes a School user to whatever's next. Stop mid-way, close the
  // browser, come back tomorrow — land right back on the same step,
  // not the dashboard, until it's genuinely done.
  const SETUP_STEPS = [
    { check: (s) => !!(s.schoolType && s.boardType), path: '/portal/setup' },
    { check: (s) => s.staffCount > 1, path: '/school/staff' },
    { check: (s) => s.classCount > 0, path: '/school/classes' },
    { check: (s) => s.subjectCount > 0, path: '/school/subjects' },
    { check: (s) => s.feeStructureCount > 0, path: '/school/fee-structure' },
    { check: (s) => s.studentCount > 0, path: '/school/admission' },
  ];
  const SETUP_PATHS = SETUP_STEPS.map((s) => s.path);
  const [setupState, setSetupState] = useState(null);

  useEffect(() => {
    if (!session || tenant?.appType !== 'school' || !tenant?.appId) return;
    let cancelled = false;
    async function checkSetup() {
      const [
        { data: appRow },
        { count: staffCount },
        { count: classCount },
        { count: subjectCount },
        { count: feeStructureCount },
        { count: studentCount },
      ] = await Promise.all([
        supabase.from('apps').select('school_type, board_type').eq('id', tenant.appId).maybeSingle(),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('app_id', tenant.appId),
        supabase.from('classes').select('id', { count: 'exact', head: true }).eq('app_id', tenant.appId),
        supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('app_id', tenant.appId),
        supabase.from('fee_structure').select('id', { count: 'exact', head: true }).eq('app_id', tenant.appId),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('app_id', tenant.appId).eq('status', 'active'),
      ]);
      if (!cancelled) {
        setSetupState({
          schoolType: appRow?.school_type, boardType: appRow?.board_type,
          staffCount: staffCount || 0, classCount: classCount || 0,
          subjectCount: subjectCount || 0, feeStructureCount: feeStructureCount || 0,
          studentCount: studentCount || 0,
        });
      }
    }
    checkSetup();
    return () => { cancelled = true; };
  }, [session, tenant?.appType, tenant?.appId, path]); // re-check on every navigation, so completing a step is picked up immediately

  const nextIncompleteStep = setupState
    ? SETUP_STEPS.find((s) => !s.check(setupState))
    : null;

  // "Skip for now" — a genuine escape hatch, not a permanent bypass.
  // Stored in sessionStorage (clears when the browser/tab closes), so
  // someone can freely explore for the rest of *this* visit, but the
  // guided flow picks back up on their next real login — setup
  // genuinely isn't done just because they looked around once.
  const setupSkipped = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('mpower_setup_skipped') === 'true';

  const shouldForceRedirect = session && tenant?.appType === 'school' && nextIncompleteStep && !setupSkipped
    && !SETUP_PATHS.includes(path)          // never redirect away from a setup step itself — avoids a loop
    && !path.startsWith('/portal/login')
    && !path.startsWith('/registration');

  // Idle timeout...
  useEffect(() => {    if (!session) return;
    let idleTimer;
    function resetTimer() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(async () => {
        // Release before signOut() — the edge function identifies the
        // caller from their own still-valid access token, so this must
        // run first. Non-blocking: idle sign-out still proceeds even if
        // release fails (e.g. offline right as the timer fires).
        try {
          await supabase.functions.invoke('check-and-claim-session', { body: { action: 'release' } });
        } catch { /* non-blocking */ }
        await supabase.auth.signOut();
        window.location.href = '/portal/login?reason=idle';
      }, 30 * 60 * 1000);
    }
    const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(idleTimer);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [session]);

  // Session heartbeat — keeps this session's claim in active_sessions
  // fresh every 5 minutes so a genuinely still-active user is never
  // mistaken for stale after the 30-minute claim window. If the
  // response says the session's no longer active (another device
  // claimed it), sign out here immediately rather than waiting for
  // the person to hit an RLS error on their next action. No release
  // call needed on that path — this device's own row is already gone,
  // that's exactly why stillActive came back false.
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-and-claim-session', { body: { action: 'heartbeat' } });
        if (!error && data && data.stillActive === false) {
          await supabase.auth.signOut();
          window.location.href = '/portal/login?reason=session_replaced';
        }
      } catch { /* network hiccup — try again next interval */ }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [session]);

  if (shouldForceRedirect && path !== nextIncompleteStep.path) {
    return <Navigate to={nextIncompleteStep.path} replace />;
  }

  const showSkipBanner = session && tenant?.appType === 'school' && nextIncompleteStep && !setupSkipped && SETUP_PATHS.includes(path);

  return (
    <>
      {showSkipBanner && (
        <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 3000, background: '#161618', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Not ready to finish setup?</span>
          <button
            onClick={() => { sessionStorage.setItem('mpower_setup_skipped', 'true'); window.location.href = '/school/dashboard'; }}
            style={{ fontSize: 12, fontWeight: 600, color: '#E8A020', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
            Skip for now — explore the app
          </button>
        </div>
      )}
      {showNav && <TopNav screen={SCREEN_NAMES[path] || ''} />}
      <Routes>

      {/* ── Website — public ── */}
      <Route path="/"                element={<Home />} />
      <Route path="/products"        element={<Products />} />
      <Route path="/products/:appType" element={<Products />} />
      <Route path="/pricing"         element={<Pricing />} />
      <Route path="/contact"         element={<Contact />} />
      <Route path="/registration"    element={<Registration />} />
      <Route path="/portal/login"    element={<PortalLogin />} />
      <Route path="/privacy"         element={<PrivacyPolicy />} />
      <Route path="/terms"           element={<TermsOfService />} />
      <Route path="/refund-policy"   element={<RefundPolicy />} />

      {/* ── Payment — public ── */}
      <Route path="/pay/:token"      element={<PayFee />} />
      <Route path="/ptm/:sessionId"  element={<PTMBooking />} />
      <Route path="/opd-appointment/:dayId" element={<OpdAppointmentBooking />} />
      <Route path="/homework/:classId" element={<HomeworkView />} />
      <Route path="/parent-portal" element={<ParentPortal />} />


{/* ── Grievance — public (citizens, no login needed) ── */}
<Route path="/grievance" element={<GrievanceStateSelect />} />
<Route path="/grievance/:stateSlug" element={<CtsLanding />} />
<Route path="/grievance/:stateSlug/citizen"
  element={<CitizenPortalWrapper />} />
<Route path="/grievance/:stateSlug/staff"
  element={<StaffDashboard />} />
<Route path="/grievance/:stateSlug/admin"
  element={<AdminVerificationQueue />} />
<Route path="/grievance/:stateSlug/reports"
  element={<ReportsDashboard />} />
<Route path="/grievance/:stateSlug/request-access"
  element={<RequestStaffAccess />} />
<Route path="/grievance/:stateSlug/feedback"
  element={<FeedbackDashboard />} />
<Route path="/grievance/print"
  element={<ComplaintPrint />} />
  
  
        {/* ── Portal — auth required ── */}
      <Route path="/portal/dashboard"
        element={<RequireAuth><PortalDashboard /></RequireAuth>} />
      <Route path="/portal/account"
        element={<RequireAuth><ClientPortal /></RequireAuth>} />
      <Route path="/portal/setup"
        element={<RequireAuth><FirstTimeSetup /></RequireAuth>} />

      {/* ── Corrections — principal/doctor/admin ── */}
      <Route path="/corrections"
        element={<RequireAuth><CorrectionApprovalQueue /></RequireAuth>} />

      {/* ── School ── */}
      <Route path="/school/dashboard"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><SchoolDashboard /></RequireRole></RequireAuth>} />
      <Route path="/school/admission"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><StudentAdmission /></RequireRole></RequireAuth>} />
      <Route path="/school/attendance"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><Attendance /></RequireRole></RequireAuth>} />
      <Route path="/school/fee-collection"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><FeeCollection /></RequireRole></RequireAuth>} />
      <Route path="/school/tc"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><TransferCertificate /></RequireRole></RequireAuth>} />
      <Route path="/school/certificates"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><Certificates /></RequireRole></RequireAuth>} />
      <Route path="/school/transport"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><Transport /></RequireRole></RequireAuth>} />
      <Route path="/school/hostel"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><Hostel /></RequireRole></RequireAuth>} />
      <Route path="/school/activities"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><ActivitiesCoaching /></RequireRole></RequireAuth>} />
      <Route path="/school/reports"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><ReportEngine userTier={tenant?.tier} /></RequireRole></RequireAuth>} />
      <Route path="/school/id-cards"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><IdCardPrinter /></RequireRole></RequireAuth>} />
      <Route path="/school/search"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><UniversalSearch /></RequireRole></RequireAuth>} />
      <Route path="/school/classes"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><ManageClasses /></RequireRole></RequireAuth>} />
      <Route path="/school/student"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><StudentDetail /></RequireRole></RequireAuth>} />
      <Route path="/school/timetable"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><Timetable /></RequireRole></RequireAuth>} />
      <Route path="/school/promote-students"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><PromoteStudents /></RequireRole></RequireAuth>} />
      <Route path="/school/staff"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><ManageStaff /></RequireRole></RequireAuth>} />
      <Route path="/school/fee-analytics"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><FeeAnalytics /></RequireRole></RequireAuth>} />
      <Route path="/school/attendance-analytics"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><AttendanceAnalytics /></RequireRole></RequireAuth>} />
      <Route path="/school/academic-analytics"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><AcademicAnalytics /></RequireRole></RequireAuth>} />
      <Route path="/school/birthdays"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><BirthdayWishes /></RequireRole></RequireAuth>} />
      <Route path="/school/holidays"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><HolidayManagement /></RequireRole></RequireAuth>} />
      <Route path="/school/activity-finance"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><ActivityFinance /></RequireRole></RequireAuth>} />
      <Route path="/school/subjects"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><ManageSubjects /></RequireRole></RequireAuth>} />
      <Route path="/school/fee-structure"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><ManageFeeStructure /></RequireRole></RequireAuth>} />
      <Route path="/school/fee-structure-report"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><FeeStructureReport /></RequireRole></RequireAuth>} />
      <Route path="/school/hostel-welfare-report"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><HostelWelfareReport /></RequireRole></RequireAuth>} />
      <Route path="/school/marks-entry"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><MarksEntry /></RequireRole></RequireAuth>} />
      <Route path="/school/report-card"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><ReportCard /></RequireRole></RequireAuth>} />
      <Route path="/school/ptm"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><PTMScheduling /></RequireRole></RequireAuth>} />
      <Route path="/school/homework"
        element={<RequireAuth><RequireRole roles={SCHOOL_ROLES}><HomeworkTracking /></RequireRole></RequireAuth>} />

      {/* ── Hospital ── */}
      <Route path="/hospital/dashboard"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><VisitProvider><HospitalDashboard /></VisitProvider></RequireRole></RequireAuth>} />
      <Route path="/hospital/patients/new"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><VisitProvider><PatientRegistration userTier={tenant?.tier} /></VisitProvider></RequireRole></RequireAuth>} />
      <Route path="/hospital/opd"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><VisitProvider><OpdVisit /></VisitProvider></RequireRole></RequireAuth>} />
      <Route path="/hospital/lab"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><VisitProvider><LabReports /></VisitProvider></RequireRole></RequireAuth>} />
      <Route path="/hospital/billing"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><VisitProvider><HospitalBilling /></VisitProvider></RequireRole></RequireAuth>} />
      <Route path="/hospital/ipd"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><VisitProvider><IPDManagement /></VisitProvider></RequireRole></RequireAuth>} />
      <Route path="/hospital/patients/find"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><PatientDetail /></RequireRole></RequireAuth>} />
      <Route path="/hospital/wards"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><ManageWards /></RequireRole></RequireAuth>} />
      <Route path="/hospital/doctors"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><ManageDoctors /></RequireRole></RequireAuth>} />
      <Route path="/hospital/staff"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><ManageHospitalStaff /></RequireRole></RequireAuth>} />
      <Route path="/hospital/billing-analytics"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><BillingAnalytics /></RequireRole></RequireAuth>} />
      <Route path="/hospital/appointment-analytics"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><AppointmentAnalytics /></RequireRole></RequireAuth>} />
      <Route path="/hospital/lab-tests"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><ManageLabTests /></RequireRole></RequireAuth>} />
      <Route path="/hospital/appointments"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><OpdAppointments /></RequireRole></RequireAuth>} />
      <Route path="/hospital/reports"
        element={<RequireAuth><RequireRole roles={HOSPITAL_ROLES}><HospitalReports userTier={tenant?.tier} /></RequireRole></RequireAuth>} />

      {/* ── Grievance — staff (auth required) ── */}
      <Route path="/grievance/staff"
        element={<RequireAuth><StaffDashboard /></RequireAuth>} />
      <Route path="/grievance/reports"
        element={<RequireAuth><ReportsDashboard /></RequireAuth>} />
      <Route path="/grievance/verify-queue"
        element={<RequireAuth><AdminVerificationQueue /></RequireAuth>} />
      <Route path="/grievance/feedback"
        element={<RequireAuth><FeedbackDashboard /></RequireAuth>} />

      {/* ── Control Panel — developer/support only ── */}
      <Route path="/control/clients"
        element={<RequireAuth><RequireRole roles={['developer','support']}><CrmClientView /></RequireRole></RequireAuth>} />
      <Route path="/control/tickets"
        element={<RequireAuth><RequireRole roles={['developer','support']}><SupportTickets /></RequireRole></RequireAuth>} />
      <Route path="/control/billing"
        element={<RequireAuth><RequireRole roles={['developer','support']}><BillingTracker /></RequireRole></RequireAuth>} />
      <Route path="/control/onboarding"
        element={<RequireAuth><RequireRole roles={['developer','support']}><OnboardingWizard /></RequireRole></RequireAuth>} />
      <Route path="/control/onboarding/:clientId"
        element={<RequireAuth><RequireRole roles={['developer','support']}><OnboardingWizardWrapper /></RequireRole></RequireAuth>} />
      <Route path="/control/feedback"
        element={<RequireAuth><RequireRole roles={['developer','support']}><FeedbackOverview /></RequireRole></RequireAuth>} />
      <Route path="/control/modifications"
        element={<RequireAuth><RequireRole roles={['developer','support','principal','doctor']}><ModificationRequestPortal /></RequireRole></RequireAuth>} />
      <Route path="/control/help-admin"
        element={<RequireAuth><RequireRole roles={['developer','support']}><HelpSystemAdmin /></RequireRole></RequireAuth>} />
      <Route path="/control/access"
        element={<RequireAuth><RequireRole roles={['developer','support','principal','doctor']}><ManageAccess /></RequireRole></RequireAuth>} />
      <Route path="/control/security"
        element={<RequireAuth><RequireRole roles={['developer','support']}><SecurityMonitor /></RequireRole></RequireAuth>} />

      {/* ── Fallback ── */}
      <Route path="*" element={<Navigate to="/" replace />} />

    </Routes>
    </>
  );
}

function AppBugReporter() {
  const { session } = useTenant();
  if (!session) return null; // Don't show on public pages
  return <BugReporter screenName={window.location.pathname} />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TenantProvider>
        <OfflineIndicator />
        <AppRoutes />
        <AppBugReporter />
      </TenantProvider>
    </BrowserRouter>
  );
}