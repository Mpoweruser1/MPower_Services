// src/pages/grievance/CitizenPortal.jsx
//
// Public-facing citizen portal: phone OTP login, one-time profile
// registration, complaint submission (with real category/sub-issue
// checkboxes fetched from the database), and tracking via the masked
// citizen view (no escalation status ever shown).
//
// `appId` is passed in as a prop rather than chosen in the UI — in a real
// deployment this is fixed per state instance (e.g. by subdomain/config),
// not something a citizen picks from a dropdown.

import { useState, useEffect, useCallback } from 'react';
import { useCitizenAuth } from './useCitizenAuth';
import { useGrievanceTranslations } from './useGrievanceTranslations';
import EvidenceGallery from './EvidenceGallery';
import {
  fetchAppSettings, fetchConstituencies, fetchMandals, fetchVillages, fetchSachivalayams,
  fetchCategories, fetchCategoryTranslations, fetchSubissueTranslations,
  submitComplaint, fetchMyComplaints, fetchComplaintHistory,
} from './grievanceApi';

export default function CitizenPortal({ appId }) {
  const auth = useCitizenAuth(appId);
  const [appSettings, setAppSettings] = useState(null);
  const language = auth.citizen?.language_pref || appSettings?.default_language || 'English';
  const { t } = useGrievanceTranslations(appId, language);

  useEffect(() => {
    fetchAppSettings(appId).then(setAppSettings);
  }, [appId]);

  if (auth.loading || !appSettings) return <CenteredNote>Loading…</CenteredNote>;
  if (!auth.isAuthenticated) return <PhoneLogin auth={auth} />;
  if (auth.needsProfile) return <ProfileRegistration appId={appId} appSettings={appSettings} auth={auth} t={t} />;
  return <ComplaintWorkspace appId={appId} appSettings={appSettings} citizen={auth.citizen} language={language} t={t} onSignOut={auth.signOut} />;
}

function CenteredNote({ children }) {
  return <div style={{ padding: 40, textAlign: 'center', color: '#5B6473', fontSize: 14 }}>{children}</div>;
}

/* ---------------------------------------------------------------------
 * Step 1: phone OTP login
 * ------------------------------------------------------------------- */

function PhoneLogin({ auth }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSendCode(e) {
    e.preventDefault();
    setBusy(true);
    await auth.requestOtp(phone);
    setBusy(false);
  }

  async function handleVerify(e) {
    e.preventDefault();
    setBusy(true);
    await auth.verifyOtp(phone, code);
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 360, margin: '60px auto', padding: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Sign in with your phone</h2>
      {!auth.otpSent ? (
        <form onSubmit={handleSendCode} style={{ display: 'grid', gap: 12 }}>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91XXXXXXXXXX"
            required
            style={inputStyle}
          />
          <button type="submit" disabled={busy} style={buttonStyle}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} style={{ display: 'grid', gap: 12 }}>
          <p style={{ fontSize: 13, color: '#5B6473' }}>Enter the code sent to {phone}</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            required
            style={inputStyle}
          />
          <button type="submit" disabled={busy} style={buttonStyle}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      )}
      {auth.error && <p style={{ color: '#9B3C2E', fontSize: 12.5, marginTop: 10 }}>{auth.error}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------
 * Step 2: one-time profile registration (Section 1 of the paper form)
 * ------------------------------------------------------------------- */

function ProfileRegistration({ appId, appSettings, auth, t }) {
  const [fullName, setFullName] = useState('');
  const [fatherHusbandName, setFatherHusbandName] = useState('');
  const [address, setAddress] = useState('');
  const [wardNo, setWardNo] = useState('');
  const [membershipId, setMembershipId] = useState('');
  const geo = useGeographyPicker(appId, appSettings);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    await auth.registerProfile({
      full_name: fullName,
      father_husband_name: fatherHusbandName || null,
      address: address || null,
      ward_no: wardNo || null,
      membership_id: membershipId || null,
      phone: auth.session.user.phone,
      constituency_id: geo.constituencyId,
      mandal_id: geo.mandalId,
      village_id: geo.villageId,
      sachivalayam_id: geo.sachivalayamId || null,
    });
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{t('section1_title', 'Complainant Details')}</h2>
      <p style={{ fontSize: 12.5, color: '#5B6473', marginBottom: 18 }}>One-time — used for every complaint you file.</p>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 13 }}>
        <Field label={t('field_name', 'Name')}>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required style={inputStyle} />
        </Field>
        <Field label={t('field_father_husband_name', "Father's/Husband's Name")}>
          <input value={fatherHusbandName} onChange={(e) => setFatherHusbandName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={t('field_full_address', 'Full Address')}>
          <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={t('field_ward_no', 'Ward No.')}>
          <input value={wardNo} onChange={(e) => setWardNo(e.target.value)} style={inputStyle} />
        </Field>
        <Field label={t('field_membership_id', 'Membership Number (Optional)')}>
          <input value={membershipId} onChange={(e) => setMembershipId(e.target.value)} style={inputStyle} />
        </Field>
        <GeographyFields geo={geo} appSettings={appSettings} />
        <button type="submit" disabled={busy || !geo.ready} style={buttonStyle}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------
 * Step 3: submit + track complaints
 * ------------------------------------------------------------------- */

function ComplaintWorkspace({ appId, appSettings, citizen, language, t, onSignOut }) {
  const [showForm, setShowForm] = useState(true);
  const [complaints, setComplaints] = useState([]);
  const [activeComplaint, setActiveComplaint] = useState(null);

  const loadComplaints = useCallback(() => {
    fetchMyComplaints().then(setComplaints);
  }, []);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>{citizen.full_name}</h1>
        <button onClick={onSignOut} style={{ fontSize: 12, color: '#5B6473', background: 'none', border: 'none' }}>
          Sign out
        </button>
      </div>

      {showForm ? (
        <ComplaintForm
          appId={appId}
          appSettings={appSettings}
          citizen={citizen}
          language={language}
          t={t}
          onSubmitted={() => {
            setShowForm(false);
            loadComplaints();
          }}
        />
      ) : (
        <button onClick={() => setShowForm(true)} style={{ ...buttonStyle, marginBottom: 20 }}>
          {t('new_complaint', 'New complaint')}
        </button>
      )}

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px' }}>
        {t('your_complaints', 'Your complaints')} ({complaints.length})
      </h3>
      <div style={{ display: 'grid', gap: 10 }}>
        {complaints.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveComplaint(c)}
            style={{ textAlign: 'left', padding: 14, border: '1px solid #D9D5C8', borderRadius: 8, background: '#fff' }}
          >
            <div style={{ fontSize: 11, color: '#8B9099', fontFamily: 'monospace' }}>{c.case_no}</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: '#5B6473', marginTop: 4 }}>{c.category} · {c.stage}</div>
          </button>
        ))}
      </div>

      {activeComplaint && (
        <ComplaintDetail complaint={activeComplaint} citizenId={citizen.id} onClose={() => setActiveComplaint(null)} />
      )}
    </div>
  );
}

