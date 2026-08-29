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

// School
import SchoolDashboard from './school/Dashboard';
import Attendance from './school/Attendance';
import FeeCollection from './school/FeeCollection';
import TransferCertificate from './school/TransferCertificate';
import Certificates from './school/Certificates';
import Transport from './school/Transport';
import Hostel from './school/Hostel';
import ActivitiesCoaching from './school/ActivitiesCoaching';
import StudentAdmission from './school/StudentAdmission';
import ManageClasses from './school/ManageClasses';
import { ReportEngine, IdCardPrinter, UniversalSearch } from './school/ReportsSearchIdCards';

// Hospital
import HospitalDashboard from './hospital/HospitalDashboard';
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

// Control Panel
import CrmClientView from './controlpanel/CrmClientView';
import SupportTickets from './controlpanel/SupportTickets';
import BillingTracker from './controlpanel/BillingTracker';
import OnboardingWizard from './controlpanel/OnboardingWizard';
import ModificationRequestPortal from './controlpanel/ModificationRequestPortal';
import HelpSystemAdmin from './controlpanel/HelpSystemAdmin';
import ManageAccess from './controlpanel/ManageAccess';
import SecurityMonitor from './controlpanel/SecurityMonitor';

// Shared
import BugReporter from './shared/BugReporter';
import RequireRole from './shared/RequireRole';
import CorrectionApprovalQueue from './shared/CorrectionApprovalQueue';
import BusinessDetails from './shared/BusinessDetails';
import HospitalNav from './shared/HospitalNav';
import SchoolNav from './shared/SchoolNav';

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
const SCREEN_NAMES = {
  '/school/dashboard': 'Dashboard', '/school/admission': 'Student admission',
  '/school/attendance': 'Attendance', '/school/fee-collection': 'Fee collection',
  '/school/tc': 'Transfer certificate', '/school/certificates': 'Certificates',
  '/school/transport': 'Transport', '/school/hostel': 'Hostel',
  '/school/activities': 'Activities', '/school/reports': 'Reports',
  '/school/id-cards': 'ID cards', '/school/search': 'Search',
  '/school/classes': 'Manage classes',
  '/school/business-details': 'Business details',
  '/hospital/dashboard': 'Dashboard', '/hospital/patients/new': 'Patient registration',
  '/hospital/opd': 'OPD visit', '/hospital/lab': 'Lab reports',
  '/hospital/billing': 'Billing', '/hospital/ipd': 'IPD management',
  '/hospital/business-details': 'Business details',
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
        element={<RequireAuth><SchoolDashboard /></RequireAuth>} />
      <Route path="/school/admission"
        element={<RequireAuth><StudentAdmission /></RequireAuth>} />
      <Route path="/school/attendance"
        element={<RequireAuth><Attendance /></RequireAuth>} />
      <Route path="/school/fee-collection"
        element={<RequireAuth><FeeCollection /></RequireAuth>} />
      <Route path="/school/tc"
        element={<RequireAuth><TransferCertificate /></RequireAuth>} />
      <Route path="/school/certificates"
        element={<RequireAuth><Certificates /></RequireAuth>} />
      <Route path="/school/transport"
        element={<RequireAuth><Transport /></RequireAuth>} />
      <Route path="/school/hostel"
        element={<RequireAuth><Hostel /></RequireAuth>} />
      <Route path="/school/activities"
        element={<RequireAuth><ActivitiesCoaching /></RequireAuth>} />
      <Route path="/school/reports"
        element={<RequireAuth><ReportEngine userTier={tenant?.tier} /></RequireAuth>} />
      <Route path="/school/id-cards"
        element={<RequireAuth><IdCardPrinter /></RequireAuth>} />
      <Route path="/school/search"
        element={<RequireAuth><UniversalSearch /></RequireAuth>} />
      <Route path="/school/classes"
        element={<RequireAuth><ManageClasses /></RequireAuth>} />
      <Route path="/school/business-details"
        element={<RequireAuth><BusinessDetails NavComponent={SchoolNav} /></RequireAuth>} />

      {/* ── Hospital ── */}
      <Route path="/hospital/dashboard"
        element={<RequireAuth><VisitProvider><HospitalDashboard /></VisitProvider></RequireAuth>} />
      <Route path="/hospital/patients/new"
        element={<RequireAuth><VisitProvider><PatientRegistration userTier={tenant?.tier} /></VisitProvider></RequireAuth>} />
      <Route path="/hospital/opd"
        element={<RequireAuth><VisitProvider><OpdVisit /></VisitProvider></RequireAuth>} />
      <Route path="/hospital/lab"
        element={<RequireAuth><VisitProvider><LabReports /></VisitProvider></RequireAuth>} />
      <Route path="/hospital/billing"
        element={<RequireAuth><VisitProvider><HospitalBilling /></VisitProvider></RequireAuth>} />
      <Route path="/hospital/ipd"
        element={<RequireAuth><VisitProvider><IPDManagement /></VisitProvider></RequireAuth>} />
      <Route path="/hospital/business-details"
        element={<RequireAuth><BusinessDetails NavComponent={HospitalNav} /></RequireAuth>} />

      {/* ── Grievance — staff (auth required) ── */}
      <Route path="/grievance/staff"
        element={<RequireAuth><StaffDashboard /></RequireAuth>} />
      <Route path="/grievance/reports"
        element={<RequireAuth><ReportsDashboard /></RequireAuth>} />
      <Route path="/grievance/verify-queue"
        element={<RequireAuth><AdminVerificationQueue /></RequireAuth>} />

      {/* ── Control Panel — developer/support only ── */}
      <Route path="/control/clients"
        element={<RequireAuth><RequireRole roles={['developer','support']}><CrmClientView /></RequireRole></RequireAuth>} />
      <Route path="/control/tickets"
        element={<RequireAuth><RequireRole roles={['developer','support']}><SupportTickets /></RequireRole></RequireAuth>} />
      <Route path="/control/billing"
        element={<RequireAuth><RequireRole roles={['developer','support']}><BillingTracker /></RequireRole></RequireAuth>} />
      <Route path="/control/onboarding"
        element={<RequireAuth><RequireRole roles={['developer','support']}><OnboardingWizard /></RequireRole></RequireAuth>} />
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
