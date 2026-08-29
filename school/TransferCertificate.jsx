// school/TransferCertificate.jsx — FINAL (Supabase wired)
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import PrintHeader from '../shared/PrintHeader';
import BugReporter from '../shared/BugReporter';

const LEAVING_REASONS = [
  'Joining another school',
  'Moving to another city/state',
  'Joining govt residential school',
  'Family reason',
  'Completed education at this school',
  'Other',
];

const CONDUCT_OPTIONS = ['Excellent', 'Very Good', 'Good', 'Satisfactory'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  fieldErr: { fontSize: 12, color: '#E05A5A', marginTop: 4 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
};

function dobInWords(dobStr) {
  if (!dobStr) return '—';
  const date = new Date(dobStr);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function TransferCertificate() {
  const { tenant } = useTenant();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [student, setStudent] = useState(null);
  const [feeDues, setFeeDues] = useState([]);
  const [attendancePct, setAttendancePct] = useState(null);

  // TC form fields
  const [reason, setReason] = useState('');
  const [reasonOther, setReasonOther] = useState('');
  const [leavingDate, setLeavingDate] = useState('');
  const [conduct, setConduct] = useState('Good');
  const [remarks, setRemarks] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);

  const [issuedTc, setIssuedTc] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState('');

  async function searchStudents(q) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('students')
      .select('id, full_name, sid, father_name, mother_name, dob, class_id, section, admission_date, apaar_id, caste_category, classes(class_name)')
      .eq('app_id', tenant.appId)
      .eq('status', 'active')
      .or(`full_name.ilike.%${q}%,sid.ilike.%${q}%`)
      .limit(8);
    setSearchResults(data || []);
    setSearching(false);
  }

  async function selectStudent(s) {
    setStudent(s);
    setSearchResults([]);
    setSearchQuery('');
    setIssuedTc(null);
    setError('');

    // Check fee dues
    const { data: dues } = await supabase
      .from('fee_dues')
      .select('amount_due, amount_paid')
      .eq('student_id', s.id);

    const pendingDues = (dues || []).filter((d) => Number(d.amount_due) > Number(d.amount_paid));
    setFeeDues(pendingDues);

    // Get attendance percentage
    const yearStart = `${new Date().getFullYear()}-06-01`;
    const { count: total }   = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', s.id).gte('date', yearStart);
    const { count: present } = await supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('student_id', s.id).eq('status', 'P').gte('date', yearStart);
    setAttendancePct(total > 0 ? Math.round(((present || 0) / total) * 100) : null);
  }

  const hasPendingDues = feeDues.length > 0;
  const totalPending   = feeDues.reduce((s, d) => s + Number(d.amount_due) - Number(d.amount_paid), 0);
  const isBlocked      = hasPendingDues && !overrideReason.trim();

  function validate() {
    if (!reason)                           { setError('Select reason for leaving.'); return false; }
    if (reason === 'Other' && !reasonOther.trim()) { setError('Please specify the reason.'); return false; }
    if (!leavingDate)                      { setError('Select date of leaving.'); return false; }
    if (new Date(leavingDate) > new Date()) { setError('Date of leaving cannot be in the future.'); return false; }
    if (isBlocked) {
      setError(`Fee dues of ₹${totalPending.toLocaleString('en-IN')} are pending. Clear dues or provide an override reason.`);
      setShowOverride(true);
      return false;
    }
    return true;
  }

  async function issueTc() {
    setError('');
    if (!validate()) return;
    setIssuing(true);

    // Check if TC already issued for this student
    const { data: existing } = await supabase
      .from('transfer_certificates')
      .select('id, tc_no')
      .eq('student_id', student.id)
      .maybeSingle();

    if (existing) {
      setError(`TC already issued for this student — TC No: ${existing.tc_no}`);
      setIssuing(false);
      return;
    }

    // Generate TC number
    const year  = new Date().getFullYear();
    const { count } = await supabase
      .from('transfer_certificates')
      .select('id', { count: 'exact', head: true })
      .eq('app_id', tenant.appId);

    const tcNo = `TC/${year}/${String((count || 0) + 1).padStart(4, '0')}`;
    const finalReason = reason === 'Other' ? reasonOther.trim() : reason;

    const { data: tc, error: tcErr } = await supabase
      .from('transfer_certificates')
      .insert({
        app_id:          tenant.appId,
        student_id:      student.id,
        tc_no:           tcNo,
        reason_leaving:  finalReason,
        date_of_leaving: leavingDate,
        conduct,
        remarks:         remarks.trim() || null,
        override_reason: overrideReason.trim() || null,
        issued_by:       tenant.userRowId,
        issued_at:       new Date().toISOString(),
        attendance_pct:  attendancePct,
      })
      .select()
      .single();

    if (tcErr) {
      setError('Failed to issue TC. Please try again.');
      setIssuing(false);
      return;
    }

    // Update student status
    await supabase.from('students').update({ status: 'tc_issued' }).eq('id', student.id);

    setIssuedTc({
      ...tc,
      student,
      reason: finalReason,
      orgName: tenant.orgName,
      principalName: tenant.fullName,
    });
    setIssuing(false);
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print { .no-print { display: none !important; } }
      `}</style>

      <div style={S.inner}>
        <div className="no-print" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Transfer Certificate · స్థానాంతర ధృవపత్రం
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Transfer Certificate</h1>
        </div>

        {!issuedTc ? (
          <>
            {/* Student search */}
            {!student ? (
              <div style={S.card}>
                <label style={S.label}>Search student · విద్యార్థిని వెతకండి</label>
                <input
                  value={searchQuery}
                  onChange={(e) => searchStudents(e.target.value)}
                  placeholder="Name or SID..."
                  style={S.input(false)}
                  autoFocus
                />
                {searching && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>Searching...</p>}
                {searchResults.length > 0 && (
                  <div style={{ marginTop: 8, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden' }}>
                    {searchResults.map((s) => (
                      <div key={s.id} onClick={() => selectStudent(s)}
                        style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#111113' }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{s.full_name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                          {s.sid} · {s.classes?.class_name}{s.section ? `-${s.section}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Student card */}
                <div style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{student.full_name}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      {student.sid} · {student.classes?.class_name}{student.section ? `-${student.section}` : ''}
                      {student.dob ? ` · DOB: ${dobInWords(student.dob)}` : ''}
                    </p>
                    {attendancePct !== null && (
                      <p style={{ margin: '3px 0 0', fontSize: 12, color: attendancePct < 75 ? '#E05A5A' : '#6AAA90' }}>
                        Attendance: {attendancePct}%
                      </p>
                    )}
                  </div>
                  <button onClick={() => { setStudent(null); setFeeDues([]); setError(''); setIssuedTc(null); }}
                    style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
                    Change
                  </button>
                </div>

                {/* Fee dues warning */}
                {hasPendingDues && (
                  <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#E05A5A', fontWeight: 500 }}>
                      ⚠️ Fee dues pending — ₹{totalPending.toLocaleString('en-IN')}
                    </p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      TC is blocked until dues are cleared. Provide override reason if exception needed.
                    </p>
                  </div>
                )}

                {/* TC form */}
                <div style={S.card}>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16 }}>TC details</p>

                  <div style={S.row2}>
                    <div>
                      <label style={S.label}>Reason for leaving *</label>
                      <select value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }}
                        style={{ ...S.input(!!error && !reason), cursor: 'pointer' }}>
                        <option value="">-- Select --</option>
                        {LEAVING_REASONS.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Date of leaving *</label>
                      <input type="date" value={leavingDate}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => { setLeavingDate(e.target.value); setError(''); }}
                        style={S.input(!!error && !leavingDate)} />
                    </div>
                  </div>

                  {reason === 'Other' && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={S.label}>Specify reason *</label>
                      <input value={reasonOther} onChange={(e) => setReasonOther(e.target.value)}
                        placeholder="Please specify" style={S.input(false)} />
                    </div>
                  )}

                  <div style={S.row2}>
                    <div>
                      <label style={S.label}>Conduct</label>
                      <select value={conduct} onChange={(e) => setConduct(e.target.value)}
                        style={{ ...S.input(false), cursor: 'pointer' }}>
                        {CONDUCT_OPTIONS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Remarks (optional)</label>
                      <input value={remarks} onChange={(e) => setRemarks(e.target.value)}
                        placeholder="Any additional remarks" style={S.input(false)} />
                    </div>
                  </div>

                  {(showOverride || hasPendingDues) && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={S.label}>Override reason (required to issue TC with pending dues) *</label>
                      <input value={overrideReason} onChange={(e) => { setOverrideReason(e.target.value); setError(''); }}
                        placeholder="e.g. Parent request, fees to be collected separately"
                        style={S.input(hasPendingDues && !overrideReason.trim())} />
                    </div>
                  )}

                  {error && (
                    <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                      ⚠️ {error}
                    </div>
                  )}

                  <button onClick={issueTc} disabled={issuing}
                    style={{ width: '100%', padding: 13, background: issuing ? 'rgba(255,255,255,0.08)' : '#E8A020', color: issuing ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: issuing ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {issuing ? 'Issuing TC...' : '📄 Issue Transfer Certificate'}
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          /* TC Preview — printable */
          <div>
            <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button onClick={() => window.print()}
                style={{ flex: 1, padding: 12, background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>
                🖨️ Print TC
              </button>
              <button onClick={() => { setIssuedTc(null); setStudent(null); setReason(''); setLeavingDate(''); setOverrideReason(''); setError(''); }}
                style={{ flex: 1, padding: 12, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
                Issue another TC
              </button>
            </div>

            {/* TC Document */}
            <div style={{ background: '#fff', color: '#000', padding: '28px 32px', borderRadius: 8, fontFamily: 'serif' }}>
              {/* Shared header — replaces a hand-rolled header that
                  duplicated PrintHeader's @page rule and page-number
                  CSS, and lacked the address/phone/GSTIN details
                  PrintHeader now includes. */}
              <PrintHeader documentTitle="Transfer Certificate" />

              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <p style={{ fontSize: 12, color: '#555', margin: 0 }}>Recognised by Govt. of Andhra Pradesh</p>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 0', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Transfer Certificate
                </h3>
                <p style={{ fontSize: 12, margin: '4px 0 0', color: '#555' }}>స్థానాంతర ధృవపత్రం</p>
              </div>

              {/* TC Number and Date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 12 }}>
                <span><strong>TC No:</strong> {issuedTc.tc_no}</span>
                <span><strong>Date:</strong> {new Date(issuedTc.issued_at).toLocaleDateString('en-IN')}</span>
              </div>

              {/* Student details */}
              {[
                ['Name of student', issuedTc.student.full_name],
                ["Father's name", issuedTc.student.father_name || '—'],
                ["Mother's name", issuedTc.student.mother_name || '—'],
                ['Date of birth', dobInWords(issuedTc.student.dob)],
                ['Nationality', 'Indian'],
                ['Caste category', issuedTc.student.caste_category || '—'],
                ['APAAR ID', issuedTc.student.apaar_id || 'Not generated'],
                ['Date of admission', dobInWords(issuedTc.student.admission_date)],
                ['Class studying', `${issuedTc.student.classes?.class_name}${issuedTc.student.section ? `-${issuedTc.student.section}` : ''}`],
                ['Date of leaving', dobInWords(issuedTc.date_of_leaving)],
                ['Reason for leaving', issuedTc.reason],
                ['Conduct', issuedTc.conduct],
                ['Attendance percentage', issuedTc.attendance_pct !== null ? `${issuedTc.attendance_pct}%` : '—'],
                ['Remarks', issuedTc.remarks || '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', borderBottom: '1px dashed #ccc', padding: '6px 0', fontSize: 12 }}>
                  <span style={{ width: '45%', color: '#555' }}>{label}</span>
                  <span style={{ fontWeight: 500 }}>{value}</span>
                </div>
              ))}

              {/* Signature */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, fontSize: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderTop: '1px solid #000', paddingTop: 6, width: 140 }}>Class Teacher</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderTop: '1px solid #000', paddingTop: 6, width: 160 }}>
                    Principal / Headmaster<br />
                    <span style={{ fontSize: 12, color: '#555' }}>{issuedTc.orgName}</span>
                  </div>
                </div>
              </div>

              {/* Audit stamp */}
              <div style={{ marginTop: 20, padding: '8px 12px', background: '#f5f5f5', borderRadius: 4, fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
                TC No: {issuedTc.tc_no} · Issued: {new Date(issuedTc.issued_at).toLocaleString('en-IN')} · By: {issuedTc.principalName} · MPower
              </div>
            </div>
          </div>
        )}
      </div>

      <SchoolNav />
      <BugReporter screenName="transfer_certificate" />
    </div>
  );
}