function ComplaintForm({ appId, appSettings, citizen, language, t, onSubmitted }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [suggestedSolution, setSuggestedSolution] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoryTranslations, setCategoryTranslations] = useState({});
  const [subissueTranslations, setSubissueTranslations] = useState({});
  const [categoryId, setCategoryId] = useState(null);
  const [selectedIssues, setSelectedIssues] = useState([]);
  const [otherDetail, setOtherDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetchCategories(appId),
      fetchCategoryTranslations(language),
      fetchSubissueTranslations(language),
    ]).then(([cats, catT, subT]) => {
      setCategories(cats);
      setCategoryTranslations(catT);
      setSubissueTranslations(subT);
      if (cats.length > 0) setCategoryId(cats[0].id);
    });
  }, [appId, language]);

  const activeCategory = categories.find((c) => c.id === categoryId);

  function toggleIssue(key) {
    setSelectedIssues((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !activeCategory) return;
    setBusy(true);
    setError(null);
    try {
      await submitComplaint({
        citizenId: citizen.id,
        appId,
        constituencyId: citizen.constituency_id,
        mandalId: citizen.mandal_id,
        villageId: citizen.village_id,
        sachivalayamId: citizen.sachivalayam_id,
        title: title.trim(),
        description: description.trim(),
        category: activeCategory.label_en,
        priority,
        suggestedSolution: suggestedSolution.trim(),
        inputMode: 'written',
        language,
        issueKeys: selectedIssues,
        otherDetail: otherDetail.trim(),
        byName: citizen.full_name,
      });
      setTitle('');
      setDescription('');
      setSuggestedSolution('');
      setSelectedIssues([]);
      setOtherDetail('');
      onSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16, border: '1px solid #D9D5C8', borderRadius: 10, padding: 20, marginBottom: 24 }}>
      <Field label="Subject">
        <input value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} />
      </Field>

      <Field label={t('category_label', 'Category')}>
        <select value={categoryId || ''} onChange={(e) => { setCategoryId(e.target.value); setSelectedIssues([]); setOtherDetail(''); }} style={inputStyle}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryTranslations[c.id] && categoryTranslations[c.id] !== c.label_en
                ? `${c.label_en} | ${categoryTranslations[c.id]}`
                : c.label_en}
            </option>
          ))}
        </select>
      </Field>

      {activeCategory && (
        <div style={{ display: 'grid', gap: 6 }}>
          {activeCategory.complaint_subissues.map((issue) => (
            <label key={issue.id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={selectedIssues.includes(issue.subissue_key)} onChange={() => toggleIssue(issue.subissue_key)} />
              {subissueTranslations[issue.id] && subissueTranslations[issue.id] !== issue.label_en
                ? `${issue.label_en} | ${subissueTranslations[issue.id]}`
                : issue.label_en}
            </label>
          ))}
          {selectedIssues.includes('other') && (
            <input value={otherDetail} onChange={(e) => setOtherDetail(e.target.value)} placeholder="Please specify" style={inputStyle} />
          )}
        </div>
      )}

      <Field label={t('priority_label', 'Priority')}>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
          <option>Normal</option>
          <option>Urgent</option>
        </select>
      </Field>

      <Field label={t('section3_title', 'Detailed Description')}>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4} style={inputStyle} />
      </Field>

      <Field label={t('section4_title', 'Suggested Solution (Optional)')}>
        <textarea value={suggestedSolution} onChange={(e) => setSuggestedSolution(e.target.value)} rows={2} style={inputStyle} />
      </Field>

      {error && <p style={{ color: '#9B3C2E', fontSize: 12.5 }}>{error}</p>}

      <button type="submit" disabled={busy} style={buttonStyle}>
        {busy ? 'Submitting…' : t('submit_button', 'Submit Complaint')}
      </button>
    </form>
  );
}

