// hospital/IPDManagement.jsx — FINAL
// Beds are real records (ward_beds): admit / move pick a free bed from the list, grouped by room.
// The Ward map is a bed board: tap a free bed to admit a patient there; tap a taken bed to see the
// patient and move, discharge or bill from it.
// A free bed can be reserved (anyone) or taken out of service (principal / doctor); a held bed cannot
// be chosen for a patient. Needs fix_hospital_bed_holds.sql; without it the board works as before.
// A ward with no bed list yet (database script not run) keeps the old typed bed number.
// Deposits: the admit form offers the ward's usual deposit (editable, 0 = none); each patient shows the
// deposit in hand and can take / refund one (DepositBox). Needs fix_hospital_deposits.sql; without it
// nothing about deposits is shown.
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { useVisit } from '../context/VisitContext';
import PatientSelector from '../shared/PatientSelector';
import VitalsEntry from '../shared/VitalsEntry';
import DischargeSummaryDocument from '../shared/DischargeSummaryDocument';
import HospitalNav from '../shared/HospitalNav';
import BugReporter from '../shared/BugReporter';
import { buildWardWithBeds, groupBedsByRoom, validateBedNo as validateBedNoLogic } from '../shared/bedLogic';
import { validateDischargeSummary, computeLengthOfStay } from '../shared/dischargeLogic';
import { istToday, fetchAllRows } from './hospitalUtils';
import DepositBox, { money as depMoney, validateDepositAmount } from './DepositBox';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  stat: { background: '#111113', borderRadius: 10, padding: 14, textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' },
  textarea: { width: '100%', padding: '10px 14px', background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'none' },
  fieldErr: { fontSize: 11, color: '#E05A5A', marginTop: 4 },
};

// How a bed on hold looks: reserved = blue, out of service = grey.
const HOLD_STYLE = {
  reserved:       { word: 'reserved',       short: 'Reserved', bg: 'rgba(90,154,223,0.14)',  border: 'rgba(90,154,223,0.35)',  fg: '#5A9ADF' },
  out_of_service: { word: 'out of service', short: 'Out',      bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.18)', fg: 'rgba(255,255,255,0.5)' },
};
const OOS_REASONS = ['Under repair', 'Cleaning / sanitising', 'Isolation hold', 'Equipment fault', 'Other'];

