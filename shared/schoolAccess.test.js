// shared/schoolAccess.test.js — NEW (School Round 1)
import { describe, it, expect } from 'vitest';
import { moduleForPath, buildAccess, SCHOOL_SCREEN_MODULE } from './schoolAccess';

describe('moduleForPath', () => {
  it('maps known screens, ignores a trailing slash', () => {
    expect(moduleForPath('/school/attendance')).toBe('attendance');
    expect(moduleForPath('/school/attendance/')).toBe('attendance');
    expect(moduleForPath('/school/report-card')).toBe('marks_entry');
  });
  it('Dashboard is open (null); an unknown address is undefined (owners only)', () => {
    expect(moduleForPath('/school/dashboard')).toBeNull();
    expect(moduleForPath('/school/not-a-screen')).toBeUndefined();
  });
  it('only uses permission modules that exist for School', () => {
    const known = new Set(['admission', 'analytics', 'attendance', 'business_details', 'certificates', 'fee_collection',
      'homework', 'hostel', 'manage_fee_structure', 'manage_staff', 'marks_entry', 'promote_students', 'ptm',
      'timetable', 'transport', 'school_setup', 'student_lookup', 'activities', 'birthdays']);
    Object.values(SCHOOL_SCREEN_MODULE).filter(Boolean).forEach((m) => expect(known.has(m)).toBe(true));
  });
});

describe('buildAccess', () => {
  it('owners can do everything', () => {
    expect(buildAccess('principal', [], []).can('anything', 'can_delete')).toBe(true);
  });
  it('uses the role row; a missing row or blank value means no', () => {
    const a = buildAccess('teacher', [{ module_code: 'attendance', can_view: true, can_create: null, can_edit: true, can_delete: false }], []);
    expect(a.can('attendance')).toBe(true);
    expect(a.can('attendance', 'can_create')).toBe(false);
    expect(a.can('attendance', 'can_edit')).toBe(true);
    expect(a.can('fee_collection')).toBe(false);
    expect(a.can('attendance', 'bogus')).toBe(false);
  });
  it('a per-person override replaces the role row completely (same as usePermission)', () => {
    const deny = buildAccess('teacher', [{ module_code: 'ptm', can_view: true }], [{ module_code: 'ptm', can_view: false }]);
    expect(deny.can('ptm')).toBe(false);
    const allow = buildAccess('teacher', [], [{ module_code: 'ptm', can_view: true }]);
    expect(allow.can('ptm')).toBe(true);
    expect(allow.can('ptm', 'can_create')).toBe(false);
  });
});
