// shared/DemoPack.jsx — REBUILT
// Was previously a non-functional mockup: "Download PDF" was a fake
// 800ms spinner with no actual output, and the page list included
// "Multi-branch comparison dashboard" — a feature confirmed not built
// for either School or Hospital. Both fixed: PDF generation now uses
// the same window.print() pattern every other document in this app
// already uses (Certificates, TC, invoices), and the unbuilt feature
// claim is removed rather than shown with a "SAMPLE DATA" watermark
// that would imply it's real, just using demo numbers.
import React from 'react';

const SCHOOL_DEMO_DATA = {
  schoolName: 'Sri Vidya Educational Trust',
  branches: [{ name: 'Machilipatnam (main)', students: 200 }, { name: 'Pedana', students: 86 }],
  totalStudents: 286,
};

const HOSPITAL_DEMO_DATA = {
  hospitalName: 'City Care Hospital Group',
  branches: [{ name: 'Rajahmundry (main)', patientsToday: 22, revenueToday: 19500 }, { name: 'Kakinada', patientsToday: 12, revenueToday: 9000 }],
};

// "Multi-branch comparison dashboard" removed from both lists — not
// built for either module. Every remaining page below has real,
// working mockup content rendered further down.
const PAGES = {
  school: ['School summary dashboard', 'Daily attendance — class-wise', 'Monthly attendance summary', 'Exam results — class rank list', 'Student report card', 'Fee collection summary', 'Transfer certificate (sample)', 'Welfare scheme beneficiary list (Talliki Vandanam)', 'Bulk marks entry grid', 'WhatsApp delivery example'],
  hospital: ['Hospital summary dashboard', 'OPD patient count by doctor', 'Bed occupancy report', 'Sample prescription', 'Sample lab report', 'Daily revenue summary', 'GST invoice (sample)', 'ABHA-linked health record (sample)', 'Discharge summary (sample)'],
};

