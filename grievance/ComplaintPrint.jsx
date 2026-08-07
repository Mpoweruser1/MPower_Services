// grievance/ComplaintPrint.jsx
// Handles all CTS print scenarios:
// 1. Citizen representation letter to MLA/MP
// 2. Staff — single complaint print for official reference
// 3. Staff — batch complaint list for minister/collector submission
import { useSearchParams, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import GrievanceNav from './GrievanceNav';

// ─── Shared print styles ───────────────────────────────────

const PRINT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;600;700&family=Times+New+Roman&display=swap');
  
  @media print {
    body { margin: 0; padding: 0; background: #fff !important; color: #000 !important; }
    .no-print { display: none !important; }
    @page { size: A4 portrait; margin: 12mm 15mm; }
    .print-page { 
      page-break-after: always; 
      padding: 0;
      font-family: 'Times New Roman', serif;
    }
    .print-page:last-child { page-break-after: avoid; }
  }
  
  @media screen {
    .print-page {
      max-width: 210mm;
      margin: 0 auto 32px;
      padding: 40px 48px;
      background: #fff;
      color: #000;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: 'Times New Roman', serif;
    }
  }
  
  .print-page h1 { font-size: 16pt; text-align: center; margin: 0 0 4px; }
  .print-page h2 { font-size: 14pt; text-align: center; margin: 0 0 16px; }
  .print-page p  { font-size: 12pt; line-height: 1.8; margin: 0 0 10px; }
  .print-page table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .print-page th { background: #f0f0f0; padding: 6px 10px; border: 1px solid #999; text-align: left; font-size: 10pt; }
  .print-page td { padding: 6px 10px; border: 1px solid #ccc; vertical-align: top; font-size: 10pt; }
  .print-page .telugu { font-family: 'Noto Sans Telugu', sans-serif; }
  .print-page .underline { border-bottom: 1px solid #000; display: inline-block; min-width: 200px; }
  .letterhead-box { border: 2px solid #000; padding: 12px 16px; margin-bottom: 20px; }
  .stamp-box { border: 1px dashed #666; padding: 10px; margin-top: 20px; font-size: 10pt; color: #444; }
  .signature-line { display: flex; justify-content: space-between; margin-top: 40px; }
`;

// ─── Helpers ───────────────────────────────────────────────
function todayFormatted(lang = 'en') {
  return new Date().toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function stageLabel(stage) {
  const map = {
    submitted: 'Submitted / సమర్పించబడింది',
    under_review: 'Under Review / పరిశీలనలో ఉంది',
    forwarded: 'Forwarded / సంబంధిత శాఖకు పంపబడింది',
    resolved: 'Resolved / పరిష్కరించబడింది',
    closed: 'Closed / మూసివేయబడింది',
  };
  return map[stage] || stage;
}

function categoryLabel(cat) {
  const map = {
    roads: 'Roads & Infrastructure / రోడ్లు',
    water: 'Water Supply / మంచినీరు',
    electricity: 'Electricity / విద్యుత్',
    drainage: 'Drainage & Sanitation / మురుగు',
    health: 'Health / ఆరోగ్యం',
    education: 'Education / విద్య',
    pensions: 'Pensions & Welfare / పింఛన్లు',
    ration: 'Ration / రేషన్',
    land: 'Land & Revenue / భూమి',
    other: 'Other / ఇతర',
  };
  return map[cat] || cat;
}

// Masks all but the last 4 digits — standard practice for a printed
// document that may pass through several hands (staff, officials)
// before reaching the citizen's own representative.
function maskPhone(phone) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return 'X'.repeat(digits.length - 4) + digits.slice(-4);
}

// ═══════════════════════════════════════════════════════════
// PRINT TYPE 1 — Citizen Representation Letter to MLA / MP
// ═══════════════════════════════════════════════════════════
function CitizenRepresentationLetter({ complaint, mlaName, constituency }) {
  return (
    <div className="print-page">

      {/* Official letterhead top */}
      <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px double #000', paddingBottom: 14 }}>
        <p style={{ margin: 0, fontSize: '11pt', fontWeight: 'bold', letterSpacing: 1 }}>
          GRIEVANCE REPRESENTATION / ఫిర్యాదు విజ్ఞాపన పత్రం
        </p>
        <p style={{ margin: '4px 0 0', fontSize: '10pt', color: '#333' }}>
          Submitted through MPower Grievance Tracking System · Case No: <strong>{complaint.case_no}</strong>
        </p>
      </div>

      {/* Addressee */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: 0, fontWeight: 'bold' }}>To,</p>
        <p style={{ margin: '4px 0 0' }}>
          The Honourable {complaint.addressee_type === 'mp' ? 'Member of Parliament' : 'Member of Legislative Assembly'},
        </p>
        <p style={{ margin: 0, fontWeight: 'bold' }}>
          Sri/Smt. {mlaName || '________________________'},
        </p>
        <p style={{ margin: 0 }}>
          {complaint.addressee_type === 'mp' ? 'Parliament Constituency' : 'Legislative Assembly Constituency'} — {constituency || complaint.constituencies?.name || '________________________'}
        </p>
      </div>

      {/* Subject line */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: 0 }}>
          <strong>Sub:</strong> Representation regarding <strong>{categoryLabel(complaint.category)}</strong> — {complaint.title}
        </p>
        <p style={{ margin: '4px 0 0' }}>
          <strong>Ref:</strong> Grievance Case No. <strong>{complaint.case_no}</strong> dated {new Date(complaint.created_at).toLocaleDateString('en-IN')}
        </p>
      </div>

      {/* Salutation */}
      <p>Respected Sir/Madam,</p>

      {/* Body */}
      <p style={{ textIndent: '2em' }}>
        I, <strong>{complaint.citizens?.full_name || 'the undersigned'}</strong>, 
        {complaint.villages?.name ? ` resident of ${complaint.villages.name}, ` : ' '}
        {complaint.mandals?.name ? `${complaint.mandals.name} Mandal, ` : ''}
        humbly submit this representation to bring to your kind attention the following grievance pertaining to our area.
      </p>

      {/* Problem statement box */}
      <div style={{ border: '1px solid #000', padding: '12px 16px', margin: '16px 0', background: '#fafafa' }}>
        <p style={{ margin: '0 0 8px', fontWeight: 'bold', fontSize: '11pt' }}>
          Nature of Grievance / ఫిర్యాదు వివరాలు:
        </p>
        <p style={{ margin: '0 0 10px', lineHeight: 2 }}>{complaint.description}</p>
        <p style={{ margin: 0, fontSize: '10pt', color: '#444' }}>
          Category: {categoryLabel(complaint.category)} &nbsp;·&nbsp;
          Priority: {complaint.priority || 'Normal'} &nbsp;·&nbsp;
          Location: {[complaint.villages?.name, complaint.mandals?.name].filter(Boolean).join(', ') || 'Not specified'}
        </p>
      </div>

      {/* Current status */}
      <p>
        This grievance was filed on <strong>{new Date(complaint.created_at).toLocaleDateString('en-IN')}</strong> and 
        the current status is <strong>{stageLabel(complaint.stage)}</strong>.
        {complaint.stage === 'submitted' || complaint.stage === 'under_review'
          ? ' The matter is yet to be resolved and requires your kind intervention.'
          : ' We request your continued support for final resolution.'}
      </p>

      {/* What citizen wants */}
      <p style={{ textIndent: '2em' }}>
        I, therefore, most respectfully request your goodself to kindly look into this matter and 
        direct the concerned authorities to take immediate action for the resolution of the above grievance. 
        Your kind intervention in this regard will be highly appreciated.
      </p>

      {/* Telugu version of the request */}
      <div className="telugu" style={{ background: '#f9f9f9', border: '1px solid #ddd', padding: '10px 14px', margin: '16px 0', fontSize: '11pt', lineHeight: 2 }}>
        <p style={{ margin: 0, fontWeight: 'bold' }}>తెలుగులో విన్నపం:</p>
        <p style={{ margin: '6px 0 0' }}>
          మీకు వినమ్రంగా విజ్ఞప్తి చేసుకుంటున్నాను — పై ఫిర్యాదు విషయంలో సంబంధిత అధికారులకు తగిన ఆదేశాలిచ్చి, 
          సత్వర పరిష్కారానికి మీ విలువైన సహకారం అందించగలరని ప్రార్థిస్తున్నాను.
        </p>
      </div>

      {/* Closing */}
      <p>Thanking you,</p>
      <p>Yours faithfully,</p>

      {/* Signature section */}
      <div className="signature-line">
        <div>
          <p style={{ margin: 0 }}><strong>{complaint.citizens?.full_name || '________________________'}</strong></p>
          <p style={{ margin: '2px 0 0', fontSize: '10pt' }}>
            {[complaint.villages?.name, complaint.mandals?.name].filter(Boolean).join(', ')}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '10pt' }}>
            Phone: {maskPhone(complaint.citizens?.phone)}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '10pt' }}>Date: {todayFormatted()}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ width: 120, height: 60, border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9pt', color: '#888' }}>
            Signature / వేలిముద్ర
          </div>
        </div>
      </div>

      {/* System stamp */}
      <div className="stamp-box">
        <p style={{ margin: 0, fontSize: '9pt' }}>
          System Reference: Case No. {complaint.case_no} · 
          Filed: {new Date(complaint.created_at).toLocaleString('en-IN')} · 
          Generated: {new Date().toLocaleString('en-IN')} · 
          MPower Grievance Tracking System
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PRINT TYPE 2 — Single Complaint Detail (Staff use)
// ═══════════════════════════════════════════════════════════
function SingleComplaintPrint({ complaint, mlaName, constituency }) {
  return (
    <div className="print-page">

      <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #000', paddingBottom: 12 }}>
        <p style={{ margin: 0, fontSize: '13pt', fontWeight: 'bold', letterSpacing: 1 }}>
          GRIEVANCE DETAIL REPORT
        </p>
        <p className="telugu" style={{ margin: '4px 0 0', fontSize: '12pt' }}>ఫిర్యాదు వివరణ నివేదిక</p>
        <p style={{ margin: '6px 0 0', fontSize: '10pt' }}>
          {mlaName} · {constituency} Constituency · MPower CTS
        </p>
      </div>

      {/* Case header */}
      <table style={{ marginBottom: 20 }}>
        <tbody>
          {[
            ['Case Number / కేసు నంబర్', complaint.case_no],
            ['Title / శీర్షిక', complaint.title],
            ['Category / వర్గం', categoryLabel(complaint.category)],
            ['Priority / ప్రాధాన్యత', complaint.priority || 'Normal'],
            ['Stage / దశ', stageLabel(complaint.stage)],
            ['Filed Date / దాఖలు తేదీ', new Date(complaint.created_at).toLocaleDateString('en-IN')],
            ['Village / గ్రామం', complaint.villages?.name || '—'],
            ['Mandal / మండలం', complaint.mandals?.name || '—'],
            ['Constituency / నియోజకవర్గం', complaint.constituencies?.name || constituency || '—'],
          ].map(([label, value]) => (
            <tr key={label}>
              <td style={{ fontWeight: 'bold', width: '40%', background: '#f7f7f7' }}>{label}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Description */}
      <p style={{ fontWeight: 'bold', marginBottom: 6 }}>Complaint Details / ఫిర్యాదు వివరాలు:</p>
      <div style={{ border: '1px solid #ccc', padding: '10px 14px', marginBottom: 16, minHeight: 80, lineHeight: 1.8 }}>
        {complaint.description}
      </div>

      {/* Action history if available */}
      {complaint.history && complaint.history.length > 0 && (
        <>
          <p style={{ fontWeight: 'bold', marginBottom: 6 }}>Action History / చర్య చరిత్ర:</p>
          <table style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Stage</th>
                <th>Action Taken</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {complaint.history.map((h, i) => (
                <tr key={i}>
                  <td>{new Date(h.changed_at).toLocaleDateString('en-IN')}</td>
                  <td>{stageLabel(h.stage)}</td>
                  <td>{h.remarks || '—'}</td>
                  <td>{h.changed_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* For official use */}
      <div style={{ border: '1px solid #000', padding: '12px', marginTop: 20 }}>
        <p style={{ margin: '0 0 20px', fontWeight: 'bold' }}>For Official Use / అధికారిక వినియోగం కొరకు:</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30 }}>
          <div>
            <div style={{ borderTop: '1px solid #000', width: 160, paddingTop: 4, textAlign: 'center', fontSize: '9pt' }}>Signature of Staff</div>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #000', width: 160, paddingTop: 4, textAlign: 'center', fontSize: '9pt' }}>Signature of MLA / Representative</div>
          </div>
        </div>
      </div>

      <div className="stamp-box">
        <p style={{ margin: 0, fontSize: '9pt' }}>
          Generated: {new Date().toLocaleString('en-IN')} · MPower Grievance Tracking System · {complaint.case_no}
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PRINT TYPE 3 — Batch Complaint List for Minister / Collector
// ═══════════════════════════════════════════════════════════
function BatchComplaintList({ complaints, mlaName, constituency, addresseeName, addresseeRole, filters }) {
  // Group by category
  const grouped = complaints.reduce((acc, c) => {
    const cat = c.category || 'other';
    acc[cat] = acc[cat] || [];
    acc[cat].push(c);
    return acc;
  }, {});

  const totalCount = complaints.length;
  const resolvedCount = complaints.filter((c) => c.stage === 'resolved' || c.stage === 'closed').length;
  const pendingCount = totalCount - resolvedCount;

  return (
    <div className="print-page">

      {/* Covering letter header */}
      <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '3px double #000', paddingBottom: 14 }}>
        <p style={{ margin: 0, fontSize: '14pt', fontWeight: 'bold', letterSpacing: 1 }}>
          CONSTITUENCY GRIEVANCE STATUS REPORT
        </p>
        <p className="telugu" style={{ margin: '4px 0', fontSize: '12pt' }}>
          నియోజకవర్గ ఫిర్యాదుల స్థితి నివేదిక
        </p>
        <p style={{ margin: '4px 0 0', fontSize: '10pt' }}>
          {constituency} Constituency · {mlaName}
        </p>
      </div>

      {/* Addressed to */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: 0 }}><strong>To,</strong></p>
        <p style={{ margin: '4px 0 0' }}>The Honourable {addresseeRole || 'District Collector'},</p>
        <p style={{ margin: 0, fontWeight: 'bold' }}>{addresseeName || '________________________'}</p>
        <p style={{ margin: 0 }}>Subject: Consolidated Grievance List for {constituency} Constituency for necessary action</p>
      </div>

      <p>Respected Sir/Madam,</p>
      <p style={{ textIndent: '2em' }}>
        I am enclosing herewith the consolidated list of <strong>{totalCount}</strong> grievances 
        received from citizens of <strong>{constituency}</strong> Constituency through the MPower 
        Digital Grievance Tracking System. Of these, <strong>{resolvedCount}</strong> have been resolved 
        and <strong>{pendingCount}</strong> are pending resolution. I request your kind attention and 
        necessary action on the pending matters.
      </p>

      {/* Summary table */}
      <div style={{ border: '1px solid #000', padding: 12, marginBottom: 20, background: '#f9f9f9' }}>
        <p style={{ margin: '0 0 10px', fontWeight: 'bold', fontSize: '11pt' }}>Executive Summary / సారాంశం</p>
        <table>
          <thead>
            <tr>
              <th>Category / వర్గం</th>
              <th style={{ textAlign: 'center' }}>Total</th>
              <th style={{ textAlign: 'center' }}>Resolved</th>
              <th style={{ textAlign: 'center' }}>Pending</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([cat, items]) => {
              const resolved = items.filter((c) => c.stage === 'resolved' || c.stage === 'closed').length;
              return (
                <tr key={cat}>
                  <td>{categoryLabel(cat)}</td>
                  <td style={{ textAlign: 'center' }}>{items.length}</td>
                  <td style={{ textAlign: 'center', color: '#085041' }}>{resolved}</td>
                  <td style={{ textAlign: 'center', color: '#A32D2D', fontWeight: 'bold' }}>{items.length - resolved}</td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 'bold', background: '#f0f0f0' }}>
              <td>TOTAL</td>
              <td style={{ textAlign: 'center' }}>{totalCount}</td>
              <td style={{ textAlign: 'center', color: '#085041' }}>{resolvedCount}</td>
              <td style={{ textAlign: 'center', color: '#A32D2D' }}>{pendingCount}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Category-wise detailed list */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 24 }}>
          <p style={{ fontWeight: 'bold', fontSize: '11pt', margin: '0 0 8px', borderLeft: '4px solid #000', paddingLeft: 10 }}>
            {categoryLabel(cat)} ({items.length} complaints)
          </p>
          <table>
            <thead>
              <tr>
                <th style={{ width: '12%' }}>Case No.</th>
                <th style={{ width: '28%' }}>Complaint / ఫిర్యాదు</th>
                <th style={{ width: '16%' }}>Village/Mandal</th>
                <th style={{ width: '12%' }}>Filed Date</th>
                <th style={{ width: '12%' }}>Priority</th>
                <th style={{ width: '20%' }}>Status / స్థితి</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ fontFamily: 'monospace', fontSize: '9pt' }}>{c.case_no}</td>
                  <td>{c.title}</td>
                  <td style={{ fontSize: '9pt' }}>
                    {[c.villages?.name, c.mandals?.name].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td style={{ fontSize: '9pt' }}>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                  <td style={{ fontSize: '9pt' }}>{c.priority || 'Normal'}</td>
                  <td style={{ fontSize: '9pt', fontWeight: c.stage === 'resolved' ? 'normal' : 'bold', color: c.stage === 'resolved' ? '#085041' : c.stage === 'submitted' ? '#A32D2D' : '#633806' }}>
                    {stageLabel(c.stage)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Closing */}
      <p style={{ marginTop: 20 }}>I request your goodself to kindly direct the concerned departments for early redressal of pending grievances.</p>
      <p>Thanking you,</p>

      <div className="signature-line">
        <div>
          <p style={{ margin: 0, fontWeight: 'bold' }}>{mlaName}</p>
          <p style={{ margin: '2px 0 0', fontSize: '10pt' }}>MLA, {constituency} Constituency</p>
          <p style={{ margin: '2px 0 0', fontSize: '10pt' }}>Date: {todayFormatted()}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ width: 140, height: 70, border: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9pt', color: '#888' }}>
            Official Seal & Signature
          </div>
        </div>
      </div>

      <div className="stamp-box">
        <p style={{ margin: 0, fontSize: '9pt' }}>
          Generated: {new Date().toLocaleString('en-IN')} · 
          MPower CTS · {totalCount} complaints · 
          {filters?.dateFrom ? `Period: ${filters.dateFrom} to ${filters.dateTo || 'today'}` : 'All time'}
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT — Print Preview & Controls
// ═══════════════════════════════════════════════════════════
export default function ComplaintPrint({ caseNo, mode = 'citizen', appId }) {
  const [printType, setPrintType] = useState(mode);
  const [complaint, setComplaint] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlCaseNo = caseNo || searchParams.get('case') || searchParams.get('id') || '';
  const [manualCaseNo, setManualCaseNo] = useState('');

  // Addressee config
  const [mlaName, setMlaName] = useState('');
  const [constituency, setConstituency] = useState('');
  const [addresseeName, setAddresseeName] = useState('');
  const [addresseeRole, setAddresseeRole] = useState('District Collector');
  const [addresseeType, setAddresseeType] = useState('mla');

  // Batch filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [filterMandal, setFilterMandal] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');


  useEffect(() => {
  if (printType === 'citizen' || printType === 'staff_single') {
    loadSingleComplaint();
  } else {
    loadBatchComplaints();
  }
}, [printType, appId]);

useEffect(() => {
  if (urlCaseNo && (printType === 'citizen' || printType === 'staff_single')) {
    loadSingleComplaint();
  }
}, [urlCaseNo]);

  async function loadSingleComplaint() {
  if (!urlCaseNo) { setLoading(false); return; }
  setLoading(true);
  
  const { data, error: err } = await supabase
    .from('complaints')
    .select('*')
    .eq('case_no', urlCaseNo)
    .single();
  
  if (err) { setError('Complaint not found.'); setLoading(false); return; }

  // Fetch related data separately
  const [constData, mandalData, villageData, citizenData, historyData] = await Promise.all([
    data.constituency_id ? supabase.from('constituencies').select('name, rep_name').eq('id', data.constituency_id).single() : { data: null },
    data.mandal_id ? supabase.from('mandals').select('name').eq('id', data.mandal_id).single() : { data: null },
    data.village_id ? supabase.from('villages').select('name').eq('id', data.village_id).single() : { data: null },
    data.citizen_id ? supabase.from('citizens').select('full_name, phone, address, father_husband_name').eq('id', data.citizen_id).single() : { data: null },
    supabase.from('complaint_history').select('*').eq('complaint_id', data.id).order('created_at'),
  ]);
  setComplaint({
    ...data,
    constituencies: constData.data,
    mandals: mandalData.data,
    villages: villageData.data,
    citizens: citizenData.data,
    history: historyData.data || [],
  });

  setConstituency(constData.data?.name || '');
  setMlaName(constData.data?.rep_name || '');
  setLoading(false);
}
  async function loadBatchComplaints() {
    if (!appId) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('complaints').select('*').eq('app_id', appId).order('created_at', { ascending: false });
    if (filterCategory) query = query.eq('category', filterCategory);
    if (filterStage) query = query.eq('stage', filterStage);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');
    const { data, error: err } = await query;
    if (err) { setError('Failed to load complaints.'); setLoading(false); return; }

    // The base query above has no joins at all — village/mandal names
    // were always blank in this report before. Resolve them here in
    // two batched queries (not one per row) using the distinct ids
    // actually present in this result set.
    const rows = data || [];
    const mandalIds = [...new Set(rows.map((r) => r.mandal_id).filter(Boolean))];
    const villageIds = [...new Set(rows.map((r) => r.village_id).filter(Boolean))];

    const [mandalRes, villageRes] = await Promise.all([
      mandalIds.length ? supabase.from('mandals').select('id, name').in('id', mandalIds) : { data: [] },
      villageIds.length ? supabase.from('villages').select('id, name').in('id', villageIds) : { data: [] },
    ]);
    const mandalMap = Object.fromEntries((mandalRes.data || []).map((m) => [m.id, m.name]));
    const villageMap = Object.fromEntries((villageRes.data || []).map((v) => [v.id, v.name]));

    let enriched = rows.map((r) => ({
      ...r,
      mandals: r.mandal_id ? { name: mandalMap[r.mandal_id] } : null,
      villages: r.village_id ? { name: villageMap[r.village_id] } : null,
    }));

    // filterMandal used to filter on a column ('submitter_mandal')
    // that doesn't exist on complaints at all — silently matched
    // nothing, ever. Filtering client-side on the resolved name instead.
    if (filterMandal) {
      const needle = filterMandal.toLowerCase();
      enriched = enriched.filter((r) => (r.mandals?.name || '').toLowerCase().includes(needle));
    }

    setComplaints(enriched);
    setLoading(false);
  }

  const S = {
    page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
    inner: { maxWidth: 860, margin: '0 auto', padding: '24px 20px' },
    card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 16 },
    input: { width: '100%', padding: '9px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
    select: { width: '100%', padding: '9px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', cursor: 'pointer' },
    label: { fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  };

  return (
    <div style={S.page}>
      <style>{PRINT_STYLES}</style>

      <div style={S.inner} className="no-print">
        {/* Works correctly whether a citizen or staff member arrived
            here — always returns to wherever they actually came from,
            without needing to know which type of session this is. */}
        <button
          onClick={() => window.history.back()}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Print / Export</p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0, letterSpacing: -0.5 }}>Complaint Print Centre</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>ఫిర్యాదు ముద్రణ కేంద్రం</p>
          </div>
          <button onClick={() => window.print()} style={{ padding: '10px 24px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}>
            🖨️ Print now
          </button>
        </div>

        {/* Print type selector */}
        <div style={{ ...S.card, marginBottom: 20 }}>
          <p style={{ ...S.label, marginBottom: 12 }}>What do you want to print?</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { k: 'citizen', icon: '📋', title: 'Representation Letter', sub: 'Citizen → MLA/MP', te: 'పౌరుడి విజ్ఞాపన పత్రం' },
              { k: 'staff_single', icon: '📄', title: 'Single Complaint Detail', sub: 'Staff internal use', te: 'ఒక ఫిర్యాదు వివరాలు' },
              { k: 'staff_batch', icon: '📑', title: 'Batch List for Minister', sub: 'All complaints summary', te: 'మంత్రికి జాబితా' },
            ].map((opt) => (
              <div key={opt.k} onClick={() => setPrintType(opt.k)} style={{ padding: 14, border: `1px solid ${printType === opt.k ? 'rgba(232,160,32,0.5)' : 'rgba(255,255,255,0.07)'}`, background: printType === opt.k ? 'rgba(232,160,32,0.08)' : '#111113', borderRadius: 10, cursor: 'pointer' }}>
                <p style={{ fontSize: 22, margin: '0 0 6px' }}>{opt.icon}</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{opt.title}</p>
                <p style={{ margin: '2px 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{opt.sub}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{opt.te}</p>
              </div>
            ))}
          </div>
        </div>
      {!urlCaseNo && (
      <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
          Case Number / Complaint ID
           </label>
            <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualCaseNo}
                onChange={e => setManualCaseNo(e.target.value)}
              placeholder="GR/2026/000001"
            style={{ flex: 1, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
              />
              <button
                onClick={() => navigate(`/grievance/print?case=${encodeURIComponent(manualCaseNo)}`)}
                style={{ padding: '8px 16px', background: '#185FA5', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                  Load
              </button>
            </div>
        </div>
)}
        {/* Config panel */}
        <div style={S.card}>
          <p style={{ ...S.label, marginBottom: 12 }}>Configuration / సెట్టింగ్స్</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={S.label}>MLA / MP Name</label>
              <input value={mlaName} onChange={(e) => setMlaName(e.target.value)} placeholder="e.g. Sri Y.S. Jagan Mohan Reddy" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Constituency</label>
              <input value={constituency} onChange={(e) => setConstituency(e.target.value)} placeholder="e.g. Pulivendula" style={S.input} />
            </div>
          </div>

          {(printType === 'citizen') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={S.label}>Addressed to (MLA or MP?)</label>
                <select value={addresseeType} onChange={(e) => setAddresseeType(e.target.value)} style={S.select}>
                  <option value="mla">MLA — Member of Legislative Assembly</option>
                  <option value="mp">MP — Member of Parliament</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Case Number</label>
                <input value={urlCaseNo || ''} readOnly style={{ ...S.input, opacity: 0.6 }} />
              </div>
            </div>
          )}

          {printType === 'staff_batch' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={S.label}>Addressed to (name)</label>
                  <input value={addresseeName} onChange={(e) => setAddresseeName(e.target.value)} placeholder="Collector / Minister name" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Their designation</label>
                  <select value={addresseeRole} onChange={(e) => setAddresseeRole(e.target.value)} style={S.select}>
                    <option>District Collector</option>
                    <option>Minister</option>
                    <option>Joint Collector</option>
                    <option>MRO</option>
                    <option>Superintendent of Police</option>
                    <option>Chief Minister</option>
                    <option>Other Official</option>
                  </select>
                </div>
              </div>
              <p style={{ ...S.label, marginBottom: 8 }}>Filter complaints to include</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
                <div>
                  <label style={S.label}>Category</label>
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={S.select}>
                    <option value="">All categories</option>
                    {['roads', 'water', 'electricity', 'drainage', 'health', 'education', 'pensions', 'ration', 'land', 'other'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Status</label>
                  <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} style={S.select}>
                    <option value="">All statuses</option>
                    <option value="submitted">Submitted</option>
                    <option value="under_review">Under review</option>
                    <option value="forwarded">Forwarded</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div>
                  <label style={S.label}>From date</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={S.input} />
                </div>
                <div>
                  <label style={S.label}>To date</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={S.input} />
                </div>
              </div>
              <button onClick={loadBatchComplaints} style={{ padding: '8px 18px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                Apply filters & preview
              </button>
              {complaints.length > 0 && (
                <p style={{ fontSize: 12, color: '#6AAA90', marginTop: 8, marginBottom: 0 }}>
                  ✓ {complaints.length} complaints will be included in the print
                </p>
              )}
            </>
          )}
        </div>

        {error && (
          <p style={{ color: '#E05A5A', fontSize: 13, marginBottom: 16 }}>{error}</p>
        )}

        {loading && (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading complaint data...</p>
        )}

        {/* Print preview label */}
        {!loading && !error && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '10px 16px', marginBottom: 20 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#E8A020', fontWeight: 500 }}>
              📄 Print preview below — looks exactly like the printed output
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Click "Print now" above or use Ctrl+P / ⌘+P to print
            </p>
          </div>
        )}
      </div>

      {/* ── Actual printable content ── */}
      {!loading && !error && (
        <>
          {printType === 'citizen' && complaint && (
            <CitizenRepresentationLetter
              complaint={{ ...complaint, addressee_type: addresseeType }}
              mlaName={mlaName}
              constituency={constituency}
            />
          )}
          {printType === 'staff_single' && complaint && (
            <SingleComplaintPrint
              complaint={complaint}
              mlaName={mlaName}
              constituency={constituency}
            />
          )}
          {printType === 'staff_batch' && complaints.length > 0 && (
            <BatchComplaintList
              complaints={complaints}
              mlaName={mlaName}
              constituency={constituency}
              addresseeName={addresseeName}
              addresseeRole={addresseeRole}
              filters={{ dateFrom, dateTo, filterCategory, filterStage }}
            />
          )}
        </>
      )}
      <GrievanceNav />
    </div>
  );
}