// school/Certificates.jsx — FINAL (Supabase wired)
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

const CERT_TYPES = [
  { code: 'bonafide',  label: 'Bonafide Certificate',  labelTe: 'నిజమైన ధృవపత్రం' },
  { code: 'study',     label: 'Study Certificate',      labelTe: 'అధ్యయన ధృవపత్రం' },
  { code: 'character', label: 'Character Certificate',  labelTe: 'ప్రవర్తన ధృవపత్రం' },
  { code: 'conduct',   label: 'Conduct Certificate',    labelTe: 'నడవడిక ధృవపత్రం' },
];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 12 },
  input: (err) => ({ width: '100%', padding: '10px 14px', background: '#111113', border: `1px solid ${err ? '#E05A5A' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }),
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
};

function certBody(type, student, orgName) {
  const name    = student.full_name;
  const cls     = student.classes?.class_name || '—';
  const section = student.section || '';
  const dob     = student.dob ? new Date(student.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const year    = new Date().getFullYear();

  switch (type) {
    case 'bonafide':
      return `This is to certify that ${name}, Date of Birth ${dob}, is a bonafide student of this school and is studying in Class ${cls}${section ? `-${section}` : ''} during the academic year ${year}–${year + 1}.`;
    case 'study':
      return `This is to certify that ${name} has studied in ${orgName} from the academic year ${year - 1}–${year} and is currently studying in Class ${cls}${section ? `-${section}` : ''} during the academic year ${year}–${year + 1}.`;
    case 'character':
      return `This is to certify that ${name}, a student of Class ${cls}${section ? `-${section}` : ''}, bears a good moral character to the best of our knowledge during their time at this institution.`;
    case 'conduct':
      return `This is to certify that the conduct of ${name}, studying in Class ${cls}${section ? `-${section}` : ''}, has been Good during the academic year ${year}–${year + 1}.`;
    default:
      return '';
  }
}

export default function Certificates() {
  const { tenant } = useTenant();
  const [certType, setCertType]         = useState('bonafide');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);
  const [student, setStudent]           = useState(null);
  const [issuing, setIssuing]           = useState(false);
  const [issuedCert, setIssuedCert]     = useState(null);
  const [error, setError]               = useState('');

  async function searchStudents(q) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('students')
      .select('id, full_name, sid, dob, section, father_name, classes(class_name)')
      .eq('app_id', tenant.appId)
      .eq('status', 'active')
      .or(`full_name.ilike.%${q}%,sid.ilike.%${q}%`)
      .limit(8);
    setSearchResults(data || []);
    setSearching(false);
  }

  function selectStudent(s) {
    setStudent(s);
    setSearchResults([]);
    setSearchQuery('');
    setIssuedCert(null);
    setError('');
  }

  async function issueCertificate() {
    setError('');
    if (!student) { setError('Select a student first.'); return; }
    setIssuing(true);

    // Generate certificate number
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('certificates')
      .select('id', { count: 'exact', head: true })
      .eq('app_id', tenant.appId)
      .eq('cert_type', certType);

    const certNo = `${certType.toUpperCase().slice(0, 3)}/${year}/${String((count || 0) + 1).padStart(4, '0')}`;

    const { data: cert, error: certErr } = await supabase
      .from('certificates')
      .insert({
        app_id:      tenant.appId,
        student_id:  student.id,
        cert_type:   certType,
        cert_no:     certNo,
        issued_by:   tenant.userRowId,
        issued_at:   new Date().toISOString(),
        body_text:   certBody(certType, student, tenant.orgName),
      })
      .select()
      .single();

    if (certErr) {
      setError('Failed to issue certificate. Please try again.');
      setIssuing(false);
      return;
    }

    setIssuedCert({
      ...cert,
      student,
      certTypeLabel: CERT_TYPES.find((c) => c.code === certType)?.label,
      orgName: tenant.orgName,
      principalName: tenant.fullName,
    });
    setIssuing(false);
  }

  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @media print { .no-print { display: none !important; } @page { size: A4 portrait; margin: 15mm 18mm; } }
      `}</style>

      <div style={S.inner}>
        <div className="no-print" style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Certificates · సర్టిఫికెట్లు
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Issue Certificate</h1>
        </div>

        {!issuedCert ? (
          <>
            {/* Certificate type */}
            <div style={S.card}>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 14 }}>Certificate type</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {CERT_TYPES.map((ct) => (
                  <button key={ct.code} onClick={() => setCertType(ct.code)}
                    style={{ padding: '12px 10px', borderRadius: 8, border: `1px solid ${certType === ct.code ? 'rgba(232,160,32,0.4)' : 'rgba(255,255,255,0.08)'}`, background: certType === ct.code ? 'rgba(232,160,32,0.08)' : '#111113', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: certType === ct.code ? 600 : 400, color: certType === ct.code ? '#E8A020' : '#fff' }}>{ct.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{ct.labelTe}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Student search */}
            {!student ? (
              <div style={S.card}>
                <label style={S.label}>Search student</label>
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
              <div style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{student.full_name}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    {student.sid} · {student.classes?.class_name}{student.section ? `-${student.section}` : ''}
                  </p>
                </div>
                <button onClick={() => { setStudent(null); setError(''); }}
                  style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
                  Change
                </button>
              </div>
            )}

            {/* Preview */}
            {student && (
              <div style={{ ...S.card, background: '#111113' }}>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>Preview</p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.8 }}>
                  {certBody(certType, student, tenant?.orgName || 'This School')}
                </p>
              </div>
            )}

            {error && (
              <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#E05A5A' }}>
                ⚠️ {error}
              </div>
            )}

            <button onClick={issueCertificate}
              disabled={issuing || !student}
              style={{ width: '100%', padding: 13, background: issuing || !student ? 'rgba(255,255,255,0.08)' : '#E8A020', color: issuing || !student ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: issuing || !student ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {issuing ? 'Issuing...' : '🎓 Issue Certificate'}
            </button>
          </>
        ) : (
          /* Certificate document */
          <div>
            <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button onClick={() => window.print()}
                style={{ flex: 1, padding: 12, background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>
                🖨️ Print Certificate
              </button>
              <button onClick={() => { setIssuedCert(null); setStudent(null); setError(''); }}
                style={{ flex: 1, padding: 12, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}>
                Issue another
              </button>
            </div>

            <div style={{ background: '#fff', color: '#000', padding: '32px 40px', borderRadius: 8, fontFamily: 'serif' }}>
              <div style={{ textAlign: 'center', marginBottom: 24, borderBottom: '2px solid #000', paddingBottom: 16 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>{issuedCert.orgName}</h2>
                <p style={{ fontSize: 12, color: '#555', margin: 0 }}>Recognised by Govt. of Andhra Pradesh</p>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '14px 0 0', textTransform: 'uppercase', letterSpacing: 2 }}>
                  {issuedCert.certTypeLabel}
                </h3>
              </div>

              <p style={{ fontSize: 14, lineHeight: 2, textAlign: 'justify', marginBottom: 40 }}>
                {issuedCert.body_text}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 40 }}>
                <span>Cert No: <strong>{issuedCert.cert_no}</strong></span>
                <span>Date: <strong>{new Date(issuedCert.issued_at).toLocaleDateString('en-IN')}</strong></span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderTop: '1px solid #000', paddingTop: 8, width: 180 }}>
                    Principal / Headmaster<br />
                    <span style={{ fontSize: 12, color: '#555' }}>{issuedCert.orgName}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, padding: '6px 10px', background: '#f5f5f5', borderRadius: 4, fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
                Cert No: {issuedCert.cert_no} · Issued: {new Date(issuedCert.issued_at).toLocaleString('en-IN')} · MPower
              </div>
            </div>
          </div>
        )}
      </div>

      <SchoolNav />
      <BugReporter screenName="certificates" />
    </div>
  );
}