const boxStyle = { border: '1px solid #ddd', borderRadius: 6, padding: 16, marginTop: 12 };
const rowStyle = { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee', fontSize: 12 };
const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #333', fontSize: 11 };
const td = { padding: '5px 8px', borderBottom: '1px solid #ddd', fontSize: 11 };

function Watermark() {
  return <p style={{ fontSize: 10, color: '#999', textAlign: 'center', margin: '0 0 10px', letterSpacing: 1 }}>— SAMPLE DATA —</p>;
}

function PrintPage({ title, orgName, children }) {
  return (
    <div style={{ pageBreakAfter: 'always', padding: '24px 28px', fontFamily: 'sans-serif', color: '#000' }}>
      <div style={{ borderBottom: '2px solid #185FA5', paddingBottom: 8, marginBottom: 12 }}>
        <p style={{ fontSize: 10, color: '#666', margin: 0 }}>{orgName}</p>
        <h3 style={{ fontSize: 15, margin: '2px 0 0' }}>{title}</h3>
      </div>
      <Watermark />
      {children}
    </div>
  );
}

// One real mockup per page, built from actual field names/terminology
// used elsewhere in this app — not generic filler.
function schoolPageContent(page, data) {
  switch (page) {
    case 'School summary dashboard':
      return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[['Total students', data.totalStudents], ['Attendance today', '94%'], ['Fee collected (month)', '₹4,85,000']].map(([l, v]) => (
          <div key={l} style={boxStyle}><p style={{ fontSize: 10, color: '#666', margin: 0 }}>{l}</p><p style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>{v}</p></div>
        ))}
      </div>;
    case 'Daily attendance — class-wise':
      return <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Class</th><th style={th}>Present</th><th style={th}>Absent</th><th style={th}>%</th></tr></thead>
        <tbody>{['Class 8-A', 'Class 8-B', 'Class 9-A'].map((c, i) => <tr key={c}><td style={td}>{c}</td><td style={td}>{32 - i}</td><td style={td}>{i + 1}</td><td style={td}>{Math.round(((32 - i) / 33) * 100)}%</td></tr>)}</tbody></table>;
    case 'Monthly attendance summary':
      return <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Class</th><th style={th}>Working days</th><th style={th}>Avg attendance</th></tr></thead>
        <tbody>{['Class 8-A', 'Class 9-A', 'Class 10-A'].map((c) => <tr key={c}><td style={td}>{c}</td><td style={td}>22</td><td style={td}>91%</td></tr>)}</tbody></table>;
    case 'Exam results — class rank list':
      return <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Rank</th><th style={th}>Student</th><th style={th}>Total</th><th style={th}>%</th></tr></thead>
        <tbody>{[['1', 'Aarav Reddy', '478/500', '95.6%'], ['2', 'Divya Sharma', '465/500', '93%'], ['3', 'Kiran Kumar', '452/500', '90.4%']].map((r) => <tr key={r[1]}>{r.map((c, i) => <td key={i} style={td}>{c}</td>)}</tr>)}</tbody></table>;
    case 'Student report card':
      return <div style={boxStyle}>
        <p style={{ fontSize: 12, margin: 0 }}><strong>Name:</strong> Aarav Reddy &nbsp; <strong>Class:</strong> 8-A &nbsp; <strong>Attendance:</strong> 94%</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}><thead><tr><th style={th}>Subject</th><th style={th}>Marks</th><th style={th}>Grade</th></tr></thead>
          <tbody>{[['Mathematics', '90/100', 'A2'], ['Science', '85/100', 'A2'], ['Telugu', '88/100', 'A2']].map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} style={td}>{c}</td>)}</tr>)}</tbody></table>
      </div>;
    case 'Fee collection summary':
      return <div style={boxStyle}>{[['Total due', '₹7,50,000'], ['Collected', '₹6,15,000'], ['Outstanding', '₹1,35,000'], ['Collection %', '82%']].map(([l, v]) => <div key={l} style={rowStyle}><span>{l}</span><strong>{v}</strong></div>)}</div>;
    case 'Transfer certificate (sample)':
      return <div style={boxStyle}><p style={{ fontSize: 12, lineHeight: 1.8 }}>This is to certify that <strong>Aarav Reddy</strong>, admission no. 0231, was a student of this school from June 2021 to March 2026, studying up to Class 8. Conduct: <strong>Good</strong>.</p></div>;
    case 'Welfare scheme beneficiary list (Talliki Vandanam)':
      return <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Student</th><th style={th}>Class</th><th style={th}>Attendance</th><th style={th}>Status</th></tr></thead>
        <tbody>{[['Aarav Reddy', '8-A', '96%', 'Eligible'], ['Divya Sharma', '6-B', '78%', 'At risk — below 75%']].map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} style={td}>{c}</td>)}</tr>)}</tbody></table>;
    case 'Bulk marks entry grid':
      return <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Student</th><th style={th}>Theory</th><th style={th}>Internal</th><th style={th}>Total</th></tr></thead>
        <tbody>{[['Aarav Reddy', '68', '22', '90'], ['Divya Sharma', '55', '18', '73']].map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} style={td}>{c}</td>)}</tr>)}</tbody></table>;
    case 'WhatsApp delivery example':
      return <div style={{ ...boxStyle, background: '#DCF8C6', maxWidth: 320 }}><p style={{ fontSize: 12, margin: 0 }}>📚 <strong>Attendance Alert</strong><br />Aarav Reddy was marked absent today (2 Sep). Reply if this is unexpected.<br /><span style={{ fontSize: 10, color: '#666' }}>Sent via {data.schoolName}</span></p></div>;
    default:
      return null;
  }
}

