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

import GrievanceNav from './GrievanceNav';
import { useState, useEffect, useCallback } from 'react';
import { useCitizenAuth } from './useCitizenAuth';
import { useGrievanceTranslations } from './useGrievanceTranslations';
import EvidenceGallery from './EvidenceGallery';
import {
  fetchAppIdBySlug, fetchAppSettings, fetchConstituencies, fetchMandals, fetchVillages, fetchSachivalayams,
  fetchCategories, fetchCategoryTranslations, fetchSubissueTranslations, fetchCategoryDocuments,
  submitComplaint, fetchMyComplaints, fetchComplaintHistory, uploadEvidence, submitFeedback,
} from './grievanceApi';

// Plain emoji, not an icon library — works everywhere with zero new
// dependencies, and is genuinely more scannable than text alone for
// citizens who may not read English or Telugu fluently.
export const CATEGORY_EMOJI = {
  // Education
  'Talliki Vandanam Scheme': '👩‍👧',
  'Sarvepalli Radhakrishnan Vidya Mitra': '🎒',
  'Dokka Seethamma Madhyahana Badi Bhojanam': '🍱',
  'Mana Badi — Mana Bhavishyathu': '🏫',
  'Balika Raksha': '👧',
  'Post Matric Scholarships (Tuition Fee Reimbursement)': '🎓',
  'Post Matric Scholarships (Maintenance Fee)': '🏠',
  'Ambedkar Overseas Vidya Nidhi (AOVN)': '✈️',
  'Abdul Kalam Prathiba Puraskaram': '🏆',
  'NTR Vidyonnathi': '📝',
  'Incentives for Civil Services Examination': '📜',
  // Agriculture and Nutrition
  'Annadata Sukhibhava': '🌾',
  'Bala Sanjeevani': '🥗',
  'Anna Amrutha Hastam': '🤰',
  // Welfare and Housing
  'NTR Bharosa Pension Scheme': '💰',
  'Chandranna Pelli Kanuka': '💍',
  'NTR Housing Scheme': '🏠',
  // Infrastructure
  'Electricity Problems': '⚡',
  'Drinking Water Problem': '💧',
  'Drainage System': '🚰',
  'Roads and Infrastructure': '🛣️',
  // Other
  'Land and Property Disputes': '📋',
  'Other Government Services': '❓',
};

export const STAGE_META = {
  Submitted: { color: '#5B6473', bg: '#5B647320', emoji: '📥' },
  Acknowledged: { color: '#15213A', bg: '#15213A20', emoji: '👀' },
  'In Progress': { color: '#15213A', bg: '#15213A20', emoji: '⏳' },
  Escalated: { color: '#9B3C2E', bg: '#9B3C2E20', emoji: '⬆️' },
  Sanctioned: { color: '#A8762C', bg: '#A8762C20', emoji: '💰' },
  Resolved: { color: '#3E5C45', bg: '#3E5C4520', emoji: '✅' },
  Declined: { color: '#6B5B73', bg: '#6B5B7320', emoji: '💬' },
};

export function StageBadge({ stage }) {
  const meta = STAGE_META[stage] || STAGE_META.Submitted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700,
      color: meta.color, background: meta.bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 13 }}>{meta.emoji}</span>{stage}
    </span>
  );
}

