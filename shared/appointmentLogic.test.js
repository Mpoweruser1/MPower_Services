// shared/appointmentLogic.test.js — NEW
import { describe, it, expect } from 'vitest';
import { isNoShow, countNoShowsByDoctor } from './appointmentLogic';

const NOW = new Date('2026-09-01T12:00:00Z');

describe('isNoShow', () => {
  it('a booked slot whose time has already passed IS a no-show', () => {
    const slot = { status: 'booked', slot_time: '2026-09-01T09:00:00Z' };
    expect(isNoShow(slot, NOW)).toBe(true);
  });

  it('a booked slot still in the future is NOT a no-show yet — the patient still has time to arrive', () => {
    const slot = { status: 'booked', slot_time: '2026-09-01T15:00:00Z' };
    expect(isNoShow(slot, NOW)).toBe(false);
  });

  it('a completed slot (patient checked in) is never a no-show, even long after the appointment time', () => {
    const slot = { status: 'completed', slot_time: '2026-09-01T09:00:00Z' };
    expect(isNoShow(slot, NOW)).toBe(false);
  });

  it('a slot that was never booked at all ("open") is not a no-show — nobody was expected', () => {
    const slot = { status: 'open', slot_time: '2026-09-01T09:00:00Z' };
    expect(isNoShow(slot, NOW)).toBe(false);
  });

  it('a slot exactly at the current moment is not yet a no-show — must be strictly in the past', () => {
    const slot = { status: 'booked', slot_time: NOW.toISOString() };
    expect(isNoShow(slot, NOW)).toBe(false);
  });
});

describe('countNoShowsByDoctor', () => {
  const slots = [
    { id: 1, doctorName: 'Dr. Sharma' },
    { id: 2, doctorName: 'Dr. Sharma' },
    { id: 3, doctorName: 'Dr. Reddy' },
  ];
  const getDoctorName = (s) => s.doctorName;

  it('counts no-shows correctly per doctor', () => {
    const counts = countNoShowsByDoctor(slots, getDoctorName);
    expect(counts).toEqual({ 'Dr. Sharma': 2, 'Dr. Reddy': 1 });
  });

  it('falls back to "Unknown" rather than dropping a slot whose doctor link is broken or missing — losing a real no-show from the count would be worse than an "Unknown" bucket', () => {
    const withMissing = [...slots, { id: 4, doctorName: null }];
    const counts = countNoShowsByDoctor(withMissing, getDoctorName);
    expect(counts.Unknown).toBe(1);
  });

  it('an empty slot list produces an empty count object, not an error', () => {
    expect(countNoShowsByDoctor([], getDoctorName)).toEqual({});
  });
});