function hospitalPageContent(page, data) {
  switch (page) {
    case 'Hospital summary dashboard':
      return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[['OPD today', '34'], ['Admissions today', '3'], ['Revenue today', '₹42,000']].map(([l, v]) => (
          <div key={l} style={boxStyle}><p style={{ fontSize: 10, color: '#666', margin: 0 }}>{l}</p><p style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 0' }}>{v}</p></div>
        ))}
      </div>;
    case 'OPD patient count by doctor':
      return <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Doctor</th><th style={th}>Patients seen</th><th style={th}>No-shows</th></tr></thead>
        <tbody>{[['Dr. Sharma', '18', '2'], ['Dr. Reddy', '16', '1']].map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} style={td}>{c}</td>)}</tr>)}</tbody></table>;
    case 'Bed occupancy report':
      return <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Ward</th><th style={th}>Total beds</th><th style={th}>Occupied</th><th style={th}>Available</th></tr></thead>
        <tbody>{[['General', '10', '7', '3'], ['ICU', '4', '3', '1']].map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} style={td}>{c}</td>)}</tr>)}</tbody></table>;
    case 'Sample prescription':
      return <div style={boxStyle}><p style={{ fontSize: 12, margin: 0 }}><strong>Patient:</strong> Sample Patient · UID PT-000001</p><p style={{ fontSize: 12 }}><strong>Diagnosis:</strong> Viral fever</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}><thead><tr><th style={th}>Medicine</th><th style={th}>Dosage</th><th style={th}>Duration</th></tr></thead>
          <tbody><tr><td style={td}>Paracetamol 500mg</td><td style={td}>1-0-1</td><td style={td}>5 days</td></tr></tbody></table></div>;
    case 'Sample lab report':
      return <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Test</th><th style={th}>Result</th><th style={th}>Normal range</th></tr></thead>
        <tbody><tr><td style={td}>Hemoglobin</td><td style={td}>13.2 g/dL</td><td style={td}>13–17 g/dL</td></tr></tbody></table>;
    case 'Daily revenue summary':
      return <div style={boxStyle}>{[['Cash', '₹15,000'], ['UPI', '₹12,000'], ['Card', '₹8,000'], ['Aarogyasri', '₹7,000']].map(([l, v]) => <div key={l} style={rowStyle}><span>{l}</span><strong>{v}</strong></div>)}</div>;
    case 'GST invoice (sample)':
      return <div style={boxStyle}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Item</th><th style={th}>Amount</th></tr></thead>
        <tbody><tr><td style={td}>Consultation Fee</td><td style={td}>₹500</td></tr><tr><td style={td}>CBC Test</td><td style={td}>₹350</td></tr><tr><td style={td}><strong>Total</strong></td><td style={td}><strong>₹850</strong></td></tr></tbody></table></div>;
    case 'ABHA-linked health record (sample)':
      return <div style={boxStyle}><p style={{ fontSize: 12, margin: 0 }}><strong>ABHA ID:</strong> 91-2345-6789-0123 ✓ Linked<br /><strong>Blood group:</strong> O+ &nbsp; <strong>Allergies:</strong> Penicillin</p></div>;
    case 'Discharge summary (sample)':
      return <div style={boxStyle}><p style={{ fontSize: 12, lineHeight: 1.8 }}><strong>Admitted:</strong> 28 Aug 2026 &nbsp; <strong>Discharged:</strong> 1 Sep 2026<br />Patient admitted with viral fever, treated with IV fluids and antipyretics. Discharged in stable condition with advice for follow-up in 5 days.</p></div>;
    default:
      return null;
  }
}

export default function DemoPack({ appType = 'school' }) {
  const data = appType === 'school' ? SCHOOL_DEMO_DATA : HOSPITAL_DEMO_DATA;
  const pages = PAGES[appType];
  const orgName = appType === 'school' ? data.schoolName : data.hospitalName;

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-pack { display: block !important; }
        }
      `}</style>

      <div className="no-print" style={{ maxWidth: 680, margin: '0 auto', fontFamily: 'sans-serif', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Demo Report Pack — {appType === 'school' ? 'School' : 'Hospital'}</h2>
          <button onClick={() => window.print()} style={{ padding: '8px 16px', fontSize: 12, border: 'none', borderRadius: 6, background: '#185FA5', color: '#fff', cursor: 'pointer' }}>
            🖨️ Print / Save as PDF
          </button>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #0D1B2A, #185FA5)', borderRadius: 10, padding: 24, textAlign: 'center', color: '#fff', marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>SAMPLE DEMONSTRATION REPORT</p>
          <p style={{ fontSize: 20, fontWeight: 600, margin: '6px 0 4px' }}>{orgName}</p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{data.branches.length} branches · {appType === 'school' ? `${data.totalStudents} students` : 'Multi-location'}</p>
        </div>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 8 }}>Contents — {pages.length} sample pages</p>
          {pages.map((p, i) => (
            <div key={p} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px dashed #eee', fontSize: 13 }}>
              <span style={{ color: '#888', width: 24 }}>{i + 1}.</span>
              <span>{p}</span>
            </div>
          ))}
        </div>
        <div style={{ background: '#FAEEDA', borderRadius: 8, padding: 10, fontSize: 12, color: '#633806' }}>
          This pack uses dummy data only and is clearly watermarked "SAMPLE DATA" on every page.
        </div>
      </div>

      {/* Print-only content — hidden on screen, only shown via window.print() */}
      <div className="print-pack" style={{ display: 'none' }}>
        {pages.map((p) => (
          <PrintPage key={p} title={p} orgName={orgName}>
            {appType === 'school' ? schoolPageContent(p, data) : hospitalPageContent(p, data)}
          </PrintPage>
        ))}
      </div>
    </div>
  );
}