export default function CitizenPortal({ stateSlug }) {
  const [appId, setAppId] = useState(undefined); // undefined = still resolving, null = not found
  const [appSettings, setAppSettings] = useState(null);

  useEffect(() => {
    fetchAppIdBySlug(stateSlug).then(setAppId);
  }, [stateSlug]);

  useEffect(() => {
    if (appId) fetchAppSettings(appId).then(setAppSettings);
  }, [appId]);

  // Auth hook needs a real appId to register a NEW citizen against — but
  // existing citizens logging back in don't need it resolved instantly,
  // so it's safe to call this even while appId is still resolving.
  const auth = useCitizenAuth(appId);
  const language = auth.citizen?.language_pref || appSettings?.default_language || 'English';
  const { t } = useGrievanceTranslations(appId, language);

  if (appId === undefined) return <CenteredNote>Loading…</CenteredNote>;
  if (appId === null) {
    return <CenteredNote>This state isn't set up on this platform yet. Check the link you were given, or contact your local office.</CenteredNote>;
  }
  if (!appSettings) return <CenteredNote>Loading…</CenteredNote>;
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
  village_id: geo.villageId || null,
  mandal_id: geo.mandalId || null,
  constituency_id: geo.constituencyId || null,
    ward_no: wardNo || null,
      membership_id: membershipId || null,
      phone: auth.session.user.phone,
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
  const [showFeedback, setShowFeedback] = useState(false);

  const loadComplaints = useCallback(() => {
    fetchMyComplaints().then(setComplaints);
  }, []);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>{citizen?.full_name || 'Welcome'}</h1>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button onClick={() => setShowFeedback(true)} style={{ fontSize: 12, color: '#15213A', background: 'none', border: 'none', fontWeight: 600 }}>
            💬 Feedback
          </button>
          <button onClick={onSignOut} style={{ fontSize: 12, color: '#5B6473', background: 'none', border: 'none' }}>
            Sign out
          </button>
        </div>
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
            style={{ textAlign: 'left', padding: 14, border: '1px solid #D9D5C8', borderRadius: 8, background: '#fff', display: 'flex', gap: 12, alignItems: 'center' }}
          >
            <span style={{ fontSize: 26, flexShrink: 0 }}>{CATEGORY_EMOJI[c.category] || '📄'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#8B9099', fontFamily: 'monospace' }}>{c.case_no}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
              <div style={{ marginTop: 6 }}><StageBadge stage={c.stage} /></div>
            </div>
          </button>
        ))}
      </div>

      {activeComplaint && (
        <ComplaintDetail complaint={activeComplaint} citizenId={citizen.id} onClose={() => setActiveComplaint(null)} />
      )}

      {showFeedback && (
        <FeedbackWidget
          appId={appId}
          citizenId={citizen.id}
          context="citizen_portal"
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}

export function FeedbackWidget({ appId, citizenId, userId, context, onClose }) {
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      await submitFeedback({ appId, citizenId, userId, rating: rating || null, comments: comments.trim() || null, context });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 22, maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>🙏 Thank you</p>
            <p style={{ fontSize: 13, color: '#5B6473', marginBottom: 16 }}>Your feedback helps improve this system for everyone.</p>
            <button onClick={onClose} style={buttonStyle}>Close</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>💬 How is this app working for you?</p>
            <p style={{ fontSize: 12.5, color: '#5B6473', marginBottom: 14 }}>This is feedback about the app itself — not a complaint.</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  style={{ fontSize: 28, background: 'none', border: 'none', opacity: n <= rating ? 1 : 0.3, cursor: 'pointer' }}
                >
                  ⭐
                </button>
              ))}
            </div>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="What could be better? (optional)"
              rows={3}
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            {error && <p style={{ fontSize: 12, color: '#9B3C2E', marginBottom: 8 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSubmit} disabled={busy} style={{ ...buttonStyle, flex: 1 }}>
                {busy ? 'Sending…' : 'Send feedback'}
              </button>
              <button onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid #D9D5C8', borderRadius: 7, fontSize: 14, fontWeight: 600, color: '#5B6473' }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
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
  const [categoryDocuments, setCategoryDocuments] = useState({});
  const [selectedIssues, setSelectedIssues] = useState([]);
  const [otherDetail, setOtherDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [usedVoice, setUsedVoice] = useState(false);
  const [stagedFiles, setStagedFiles] = useState([]); // evidence attached before the complaint exists yet
  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => {
    Promise.all([
      // Citizens always see every applicable category, regardless of the
      // state's subscription tier — filing a genuine complaint isn't a
      // premium feature. Subscription tier gates STAFF-side tools instead
      // (see report_templates.min_tier for the Reports Dashboard).
      fetchCategories(appId),
      fetchCategoryTranslations(language),
      fetchSubissueTranslations(language),
      fetchCategoryDocuments(appId),
    ]).then(([cats, catT, subT, docs]) => {
      setCategories(cats);
      setCategoryTranslations(catT);
      setSubissueTranslations(subT);
      setCategoryDocuments(docs);
      if (cats.length > 0) setCategoryId(cats[0].id);
    });
  }, [appId, language]);

  const activeCategory = categories.find((c) => c.id === categoryId);

  function toggleIssue(key) {
    setSelectedIssues((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // Voice input — appends spoken text into whichever field's setter is
  // passed in. Uses the browser's built-in speech recognition (Chrome/Edge
  // support this natively) — no separate transcription service needed for
  // this path, which is why transcriptionSource is 'other' on submit.
  function speakInto(setter) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice input needs Chrome or Edge — not supported in this browser.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'Telugu' ? 'te-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setter((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setUsedVoice(true);
    };
    recognition.onerror = () => {};
    recognition.start();
  }

  function handleFileStaged(e) {
    const files = Array.from(e.target.files || []);
    setStagedFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  }

  function removeStagedFile(index) {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !activeCategory) return;
    setBusy(true);
    setError(null);
    try {
      const complaint = await submitComplaint({
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
        inputMode: usedVoice ? 'oral' : 'written',
        language: usedVoice ? language : null,
        transcriptionSource: usedVoice ? 'other' : null,
        issueKeys: selectedIssues,
        otherDetail: otherDetail.trim(),
        byName: citizen.full_name,
      });

      if (stagedFiles.length > 0) {
        setUploadStatus(`Uploading evidence (0/${stagedFiles.length})…`);
        for (let i = 0; i < stagedFiles.length; i++) {
          try {
            await uploadEvidence({ complaintId: complaint.id, file: stagedFiles[i], uploadedByCitizenId: citizen.id });
          } catch (uploadErr) {
            // Don't let a failed photo block the complaint that's already saved
            setError(`Complaint saved, but one file failed to upload: ${uploadErr.message}`);
          }
          setUploadStatus(`Uploading evidence (${i + 1}/${stagedFiles.length})…`);
        }
        setUploadStatus('');
      }

      setTitle('');
      setDescription('');
      setSuggestedSolution('');
      setSelectedIssues([]);
      setOtherDetail('');
      setStagedFiles([]);
      setUsedVoice(false);
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
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required style={{ ...inputStyle, flex: 1 }} />
          <MicButton onClick={() => speakInto(setTitle)} />
        </div>
      </Field>

      <Field label={t('category_label', 'Category')}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 24 }}>{activeCategory ? (CATEGORY_EMOJI[activeCategory.label_en] || '📄') : '📄'}</span>
          <select
            value={categoryId || ''}
            onChange={(e) => { setCategoryId(e.target.value); setSelectedIssues([]); setOtherDetail(''); }}
            style={{ ...inputStyle, flex: 1 }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {CATEGORY_EMOJI[c.label_en] || '📄'} {categoryTranslations[c.id] && categoryTranslations[c.id] !== c.label_en
                  ? `${c.label_en} | ${categoryTranslations[c.id]}`
                  : c.label_en}
              </option>
            ))}
          </select>
        </div>
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

      {activeCategory && categoryDocuments[activeCategory.id]?.length > 0 && (
        <div style={{ background: '#FFF8E8', border: '1px solid #A8762C40', borderRadius: 8, padding: 12 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#A8762C', marginBottom: 6 }}>
            📎 Documents that may help your case (attach as evidence below if you have them):
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#5B4A2A' }}>
            {categoryDocuments[activeCategory.id].map((doc, i) => <li key={i}>{doc}</li>)}
          </ul>
        </div>
      )}

      <Field label={t('priority_label', 'Priority')}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Normal', 'Urgent'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              style={{
                flex: 1, padding: '10px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                border: `2px solid ${priority === p ? (p === 'Urgent' ? '#9B3C2E' : '#15213A') : '#D9D5C8'}`,
                background: priority === p ? (p === 'Urgent' ? '#9B3C2E15' : '#15213A15') : '#fff',
                color: priority === p ? (p === 'Urgent' ? '#9B3C2E' : '#15213A') : '#5B6473',
              }}
            >
              {p === 'Urgent' ? '🚨 Urgent' : '📅 Normal'}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('section3_title', 'Detailed Description')}>
        <div style={{ display: 'flex', gap: 6 }}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={4} style={{ ...inputStyle, flex: 1 }} />
          <MicButton onClick={() => speakInto(setDescription)} />
        </div>
        {usedVoice && <p style={{ fontSize: 11, color: '#3E5C45', marginTop: 4 }}>🎤 Voice input used for this complaint</p>}
      </Field>

      <Field label={t('section4_title', 'Suggested Solution (Optional)')}>
        <textarea value={suggestedSolution} onChange={(e) => setSuggestedSolution(e.target.value)} rows={2} style={inputStyle} />
      </Field>

      <Field label="📷 Evidence — Photo or Video (Optional)">
        <label style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          fontSize: 12.5, fontWeight: 600, padding: '9px 12px', border: '1px dashed #B9B4A3',
          borderRadius: 6, cursor: 'pointer', color: '#15213A',
        }}>
          + Add photo or video
          <input type="file" accept="image/*,video/*" onChange={handleFileStaged} style={{ display: 'none' }} />
        </label>
        {stagedFiles.length > 0 && (
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {stagedFiles.map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: '#F7F6F2', padding: '6px 10px', borderRadius: 6 }}>
                <span>{f.type.startsWith('video') ? '🎥' : '🖼️'} {f.name}</span>
                <button type="button" onClick={() => removeStagedFile(i)} style={{ border: 'none', background: 'none', color: '#9B3C2E', fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </Field>

      {uploadStatus && <p style={{ fontSize: 12, color: '#5B6473' }}>{uploadStatus}</p>}
      {error && <p style={{ color: '#9B3C2E', fontSize: 12.5 }}>{error}</p>}

      <button type="submit" disabled={busy} style={buttonStyle}>
        {busy ? 'Submitting…' : `📮 ${t('submit_button', 'Submit Complaint')}`}
      </button>
    </form>
  );
}

function MicButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Speak instead of typing"
      style={{
        flexShrink: 0, width: 42, border: '1px solid #D9D5C8', borderRadius: 6,
        background: '#F7F6F2', fontSize: 18, cursor: 'pointer',
      }}
    >
      🎤
    </button>
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
        <h3 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>{CATEGORY_EMOJI[complaint.category] || '📄'}</span>{complaint.title}
        </h3>
        // In ComplaintDetail function — after StageBadge line, add:
<div style={{ margin: '8px 0' }}><StageBadge stage={complaint.stage} /></div>

{/* ADD THIS — print button */}
<button
  onClick={() => window.open(`/grievance/print?case=${complaint.case_no}`, '_blank')}
  style={{
    width: '100%', padding: '10px 14px', marginBottom: 12,
    background: '#fff', border: '1px solid #D9D5C8', borderRadius: 8,
    fontSize: 13, fontWeight: 600, color: '#15213A', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  }}
>
  🖨️ Print Representation Letter
</button>

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
    ready: !!constituencyId && !!mandalId,
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