function ComplaintDetail({ complaint, citizenId, onClose }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    fetchComplaintHistory(complaint.id).then(setHistory);
  }, [complaint.id]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 380, background: '#fff', height: '100%', padding: 20, overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ float: 'right', border: 'none', background: 'none' }}>✕</button>
        <div style={{ fontSize: 11, color: '#8B9099', fontFamily: 'monospace' }}>{complaint.case_no}</div>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>{complaint.title}</h3>
        <p style={{ fontSize: 13, color: '#3A4250', margin: '10px 0' }}>{complaint.description}</p>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginTop: 20 }}>History</h4>
        {/* Only 'public' visibility rows ever reach this list — RLS enforces
            that server-side, this component doesn't filter anything itself. */}
        {history.map((h) => (
          <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid #EFEDE6' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{h.stage}</div>
            <div style={{ fontSize: 11, color: '#8B9099' }}>{h.by_name} · {new Date(h.created_at).toLocaleString()}</div>
            {h.note && <div style={{ fontSize: 12.5, marginTop: 3 }}>{h.note}</div>}
          </div>
        ))}
        <EvidenceGallery complaintId={complaint.id} uploaderCitizenId={citizenId} canUpload />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
 * Shared geography cascading-dropdown logic
 * ------------------------------------------------------------------- */

function useGeographyPicker(appId, appSettings) {
  const [constituencies, setConstituencies] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [villages, setVillages] = useState([]);
  const [sachivalayams, setSachivalayams] = useState([]);
  const [constituencyId, setConstituencyId] = useState('');
  const [mandalId, setMandalId] = useState('');
  const [villageId, setVillageId] = useState('');
  const [sachivalayamId, setSachivalayamId] = useState('');

  useEffect(() => {
    fetchConstituencies(appId).then((list) => {
      setConstituencies(list);
      if (list.length) setConstituencyId(list[0].id);
    });
  }, [appId]);

  useEffect(() => {
    if (!constituencyId) return;
    fetchMandals(constituencyId).then((list) => {
      setMandals(list);
      setMandalId(list[0]?.id || '');
    });
  }, [constituencyId]);

  useEffect(() => {
    if (!mandalId) return;
    fetchVillages(mandalId).then((list) => {
      setVillages(list);
      setVillageId(list[0]?.id || '');
    });
  }, [mandalId]);

  useEffect(() => {
    if (!villageId || !appSettings?.has_sachivalayam) {
      setSachivalayams([]);
      setSachivalayamId('');
      return;
    }
    fetchSachivalayams(villageId).then((list) => {
      setSachivalayams(list);
      setSachivalayamId(list[0]?.id || '');
    });
  }, [villageId, appSettings]);

  return {
    constituencies, mandals, villages, sachivalayams,
    constituencyId, setConstituencyId,
    mandalId, setMandalId,
    villageId, setVillageId,
    sachivalayamId, setSachivalayamId,
    ready: !!constituencyId && !!mandalId && !!villageId,
  };
}

function GeographyFields({ geo, appSettings }) {
  return (
    <>
      <Field label="Constituency">
        <select value={geo.constituencyId} onChange={(e) => geo.setConstituencyId(e.target.value)} style={inputStyle}>
          {geo.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.rep_name}</option>)}
        </select>
      </Field>
      <Field label="Mandal">
        <select value={geo.mandalId} onChange={(e) => geo.setMandalId(e.target.value)} style={inputStyle}>
          {geo.mandals.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Village">
        <select value={geo.villageId} onChange={(e) => geo.setVillageId(e.target.value)} style={inputStyle}>
          {geo.villages.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </Field>
      {appSettings?.has_sachivalayam && geo.sachivalayams.length > 0 && (
        <Field label="Sachivalayam">
          <select value={geo.sachivalayamId} onChange={(e) => geo.setSachivalayamId(e.target.value)} style={inputStyle}>
            {geo.sachivalayams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      )}
    </>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6473' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  border: '1px solid #D9D5C8',
  borderRadius: 6,
  padding: '9px 11px',
  fontSize: 13.5,
  width: '100%',
};

const buttonStyle = {
  background: '#15213A',
  color: '#fff',
  border: 'none',
  borderRadius: 7,
  padding: '11px 16px',
  fontSize: 14,
  fontWeight: 600,
};
