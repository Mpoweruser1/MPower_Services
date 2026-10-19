// shared/schoolAccess.js — NEW (School Round 1, 16-10-2026)
//
// Which permission module each School screen needs. One list, used by both
// the route guard (SchoolAccessLayout) and the menu (SchoolNav), so the menu
// never shows a screen the guard would refuse, and the other way round.
//
//   null      -> open to every signed-in School login (Dashboard)
//   'module'  -> needs "View" on that module (Manage Access screen)
//   anything not listed here -> owners only (fails closed)

export const OWNER_ROLES = ['principal', 'doctor', 'developer', 'support'];

export const SCHOOL_SCREEN_MODULE = {
  '/school/dashboard':             null,
  '/school/admission':             'admission',
  '/school/attendance':            'attendance',
  '/school/fee-collection':        'fee_collection',
  '/school/tc':                    'certificates',
  '/school/certificates':          'certificates',
  '/school/id-cards':              'certificates',
  '/school/transport':             'transport',
  '/school/hostel':                'hostel',
  '/school/activities':            'activities',
  '/school/activity-finance':      'activities',
  '/school/reports':               'analytics',
  '/school/academic-analytics':    'analytics',
  '/school/attendance-analytics':  'analytics',
  '/school/fee-analytics':         'analytics',
  '/school/fee-structure-report':  'analytics',
  '/school/hostel-welfare-report': 'analytics',
  '/school/search':                'student_lookup',
  '/school/student':               'student_lookup',
  '/school/classes':               'school_setup',
  '/school/subjects':              'school_setup',
  '/school/holidays':              'school_setup',
  '/school/business-details':      'business_details',
  '/school/timetable':             'timetable',
  '/school/promote-students':      'promote_students',
  '/school/staff':                 'manage_staff',
  '/school/fee-structure':         'manage_fee_structure',
  '/school/birthdays':             'birthdays',
  '/school/homework':              'homework',
  '/school/ptm':                   'ptm',
  '/school/marks-entry':           'marks_entry',
  '/school/report-card':           'marks_entry',
};

/** Module a path needs: null = open, a string = that module, undefined = not a known screen. */
export function moduleForPath(pathname) {
  const p = (pathname || '').replace(/\/+$/, '') || '/';
  return Object.prototype.hasOwnProperty.call(SCHOOL_SCREEN_MODULE, p)
    ? SCHOOL_SCREEN_MODULE[p]
    : undefined;
}

const ACTIONS = ['can_view', 'can_create', 'can_edit', 'can_delete'];

/**
 * Turns the two permission tables into a single can(module, action) check.
 * Same rules as usePermission.js, so a screen using usePermission and the
 * menu can never disagree:
 *   - owners always have everything;
 *   - a per-person override row, when one exists, replaces the role default
 *     completely (a blank value in it counts as "no");
 *   - otherwise the role's default row;
 *   - nothing found -> no.
 */
export function buildAccess(role, rolePermRows, overrideRows) {
  const isOwner = OWNER_ROLES.includes(role);
  const byModule = new Map();
  (rolePermRows || []).forEach((r) => byModule.set(r.module_code, r));
  (overrideRows || []).forEach((r) => byModule.set(r.module_code, r));

  function can(moduleCode, action = 'can_view') {
    if (isOwner) return true;
    if (!ACTIONS.includes(action)) return false;
    const row = byModule.get(moduleCode);
    return !!(row && row[action]);
  }

  return { isOwner, can };
}
