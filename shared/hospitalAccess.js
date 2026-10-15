// shared/hospitalAccess.js — NEW
// Who may open which Hospital screen. One list used by BOTH the routes (App.jsx) and the menu
// (HospitalNav.jsx), so a screen is never shown to someone who would only be refused at the door.
// Screens not listed here are open to every Hospital login (register, OPD, lab, billing, IPD, find patient, appointments).
// Owners (principal, doctor) can open everything. The database has its own checks too — this is the friendly front door.
export const OWNER_ROLES = ['principal', 'doctor'];

export const HOSPITAL_ACCESS = {
  '/hospital/wards': OWNER_ROLES,
  '/hospital/doctors': OWNER_ROLES,
  '/hospital/staff': OWNER_ROLES,
  '/hospital/lab-tests': OWNER_ROLES,
  '/hospital/price-list': OWNER_ROLES,
  '/hospital/business-details': OWNER_ROLES,
  '/hospital/reports': [...OWNER_ROLES, 'billing_clerk'],
  '/hospital/billing-analytics': [...OWNER_ROLES, 'billing_clerk'],
  '/hospital/appointment-analytics': [...OWNER_ROLES, 'receptionist'],
};

// The reports a billing clerk may run: the ones about money.
export const MONEY_REPORT_IDS = ['monthly_revenue_trend', 'revenue_by_mode', 'ipd_deposits', 'collections', 'claims', 'cancelled_bills', 'revenue_by_service'];

// null = open to all; otherwise the list of roles.
export function rolesFor(path) { return HOSPITAL_ACCESS[path] || null; }

export function canOpenHospitalPath(role, path) {
  const roles = rolesFor(path);
  return !roles || roles.includes(role);
}
