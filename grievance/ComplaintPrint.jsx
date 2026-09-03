// grievance/ComplaintPrint.jsx
// Handles all CTS print scenarios:
// 1. Citizen representation letter to MLA/MP
// 2. Staff — single complaint print for official reference
// 3. Staff — batch complaint list for minister/collector submission
import { useSearchParams, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import { fetchCategories, getStaffPhotoUrl, fetchConstituencies, fetchMandals, fetchVillages, fetchMyConstituencyId } from './grievanceApi';
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
// CM photos for the batch report letterhead. Keyed by state name (from
// apps.state_name). Path is a storage path in the same 'staff-photos'
// bucket rep/staff photos already use, resolved to a signed URL at
// print time via getStaffPhotoUrl — not a plain public URL, since this
// bucket is private.
const CM_PHOTOS = {
  'Andhra Pradesh': 'cm_photo.jpg',
  'Telangana': null,
};

// CM/MLA photos live in their own dedicated bucket, 'representative-
// photos' — separate from staff-photos (which is for staff members'
// own profile photos, an unrelated thing). Signed URL either way,
// works regardless of whether the bucket is public or private.
async function getRepPhotoUrl(path, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from('representative-photos').createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

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
function SingleComplaintPrint({ complaint, constituency, stateName }) {
  return (
    <div className="print-page">

      <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '2px solid #000', paddingBottom: 12 }}>
        <p style={{ margin: 0, fontSize: '13pt', fontWeight: 'bold', letterSpacing: 1 }}>
          GRIEVANCE DETAIL REPORT
        </p>
        <p className="telugu" style={{ margin: '4px 0 0', fontSize: '12pt' }}>ఫిర్యాదు వివరణ నివేదిక</p>
        <p style={{ margin: '6px 0 0', fontSize: '10pt' }}>
          {stateName ? `${stateName} · ` : ''}MPower CTS · Internal Reference
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
// PRINT TYPE 4 — Statewide Summary for Minister
// ═══════════════════════════════════════════════════════════
// A genuinely different document from BatchComplaintList above, not a
// loosened version of it. That one is structurally one MLA's own
// letter — first person, one signature, one constituency. This one
// covers many/all constituencies at once, which means it can never
// honestly be signed by any single MLA. So it's issued by the state
// Grievance Administration itself, addressed the same way (Minister/
// CM), but grouped BY CONSTITUENCY rather than by category — a
// Minister reading this needs to see which areas need attention, not
// one flat mixed list of 40 complaints from nine different places.
function StatewideSummaryForMinister({ complaints, addresseeName, addresseeRole, filters, cmPhotoUrl, stateName, issuedByName, districtName }) {
  // Group by constituency (falling back to a clear label for any
  // complaint that somehow has no constituency on file, rather than
  // silently dropping it from the report), then sort each group
  // oldest-pending-first, same reasoning as the category grouping.
  const grouped = complaints.reduce((acc, c) => {
    const name = c.constituencies?.name || 'Constituency not on file';
    acc[name] = acc[name] || [];
    acc[name].push(c);
    return acc;
  }, {});
  Object.values(grouped).forEach((items) => items.sort((a, b) => daysPending(b) - daysPending(a)));

  const totalCount = complaints.length;
  const resolvedCount = complaints.filter((c) => ['Resolved', 'Sanctioned', 'Declined'].includes(c.stage)).length;
  const pendingCount = totalCount - resolvedCount;
  const constituencyCount = Object.keys(grouped).length;

  const pending = complaints.filter((c) => !['Resolved', 'Sanctioned', 'Declined'].includes(c.stage));
  const oldestPending = pending.length
    ? pending.reduce((oldest, c) => (daysPending(c) > daysPending(oldest) ? c : oldest))
    : null;

  return (
    <div className="print-page batch-report">

      {/* Letterhead — CM photo only, no MLA photo slot at all, since
          this document is never issued in any one MLA's name. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #000' }}>
        <div style={{ textAlign: 'center', flex: 1, padding: '0 16px' }}>
          <p style={{ margin: 0, fontSize: '13pt', fontWeight: 'bold', letterSpacing: 1 }}>
            GOVERNMENT OF {(stateName || '').toUpperCase()}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '9pt', color: '#444' }}>
            MPower Grievance Tracking System · Official Statewide Report
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
          {districtName ? 'DISTRICT GRIEVANCE SUMMARY' : 'STATEWIDE GRIEVANCE SUMMARY'}
        </p>
        <p className="telugu" style={{ margin: '4px 0', fontSize: '12pt' }}>
          రాష్ట్రవ్యాప్త ఫిర్యాదుల సారాంశం
        </p>
        <p style={{ margin: '4px 0 0', fontSize: '10pt' }}>
          {districtName ? `${districtName} District, ${stateName}` : stateName} · {constituencyCount} constituencies covered
        </p>
      </div>

      {/* Addressed to */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ margin: 0 }}><strong>To,</strong></p>
        <p style={{ margin: '4px 0 0' }}>The Honourable {addresseeRole || 'Minister'},</p>
        <p style={{ margin: 0, fontWeight: 'bold' }}>{addresseeName || '________________________'}</p>
        <p style={{ margin: 0 }}>Subject: Consolidated {districtName ? `${districtName} District` : 'Statewide'} Grievance Summary for necessary action</p>
      </div>

      <p>Respected Sir/Madam,</p>
      <p style={{ textIndent: '2em' }}>
        I am enclosing herewith, on behalf of the {stateName} Grievance Administration, the consolidated
        list of <strong>{totalCount}</strong> grievances received from citizens across <strong>{constituencyCount}</strong> constituencies
        {districtName ? <> within <strong>{districtName}</strong> district</> : null}
        through the MPower Digital Grievance Tracking System. Of these, <strong>{resolvedCount}</strong> have
        been resolved and <strong>{pendingCount}</strong> are pending resolution. I request your kind attention
        and necessary action on the pending matters.
      </p>

      {oldestPending && (
        <div style={{ border: '2px solid #A32D2D', padding: '10px 14px', marginBottom: 16, background: '#fdf2f2' }}>
          <p style={{ margin: 0, fontSize: '11pt', fontWeight: 'bold', color: '#A32D2D' }}>
            ⚠ Oldest unresolved complaint: {daysPending(oldestPending)} days
            — {oldestPending.constituencies?.name || 'Constituency not on file'}, {categoryLabel(oldestPending.category)} ({oldestPending.case_no})
          </p>
        </div>
      )}

      {/* Summary table — one row per constituency, not per category,
          so the Minister can see which areas need attention. */}
      <div style={{ border: '1px solid #000', padding: 12, marginBottom: 20, background: '#f9f9f9' }}>
        <p style={{ margin: '0 0 10px', fontWeight: 'bold', fontSize: '11pt' }}>Executive Summary / సారాంశం</p>
        <table>
          <thead>
            <tr>
              <th>Constituency / నియోజకవర్గం</th>
              <th style={{ textAlign: 'center' }}>Total</th>
              <th style={{ textAlign: 'center' }}>Resolved</th>
              <th style={{ textAlign: 'center' }}>Pending</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([name, items]) => {
              const resolved = items.filter((c) => ['Resolved', 'Sanctioned', 'Declined'].includes(c.stage)).length;
              return (
                <tr key={name}>
                  <td>{name}</td>
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

      {/* Constituency-wise detailed list */}
      {Object.entries(grouped).map(([name, items]) => (
        <div key={name} style={{ marginBottom: 24 }}>
          <p style={{ fontWeight: 'bold', fontSize: '11pt', margin: '0 0 8px', borderLeft: '4px solid #000', paddingLeft: 10 }}>
            {name} ({items.length} complaints)
          </p>
          <table>
            <thead>
              <tr>
                <th style={{ width: '8%' }}>Case No.</th>
                <th style={{ width: '13%' }}>Complaint / ఫిర్యాదు</th>
                <th style={{ width: '10%' }}>Category</th>
                <th style={{ width: '13%' }}>Citizen Contact</th>
                <th style={{ width: '10%' }}>Village/Mandal</th>
                <th style={{ width: '8%' }}>Days Pending</th>
                <th style={{ width: '7%' }}>Priority</th>
                <th style={{ width: '13%' }}>Status / స్థితి</th>
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
                  <td style={{ fontSize: '9pt' }}>{categoryLabel(c.category)}</td>
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
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Closing — signed by the actual admin who generated this, not
          any MLA, and with a title that honestly reflects that. */}
      <p style={{ marginTop: 20 }}>I request your goodself to kindly direct the concerned departments for early redressal of pending grievances across these constituencies.</p>
      <p>Thanking you,</p>

      <div className="signature-line">
        <div>
          <p style={{ margin: 0, fontWeight: 'bold' }}>{issuedByName || '________________________'}</p>
          <p style={{ margin: '2px 0 0', fontSize: '10pt' }}>On behalf of the {stateName} Grievance Administration</p>
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
          MPower CTS · {totalCount} complaints across {constituencyCount} constituencies · 
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
  const [cmPhotoUrl, setCmPhotoUrl] = useState(null);
  const [stateName, setStateName] = useState(null);
  // Removed mlaConfigEditing entirely — this used to let staff switch
  // to free-text boxes and type over the correct, real MLA name and
  // constituency with anything at all. A complaint (or a selected
  // batch constituency) only ever has one actually-correct answer,
  // already fetched from real data below — there's no legitimate
  // reason to allow overriding it with arbitrary typed text, only
  // reasons to accidentally get it wrong.
  const [filterStage, setFilterStage] = useState(searchParams.get('status') || '');
  // Renamed from the old filterMandal (a client-side name-text match
  // that was never connected to any UI) to filterMandalId, matching
  // the real, server-side, ID-based pattern every other filter here
  // already uses.
  const [filterConstituencyId, setFilterConstituencyId] = useState(searchParams.get('constituencyId') || '');
  const [filterMandalId, setFilterMandalId] = useState(searchParams.get('mandalId') || '');
  const [filterVillageId, setFilterVillageId] = useState(searchParams.get('villageId') || '');
  const [constituencyOptions, setConstituencyOptions] = useState([]);
  // District/branch — only meaningful for Statewide Summary, narrowing
  // it from "whole state" to "one district's constituencies" — the
  // real middle ground between Batch List's one-constituency and
  // Statewide's default of everything, for a District Collector who
  // needs their own district's picture, not the whole state's.
  const [filterBranchId, setFilterBranchId] = useState('');
  const [branchOptions, setBranchOptions] = useState([]);

  useEffect(() => {
    if (!appId) return;
    supabase.from('branches').select('id, branch_name').eq('app_id', appId).order('branch_name')
      .then(({ data }) => setBranchOptions(data || []))
      .catch(() => setBranchOptions([]));
  }, [appId]);

  // A real MLA/MP office login (role=representative) is tied to
  // exactly one constituency via rep_assignments — auto-fill the
  // filter with their own seat rather than leaving them to manually
  // find themselves in a statewide dropdown. Only runs when nothing
  // was already specified (a URL constituencyId, or an admin who's
  // already picked one manually) — never overrides an explicit choice.
  useEffect(() => {
    if (filterConstituencyId || !tenant || tenant.role !== 'representative') return;
    fetchMyConstituencyId(tenant.userRowId).then((id) => {
      if (id) setFilterConstituencyId(id);
    });
  }, [tenant, filterConstituencyId]);
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

  // FIXED: MLA photo previously came from tenant.photoUrl — whichever
  // staff member happened to be logged in and printing, not a fixed
  // photo for the constituency itself. Removed that useEffect entirely;
  // the photo now comes from the exact same query below that already
  // correctly fetches the real MLA name, so both are always in sync
  // and both come from the one real source of truth.

  // Previously mlaName/constituency were only ever set for single-
  // complaint mode — batch mode's header stayed blank unless someone
  // manually typed it in every time. Now, filtering the batch report
  // to one specific constituency (e.g. via StaffDashboard's "Print
  // this view") correctly fills in that constituency's real MLA name
  // and constituency name in the header automatically.
  useEffect(() => {
    if (printType !== 'staff_batch' || !filterConstituencyId) return;
    supabase.from('constituencies').select('name, rep_name, rep_photo_url').eq('id', filterConstituencyId).single()
      .then(({ data }) => {
        if (data) {
          setConstituency(data.name || '');
          setMlaName(data.rep_name || '');
          if (data.rep_photo_url) {
            getRepPhotoUrl(data.rep_photo_url).then(setMlaPhotoUrl).catch(() => setMlaPhotoUrl(null));
          } else {
            setMlaPhotoUrl(null);
          }
        }
      });
  }, [printType, filterConstituencyId]);

  // CM photo — same private-bucket, signed-URL pattern as the MLA
  // photo. CM_PHOTOS holds a storage path, not a directly-usable URL.
  useEffect(() => {
    const path = stateName && CM_PHOTOS[stateName];
    if (path) {
      getRepPhotoUrl(path).then(setCmPhotoUrl).catch(() => setCmPhotoUrl(null));
    } else {
      setCmPhotoUrl(null);
    }
  }, [stateName]);

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

    // Loading data happens in exactly two situations, never a third
  // implicit one: (1) once here, right when the page first has enough
  // info to act — using whatever the real URL said at that moment
  // (a citizen's own ?case= link, or a batch URL with filters already
  // set) — and (2) explicitly, when Search or Apply Filters is
  // pressed. This effect deliberately depends on appId ALONE, not on
  // printType — so it never re-fires just because a tab was clicked;
  // that ambiguity (loading being triggered by two different things
  // at once) is what let stale data from one print type silently
  // persist and display under a different one.
  useEffect(() => {
    // Confirmed real bug: this used to gate on appId before checking
    // anything else, which blocked EVERY citizen from ever loading
    // their own print page — appId can never resolve for an anonymous
    // citizen session (no tenant, and the route never passes it as a
    // prop), so this returned immediately every single time, and
    // loading stayed true forever. loadSingleComplaint doesn't
    // actually need appId at all — it looks the complaint up by
    // case_no alone. Only the batch/statewide staff paths genuinely
    // need appId, so only those still wait for it.
    if ((printType === 'citizen' || printType === 'staff_single') && urlCaseNo) {
      loadSingleComplaint(urlCaseNo);
      return;
    }
    if (!appId) return;
    if (printType === 'staff_batch') {
      loadBatchComplaints();
    } else if (printType === 'staff_statewide') {
      loadStatewideComplaints();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  // Clicking any of the three print-type tabs always resets to a
  // genuinely blank slate — same rule for all three, no exceptions.
  // Complaint data, MLA name/photo/constituency, every batch filter,
  // and the addressee are all cleared, and the URL's own ?case=
  // parameter is stripped too, so it never keeps claiming a complaint
  // is loaded when it isn't. This requires explicitly searching or
  // selecting again for the new type — deliberate, since a citizen
  // letter and a staff detail view are genuinely different intents
  // even when they happen to reference the same complaint. The
  // didMount guard skips this on the very first render, so it never
  // wipes out the initial load from the effect above.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    setComplaint(null);
    setComplaints([]);
    setConstituency('');
    setMlaName('');
    setMlaPhotoUrl(null);
    setManualCaseNo('');
    setError('');
    setLoading(false);
    setFilterCategory('');
    setFilterSearch('');
    setFilterPriority('');
    setFilterStage('');
    setFilterConstituencyId('');
    setFilterBranchId('');
    setFilterMandalId('');
    setFilterVillageId('');
    setDateFrom('');
    setDateTo('');
    setAddresseeName('');
    setAddresseeRole('District Collector');
    if (searchParams.get('case') || searchParams.get('id')) {
      navigate('/grievance/print', { replace: true });
    }
  }, [printType]);

  async function loadSingleComplaint(targetCaseNo) {
  if (!targetCaseNo) { setLoading(false); return; }
  setLoading(true);
  setError('');
  
  const { data, error: err } = await supabase
    .from('complaints')
    .select('*')
    .eq('case_no', targetCaseNo)
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
    // Batch List for Minister is structurally one MLA's personal
    // letter — the covering paragraph and signature are both written
    // in first person, on behalf of one specific office. A version
    // spanning several constituencies isn't "the same letter with a
    // blank field" — it's a document nobody could honestly sign, since
    // no single MLA represents citizens from several different seats
    // at once. So this is a hard requirement, not a soft warning:
    // refuse to generate at all until scoped to exactly one seat,
    // the same way a citizen's letter can't generate without a real
    // citizen having filed a complaint.
    if (!filterConstituencyId) {
      setError('Select a constituency before generating this report — Batch List for Minister is written as one MLA\u2019s letter, so it must be scoped to exactly one office. For an overview across many constituencies, use Reports instead.');
      setLoading(false);
      return;
    }
    // An MRO's real authority is one MANDAL, not a whole constituency
    // (which usually contains several). Sending them complaints from
    // mandals outside their own would ask them to act on something
    // they have no actual jurisdiction over — same "don't produce a
    // document nobody could honestly act on" principle as the
    // constituency requirement above, just one level narrower.
    if (addresseeRole === 'MRO' && !filterMandalId) {
      setError('An MRO\u2019s authority covers one mandal, not the whole constituency — select which mandal this report is for before generating.');
      setLoading(false);
      return;
    }
    setError('');
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

  // Same query shape as loadBatchComplaints above, deliberately kept
  // as its own separate function rather than a shared helper with a
  // flag — the one thing that must never accidentally leak between
  // them is the constituency requirement itself, and two independent,
  // fully-readable functions make that impossible to get wrong via a
  // missed condition somewhere. The one real addition: constituency
  // names are fetched too, since grouping the output by constituency
  // needs them — loadBatchComplaints never needed this, since it's
  // always scoped to a single, already-known constituency.
  async function loadStatewideComplaints() {
    if (!appId) { setLoading(false); return; }
    setError('');
    setLoading(true);

    // District narrows by first resolving which constituencies
    // actually belong to it — a complaint only ever links to a
    // constituency_id directly, never to a branch/district itself.
    let branchConstituencyIds = null;
    if (filterBranchId) {
      const { data: branchConsts, error: branchErr } = await supabase
        .from('constituencies').select('id').eq('branch_id', filterBranchId);
      if (branchErr) { setError('Failed to resolve this district\u2019s constituencies.'); setLoading(false); return; }
      branchConstituencyIds = (branchConsts || []).map((c) => c.id);
      if (branchConstituencyIds.length === 0) { setComplaints([]); setLoading(false); return; }
    }

    let query = supabase.from('complaints').select('*').eq('app_id', appId).order('created_at', { ascending: false });
    if (branchConstituencyIds) query = query.in('constituency_id', branchConstituencyIds);
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

    const rows = data || [];
    const constituencyIds = [...new Set(rows.map((r) => r.constituency_id).filter(Boolean))];
    const mandalIds = [...new Set(rows.map((r) => r.mandal_id).filter(Boolean))];
    const villageIds = [...new Set(rows.map((r) => r.village_id).filter(Boolean))];
    const citizenIds = [...new Set(rows.map((r) => r.citizen_id).filter(Boolean))];

    const [constRes, mandalRes, villageRes, citizenRes] = await Promise.all([
      constituencyIds.length ? supabase.from('constituencies').select('id, name').in('id', constituencyIds) : { data: [] },
      mandalIds.length ? supabase.from('mandals').select('id, name').in('id', mandalIds) : { data: [] },
      villageIds.length ? supabase.from('villages').select('id, name').in('id', villageIds) : { data: [] },
      citizenIds.length ? supabase.from('citizens').select('id, full_name, phone').in('id', citizenIds) : { data: [] },
    ]);
    const constMap = Object.fromEntries((constRes.data || []).map((c) => [c.id, c.name]));
    const mandalMap = Object.fromEntries((mandalRes.data || []).map((m) => [m.id, m.name]));
    const villageMap = Object.fromEntries((villageRes.data || []).map((v) => [v.id, v.name]));
    const citizenMap = Object.fromEntries((citizenRes.data || []).map((c) => [c.id, c]));

    let enriched = rows.map((r) => ({
      ...r,
      constituencies: r.constituency_id ? { name: constMap[r.constituency_id] } : null,
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
    label: { fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  };

  if (tenantLoading) {
    return (
      <div style={S.page}>
        <div style={S.inner}><p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Loading…</p></div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{PRINT_STYLES}</style>

      <div style={S.inner} className="no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Print / Export</p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0, letterSpacing: -0.5 }}>Complaint Print Centre</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' }}>ఫిర్యాదు ముద్రణ కేంద్రం</p>
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
          <div style={{ display: 'grid', gridTemplateColumns: isStaff ? 'repeat(auto-fit, minmax(150px, 1fr))' : '1fr', gap: 10 }}>
            {[
              { k: 'citizen', icon: '📋', title: 'Representation Letter', sub: 'Citizen → MLA/MP', te: 'పౌరుడి విజ్ఞాపన పత్రం' },
              { k: 'staff_single', icon: '📄', title: 'Single Complaint Detail', sub: 'Staff internal use', te: 'ఒక ఫిర్యాదు వివరాలు' },
              { k: 'staff_batch', icon: '📑', title: 'Batch List for Minister', sub: 'One constituency, one MLA', te: 'మంత్రికి జాబితా' },
              // State-wide roles only — this is a genuinely different
              // document from Batch List above, not a version of it
              // with the constituency requirement relaxed. It can
              // never be signed by any one MLA, so it's only offered
              // to the roles who legitimately see across every
              // constituency in the first place.
              { k: 'staff_statewide', icon: '🗺️', title: 'Statewide Summary for Minister', sub: 'Many constituencies at once', te: 'రాష్ట్రవ్యాప్త సారాంశం', roles: ['grievance_admin', 'developer', 'support'] },
            ].filter((opt) => isStaff || opt.k === 'citizen').filter((opt) => !opt.roles || opt.roles.includes(tenant?.role)).map((opt) => (
              <button key={opt.k} onClick={() => setPrintType(opt.k)} aria-pressed={printType === opt.k} style={{ textAlign: 'left', padding: 14, border: `1px solid ${printType === opt.k ? 'rgba(232,160,32,0.5)' : 'rgba(255,255,255,0.07)'}`, background: printType === opt.k ? 'rgba(232,160,32,0.08)' : '#111113', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                <p style={{ fontSize: 22, margin: '0 0 6px' }}>{opt.icon}</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{opt.title}</p>
                <p style={{ margin: '2px 0', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{opt.sub}</p>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{opt.te}</p>
              </button>
            ))}
          </div>
        </div>
      {isStaff && !urlCaseNo && (
        <div style={{ ...S.card, marginBottom: 14 }}>
          <label style={S.label}>
            Case Number / Complaint ID
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualCaseNo}
              onChange={e => setManualCaseNo(e.target.value)}
              placeholder="GR/2026/000001"
              style={S.input}
            />
            <button
              onClick={() => {
                if (!manualCaseNo.trim()) return;
                navigate(`/grievance/print?case=${encodeURIComponent(manualCaseNo)}`, { replace: true });
                loadSingleComplaint(manualCaseNo.trim());
              }}
              style={{ padding: '9px 18px', background: '#E8A020', color: '#111113', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              Load
            </button>
          </div>
        </div>
      )}
        {/* Config panel */}
        <div style={S.card}>
          <p style={{ ...S.label, marginBottom: 12 }}>Configuration / సెట్టింగ్స్</p>

          {/* MLA/Constituency — only relevant for the two document
              types actually framed around an MLA (the citizen's own
              letter, and the batch report issued in that MLA's name).
              Single Complaint Detail is a purely internal staff record
              of the complaint itself — showing MLA framing on it
              implies an ownership/addressing relationship that
              document was never meant to have. */}
          {isStaff && printType !== 'staff_single' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{mlaName || 'MLA name not set'} · {constituency || 'Constituency not set'}</span>
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

          {(printType === 'staff_batch' || printType === 'staff_statewide') && (
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
              {printType === 'staff_statewide' && (
                <div style={{ marginBottom: 10 }}>
                  <label style={S.label}>District (optional)</label>
                  <select value={filterBranchId} onChange={(e) => setFilterBranchId(e.target.value)} style={S.select}>
                    <option value="">All districts — full statewide summary</option>
                    {branchOptions.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
                  </select>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' }}>
                    Narrows this report to just one district's constituencies — the real scope a District Collector actually needs, rather than the whole state.
                  </p>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={S.label}>Constituency {printType === 'staff_batch' && <span style={{ color: '#E8A020' }}>(required)</span>}</label>
                  <select value={filterConstituencyId} onChange={(e) => { setFilterConstituencyId(e.target.value); setFilterMandalId(''); setFilterVillageId(''); setError(''); }} style={{ ...S.select, border: (printType === 'staff_batch' && !filterConstituencyId) ? '1px solid rgba(232,160,32,0.5)' : S.select.border }}>
                    <option value="">{printType === 'staff_batch' ? 'Select a constituency…' : 'All constituencies'}</option>
                    {constituencyOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {printType === 'staff_batch' && !filterConstituencyId && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' }}>
                      This letter is written as one MLA's own correspondence — it needs exactly one office to be from. For a statewide or multi-constituency overview instead, use Reports.
                    </p>
                  )}
                </div>
                <div>
                  <label style={S.label}>Mandal {addresseeRole === 'MRO' && <span style={{ color: '#E8A020' }}>(required for MRO)</span>}</label>
                  <select value={filterMandalId} onChange={(e) => { setFilterMandalId(e.target.value); setFilterVillageId(''); setError(''); }} disabled={!filterConstituencyId} style={{ ...S.select, opacity: filterConstituencyId ? 1 : 0.5, border: (addresseeRole === 'MRO' && !filterMandalId) ? '1px solid rgba(232,160,32,0.5)' : S.select.border }}>
                    <option value="">{addresseeRole === 'MRO' ? 'Select a mandal…' : 'All mandals'}</option>
                    {mandalOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {addresseeRole === 'MRO' && !filterMandalId && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' }}>
                      An MRO can only act on their own mandal, not the whole constituency.
                    </p>
                  )}
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
              <button onClick={() => printType === 'staff_statewide' ? loadStatewideComplaints() : loadBatchComplaints()} style={{ padding: '8px 18px', background: (printType === 'staff_batch' && (!filterConstituencyId || (addresseeRole === 'MRO' && !filterMandalId))) ? 'rgba(232,160,32,0.3)' : '#E8A020', color: '#111113', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
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
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Loading complaint data...</p>
        )}

        {/* Print preview label */}
        {!loading && !error && (
          <div style={{ background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', borderRadius: 10, padding: '10px 16px', marginBottom: 20 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#E8A020', fontWeight: 500 }}>
              📄 Print preview below — looks exactly like the printed output
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
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
              cmPhotoUrl={cmPhotoUrl}
              stateName={stateName}
            />
          )}
          {printType === 'staff_statewide' && complaints.length > 0 && (
            <StatewideSummaryForMinister
              complaints={complaints}
              addresseeName={addresseeName}
              addresseeRole={addresseeRole}
              filters={{ dateFrom, dateTo, filterCategory, filterStage }}
              cmPhotoUrl={cmPhotoUrl}
              stateName={stateName}
              issuedByName={tenant?.fullName}
              districtName={filterBranchId ? branchOptions.find((b) => b.id === filterBranchId)?.branch_name : null}
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