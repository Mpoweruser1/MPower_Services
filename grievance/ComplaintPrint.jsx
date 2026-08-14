// grievance/ComplaintPrint.jsx
// Handles all CTS print scenarios:
// 1. Citizen representation letter to MLA/MP
// 2. Staff — single complaint print for official reference
// 3. Staff — batch complaint list for minister/collector submission
import { useSearchParams, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { fetchCategories, getStaffPhotoUrl, fetchConstituencies, fetchMandals, fetchVillages } from './grievanceApi';
import GrievanceNav from './GrievanceNav';

// ─── Shared print styles ───────────────────────────────────

const PRINT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;600;700&family=Times+New+Roman&display=swap');
  
  @media print {
    body { margin: 0; padding: 0; background: #fff !important; color: #000 !important; }
    .no-print { display: none !important; }
    .letterhead-photo { filter: grayscale(100%); }
    @page { size: A4 portrait; margin: 12mm 15mm; }
    @page batch { size: A4 landscape; margin: 7mm 9mm; }
    .print-page.batch-report { page: batch; }
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
    Submitted: 'Submitted / సమర్పించబడింది',
    Acknowledged: 'Acknowledged / స్వీకరించబడింది',
    'In Progress': 'In Progress / పరిశీలనలో ఉంది',
    Escalated: 'Escalated / అప్పగించబడింది',
    Sanctioned: 'Sanctioned / మంజూరు చేయబడింది',
    Resolved: 'Resolved / పరిష్కరించబడింది',
    Declined: 'Declined / తిరస్కరించబడింది',
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
// A citizen typing their own name into a form doesn't always
// capitalize it — showing it exactly as typed (e.g. "kondayya") reads
// informally on what's meant to be a respectful, official document.
// This only changes how it's DISPLAYED, never the stored value itself.
// CM photos for the batch report letterhead — placeholder until the
// real images are provided. Keyed by state name (from apps.state_name).
const CM_PHOTOS = {
  'Andhra Pradesh': null,
  'Telangana': null,
};

function toTitleCase(str) {
  if (!str) return str;
  return str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function maskPhone(phone) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return 'X'.repeat(digits.length - 4) + digits.slice(-4);
}

// ═══════════════════════════════════════════════════════════
// PRINT TYPE 1 — Citizen Representation Letter to MLA / MP
// ═══════════════════════════════════════════════════════════
function CitizenRepresentationLetter({ complaint, mlaName, constituency, stateName }) {
  return (
    <div className="print-page">

      {/* Official letterhead top -- now shows state/place alongside the
          app name, matching BatchComplaintList's branding instead of
          just "MPower Grievance Tracking System" with no place info. */}
      <div style={{ textAlign: 'center', marginBottom: 14, borderBottom: '2px double #000', paddingBottom: 10 }}>
        <p style={{ margin: 0, fontSize: '11pt', fontWeight: 'bold', letterSpacing: 1 }}>
          GRIEVANCE REPRESENTATION / ఫిర్యాదు విజ్ఞాపన పత్రం
        </p>
        <p style={{ margin: '4px 0 0', fontSize: '10pt', color: '#333' }}>
          {stateName ? `Government of ${stateName} · ` : ''}Submitted through MPower CTS · Case No: <strong>{complaint.case_no}</strong>
        </p>
      </div>

      {/* Addressee */}
      <div style={{ marginBottom: 14 }}>
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
      <div style={{ marginBottom: 14 }}>
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
        I, <strong>{toTitleCase(complaint.citizens?.full_name) || 'the undersigned'}</strong>, 
        {complaint.villages?.name ? ` resident of ${complaint.villages.name}, ` : ' '}
        {complaint.mandals?.name ? `${complaint.mandals.name} Mandal, ` : ''}
        humbly submit this representation to bring to your kind attention the following grievance pertaining to our area.
      </p>

      {/* Problem statement box */}
      <div style={{ border: '1px solid #000', padding: '10px 14px', margin: '12px 0', background: '#fafafa' }}>
        <p style={{ margin: '0 0 8px', fontWeight: 'bold', fontSize: '11pt' }}>
          Nature of Grievance / ఫిర్యాదు వివరాలు:
        </p>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>{complaint.description}</p>
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

      {/* Closing */}
      <p>Thanking you,</p>
      <p>Yours faithfully,</p>

      {/* Signature section */}
      <div className="signature-line" style={{ marginTop: 26 }}>
        <div>
          <p style={{ margin: 0 }}><strong>{toTitleCase(complaint.citizens?.full_name) || '________________________'}</strong></p>
          <p style={{ margin: '2px 0 0', fontSize: '10pt' }}>
            {[complaint.villages?.name, complaint.mandals?.name].filter(Boolean).join(', ')}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '10pt' }}>
            Phone: {complaint.citizens?.phone || '—'}
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
      <div className="stamp-box" style={{ marginTop: 14 }}>
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
function SingleComplaintPrint({ complaint, mlaName, constituency, stateName }) {
  return (
    <div className="print-page">

      <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #000', paddingBottom: 12 }}>
        <p style={{ margin: 0, fontSize: '13pt', fontWeight: 'bold', letterSpacing: 1 }}>
          GRIEVANCE DETAIL REPORT
        </p>
        <p className="telugu" style={{ margin: '4px 0 0', fontSize: '12pt' }}>ఫిర్యాదు వివరణ నివేదిక</p>
        <p style={{ margin: '6px 0 0', fontSize: '10pt' }}>
          {stateName ? `${stateName} · ` : ''}{mlaName} · {constituency} Constituency · MPower CTS
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
            ['Citizen Name / పౌరుడి పేరు', toTitleCase(complaint.citizens?.full_name) || '—'],
            ['Phone / ఫోన్', complaint.citizens?.phone || '—'],
            ['Address / చిరునామా', complaint.citizens?.address || '—'],
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
                  <td>{new Date(h.created_at).toLocaleDateString('en-IN')}</td>
                  <td>{stageLabel(h.stage)}</td>
                  <td>{h.note || '—'}</td>
                  <td>{toTitleCase(h.by_name) || '—'}</td>
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
function daysPending(complaint) {
  const filed = new Date(complaint.created_at);
  const isResolved = ['Resolved', 'Sanctioned', 'Declined'].includes(complaint.stage);
  const end = isResolved ? new Date(complaint.updated_at || complaint.created_at) : new Date();
  return Math.max(0, Math.floor((end - filed) / (1000 * 60 * 60 * 24)));
}

function BatchComplaintList({ complaints, mlaName, constituency, addresseeName, addresseeRole, filters, mlaPhotoUrl, cmPhotoUrl, stateName }) {
  // Group by category, then sort each group oldest-pending-first —
  // previously just filing order, meaning an urgent complaint waiting
  // weeks could sit buried below one filed yesterday, in the same list.
  const grouped = complaints.reduce((acc, c) => {
    const cat = c.category || 'other';
    acc[cat] = acc[cat] || [];
    acc[cat].push(c);
    return acc;
  }, {});
  Object.values(grouped).forEach((items) => items.sort((a, b) => daysPending(b) - daysPending(a)));

  const totalCount = complaints.length;
  const resolvedCount = complaints.filter((c) => ['Resolved', 'Sanctioned', 'Declined'].includes(c.stage)).length;
  const pendingCount = totalCount - resolvedCount;

  // The single oldest still-pending complaint, for an at-a-glance
  // callout — the Collector/Minister sees how bad the backlog really
  // is before reading a single row of the actual table.
  const pending = complaints.filter((c) => !['Resolved', 'Sanctioned', 'Declined'].includes(c.stage));
  const oldestPending = pending.length
    ? pending.reduce((oldest, c) => (daysPending(c) > daysPending(oldest) ? c : oldest))
    : null;

  return (
    <div className="print-page batch-report">

      {/* Official letterhead — first page only, matching how a real
          government/official document letterhead works. MLA photo
          pulled from their own staff profile (already collected at
          registration); CM photo is a placeholder slot until the real
          image is provided per state. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #000' }}>
        <div style={{ width: 78, height: 98, border: '1px solid #999', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {mlaPhotoUrl ? (
            <img src={mlaPhotoUrl} alt="MLA" className="letterhead-photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '8pt', color: '#999', textAlign: 'center', padding: 4 }}>MLA Photo</span>
          )}
        </div>
        <div style={{ textAlign: 'center', flex: 1, padding: '0 16px' }}>
          <p style={{ margin: 0, fontSize: '13pt', fontWeight: 'bold', letterSpacing: 1 }}>
            GOVERNMENT OF {(stateName || '').toUpperCase()}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '9pt', color: '#444' }}>
            MPower Grievance Tracking System · Official Constituency Report
          </p>
        </div>
        <div style={{ width: 78, height: 98, border: '1px solid #999', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {cmPhotoUrl ? (
            <img src={cmPhotoUrl} alt="Chief Minister" className="letterhead-photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '8pt', color: '#999', textAlign: 'center', padding: 4 }}>CM Photo</span>
          )}
        </div>
      </div>

      {/* Covering letter header */}
      <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '3px double #000', paddingBottom: 10 }}>
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

      {oldestPending && (
        <div style={{ border: '2px solid #A32D2D', padding: '10px 14px', marginBottom: 16, background: '#fdf2f2' }}>
          <p style={{ margin: 0, fontSize: '11pt', fontWeight: 'bold', color: '#A32D2D' }}>
            ⚠ Oldest unresolved complaint: {daysPending(oldestPending)} days
            — {categoryLabel(oldestPending.category)}, {oldestPending.villages?.name || oldestPending.mandals?.name || '—'} ({oldestPending.case_no})
          </p>
        </div>
      )}

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
              const resolved = items.filter((c) => ['Resolved', 'Sanctioned', 'Declined'].includes(c.stage)).length;
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
                <th style={{ width: '8%' }}>Case No.</th>
                <th style={{ width: '14%' }}>Complaint / ఫిర్యాదు</th>
                <th style={{ width: '13%' }}>Citizen Contact</th>
                <th style={{ width: '11%' }}>Village/Mandal</th>
                <th style={{ width: '8%' }}>Days Pending</th>
                <th style={{ width: '7%' }}>Priority</th>
                <th style={{ width: '13%' }}>Status / స్థితి</th>
                <th style={{ width: '13%' }}>Assigned To / Dept</th>
                <th style={{ width: '13%' }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c, i) => {
                const days = daysPending(c);
                const overdue = days >= 14 && !['Resolved', 'Sanctioned', 'Declined'].includes(c.stage);
                return (
                <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ fontFamily: 'monospace', fontSize: '9pt' }}>{c.case_no}</td>
                  <td>{c.title}</td>
                  <td style={{ fontSize: '9pt' }}>
                    {c.citizens?.full_name || '—'}{c.citizens?.phone ? ` · ${c.citizens.phone}` : ''}
                  </td>
                  <td style={{ fontSize: '9pt' }}>
                    {[c.villages?.name, c.mandals?.name].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td style={{ fontSize: '9pt', fontWeight: overdue ? 'bold' : 'normal', color: overdue ? '#A32D2D' : '#000' }}>
                    {days} {days === 1 ? 'day' : 'days'}
                  </td>
                  <td style={{ fontSize: '9pt' }}>{c.priority || 'Normal'}</td>
                  <td style={{ fontSize: '9pt', fontWeight: c.stage === 'Resolved' ? 'normal' : 'bold', color: c.stage === 'Resolved' ? '#085041' : c.stage === 'Submitted' ? '#A32D2D' : '#633806' }}>
                    {stageLabel(c.stage)}
                  </td>
                  <td style={{ minHeight: 24 }}></td>
                  <td style={{ minHeight: 24 }}></td>
                </tr>
                );
              })}
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
export default function ComplaintPrint({ caseNo, mode = 'citizen', appId: appIdProp }) {
  const { tenant, loading: tenantLoading } = useTenant();
  const isStaff = !!tenant;
  // The only route to this page (/grievance/print) never actually
  // passes appId as a prop — it was always undefined, meaning
  // loadBatchComplaints() silently did nothing on every single click
  // of "Apply filters & preview", not just occasionally. A staff
  // member's own tenant.appId is also the correct, natural scope for
  // batch printing regardless — they should only ever batch-print
  // their own state's complaints.
  const appId = appIdProp || tenant?.appId;
  const [searchParams] = useSearchParams();
  const [printType, setPrintType] = useState(searchParams.get('mode') || mode);
  const [complaint, setComplaint] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const urlCaseNo = caseNo || searchParams.get('case') || searchParams.get('id') || '';
  const [manualCaseNo, setManualCaseNo] = useState('');

  // Addressee config
  const [mlaName, setMlaName] = useState('');
  const [constituency, setConstituency] = useState('');
  const [addresseeName, setAddresseeName] = useState('');
  const [addresseeRole, setAddresseeRole] = useState('District Collector');
  const [addresseeType, setAddresseeType] = useState('mla');

  // Batch filters — every one of these now initializes from the URL,
  // not just case/id. This is what actually lets StaffDashboard's
  // "Print this view" button carry its filters over; previously the
  // URL params it sent were silently ignored entirely.
  const [filterCategory, setFilterCategory] = useState(searchParams.get('category') || '');
  const [filterSearch, setFilterSearch] = useState(searchParams.get('search') || '');
  const [filterPriority, setFilterPriority] = useState(searchParams.get('priority') || '');
  const [realCategories, setRealCategories] = useState([]);
  const [mlaPhotoUrl, setMlaPhotoUrl] = useState(null);
  const [stateName, setStateName] = useState(null);
  const [mlaConfigEditing, setMlaConfigEditing] = useState(false);
  const [filterStage, setFilterStage] = useState(searchParams.get('status') || '');
  // Renamed from the old filterMandal (a client-side name-text match
  // that was never connected to any UI) to filterMandalId, matching
  // the real, server-side, ID-based pattern every other filter here
  // already uses.
  const [filterConstituencyId, setFilterConstituencyId] = useState(searchParams.get('constituencyId') || '');
  const [filterMandalId, setFilterMandalId] = useState(searchParams.get('mandalId') || '');
  const [filterVillageId, setFilterVillageId] = useState(searchParams.get('villageId') || '');
  const [constituencyOptions, setConstituencyOptions] = useState([]);
  const [mandalOptions, setMandalOptions] = useState([]);
  const [villageOptions, setVillageOptions] = useState([]);
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');


  useEffect(() => {
    if (!tenantLoading && !isStaff && printType !== 'citizen') {
      setPrintType('citizen');
    }
  }, [tenantLoading, isStaff, printType]);

  useEffect(() => {
    if (appId) fetchCategories(appId).then(setRealCategories).catch(() => {});
  }, [appId]);

  useEffect(() => {
    if (appId) fetchConstituencies(appId).then(setConstituencyOptions).catch(() => {});
  }, [appId]);

  useEffect(() => {
    if (!filterConstituencyId) { setMandalOptions([]); return; }
    fetchMandals(filterConstituencyId).then(setMandalOptions).catch(() => {});
  }, [filterConstituencyId]);

  useEffect(() => {
    if (!filterMandalId) { setVillageOptions([]); return; }
    fetchVillages(filterMandalId).then(setVillageOptions).catch(() => {});
  }, [filterMandalId]);

  // MLA photo for the batch report letterhead — pulled from the
  // logged-in staff member's own profile photo (already collected
  // during staff registration, just never displayed anywhere before).
  useEffect(() => {
    if (tenant?.photoUrl && printType === 'staff_batch') {
      getStaffPhotoUrl(tenant.photoUrl).then(setMlaPhotoUrl).catch(() => {});
    }
  }, [tenant?.photoUrl, printType]);

  // Previously mlaName/constituency were only ever set for single-
  // complaint mode — batch mode's header stayed blank unless someone
  // manually typed it in every time. Now, filtering the batch report
  // to one specific constituency (e.g. via StaffDashboard's "Print
  // this view") correctly fills in that constituency's real MLA name
  // and constituency name in the header automatically.
  useEffect(() => {
    if (printType !== 'staff_batch' || !filterConstituencyId) return;
    supabase.from('constituencies').select('name, rep_name').eq('id', filterConstituencyId).single()
      .then(({ data }) => {
        if (data) { setConstituency(data.name || ''); setMlaName(data.rep_name || ''); }
      });
  }, [printType, filterConstituencyId]);

  // Fetch stateName for every print type, not just staff_batch -- the
  // citizen letter and single-complaint print both showed no state/
  // place info at all before this, since this data was never even
  // requested for them.
  useEffect(() => {
    if (appId) {
      supabase.from('apps').select('state_name').eq('id', appId).maybeSingle()
        .then(({ data }) => setStateName(data?.state_name || null));
    }
  }, [appId]);

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
    if (filterSearch.trim()) query = query.ilike('title', `%${filterSearch.trim()}%`);
    if (filterStage === 'PENDING_ONLY') {
      query = query.not('stage', 'in', '(Resolved,Sanctioned,Declined)');
    } else if (filterStage === 'HANDLED_ONLY') {
      query = query.in('stage', ['Resolved', 'Sanctioned', 'Declined']);
    } else if (filterStage) {
      query = query.eq('stage', filterStage);
    }
    if (filterPriority) query = query.eq('priority', filterPriority);
    if (filterConstituencyId) query = query.eq('constituency_id', filterConstituencyId);
    if (filterMandalId) query = query.eq('mandal_id', filterMandalId);
    if (filterVillageId) query = query.eq('village_id', filterVillageId);
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
    const citizenIds = [...new Set(rows.map((r) => r.citizen_id).filter(Boolean))];

    const [mandalRes, villageRes, citizenRes] = await Promise.all([
      mandalIds.length ? supabase.from('mandals').select('id, name').in('id', mandalIds) : { data: [] },
      villageIds.length ? supabase.from('villages').select('id, name').in('id', villageIds) : { data: [] },
      citizenIds.length ? supabase.from('citizens').select('id, full_name, phone').in('id', citizenIds) : { data: [] },
    ]);
    const mandalMap = Object.fromEntries((mandalRes.data || []).map((m) => [m.id, m.name]));
    const villageMap = Object.fromEntries((villageRes.data || []).map((v) => [v.id, v.name]));
    const citizenMap = Object.fromEntries((citizenRes.data || []).map((c) => [c.id, c]));

    let enriched = rows.map((r) => ({
      ...r,
      mandals: r.mandal_id ? { name: mandalMap[r.mandal_id] } : null,
      villages: r.village_id ? { name: villageMap[r.village_id] } : null,
      citizens: r.citizen_id ? citizenMap[r.citizen_id] : null,
    }));

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

  if (tenantLoading) {
    return (
      <div style={S.page}>
        <div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</p></div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{PRINT_STYLES}</style>

      <div style={S.inner} className="no-print">
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

        {/* Print type selector — citizens only ever see the one option
            relevant to them; the other two are staff-only. Previously
            shown to literally anyone regardless of who was logged in. */}
        <div style={{ ...S.card, marginBottom: 20 }}>
          <p style={{ ...S.label, marginBottom: 12 }}>What do you want to print?</p>
          <div style={{ display: 'grid', gridTemplateColumns: isStaff ? '1fr 1fr 1fr' : '1fr', gap: 10 }}>
            {[
              { k: 'citizen', icon: '📋', title: 'Representation Letter', sub: 'Citizen → MLA/MP', te: 'పౌరుడి విజ్ఞాపన పత్రం' },
              { k: 'staff_single', icon: '📄', title: 'Single Complaint Detail', sub: 'Staff internal use', te: 'ఒక ఫిర్యాదు వివరాలు' },
              { k: 'staff_batch', icon: '📑', title: 'Batch List for Minister', sub: 'All complaints summary', te: 'మంత్రికి జాబితా' },
            ].filter((opt) => isStaff || opt.k === 'citizen').map((opt) => (
              <div key={opt.k} onClick={() => setPrintType(opt.k)} style={{ padding: 14, border: `1px solid ${printType === opt.k ? 'rgba(232,160,32,0.5)' : 'rgba(255,255,255,0.07)'}`, background: printType === opt.k ? 'rgba(232,160,32,0.08)' : '#111113', borderRadius: 10, cursor: 'pointer' }}>
                <p style={{ fontSize: 22, margin: '0 0 6px' }}>{opt.icon}</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{opt.title}</p>
                <p style={{ margin: '2px 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{opt.sub}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{opt.te}</p>
              </div>
            ))}
          </div>
        </div>
      {isStaff && !urlCaseNo && (
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

          {/* MLA/Constituency — collapsed to a quiet read-only line by
              default, since this almost never needs touching. An
              "Edit" link reveals the fields only when actually needed,
              instead of taking up prime space every single time. */}
          {isStaff && !mlaConfigEditing ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{mlaName || 'MLA name not set'} · {constituency || 'Constituency not set'}</span>
              <button onClick={() => setMlaConfigEditing(true)} style={{ background: 'none', border: 'none', color: '#E8A020', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={S.label}>MLA / MP Name</label>
                <input value={mlaName} onChange={(e) => setMlaName(e.target.value)} readOnly={!isStaff} placeholder="e.g. Sri Y.S. Jagan Mohan Reddy" style={{ ...S.input, opacity: isStaff ? 1 : 0.6 }} />
              </div>
              <div>
                <label style={S.label}>Constituency</label>
                <input value={constituency} onChange={(e) => setConstituency(e.target.value)} readOnly={!isStaff} placeholder="e.g. Pulivendula" style={{ ...S.input, opacity: isStaff ? 1 : 0.6 }} />
              </div>
            </div>
          )}

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
              {/* Recipient — clearly its own section, separate from filters */}
              <p style={{ ...S.label, marginBottom: 8, color: 'rgba(255,255,255,0.5)' }}>Recipient</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
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

              {/* Filters — separate section, real category/status values,
                  plus quick presets so common cases don't need manual
                  date-range picking every time */}
              <p style={{ ...S.label, marginBottom: 8, color: 'rgba(255,255,255,0.5)' }}>Filters</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {[
                  { label: 'All pending', apply: () => { setFilterStage('PENDING_ONLY'); setFilterPriority(''); setDateFrom(''); setDateTo(''); } },
                  { label: 'This month', apply: () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); setDateFrom(first.toISOString().slice(0, 10)); setDateTo(now.toISOString().slice(0, 10)); } },
                  { label: 'Urgent only', apply: () => { setFilterPriority('Urgent'); setDateFrom(''); setDateTo(''); } },
                  { label: 'All time', apply: () => { setFilterCategory(''); setFilterStage(''); setFilterPriority(''); setDateFrom(''); setDateTo(''); } },
                ].map((preset) => (
                  <button key={preset.label} type="button" onClick={preset.apply}
                    style={{ padding: '6px 12px', borderRadius: 16, border: '1px solid rgba(232,160,32,0.3)', background: 'rgba(232,160,32,0.08)', color: '#E8A020', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Search by title…" style={{ ...S.input, marginBottom: 10 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={S.label}>Constituency</label>
                  <select value={filterConstituencyId} onChange={(e) => { setFilterConstituencyId(e.target.value); setFilterMandalId(''); setFilterVillageId(''); }} style={S.select}>
                    <option value="">All constituencies</option>
                    {constituencyOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Mandal</label>
                  <select value={filterMandalId} onChange={(e) => { setFilterMandalId(e.target.value); setFilterVillageId(''); }} disabled={!filterConstituencyId} style={{ ...S.select, opacity: filterConstituencyId ? 1 : 0.5 }}>
                    <option value="">All mandals</option>
                    {mandalOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Village</label>
                  <select value={filterVillageId} onChange={(e) => setFilterVillageId(e.target.value)} disabled={!filterMandalId} style={{ ...S.select, opacity: filterMandalId ? 1 : 0.5 }}>
                    <option value="">All villages</option>
                    {villageOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 8 }}>
                <div>
                  <label style={S.label}>Category</label>
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={S.select}>
                    <option value="">All categories</option>
                    {realCategories.map((c) => (
                      <option key={c.id} value={c.label_en}>{c.label_en}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Status</label>
                  <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)} style={S.select}>
                    <option value="">All statuses</option>
                    <option value="PENDING_ONLY">Pending only (not resolved/sanctioned/declined)</option>
                    <option value="HANDLED_ONLY">Handled only (resolved/sanctioned/declined)</option>
                    <option value="Submitted">Submitted</option>
                    <option value="Acknowledged">Acknowledged</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Escalated">Escalated</option>
                    <option value="Sanctioned">Sanctioned</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Declined">Declined</option>
                  </select>
                </div>
                <div>
                  <label style={S.label}>Priority</label>
                  <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={S.select}>
                    <option value="">All priorities</option>
                    <option value="Normal">Normal</option>
                    <option value="Urgent">Urgent</option>
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
              stateName={stateName}
            />
          )}
          {printType === 'staff_single' && complaint && (
            <SingleComplaintPrint
              complaint={complaint}
              mlaName={mlaName}
              constituency={constituency}
              stateName={stateName}
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
              mlaPhotoUrl={mlaPhotoUrl}
              cmPhotoUrl={CM_PHOTOS[stateName] || null}
              stateName={stateName}
            />
          )}
        </>
      )}

      <div className="no-print" style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '20px 0 100px' }}>
        <button
          onClick={() => window.history.back()}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Back
        </button>
        <a href="/" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>🏠 Exit to Home</a>
      </div>

      <GrievanceNav />
    </div>
  );
}