// Free beds of one ward as buttons, grouped by room; beds with a patient are shown but cannot be chosen.
function BedPicker({ ward, value, onPick, occupants }) {
  if (!ward) return null;
  const groups = groupBedsByRoom(ward.beds);
  return (
    <div role="group" aria-label="Choose a bed" style={{ marginTop: 8 }}>
      {groups.map((g) => (
        <div key={g.room || '__no_room'} style={{ marginBottom: 10 }}>
          {g.room && <p style={{ margin: '0 0 6px', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{g.room}</p>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {g.beds.map((b) => (b.occupied ? (
              <span key={b.bedNo} title={occupants[b.bedNo.toLowerCase()] || 'Occupied'}
                style={{ padding: '4px 10px', border: '1px solid rgba(224,90,90,0.25)', borderRadius: 6, background: 'rgba(224,90,90,0.08)', color: 'rgba(224,90,90,0.7)', fontSize: 12 }}>
                {b.bedNo} · occupied
              </span>
            ) : b.hold ? (
              <span key={b.bedNo} title={b.hold.note}
                style={{ padding: '4px 10px', border: `1px solid ${HOLD_STYLE[b.hold.kind].border}`, borderRadius: 6, background: HOLD_STYLE[b.hold.kind].bg, color: HOLD_STYLE[b.hold.kind].fg, fontSize: 12 }}>
                {b.bedNo} · {HOLD_STYLE[b.hold.kind].word}
              </span>
            ) : (
              <button type="button" key={b.bedNo} aria-pressed={value === b.bedNo} onClick={() => onPick(b.bedNo)}
                style={{ padding: '4px 10px', border: `1px solid ${value === b.bedNo ? '#E8A020' : 'rgba(106,170,144,0.3)'}`, borderRadius: 6, background: value === b.bedNo ? '#E8A020' : 'rgba(106,170,144,0.08)', color: value === b.bedNo ? '#111113' : '#6AAA90', fontWeight: value === b.bedNo ? 700 : 400, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                {b.bedNo}
              </button>
            )))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function IPDManagement() {
  const navigate = useNavigate();
  const { tenant }                                       = useTenant();
  const { activePatient, setActivePatient } = useVisit();

  const [wards, setWards]               = useState([]);
  const [admissions, setAdmissions]     = useState([]);
  const [tab, setTab]                   = useState('overview');
  const [loading, setLoading]           = useState(true);

  // Admit patient
  const [admitPatient, setAdmitPatient] = useState(null);
  const [vitalsOpenFor, setVitalsOpenFor] = useState(null);

  // Was importing activePatient from context but never actually using
  // it — a patient set active on Registration never carried through
  // to here. Only takes it on mount, so switching to a different
  // patient later within the same IPD screen doesn't get overridden.
  useEffect(() => {
    if (activePatient) setAdmitPatient(activePatient);
  }, []);
  const [admitWardId, setAdmitWardId]   = useState('');
  const [admitBedNo, setAdmitBedNo]     = useState('');
  const [admitBedError, setAdmitBedError] = useState('');
  const [admitDiagnosis, setAdmitDiagnosis] = useState('');
  const [admitting, setAdmitting]       = useState(false);
  const [admitError, setAdmitError]     = useState('');

  // Discharge
  const [dischargingAdm, setDischargingAdm]     = useState(null);
  const [dischargeSummary, setDischargeSummary] = useState('');
  const [dischargeSummaryError, setDischargeSummaryError] = useState('');
  const [discharging, setDischarging]           = useState(false);
  const [completedDischarge, setCompletedDischarge] = useState(null);

  // Room-charge estimates per open admission (from ipd_open_estimates) and
  // the "Move bed / ward" dialog.
  const [estimates, setEstimates]   = useState({});
  const [movingAdm, setMovingAdm]   = useState(null);
  const [moveWardId, setMoveWardId] = useState('');
  const [moveBedNo, setMoveBedNo]   = useState('');
  const [moveDate, setMoveDate]     = useState('');
  const [moveError, setMoveError]   = useState('');
  const [moving, setMoving]         = useState(false);
  const [notice, setNotice]         = useState('');
  const [bedWarn, setBedWarn]       = useState('');
  // Bed board: the bed tapped on the Ward map, and the AC filter
  const [selectedBed, setSelectedBed] = useState(null); // { wardId, bedNo }
  const [acFilter, setAcFilter]       = useState('all'); // 'all' | 'ac' | 'nonac'
  // Beds on hold: are the hold columns there, the form on the tapped bed, and the call in progress
  const [holdsReady, setHoldsReady]   = useState(false);
  const [holdForm, setHoldForm]       = useState(null); // { kind, reason, note, until }
  const [holdError, setHoldError]     = useState('');
  const [holdBusy, setHoldBusy]       = useState(false);
  // deposits: depositMap = admission id -> { paid, refunded, applied, in_hand }, or null when the database script has not been run
  const [depositMap, setDepositMap]   = useState(null);
  const [requiredMap, setRequiredMap] = useState({}); // ward id -> the ward's usual deposit
  const [depositOpenFor, setDepositOpenFor] = useState(null);
  const [admitDeposit, setAdmitDeposit]     = useState('');
  const [admitDepositMode, setAdmitDepositMode] = useState('Cash');
  const isOwner = ['principal', 'doctor'].includes(tenant?.role);

  // a different bed tapped (or the panel closed): forget the half-filled form
  useEffect(() => { setHoldForm(null); setHoldError(''); }, [selectedBed]);

  // the admit form offers the usual deposit of the chosen ward (the staff may change it)
  useEffect(() => {
    const req = requiredMap[admitWardId];
    setAdmitDeposit(req > 0 ? String(req) : '');
  }, [admitWardId, requiredMap]);

  useEffect(() => {
    if (tenant?.appId) loadAll();
  }, [tenant?.appId]);

  async function loadAll() {
    setLoading(true);
    const { data: wardData } = await supabase
      .from('wards').select('*').eq('app_id', tenant.appId).order('ward_type');

    const { data: admData } = await supabase
      .from('ipd_admissions')
      .select('*, patients(id, full_name, patient_uid, phone, gender, dob), wards(ward_type)')
      .is('discharge_date', null)
      .in('ward_id', (wardData || []).map((w) => w.id));

    // The real beds (name + room). If the list cannot be read, the screen falls back to the
    // made-up bed names and says so — unless the table simply does not exist yet.
    let bedRows = [];
    let holds = false;
    setBedWarn('');
    const readBeds = (cols) => fetchAllRows(() => supabase.from('ward_beds')
      .select(cols).eq('app_id', tenant.appId).order('seq').order('id'));
    try {
      try {
        bedRows = await readBeds('id, ward_id, room, label, seq, hold_kind, hold_note, hold_until');
        holds = true;
      } catch (holdErr) {
        // 42703 = the hold columns do not exist yet (fix_hospital_bed_holds.sql not run): read without them
        if (holdErr?.code !== '42703') throw holdErr;
        bedRows = await readBeds('id, ward_id, room, label, seq');
      }
    } catch (bedErr) {
      console.error('Loading the bed list failed:', bedErr);
      if (bedErr?.code !== '42P01' && bedErr?.code !== 'PGRST205') {
        setBedWarn('The list of beds could not be loaded, so bed names may not match. Please refresh the screen.');
      }
    }

    // buildWardWithBeds is the tested version of this exact
    // computation — see shared/bedLogic.js and its test suite.
    setHoldsReady(holds);
    const wardsWithBeds = (wardData || []).map((ward) => buildWardWithBeds(ward, admData || [], bedRows, istToday()));

    setWards(wardsWithBeds);
    setAdmissions((admData || []).map((a) => ({
      id: a.id, patientId: a.patient_id,
      patientName:   a.patients?.full_name || '—',
      patientUid:    a.patients?.patient_uid || '—',
      patientPhone:  a.patients?.phone || '',
      patientGender: a.patients?.gender || '',
      bedNo:         a.bed_no,
      wardId:        a.ward_id,
      wardName:      a.wards?.ward_type || '—',
      admittedOn:    a.admission_date,
      diagnosis:     a.diagnosis || '',
      // Full patient record, so "Generate bill" can open billing with this
      // patient already selected.
      patient:       a.patients || null,
    })));

    // Running room-charge estimate. Non-blocking: if it fails (for example the
    // price-list database script has not been run yet) the screen still works
    // and simply shows no estimate.
    const { data: estData, error: estErr } = await supabase.rpc('ipd_open_estimates');
    if (estErr) {
      console.error('Loading room-charge estimates failed:', estErr);
      setEstimates({});
    } else {
      const map = {};
      (estData || []).forEach((e) => { map[e.admission_id] = e; });
      setEstimates(map);
    }
    // Deposits. Non-blocking: if the database script has not been run, deposits are simply not shown.
    const { data: depData, error: depErr } = await supabase.rpc('ipd_deposit_summary', { p_admissions: null });
    if (depErr) {
      if (depErr.code !== '42883' && depErr.code !== 'PGRST202') console.error('Loading deposits failed:', depErr);
      setDepositMap(null);
      setRequiredMap({});
    } else {
      const dm = {};
      (depData || []).forEach((d) => { dm[d.admission_id] = { paid: Number(d.paid), refunded: Number(d.refunded), applied: Number(d.applied), in_hand: Number(d.in_hand) }; });
      setDepositMap(dm);
      const { data: reqData, error: reqErr } = await supabase.from('hospital_price_list')
        .select('ward_id, deposit').eq('app_id', tenant.appId).eq('category', 'room').eq('active', true);
      if (reqErr && reqErr.code !== '42703') console.error('Loading ward deposits failed:', reqErr);
      const rm = {};
      (reqData || []).forEach((r) => { if (r.ward_id) rm[r.ward_id] = Number(r.deposit || 0); });
      setRequiredMap(rm);
    }
    setSelectedBed(null);
    setLoading(false);
  }

  function openMove(a) {
    setMovingAdm(a);
    setMoveWardId('');
    setMoveBedNo('');
    setMoveError('');
    setMoveDate(istToday());
  }

  async function moveBed() {
    setMoveError('');
    if (!moveWardId) { setMoveError('Select the ward to move to.'); return; }
    const bedErr = validateBedNo(moveBedNo, moveWardId);
    if (bedErr) { setMoveError(bedErr); return; }
    if (!moveDate) { setMoveError('Select the date of the move.'); return; }
    if (moveDate < movingAdm.admittedOn) { setMoveError('The move cannot be before the admission date.'); return; }
    if (moveDate > istToday()) { setMoveError('The move date cannot be in the future.'); return; }

    setMoving(true);
    const { error } = await supabase.rpc('ipd_transfer', {
      p_admission: movingAdm.id,
      p_ward: moveWardId,
      p_bed: moveBedNo.trim(),
      p_date: moveDate,
    });
    setMoving(false);
    if (error) {
      console.error('Moving patient failed:', error);
      setMoveError(error.message || 'Could not move the patient. Please try again.');
      return;
    }
    setNotice(`✅ ${movingAdm.patientName} moved to bed ${moveBedNo.trim()}. Room charges follow the new ward from ${moveDate}.`);
    setTimeout(() => setNotice(''), 6000);
    setMovingAdm(null);
    loadAll();
  }

  function generateBillFor(a) {
    // Hand the patient and the admission to billing so room charges can be
    // worked out from the admission dates there.
    if (a.patient) setActivePatient(a.patient);
    navigate('/hospital/billing', { state: { admissionId: a.id } });
  }

  // The only real safeguard against double-booking a physical bed —
  // see shared/bedLogic.js's isBedOccupied and its test suite.
  function validateBedNo(value, wardId) {
    return validateBedNoLogic(value, wardId, wards, admissions);
  }

  async function selectPatientForAdmission(patient) {
    setAdmitPatient(patient);
    const { data: recentVisit } = await supabase
      .from('opd_visits')
      .select('diagnosis')
      .eq('patient_id', patient.id)
      .order('visit_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentVisit?.diagnosis) setAdmitDiagnosis(recentVisit.diagnosis);
  }

  async function admitToWard() {
    setAdmitError('');
    if (!admitPatient)  { setAdmitError('Select a patient.'); return; }
    if (!admitWardId)   { setAdmitError('Select a ward.'); return; }

    const bedErr = validateBedNo(admitBedNo, admitWardId);
    if (bedErr) { setAdmitBedError(bedErr); return; }

    const depositToTake = depositMap !== null && admitDeposit !== '' ? Number(admitDeposit) : 0;
    if (depositMap !== null && admitDeposit !== '' && Number(admitDeposit) !== 0) {
      const depMsg = validateDepositAmount(admitDeposit);
      if (depMsg) { setAdmitError(`Deposit: ${depMsg}`); return; }
    }

    // Check if patient is already admitted
    const alreadyAdmitted = admissions.some((a) => a.patientId === admitPatient.id);
    if (alreadyAdmitted) { setAdmitError('This patient is already admitted. Discharge first before re-admitting.'); return; }

    setAdmitting(true);

    // ipd_admissions_admitting_doctor_id_fkey requires this column to hold a
    // doctors.id, NOT a users.id. tenant.userRowId is the signed-in user's
    // users.id — correct for columns like created_by (FK to users.id) but
    // wrong here. doctors.staff_id is what links a users row to its doctors
    // profile, so look that up first. Not every account admitting a patient
    // has a doctors profile (a nurse or receptionist may do this), and the
    // column is nullable, so fall back to null rather than fail the whole
    // admission when no profile exists.
    const { data: doctorRow } = await supabase
      .from('doctors')
      .select('id')
      .eq('staff_id', tenant.userRowId)
      .maybeSingle();

    const { data: created, error } = await supabase.from('ipd_admissions').insert({
      // NOTE: no app_id here — ipd_admissions has no app_id column.
      // Tenant scoping for this table works indirectly through
      // patient_id -> patients.app_id (see the tenant_isolation_ipd
      // RLS policy), unlike most other hospital tables which do carry
      // app_id directly. Sending it here caused every single admission
      // to fail with "Could not find the 'app_id' column of
      // 'ipd_admissions' in the schema cache."
      patient_id:          admitPatient.id,
      ward_id:             admitWardId,
      bed_no:              admitBedNo.trim(),
      admission_date:      istToday(),
      admitting_doctor_id: doctorRow?.id || null,
      diagnosis:           admitDiagnosis.trim() || 'Pending',
    }).select('id').maybeSingle();

    if (error) console.error('Admission failed:', error);

    if (error) {
      // Two kinds of database refusal are expected here: a foreign key (a linked record
      // is missing) and a duplicate (23505) — the database now refuses a second open
      // admission for the same patient and a second patient in the same bed, which can
      // happen when two people press Admit at the same moment.
      const isForeignKeyError = error.code === '23503';
      const isDuplicate = error.code === '23505';
      setAdmitError(
        isForeignKeyError
          ? 'Failed to admit patient — a linked record (doctor, patient, or ward) could not be found. Please refresh and try again.'
          : isDuplicate
            ? 'This patient is already admitted, or this bed was just taken by someone else. Refresh the screen and check the beds.'
            : `Failed to admit patient. ${error.message || 'Please try again.'}`
      );
      setAdmitting(false);
      return;
    }

    // The deposit is saved as a second step. The admission stands either way; if the deposit cannot be
    // saved the staff are told straight away and can take it from the patient's card.
    if (depositToTake > 0) {
      let admissionId = created?.id;
      if (!admissionId) {
        const { data: found } = await supabase.from('ipd_admissions').select('id')
          .eq('patient_id', admitPatient.id).is('discharge_date', null).maybeSingle();
        admissionId = found?.id;
      }
      const { error: depErr } = admissionId
        ? await supabase.rpc('add_ipd_deposit', { p_admission: admissionId, p_amount: depositToTake, p_mode: admitDepositMode, p_reference: null, p_note: 'At admission' })
        : { error: { message: 'the new admission could not be found' } };
      if (depErr) {
        console.error('Saving the admission deposit failed:', depErr);
        setNotice(`⚠️ ${admitPatient.full_name} is admitted, but the deposit of ${depMoney(depositToTake)} was NOT saved: ${depErr.message}. Take it from the patient's card.`);
        setTimeout(() => setNotice(''), 15000);
      } else {
        setNotice(`✅ ${admitPatient.full_name} admitted. Deposit ${depMoney(depositToTake)} recorded.`);
        setTimeout(() => setNotice(''), 6000);
      }
    }

    setAdmitPatient(null);
    setAdmitWardId('');
    setAdmitBedNo('');
    setAdmitBedError('');
    setAdmitDiagnosis('');
    setAdmitDepositMode('Cash');
    setAdmitting(false);
    loadAll();
    setTab('admissions');
  }

  // The deposit line of one patient (card on the Admissions tab, panel on the Ward map): amount in hand, and a
  // button that opens the full DepositBox. Nothing at all when deposits are not set up in the database.
  function depositBlock(a) {
    if (depositMap === null) return null;
    const d = depositMap[a.id] || { paid: 0, refunded: 0, applied: 0, in_hand: 0 };
    const req = requiredMap[a.wardId] || 0;
    const open = depositOpenFor === a.id;
    const short = req > 0 && d.paid - d.refunded < req;
    return (
      <div style={{ margin: '8px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: short ? '#E8A020' : 'rgba(255,255,255,0.6)' }}>
            Deposit in hand · <strong style={{ color: d.in_hand > 0 ? '#6AAA90' : (short ? '#E8A020' : 'rgba(255,255,255,0.6)') }}>{depMoney(d.in_hand)}</strong>
            {short && d.paid - d.refunded <= 0 ? ` (usual ${depMoney(req)})` : ''}
          </span>
          <button type="button" aria-expanded={open} onClick={() => setDepositOpenFor(open ? null : a.id)}
            style={{ padding: '4px 10px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
            {open ? 'Close' : '💰 Deposit'}
          </button>
        </div>
        {open && (
          <div style={{ marginTop: 8 }}>
            <DepositBox admissionId={a.id} admissionOpen required={req} canRefund={isOwner} patientName={a.patientName}
              onChanged={(sm) => { if (sm) setDepositMap((m) => (m ? { ...m, [a.id]: sm } : m)); }} />
          </div>
        )}
      </div>
    );
  }

  async function discharge() {
    setDischargeSummaryError('');
    // Same validation now used in the test suite — see
    // shared/dischargeLogic.js.
    const validationError = validateDischargeSummary(dischargeSummary);
    if (validationError) { setDischargeSummaryError(validationError); return; }

    setDischarging(true);
    const dischargeDate = istToday();
    // Only an admission that is still open can be discharged, so a second click or a second
    // person cannot overwrite the first discharge date.
    const { data: dischargedRows, error: dischargeErr } = await supabase.from('ipd_admissions').update({
      discharge_date: dischargeDate,
      discharge_summary: dischargeSummary,
    }).eq('id', dischargingAdm.id).is('discharge_date', null).select('id');

    // Previously not checked at all — a failed update would still
    // show "discharge complete", send the patient a WhatsApp message
    // saying their discharge summary is ready, and free up the bed in
    // the UI, all while the patient remained admitted in the database.
    // Since nothing has actually succeeded yet if this fails, this
    // stops here rather than partially proceeding — the modal stays
    // open with the summary text intact so nothing typed is lost.
    if (dischargeErr) {
      console.error('Discharge failed:', dischargeErr);
      setDischargeSummaryError(dischargeErr.message || 'Failed to complete discharge. Please try again.');
      setDischarging(false);
      return;
    }
    if (!dischargedRows || dischargedRows.length === 0) {
      setDischargeSummaryError('This patient was already discharged. Refresh the screen to see the latest.');
      setDischarging(false);
      loadAll();
      return;
    }

    if (dischargingAdm.patientPhone) {
      await supabase.functions.invoke('send-whatsapp', {
        body: { type: 'discharge_summary', patientId: dischargingAdm.patientId, summary: dischargeSummary },
      });
    }

    // computeLengthOfStay was genuinely missing before — see
    // shared/dischargeLogic.js. Passed through to
    // DischargeSummaryDocument so it can actually show it, not just
    // computed and dropped.
    setCompletedDischarge({
      ...dischargingAdm,
      summary: dischargeSummary,
      dischargedAt: new Date().toLocaleString('en-IN'),
      lengthOfStayDays: computeLengthOfStay(dischargingAdm.admittedOn, dischargeDate),
    });
    setDischargingAdm(null);
    setDischargeSummary('');
    setDischargeSummaryError('');
    setDischarging(false);
    loadAll();
  }

  // lower-case bed name -> patient, per ward id
  const occupantsOf = (wardId) => {
    const m = {};
    admissions.filter((a) => a.wardId === wardId).forEach((a) => { m[String(a.bedNo || '').trim().toLowerCase()] = a.patientName; });
    return m;
  };

  // Reserve a bed / take it out of service (database function set_bed_hold).
  async function saveHold(bed) {
    if (!holdForm) return;
    const kind = holdForm.kind;
    const note = (kind === 'out_of_service' && holdForm.reason !== 'Other' ? holdForm.reason : holdForm.note).trim();
    if (note.length < 3) { setHoldError(kind === 'reserved' ? 'Write who or what the bed is reserved for (at least 3 letters).' : 'Write the reason (at least 3 letters).'); return; }
    if (note.length > 120) { setHoldError('The note is too long (120 letters at most).'); return; }
    if (kind === 'reserved' && holdForm.until && holdForm.until < istToday()) { setHoldError('The "until" date cannot be in the past.'); return; }
    setHoldBusy(true);
    setHoldError('');
    const { error } = await supabase.rpc('set_bed_hold', {
      p_bed: bed.id, p_kind: kind, p_note: note, p_until: kind === 'reserved' && holdForm.until ? holdForm.until : null,
    });
    setHoldBusy(false);
    if (error) { console.error('Setting the bed hold failed:', error); setHoldError(error.message || 'Could not save. Please try again.'); return; }
    setNotice(kind === 'reserved' ? `✅ Bed ${bed.bedNo} reserved.` : `✅ Bed ${bed.bedNo} is now out of service.`);
    setTimeout(() => setNotice(''), 5000);
    loadAll();
  }

  // Release a reservation / put a bed back in service. With admitAfter the bed is then used for a patient.
  async function releaseHold(ward, bed, admitAfter) {
    setHoldBusy(true);
    setHoldError('');
    const { error } = await supabase.rpc('release_bed_hold', { p_bed: bed.id });
    setHoldBusy(false);
    if (error) { console.error('Releasing the bed hold failed:', error); setHoldError(error.message || 'Could not release the bed. Please try again.'); return; }
    if (admitAfter) {
      loadAll();
      admitHere(ward.id, bed.bedNo);
      return;
    }
    setNotice(`✅ Bed ${bed.bedNo} is free again.`);
    setTimeout(() => setNotice(''), 5000);
    loadAll();
  }

  // A tapped free bed: go to Admit with this ward and bed already chosen.
  function admitHere(wardId, bedNo) {
    setAdmitWardId(wardId);
    setAdmitBedNo(bedNo);
    setAdmitBedError('');
    setAdmitError('');
    setSelectedBed(null);
    setTab('admit');
  }

  const hasAc    = wards.some((w) => w.is_ac);
  const hasNonAc = wards.some((w) => !w.is_ac);
  const shownWards = wards.filter((w) => acFilter === 'all' || (acFilter === 'ac' ? w.is_ac : !w.is_ac));

  const totalBeds     = wards.reduce((s, w) => s + (w.total_beds || 0), 0);
  const occupiedBeds  = admissions.length;
  // beds on hold are not available
  const availableBeds = wards.reduce((s, w) => s + (w.available || 0), 0);
  const occupancyPct  = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <div style={S.inner}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>IPD Management · IPD నిర్వహణ</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>IPD / Bed Management</h1>
        </div>

        {notice && (
          <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#6AAA90' }}>
            {notice}
          </div>
        )}

        {bedWarn && (
          <div role="alert" style={{ background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E8A020' }}>
            ⚠ {bedWarn}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { value: totalBeds,     label: 'Total beds',   color: '#fff',    alert: false },
            { value: `${occupiedBeds} (${occupancyPct}%)`, label: 'Occupied', color: '#E8A020', alert: occupancyPct > 85 },
            { value: availableBeds, label: 'Available',   color: availableBeds < 3 ? '#E05A5A' : '#6AAA90', alert: availableBeds < 3 },
            { value: wards.length,  label: 'Wards',       color: '#fff',    alert: false },
          ].map((s) => (
            <div key={s.label} style={{ ...S.stat, border: `1px solid ${s.alert ? 'rgba(224,90,90,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: s.alert ? '#E05A5A' : s.color }}>{s.value}</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { k: 'overview',   l: 'Ward map' },
            { k: 'admissions', l: `Admitted (${admissions.length})` },
            { k: 'admit',      l: 'Admit patient' },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 20, cursor: 'pointer', border: tab === t.k ? 'none' : '1px solid rgba(255,255,255,0.1)', background: tab === t.k ? '#E8A020' : 'transparent', color: tab === t.k ? '#111113' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: tab === t.k ? 600 : 400, whiteSpace: 'nowrap' }}>
              {t.l}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading...</p>
        ) : (
          <>
            {/* Ward overview — the bed board */}
            {tab === 'overview' && (
              wards.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No wards configured yet.</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(106,170,144,0.35)', marginRight: 5 }} />Free</span>
                    <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(224,90,90,0.4)', marginRight: 5 }} />Patient in bed</span>
                    {holdsReady && (
                      <>
                        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(90,154,223,0.45)', marginRight: 5 }} />Reserved</span>
                        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(255,255,255,0.25)', marginRight: 5 }} />Out of service</span>
                      </>
                    )}
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>Tap a bed</span>
                    {hasAc && hasNonAc && (
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        {[{ k: 'all', l: 'All' }, { k: 'ac', l: 'AC' }, { k: 'nonac', l: 'Non-AC' }].map((f) => (
                          <button key={f.k} type="button" aria-pressed={acFilter === f.k} onClick={() => { setAcFilter(f.k); setSelectedBed(null); }}
                            style={{ padding: '3px 10px', fontSize: 11, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${acFilter === f.k ? '#5A9ADF' : 'rgba(255,255,255,0.12)'}`, background: acFilter === f.k ? 'rgba(90,154,223,0.18)' : 'transparent', color: acFilter === f.k ? '#5A9ADF' : 'rgba(255,255,255,0.5)' }}>
                            {f.l}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                  {shownWards.map((ward) => {
                    const picked = selectedBed && selectedBed.wardId === ward.id
                      ? ward.beds.find((b) => b.bedNo === selectedBed.bedNo) : null;
                    const pickedAdm = picked && picked.occupied
                      ? admissions.find((a) => a.wardId === ward.id && String(a.bedNo || '').trim().toLowerCase() === picked.bedNo.toLowerCase())
                      : null;
                    return (
                  <div key={ward.id} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>
                          {ward.ward_type} Ward
                          <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: ward.is_ac ? 'rgba(90,154,223,0.14)' : 'rgba(255,255,255,0.06)', color: ward.is_ac ? '#5A9ADF' : 'rgba(255,255,255,0.45)' }}>
                            {ward.is_ac ? 'AC' : 'Non-AC'}
                          </span>
                        </p>
                        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{ward.occupied}/{ward.total_beds} beds occupied{ward.held > 0 ? ` · ${ward.held} on hold` : ''}</p>
                      </div>
                      <div style={{ background: '#111113', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: ward.available === 0 ? '#E05A5A' : '#6AAA90' }}>{ward.available}</p>
                        <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>available</p>
                      </div>
                    </div>
                    {groupBedsByRoom(ward.beds).map((g) => (
                      <div key={g.room || '__no_room'} style={{ marginBottom: 8 }}>
                        {g.room && <p style={{ margin: '0 0 6px', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{g.room}</p>}
                        <div style={{ display: 'grid', gridTemplateColumns: ward.hasBedList ? 'repeat(auto-fill, minmax(78px, 1fr))' : 'repeat(6,1fr)', gap: 6 }}>
                          {g.beds.map((bed) => {
                            const adm = admissions.find((a) => String(a.bedNo || '').trim().toLowerCase() === bed.bedNo.toLowerCase() && a.wardId === ward.id);
                            const isPicked = !!selectedBed && selectedBed.wardId === ward.id && selectedBed.bedNo === bed.bedNo;
                            const who = bed.occupied ? (adm?.patientName || 'Occupied') : 'Free';
                            const hs = !bed.occupied && bed.hold ? HOLD_STYLE[bed.hold.kind] : null;
                            return (
                              <button type="button" key={bed.bedNo} aria-pressed={isPicked}
                                aria-label={`Bed ${bed.bedNo}, ${bed.occupied ? `patient ${who}` : hs ? `${hs.word} (${bed.hold.note})` : 'free'}`}
                                title={`${bed.bedNo} — ${bed.occupied ? who : hs ? `${hs.word}: ${bed.hold.note}` : 'Available'}`}
                                onClick={() => setSelectedBed(isPicked ? null : { wardId: ward.id, bedNo: bed.bedNo })}
                                style={{ padding: '6px 4px', borderRadius: 6, textAlign: 'center', fontSize: 9, fontWeight: 500, overflow: 'hidden', cursor: 'pointer', fontFamily: 'inherit', background: bed.occupied ? 'rgba(224,90,90,0.15)' : hs ? hs.bg : 'rgba(106,170,144,0.12)', color: bed.occupied ? '#E05A5A' : hs ? hs.fg : '#6AAA90', border: `1px solid ${isPicked ? '#E8A020' : bed.occupied ? 'rgba(224,90,90,0.25)' : hs ? hs.border : 'rgba(106,170,144,0.2)'}`, boxShadow: isPicked ? '0 0 0 1px #E8A020' : 'none' }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ward.hasBedList ? bed.bedNo : bed.bedNo.split('-').pop()}</span>
                                {bed.occupied && <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8, marginTop: 2 }}>{String(who).split(' ')[0]}</span>}
                                {hs && <span style={{ display: 'block', opacity: 0.85, marginTop: 2 }}>{hs.short}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {picked && (
                      <div role="region" aria-label={`Bed ${picked.bedNo}`} style={{ marginTop: 10, background: '#111113', border: '1px solid rgba(232,160,32,0.3)', borderRadius: 10, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>
                            Bed {picked.bedNo}{picked.room ? <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.45)' }}> · {picked.room}</span> : null}
                          </p>
                          <button type="button" onClick={() => setSelectedBed(null)} aria-label="Close"
                            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}>✕</button>
                        </div>
                        {!picked.occupied && !picked.hold && (
                          <>
                            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6AAA90' }}>This bed is free.</p>
                            <button type="button" onClick={() => admitHere(ward.id, picked.bedNo)}
                              style={{ width: '100%', padding: 11, background: '#6AAA90', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                              🛏️ Admit a patient here
                            </button>
                            {holdsReady && ward.hasBedList && picked.id && !holdForm && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button type="button" onClick={() => { setHoldForm({ kind: 'reserved', reason: OOS_REASONS[0], note: '', until: '' }); setHoldError(''); }}
                                  style={{ flex: 1, padding: '8px 0', border: '1px solid rgba(90,154,223,0.35)', color: '#5A9ADF', background: 'rgba(90,154,223,0.08)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                                  Reserve…
                                </button>
                                {isOwner && (
                                  <button type="button" onClick={() => { setHoldForm({ kind: 'out_of_service', reason: OOS_REASONS[0], note: '', until: '' }); setHoldError(''); }}
                                    style={{ flex: 1, padding: '8px 0', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.65)', background: 'transparent', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                                    Out of service…
                                  </button>
                                )}
                              </div>
                            )}
                            {holdForm && (
                              <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: holdForm.kind === 'reserved' ? '#5A9ADF' : 'rgba(255,255,255,0.7)' }}>
                                  {holdForm.kind === 'reserved' ? 'Reserve this bed' : 'Take this bed out of service'}
                                </p>
                                {holdForm.kind === 'reserved' ? (
                                  <>
                                    <label htmlFor="ipd-hold-note" style={S.label}>Reserved for (name or purpose) *</label>
                                    <input id="ipd-hold-note" name="ipd-hold-note" value={holdForm.note} maxLength={120}
                                      onChange={(e) => { setHoldForm((f) => ({ ...f, note: e.target.value })); setHoldError(''); }}
                                      placeholder="e.g. Mr Rao, surgery on Friday" style={S.input(false)} />
                                    <label htmlFor="ipd-hold-until" style={{ ...S.label, marginTop: 10 }}>Keep until (optional)</label>
                                    <input id="ipd-hold-until" name="ipd-hold-until" type="date" value={holdForm.until} min={istToday()}
                                      onChange={(e) => { setHoldForm((f) => ({ ...f, until: e.target.value })); setHoldError(''); }}
                                      style={{ ...S.input(false), width: 'auto' }} />
                                    <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>After this date the bed becomes free by itself.</p>
                                  </>
                                ) : (
                                  <>
                                    <label htmlFor="ipd-hold-reason" style={S.label}>Reason *</label>
                                    <select id="ipd-hold-reason" name="ipd-hold-reason" value={holdForm.reason}
                                      onChange={(e) => { setHoldForm((f) => ({ ...f, reason: e.target.value })); setHoldError(''); }}
                                      style={{ ...S.input(false), cursor: 'pointer' }}>
                                      {OOS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                    {holdForm.reason === 'Other' && (
                                      <input id="ipd-hold-note" name="ipd-hold-note" aria-label="Reason" value={holdForm.note} maxLength={120}
                                        onChange={(e) => { setHoldForm((f) => ({ ...f, note: e.target.value })); setHoldError(''); }}
                                        placeholder="Write the reason" style={{ ...S.input(false), marginTop: 8 }} />
                                    )}
                                  </>
                                )}
                                {holdError && <p role="alert" style={S.fieldErr}>⚠ {holdError}</p>}
                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                  <button type="button" onClick={() => { setHoldForm(null); setHoldError(''); }}
                                    style={{ flex: 1, padding: '8px 0', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', background: 'transparent', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Cancel</button>
                                  <button type="button" disabled={holdBusy} onClick={() => saveHold(picked)}
                                    style={{ flex: 2, padding: '8px 0', border: 'none', background: holdBusy ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', borderRadius: 7, cursor: holdBusy ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                                    {holdBusy ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        {!picked.occupied && picked.hold && (
                          <>
                            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: HOLD_STYLE[picked.hold.kind].fg }}>
                              {picked.hold.kind === 'reserved' ? 'Reserved' : 'Out of service'}
                            </p>
                            <p style={{ margin: '0 0 2px', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{picked.hold.note}</p>
                            {picked.hold.until && <p style={{ margin: '0 0 2px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Until {picked.hold.until}</p>}
                            {holdError && <p role="alert" style={S.fieldErr}>⚠ {holdError}</p>}
                            {picked.hold.kind === 'reserved' && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <button type="button" disabled={holdBusy} onClick={() => releaseHold(ward, picked, false)}
                                  style={{ flex: 1, padding: '9px 0', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', background: 'transparent', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                                  Release
                                </button>
                                <button type="button" disabled={holdBusy} onClick={() => releaseHold(ward, picked, true)}
                                  style={{ flex: 2, padding: '9px 0', border: 'none', background: '#6AAA90', color: '#111113', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                                  Release &amp; admit a patient here
                                </button>
                              </div>
                            )}
                            {picked.hold.kind === 'out_of_service' && (isOwner ? (
                              <button type="button" disabled={holdBusy} onClick={() => releaseHold(ward, picked, false)}
                                style={{ width: '100%', marginTop: 10, padding: '9px 0', border: 'none', background: '#6AAA90', color: '#111113', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                                Put back in service
                              </button>
                            ) : (
                              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Only the principal or a doctor can put this bed back in service.</p>
                            ))}
                          </>
                        )}
                        {picked.occupied && !pickedAdm && (
                          <p style={{ margin: 0, fontSize: 12, color: '#E05A5A' }}>This bed has a patient, but the details could not be found. Refresh the screen.</p>
                        )}
                        {pickedAdm && (
                          <>
                            <p style={{ margin: '0 0 2px', fontSize: 14, color: '#fff' }}>{pickedAdm.patientName}</p>
                            <p style={{ margin: '0 0 2px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{pickedAdm.patientUid}{pickedAdm.patientGender ? ` · ${pickedAdm.patientGender}` : ''}</p>
                            <p style={{ margin: '0 0 2px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Admitted {pickedAdm.admittedOn}{pickedAdm.diagnosis ? ` · ${pickedAdm.diagnosis}` : ''}</p>
                            {estimates[pickedAdm.id] && !estimates[pickedAdm.id].rate_missing && (
                              <p style={{ margin: '0 0 2px', fontSize: 12, color: '#E8A020' }}>
                                Room charges so far · {estimates[pickedAdm.id].days} day{estimates[pickedAdm.id].days === 1 ? '' : 's'} · ₹{Number(estimates[pickedAdm.id].amount).toLocaleString('en-IN')}
                              </p>
                            )}
                            {depositBlock(pickedAdm)}
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <button type="button" onClick={() => openMove(pickedAdm)}
                                style={{ flex: 1, padding: '9px 0', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', background: 'transparent', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                                🔁 Move
                              </button>
                              <button type="button" onClick={() => { setDischargingAdm(pickedAdm); setDischargeSummary(''); setDischargeSummaryError(''); }}
                                style={{ flex: 1, padding: '9px 0', border: '1px solid rgba(232,160,32,0.3)', color: '#E8A020', background: 'rgba(232,160,32,0.06)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                                Discharge →
                              </button>
                              <button type="button" onClick={() => generateBillFor(pickedAdm)}
                                style={{ flex: 1, padding: '9px 0', border: 'none', background: '#6AAA90', color: '#111113', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                                Generate bill
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                    );
                  })}
                </>
              )
            )}

            {/* Admissions list */}
            {tab === 'admissions' && (
              admissions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <p style={{ fontSize: 32, marginBottom: 12 }}>🛏️</p>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No patients currently admitted.</p>
                </div>
              ) : (
                admissions.map((a) => (
                  <div key={a.id} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{a.patientName}</p>
                        <p style={{ margin: '3px 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{a.patientUid} · {a.patientGender}</p>
                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Bed {a.bedNo} · {a.wardName} Ward · Admitted {a.admittedOn}</p>
                      </div>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(106,170,144,0.12)', color: '#6AAA90', border: '1px solid rgba(106,170,144,0.2)', fontWeight: 500 }}>Admitted</span>
                    </div>

                    {/* Running room charges — calendar days: admission day counts,
                        discharge day does not, minimum 1 day. */}
                    {estimates[a.id] && (
                      estimates[a.id].rate_missing ? (
                        <div style={{ background: 'rgba(232,160,32,0.08)', border: '1px solid rgba(232,160,32,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#E8A020' }}>
                          ⚠ No room rate set for {a.wardName} Ward — room charges cannot be worked out. <Link to="/hospital/price-list" style={{ color: '#E8A020', fontWeight: 600 }}>Set rate →</Link>
                        </div>
                      ) : (
                        <div style={{ background: '#111113', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                          <span>Room charges so far · {estimates[a.id].days} day{estimates[a.id].days === 1 ? '' : 's'}</span>
                          <span style={{ color: '#E8A020', fontWeight: 600 }}>₹{Number(estimates[a.id].amount).toLocaleString('en-IN')}</span>
                        </div>
                      )
                    )}

                    {depositBlock(a)}

                    {vitalsOpenFor === a.id && (
                      <VitalsEntry patientId={a.patientId} contextType="ipd" contextId={a.id} onSaved={() => setVitalsOpenFor(null)} />
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setVitalsOpenFor(vitalsOpenFor === a.id ? null : a.id)}
                        style={{ flex: 1, padding: '8px 0', border: '1px solid rgba(90,154,223,0.3)', color: '#5A9ADF', background: 'rgba(90,154,223,0.06)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                        {vitalsOpenFor === a.id ? 'Close' : '🩺 Vitals'}
                      </button>
                      <button onClick={() => { setDischargingAdm(a); setDischargeSummary(''); setDischargeSummaryError(''); }}
                        style={{ flex: 1, padding: '8px 0', border: '1px solid rgba(232,160,32,0.3)', color: '#E8A020', background: 'rgba(232,160,32,0.06)', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                        Discharge →
                      </button>
                      {/* Was window.location.href — a full page reload, which
                          silently logs the user out since persistSession:false
                          means the session lives only in memory. Reported bug:
                          "generate bill kicks me out of the system." Fixed to
                          use React Router's in-app navigation instead. */}
                      <button onClick={() => generateBillFor(a)}
                        style={{ flex: 1, padding: '8px 0', border: 'none', background: '#6AAA90', color: '#111113', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                        Generate bill
                      </button>
                    </div>
                    <button onClick={() => openMove(a)}
                      style={{ width: '100%', marginTop: 8, padding: '8px 0', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', background: 'transparent', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                      🔁 Move bed / ward
                    </button>
                  </div>
                ))
              )
            )}

            {/* Admit patient */}
            {tab === 'admit' && (
              <div style={S.card}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>Admit patient · రోగిని చేర్చండి</p>

                {admitError && (
                  <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                    ⚠️ {admitError}
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <PatientSelector
                    selectedPatient={admitPatient}
                    onSelect={selectPatientForAdmission}
                    onClear={() => setAdmitPatient(null)}
                    label="Select patient to admit"
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label htmlFor="ipd-admit-ward" style={S.label}>Ward <span style={{ color: '#E05A5A' }}>*</span></label>
                  <select id="ipd-admit-ward" name="ipd-admit-ward" value={admitWardId}
                    onChange={(e) => { setAdmitWardId(e.target.value); setAdmitBedNo(''); setAdmitBedError(''); }}
                    style={{ ...S.input(false), cursor: 'pointer' }}>
                    <option value="">-- Select ward --</option>
                    {wards.filter((w) => w.available > 0).map((w) => (
                      <option key={w.id} value={w.id}>{w.ward_type} Ward{w.is_ac ? ' (AC)' : ''} — {w.available} beds available</option>
                    ))}
                  </select>
                  {wards.length === 0 ? (
                    <p style={{ fontSize: 11, color: '#E8A020', marginTop: 4 }}>
                      ⚠ No wards set up yet — <Link to="/hospital/wards" style={{ color: '#E8A020', fontWeight: 600 }}>set up a ward first →</Link>
                    </p>
                  ) : wards.filter((w) => w.available > 0).length === 0 && (
                    <p style={{ fontSize: 11, color: '#E05A5A', marginTop: 4 }}>⚠ No beds available in any ward</p>
                  )}
                </div>

                <div style={{ marginBottom: 14 }}>
                  {(() => {
                    const admitWard = wards.find((w) => w.id === admitWardId);
                    if (admitWard && admitWard.hasBedList) {
                      return (
                        <>
                          <span style={S.label}>Bed <span style={{ color: '#E05A5A' }}>*</span></span>
                          <BedPicker ward={admitWard} value={admitBedNo} occupants={occupantsOf(admitWard.id)}
                            onPick={(b) => { setAdmitBedNo(b); setAdmitBedError(''); }} />
                          {admitBedNo && <p style={{ fontSize: 12, color: '#E8A020', margin: '4px 0 0' }}>Selected: {admitBedNo}</p>}
                          {admitBedError && <p style={S.fieldErr}>⚠ {admitBedError}</p>}
                        </>
                      );
                    }
                    return (
                      <>
                        <label htmlFor="ipd-admit-bed" style={S.label}>Bed number <span style={{ color: '#E05A5A' }}>*</span></label>
                        <input id="ipd-admit-bed" name="ipd-admit-bed" value={admitBedNo}
                          onChange={(e) => { setAdmitBedNo(e.target.value); setAdmitBedError(''); }}
                          onBlur={() => {
                            if (admitBedNo && admitWardId) {
                              const err = validateBedNo(admitBedNo, admitWardId);
                              setAdmitBedError(err || '');
                            }
                          }}
                          placeholder="e.g. G-001 or Bed 3"
                          style={S.input(!!admitBedError)} />
                        {admitBedError && <p style={S.fieldErr}>⚠ {admitBedError}</p>}

                        {admitWardId && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                            {(wards.find((w) => w.id === admitWardId)?.beds || [])
                              .filter((b) => !b.occupied).slice(0, 8)
                              .map((b) => (
                                <button key={b.bedNo} onClick={() => { setAdmitBedNo(b.bedNo); setAdmitBedError(''); }}
                                  style={{ padding: '4px 10px', border: '1px solid rgba(106,170,144,0.3)', borderRadius: 6, background: 'rgba(106,170,144,0.08)', color: '#6AAA90', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                                  {b.bedNo}
                                </button>
                              ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="ipd-admit-diagnosis" style={S.label}>Initial diagnosis</label>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: -4, marginBottom: 6 }}>
                    {admitDiagnosis ? 'Pulled forward from their most recent OPD visit — edit if needed' : ''}
                  </p>
                  <input id="ipd-admit-diagnosis" name="ipd-admit-diagnosis" value={admitDiagnosis} onChange={(e) => setAdmitDiagnosis(e.target.value)}
                    placeholder="e.g. Acute fever, fracture, post-operative care"
                    style={S.input(false)} />
                </div>

                {depositMap !== null && (
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="ipd-admit-deposit" style={S.label}>Deposit to take now (₹)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8 }}>
                      <input id="ipd-admit-deposit" name="ipd-admit-deposit" inputMode="decimal" value={admitDeposit} placeholder="0 = none"
                        onChange={(e) => setAdmitDeposit(e.target.value.replace(/[^\d.]/g, ''))} style={S.input(false)} />
                      <select aria-label="Deposit paid by" value={admitDepositMode} onChange={(e) => setAdmitDepositMode(e.target.value)} style={{ ...S.input(false), cursor: 'pointer' }}>
                        <option>Cash</option><option>UPI</option><option>Card</option>
                      </select>
                    </div>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '4px 0 0' }}>
                      {admitWardId && requiredMap[admitWardId] > 0 ? `The usual deposit for this ward is ${depMoney(requiredMap[admitWardId])}. ` : ''}
                      You can change it or leave it empty (for example in an emergency) and take it later from the patient's card.
                    </p>
                  </div>
                )}

                <button onClick={admitToWard}
                  disabled={admitting || !admitPatient || !admitWardId || !admitBedNo}
                  style={{ width: '100%', padding: 13, background: admitting || !admitPatient || !admitWardId || !admitBedNo ? 'rgba(255,255,255,0.08)' : '#6AAA90', color: admitting || !admitPatient || !admitWardId || !admitBedNo ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: admitting || !admitPatient || !admitWardId || !admitBedNo ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {admitting ? 'Admitting...' : '🛏️ Admit to ward'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Discharge modal */}
      {dischargingAdm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif' }}>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Discharge — {dischargingAdm.patientName}</p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Bed {dischargingAdm.bedNo} · {dischargingAdm.wardName} · Admitted {dischargingAdm.admittedOn}</p>

            <label htmlFor="ipd-discharge-summary" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
              Discharge summary <span style={{ color: '#E05A5A' }}>*</span>
            </label>
            <textarea
              id="ipd-discharge-summary" name="ipd-discharge-summary"
              value={dischargeSummary}
              onChange={(e) => { setDischargeSummary(e.target.value); setDischargeSummaryError(''); }}
              rows={4}
              placeholder="Patient condition at discharge, medicines given, follow-up instructions... (minimum 10 characters)"
              style={{ ...S.textarea, border: `1px solid ${dischargeSummaryError ? '#E05A5A' : 'rgba(255,255,255,0.1)'}` }}
              autoFocus
            />
            {dischargeSummaryError && <p style={S.fieldErr}>⚠ {dischargeSummaryError}</p>}
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
              {dischargeSummary.length} characters · minimum 10
            </p>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => { setDischargingAdm(null); setDischargeSummary(''); setDischargeSummaryError(''); }}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={discharge} disabled={discharging || dischargeSummary.trim().length < 10}
                style={{ flex: 2, padding: 11, background: discharging || dischargeSummary.trim().length < 10 ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: discharging || dischargeSummary.trim().length < 10 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {discharging ? 'Discharging...' : 'Complete discharge →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move bed / ward modal */}
      {movingAdm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, fontFamily: 'Inter, sans-serif' }}>
            <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: '#fff' }}>Move — {movingAdm.patientName}</p>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Now in bed {movingAdm.bedNo} · {movingAdm.wardName} Ward. Room charges follow the new ward from the move date.</p>

            {moveError && (
              <div role="alert" style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#E05A5A' }}>⚠️ {moveError}</div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label htmlFor="ipd-move-ward" style={S.label}>Move to ward</label>
              <select id="ipd-move-ward" name="ipd-move-ward" value={moveWardId}
                onChange={(e) => { setMoveWardId(e.target.value); setMoveBedNo(''); setMoveError(''); }}
                style={{ ...S.input(false), cursor: 'pointer' }}>
                <option value="">-- Select ward --</option>
                {wards.filter((w) => w.available > 0).map((w) => (
                  <option key={w.id} value={w.id}>{w.ward_type} Ward{w.is_ac ? ' (AC)' : ''} — {w.available} beds available</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              {(() => {
                const moveWard = wards.find((w) => w.id === moveWardId);
                if (moveWard && moveWard.hasBedList) {
                  return (
                    <>
                      <span style={S.label}>Bed</span>
                      <BedPicker ward={moveWard} value={moveBedNo} occupants={occupantsOf(moveWard.id)}
                        onPick={(b) => { setMoveBedNo(b); setMoveError(''); }} />
                      {moveBedNo && <p style={{ fontSize: 12, color: '#E8A020', margin: '4px 0 0' }}>Selected: {moveBedNo}</p>}
                    </>
                  );
                }
                return (
                  <>
                    <label htmlFor="ipd-move-bed" style={S.label}>Bed number</label>
                    <input id="ipd-move-bed" name="ipd-move-bed" value={moveBedNo}
                      onChange={(e) => { setMoveBedNo(e.target.value); setMoveError(''); }}
                      placeholder="e.g. G-004" style={S.input(false)} />
                    {moveWardId && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {(wards.find((w) => w.id === moveWardId)?.beds || []).filter((b) => !b.occupied).slice(0, 8).map((b) => (
                          <button key={b.bedNo} onClick={() => { setMoveBedNo(b.bedNo); setMoveError(''); }}
                            style={{ padding: '4px 10px', border: '1px solid rgba(106,170,144,0.3)', borderRadius: 6, background: 'rgba(106,170,144,0.08)', color: '#6AAA90', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                            {b.bedNo}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div style={{ marginBottom: 6 }}>
              <label htmlFor="ipd-move-date" style={S.label}>Date of move</label>
              <input id="ipd-move-date" name="ipd-move-date" type="date" value={moveDate}
                min={movingAdm.admittedOn} max={istToday()}
                onChange={(e) => { setMoveDate(e.target.value); setMoveError(''); }}
                style={{ ...S.input(false), width: 'auto' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => setMovingAdm(null)}
                style={{ flex: 1, padding: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={moveBed} disabled={moving}
                style={{ flex: 2, padding: 11, background: moving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: moving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {moving ? 'Moving...' : 'Move patient →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {completedDischarge && (
        <DischargeSummaryDocument admission={completedDischarge} onClose={() => setCompletedDischarge(null)} />
      )}

      <HospitalNav />
      <BugReporter screenName="ipd_management" />
    </div>
  );
}