// shared/DemoPack.jsx
import React, { useState } from 'react';

const SCHOOL_DEMO_DATA = {
  schoolName: 'Sri Vidya Educational Trust',
  branches: [{ name: 'Machilipatnam (main)', students: 200 }, { name: 'Pedana', students: 86 }],
  totalStudents: 286,
};

const HOSPITAL_DEMO_DATA = {
  hospitalName: 'City Care Hospital Group',
  branches: [{ name: 'Rajahmundry (main)', patientsToday: 22, revenueToday: 19500 }, { name: 'Kakinada', patientsToday: 12, revenueToday: 9000 }],
};

const PAGES = {
  school: ['School summary dashboard', 'Daily attendance — class-wise', 'Monthly attendance summary', 'Multi-branch comparison dashboard', 'Exam results — class rank list', 'Student report card (English)', 'Student report card (Telugu)', 'Fee collection summary', 'Transfer certificate (sample)', 'Welfare scheme beneficiary list (Talliki Vandanam)', 'Bulk marks entry grid (screenshot)', 'Emergency attendance sheet (sample)', 'WhatsApp delivery example'],
  hospital: ['Hospital summary dashboard', 'Multi-branch comparison dashboard', 'OPD patient count by doctor', 'Bed occupancy report', 'Sample prescription', 'Sample lab report', 'Daily revenue summary', 'GST invoice (sample)', 'ABHA-linked health record (sample)', 'Discharge summary (sample)'],
};

export default function DemoPack({ appType = 'school' }) {
  const [generating, setGenerating] = useState(false);
  const data = appType === 'school' ? SCHOOL_DEMO_DATA : HOSPITAL_DEMO_DATA;
  const pages = PAGES[appType];
  const orgName = appType === 'school' ? data.schoolName : data.hospitalName;

  function generatePdf() {
    setGenerating(true);
    setTimeout(() => setGenerating(false), 800);
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', fontFamily: 'sans-serif', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Demo Report Pack — {appType === 'school' ? 'School' : 'Hospital'}</h2>
        <button onClick={generatePdf} disabled={generating} style={{ padding: '8px 16px', fontSize: 12, border: 'none', borderRadius: 6, background: '#185FA5', color: '#fff', cursor: generating ? 'not-allowed' : 'pointer' }}>
          {generating ? 'Generating...' : 'Download PDF'}
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
  );
}