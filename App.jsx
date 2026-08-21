// App.jsx — FINAL
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import React, { useEffect } from 'react';
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
import { ReportEngine, IdCardPrinter, UniversalSearch } from './school/ReportsSearchIdCards';

// Hospital
import HospitalDashboard from './hospital/HospitalDashboard';
import PatientDetail from './hospital/PatientDetail';
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
  '/school/attendance': 'Attendance', '/school/fee-collection': 'Fee collection',
  '/school/tc': 'Transfer certificate', '/school/certificates': 'Certificates',
  '/school/transport': 'Transport', '/school/hostel': 'Hostel',
  '/school/activities': 'Activities', '/school/reports': 'Reports',
  '/school/id-cards': 'ID cards', '/school/search': 'Search',
  '/school/classes': 'Manage classes',
  '/hospital/dashboard': 'Dashboard', '/hospital/patients/new': 'Patient registration',
  '/hospital/opd': 'OPD visit', '/hospital/lab': 'Lab reports',
  '/hospital/billing': 'Billing', '/hospital/ipd': 'IPD management',
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
    && !path.startsWith('/pay/');

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

  return (
    <>
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
        <AppRoutes />
        <AppBugReporter />
      </TenantProvider>
    </BrowserRouter>
  );
}