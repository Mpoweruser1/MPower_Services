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

import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useCitizenAuth } from './useCitizenAuth';
import { useGrievanceTranslations } from './useGrievanceTranslations';
import EvidenceGallery from './EvidenceGallery';
import { FeedbackWidget } from '../shared/FeedbackWidget';
import {
  fetchAppIdBySlug, fetchAppSettings, fetchConstituencies, fetchMandals, fetchVillages, fetchSachivalayams,
  createMandal, createVillage,
  fetchCategories, fetchCategoryTranslations, fetchSubissueTranslations, fetchCategoryDocuments,
  submitComplaint, checkDailyComplaintLimit, fetchMyComplaints, fetchComplaintHistory, uploadEvidence,
  fetchConstituencyRep,
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
  Submitted: { color: '#64748b', bg: '#64748b20', emoji: '📥' },
  Acknowledged: { color: '#1a1a2e', bg: '#1a1a2e20', emoji: '👀' },
  'In Progress': { color: '#1a1a2e', bg: '#1a1a2e20', emoji: '⏳' },
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
    return <CenteredNote showHomeLink>This state isn't set up on this platform yet. Check the link you were given, or contact your local office.</CenteredNote>;
  }
  if (!appSettings) return <CenteredNote>Loading…</CenteredNote>;

  return (
    <>
      <CitizenTopBar
        stateSlug={stateSlug}
        citizenName={auth.isAuthenticated && !auth.needsProfile ? auth.citizen?.full_name : null}
        onSignOut={auth.isAuthenticated && !auth.needsProfile ? auth.signOut : null}
      />
      {!auth.isAuthenticated ? (
        <PhoneLogin auth={auth} />
      ) : auth.needsProfile ? (
        <ProfileRegistration appId={appId} appSettings={appSettings} auth={auth} t={t} />
      ) : (
        <ComplaintWorkspace appId={appId} appSettings={appSettings} citizen={auth.citizen} language={language} t={t} />
      )}
    </>
  );
}

// Shown on every citizen screen — login, profile setup, and the complaint
// workspace alike — so there's always a way back to the module's home
// page and somewhere to get help. Uses CtsLanding's own navy/gold
// branding so the transition from the landing page doesn't feel like a
// different app.
// citizenName/onSignOut are only passed once a citizen is actually
// logged in (from ComplaintWorkspace) -- login and profile-setup
// screens render this same bar without them, so it degrades cleanly
// to just the logo+Home. This is now the ONE place sign-out and the
// citizen's name are shown, instead of being duplicated a further two
// times further down the page in different, inconsistent styles.
function CitizenTopBar({ stateSlug, citizenName, onSignOut }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: '#1a1a2e' }}>
      <button
        onClick={() => navigate(`/grievance/${stateSlug}?switch=1`)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' }}
      >
        <div style={{ width: 26, height: 26, borderRadius: 6, background: '#e8a020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#1a1a2e', fontSize: 13 }}>M</div>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>MPower CTS · Home</span>
      </button>
      {onSignOut && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {citizenName && (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{citizenName}</span>
          )}
          <button
            onClick={onSignOut}
            style={{ fontSize: 11.5, padding: '5px 12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function CenteredNote({ children, showHomeLink }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
      {children}
      {showHomeLink && (
        <div style={{ marginTop: 16 }}>
          <a href="/" style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 600, textDecoration: 'underline' }}>
            ← Back to home
          </a>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------
 * Step 1: phone OTP login
 * ------------------------------------------------------------------- */

function PhoneLogin({ auth }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function handleSendCode(e) {
    e.preventDefault();
    setBusy(true);
    const ok = await auth.requestOtp(phone);
    if (ok) setResendCooldown(30);
    setBusy(false);
  }

  async function handleResend() {
    if (resendCooldown > 0 || busy) return;
    setBusy(true);
    const ok = await auth.requestOtp(phone);
    if (ok) setResendCooldown(30);
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
      {auth.otpBypassActive && (
        <div style={{ background: '#FFF3CD', border: '1px solid #E8A020', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: '#7A5A00', fontWeight: 600 }}>
          ⚠️ TEST MODE — OTP verification is bypassed (VITE_SKIP_OTP). Never active in production.
        </div>
      )}
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
          <p style={{ fontSize: 13, color: '#64748b' }}>Enter the code sent to {phone}</p>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || busy}
              style={{ background: 'none', border: 'none', padding: 0, color: resendCooldown > 0 ? '#64748b' : '#1a1a2e', fontWeight: 600, cursor: resendCooldown > 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => { auth.resetOtp(); setCode(''); }}
              style={{ background: 'none', border: 'none', padding: 0, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Wrong number?
            </button>
          </div>
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
  const [saveError, setSaveError] = useState('');
  // A citizen's details go straight onto an official document later
  // (the print letter) — a mistake here previously had no chance to be
  // caught before it was saved. This review step shows exactly what
  // was entered and requires a second, explicit confirmation before
  // anything is actually submitted.
  const [showReview, setShowReview] = useState(false);
  // Shown once the citizen reaches the review screen with a real
  // constituency chosen — their actual MLA, not a generic message.
  const [rep, setRep] = useState(null);

  function handleContinue(e) {
    e.preventDefault();
    setShowReview(true);
  }

  async function handleConfirm() {
    setBusy(true);
    setSaveError('');
    try {
      // A caught error alone isn't enough — if the network request
      // never actually completes (hangs with no response at all,
      // rather than failing quickly), await would wait forever and
      // no catch or finally block ever runs, since nothing ever
      // settles. This forces a decision after 15 seconds either way.
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 15000)
      );
      const result = await Promise.race([
        auth.registerProfile({
          full_name: fullName,
          father_husband_name: fatherHusbandName || null,
          address: address || null,
          village_id: geo.villageId || null,
          mandal_id: geo.mandalId || null,
          constituency_id: geo.constituencyId || null,
          ward_no: wardNo || null,
          membership_id: membershipId || null,
          sachivalayam_id: geo.sachivalayamId || null,
        }),
        timeout,
      ]);
      if (!result) {
        setSaveError('Could not save your details. Please check your connection and try again.');
      }
    } catch (err) {
      if (err.message === 'timeout') {
        setSaveError('This is taking longer than expected. Please check your connection and try again — if it keeps happening, wait a few minutes before retrying.');
      } else if (err.code === '23505') {
        // A real, confirmed possibility given the timeout fix above:
        // the original save can still succeed in the background after
        // the 15-second timeout already gave up and let the citizen
        // retry. The citizens table has a real unique constraint on
        // auth_id (confirmed directly, not assumed), so that retry
        // fails safely here rather than creating a duplicate — but a
        // generic "try again" would trap them in a loop that can never
        // succeed, since a profile already exists. This tells them
        // what's actually true instead.
        setSaveError('It looks like your details may already be saved from a moment ago. Please go back and check, or continue to the next step.');
      } else {
        setSaveError('Something went wrong while saving. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!showReview || !geo.constituencyId) { setRep(null); return; }
    fetchConstituencyRep(geo.constituencyId).then(setRep).catch(() => setRep(null));
  }, [showReview, geo.constituencyId]);

  if (showReview) {
    const constituencyName = geo.constituencies.find((c) => c.id === geo.constituencyId)?.name;
    const mandalName = geo.mandals.find((m) => m.id === geo.mandalId)?.name;
    const villageName = geo.villages.find((v) => v.id === geo.villageId)?.name;
    const sachivalayamName = geo.sachivalayams.find((s) => s.id === geo.sachivalayamId)?.name;

    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Review your details</h2>
        <p style={{ fontSize: 12.5, color: '#64748b', marginBottom: 18 }}>Please check everything carefully — this is used on every complaint you file.</p>
        {rep && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            {rep.repPhotoUrl && (
              <img src={rep.repPhotoUrl} alt="Your representative" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e8a020' }} />
            )}
            <div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Your representative</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{rep.repName || 'Not yet listed'}</div>
            </div>
          </div>
        )}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, display: 'grid', gap: 10, marginBottom: 18 }}>
          {[
            [t('field_name', 'Name'), fullName],
            [t('field_father_husband_name', "Father's/Husband's Name"), fatherHusbandName],
            [t('field_full_address', 'Full Address'), address],
            [t('field_ward_no', 'Ward No.'), wardNo],
            [t('field_membership_id', 'Membership Number'), membershipId],
            ['Constituency', constituencyName],
            ['Mandal', mandalName],
            ['Village', villageName],
            ...(sachivalayamName ? [['Sachivalayam', sachivalayamName]] : []),
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 14, color: '#1a1a2e' }}>{value}</div>
            </div>
          ))}
        </div>
        {saveError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#991b1b' }}>
            ⚠ {saveError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setShowReview(false)} style={{ flex: 1, background: 'none', border: '1px solid #e2e8f0', borderRadius: 7, padding: '11px 16px', fontSize: 14, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>
            ← Edit
          </button>
          <button type="button" onClick={handleConfirm} disabled={busy} style={{ ...buttonStyle, flex: 1 }}>
            {busy ? 'Saving…' : 'Confirm & Continue'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{t('section1_title', 'Complainant Details')}</h2>
      <p style={{ fontSize: 12.5, color: '#64748b', marginBottom: 18 }}>One-time — used for every complaint you file.</p>
      <form onSubmit={handleContinue} style={{ display: 'grid', gap: 13 }}>
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
        <GeographyFields geo={geo} appSettings={appSettings} suggestedBy={auth?.citizen?.id} />
        <button type="submit" disabled={!geo.ready} style={buttonStyle}>
          Continue
        </button>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------
 * Step 3: submit + track complaints
 * ------------------------------------------------------------------- */

function ComplaintWorkspace({ appId, appSettings, citizen, language, t }) {
  const [showForm, setShowForm] = useState(false);
  const [complaints, setComplaints] = useState([]);
  const [activeComplaint, setActiveComplaint] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  // Same representative info shown during registration review, now
  // persistent here — a citizen's own MLA, once known.
  const [rep, setRep] = useState(null);

  useEffect(() => {
    if (!citizen?.constituency_id) return;
    fetchConstituencyRep(citizen.constituency_id).then(setRep).catch(() => setRep(null));
  }, [citizen?.constituency_id]);

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
        {/* Sign out moved into the shared CitizenTopBar above -- this
            was a second, differently-styled sign-out button repeating
            the same action, right below the first. Feedback stays
            here since it's a real page action, not navigation. */}
        <button onClick={() => setShowFeedback(true)} style={{ fontSize: 12, color: '#1a1a2e', background: 'none', border: 'none', fontWeight: 600 }}>
          💬 Feedback
        </button>
      </div>

      {rep && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          {rep.repPhotoUrl && (
            <img src={rep.repPhotoUrl} alt="Your representative" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e8a020' }} />
          )}
          <div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Your representative</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{rep.repName || 'Not yet listed'}</div>
          </div>
        </div>
      )}

      {showForm ? (
        <ComplaintForm
          appId={appId}
          appSettings={appSettings}
          citizen={citizen}
          language={language}
          t={t}
          onCancel={() => setShowForm(false)}
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
            style={{ textAlign: 'left', padding: 14, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', display: 'flex', gap: 12, alignItems: 'center' }}
          >
            <span style={{ fontSize: 26, flexShrink: 0 }}>{CATEGORY_EMOJI[c.category] || '📄'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{c.case_no}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
              <div style={{ marginTop: 6 }}><StageBadge stage={c.stage} /></div>
            </div>
          </button>
        ))}
      </div>

      {/* Third nav row (Home + Sign out) removed -- both already live
          in the shared CitizenTopBar at the top of this same page,
          styled consistently with every other screen in this flow. */}

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

/* FeedbackWidget moved to shared/FeedbackWidget.jsx — genuinely
   generic, needed by School/Hospital too, not just CTS. */

function ComplaintForm({ appId, appSettings, citizen, language, t, onCancel, onSubmitted }) {
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
  // Same reasoning as the profile registration review step — this
  // becomes the actual printed letter to an MLA/MP later, so it's
  // worth one real chance to check everything before it's saved.
  const [showReview, setShowReview] = useState(false);

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

  function handleContinue(e) {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !activeCategory) return;
    setShowReview(true);
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const { limitReached, count } = await checkDailyComplaintLimit(citizen.id);
      if (limitReached) {
        setError(`You've reached the limit of 3 complaints per day (${count} filed today). Please try again tomorrow.`);
        setBusy(false);
        return;
      }

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
      setShowReview(false);
      onSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (showReview) {
    const issueLabels = activeCategory?.complaint_subissues
      ?.filter((i) => selectedIssues.includes(i.subissue_key))
      .map((i) => i.label_en) || [];

    return (
      <div style={{ display: 'grid', gap: 16, border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Review your complaint</h3>
        <p style={{ fontSize: 12.5, color: '#64748b', margin: '-10px 0 0' }}>Please check everything before submitting.</p>
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, display: 'grid', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Subject</div>
            <div style={{ fontSize: 14, color: '#1a1a2e' }}>{title}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Category</div>
            <div style={{ fontSize: 14, color: '#1a1a2e' }}>{CATEGORY_EMOJI[activeCategory?.label_en] || '📄'} {activeCategory?.label_en}</div>
          </div>
          {issueLabels.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Specific issues</div>
              <div style={{ fontSize: 14, color: '#1a1a2e' }}>{issueLabels.join(', ')}{otherDetail ? ` — ${otherDetail}` : ''}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Priority</div>
            <div style={{ fontSize: 14, color: '#1a1a2e' }}>{priority === 'Urgent' ? '🚨 Urgent' : '📅 Normal'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Description</div>
            <div style={{ fontSize: 14, color: '#1a1a2e' }}>{description}</div>
          </div>
          {suggestedSolution && (
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Suggested Solution</div>
              <div style={{ fontSize: 14, color: '#1a1a2e' }}>{suggestedSolution}</div>
            </div>
          )}
          {stagedFiles.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Evidence attached</div>
              <div style={{ fontSize: 14, color: '#1a1a2e' }}>{stagedFiles.length} file(s)</div>
            </div>
          )}
        </div>

        {uploadStatus && <p style={{ fontSize: 12, color: '#64748b' }}>{uploadStatus}</p>}
        {error && <p style={{ color: '#9B3C2E', fontSize: 12.5 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setShowReview(false)} disabled={busy} style={{ flex: 1, background: 'none', border: '1px solid #e2e8f0', borderRadius: 7, padding: '11px 16px', fontSize: 14, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>
            ← Edit
          </button>
          <button type="button" onClick={handleConfirm} disabled={busy} style={{ ...buttonStyle, flex: 1 }}>
            {busy ? 'Submitting…' : `📮 Confirm & ${t('submit_button', 'Submit Complaint')}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleContinue} style={{ display: 'grid', gap: 16, border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 24 }}>
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
              aria-pressed={priority === p}
              style={{
                flex: 1, padding: '10px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                border: `2px solid ${priority === p ? (p === 'Urgent' ? '#9B3C2E' : '#1a1a2e') : '#e2e8f0'}`,
                background: priority === p ? (p === 'Urgent' ? '#9B3C2E15' : '#1a1a2e15') : '#fff',
                color: priority === p ? (p === 'Urgent' ? '#9B3C2E' : '#1a1a2e') : '#64748b',
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
          fontSize: 12.5, fontWeight: 600, padding: '9px 12px', border: '1px dashed #cbd5e1',
          borderRadius: 6, cursor: 'pointer', color: '#1a1a2e',
        }}>
          + Add photo or video
          <input type="file" accept="image/*,video/*" onChange={handleFileStaged} style={{ display: 'none' }} />
        </label>
        {stagedFiles.length > 0 && (
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {stagedFiles.map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: '#f8fafc', padding: '6px 10px', borderRadius: 6 }}>
                <span>{f.type.startsWith('video') ? '🎥' : '🖼️'} {f.name}</span>
                <button type="button" onClick={() => removeStagedFile(i)} aria-label={`Remove ${f.name}`} style={{ border: 'none', background: 'none', color: '#9B3C2E', fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </Field>

      {uploadStatus && <p style={{ fontSize: 12, color: '#64748b' }}>{uploadStatus}</p>}
      {error && <p style={{ color: '#9B3C2E', fontSize: 12.5 }}>{error}</p>}

      <button type="submit" style={buttonStyle}>
        Review & {t('submit_button', 'Submit Complaint')} →
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={busy} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: '8px 0' }}>
          Cancel
        </button>
      )}
      {/* Home + Sign out row removed here too -- same reasoning as
          ComplaintWorkspace: the shared CitizenTopBar above already
          persists across this screen (it wraps the whole citizen
          flow, form included), so this was a third repeated copy. */}
    </form>
  );
}

function MicButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Speak instead of typing"
      aria-label="Speak instead of typing"
      style={{
        flexShrink: 0, width: 42, border: '1px solid #e2e8f0', borderRadius: 6,
        background: '#f8fafc', fontSize: 18, cursor: 'pointer',
      }}
    >
      🎤
    </button>
  );
}

function ComplaintDetail({ complaint, citizenId, onClose }) {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    fetchComplaintHistory(complaint.id).then(setHistory);
  }, [complaint.id]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 380, background: '#fff', height: '100%', padding: 20, overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" style={{ float: 'right', border: 'none', background: 'none' }}>✕</button>
        <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{complaint.case_no}</div>
        <h3 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>{CATEGORY_EMOJI[complaint.category] || '📄'}</span>{complaint.title}
        </h3>
        <div style={{ margin: '8px 0' }}><StageBadge stage={complaint.stage} /></div>

        <button
          onClick={() => navigate(`/grievance/print?case=${encodeURIComponent(complaint.case_no)}`)}
          style={{
            width: '100%', padding: '10px 14px', marginBottom: 12,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
            fontSize: 13, fontWeight: 600, color: '#1a1a2e', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          🖨️ Print Representation Letter
        </button>

        <p style={{ fontSize: 13, color: '#374151', margin: '10px 0' }}>{complaint.description}</p>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginTop: 20 }}>History</h4>
        {/* Only 'public' visibility rows ever reach this list — RLS enforces
            that server-side, this component doesn't filter anything itself. */}
        {history.map((h) => (
          <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{h.stage}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{toTitleCase(h.by_name)} · {new Date(h.created_at).toLocaleString()}</div>
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
  const [addingMandal, setAddingMandal] = useState(false);
  const [addingVillage, setAddingVillage] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    fetchConstituencies(appId, 'MLA').then((list) => {
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

  // A citizen's mandal/village genuinely isn't in the list yet — add it,
  // select it immediately (they aren't blocked mid-form waiting on
  // approval), and mark it user_suggested so staff reviewing complaints
  // later can tell it wasn't from the official LGD list.
  async function addMandal(name, suggestedBy) {
    setAddError('');
    setAddingMandal(true);
    try {
      const created = await createMandal({ constituencyId, name, suggestedBy });
      setMandals((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
      setMandalId(created.id);
      return created;
    } catch (err) {
      setAddError(err.message || 'Could not add that mandal. Please try again.');
      return null;
    } finally {
      setAddingMandal(false);
    }
  }

  async function addVillage(name, suggestedBy) {
    setAddError('');
    setAddingVillage(true);
    try {
      const created = await createVillage({ mandalId, name, suggestedBy });
      setVillages((prev) => (prev.some((v) => v.id === created.id) ? prev : [...prev, created]));
      setVillageId(created.id);
      return created;
    } catch (err) {
      setAddError(err.message || 'Could not add that village. Please try again.');
      return null;
    } finally {
      setAddingVillage(false);
    }
  }

  return {
    constituencies, mandals, villages, sachivalayams,
    constituencyId, setConstituencyId,
    mandalId, setMandalId,
    villageId, setVillageId,
    sachivalayamId, setSachivalayamId,
    addMandal, addVillage, addingMandal, addingVillage, addError,
    ready: !!constituencyId && !!mandalId,
  };
}

function GeographyFields({ geo, appSettings, suggestedBy }) {
  return (
    <>
      <Field label="Constituency">
        <select value={geo.constituencyId} onChange={(e) => geo.setConstituencyId(e.target.value)} style={inputStyle}>
          {geo.constituencies.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.rep_name}</option>)}
        </select>
      </Field>
      <Field label="Mandal">
        <EditableCombobox
          value={geo.mandalId}
          options={geo.mandals}
          onSelect={geo.setMandalId}
          onCreate={(name) => geo.addMandal(name, suggestedBy)}
          placeholder="Type your mandal name"
          creating={geo.addingMandal}
        />
      </Field>
      <Field label="Village">
        <EditableCombobox
          value={geo.villageId}
          options={geo.villages}
          onSelect={geo.setVillageId}
          onCreate={(name) => geo.addVillage(name, suggestedBy)}
          placeholder="Type your village name"
          creating={geo.addingVillage}
        />
      </Field>
      {geo.addError && (
        <p style={{ fontSize: 12, color: '#9B3C2E', margin: '-8px 0 4px' }}>{geo.addError}</p>
      )}
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

// Single input that both filters the existing list as you type and, when
// nothing matches, offers to add the typed name as a new entry — same
// interaction as GOV.UK's / USWDS's combo box component, adapted for a
// dependent list (village options depend on which mandal is selected).
function EditableCombobox({ value, options, onSelect, onCreate, placeholder, creating }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  useEffect(() => { setQuery(''); }, [value]);

  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? options.filter((o) => o.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : options;
  const hasExactMatch = options.some((o) => o.name.toLowerCase() === trimmedQuery.toLowerCase());

  async function handleCreate() {
    if (!trimmedQuery || creating) return;
    await onCreate(trimmedQuery);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={open ? query : (selected?.name || '')}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => {
          // Previously, typing a name and leaving without explicitly
          // clicking the matching option silently discarded it and
          // reverted to whatever was already selected — with zero
          // warning this happened. If what was typed exactly matches a
          // real option, honor that as a real selection now instead.
          if (trimmedQuery) {
            const exact = options.find((o) => o.name.toLowerCase() === trimmedQuery.toLowerCase());
            if (exact && exact.id !== value) onSelect(exact.id);
          }
          setOpen(false);
        }, 150)}
        placeholder={placeholder}
        style={inputStyle}
      />
      {open && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          {filtered.map((o) => (
            <div
              key={o.id}
              onMouseDown={() => { onSelect(o.id); setOpen(false); }}
              style={{ padding: '8px 11px', cursor: 'pointer', fontSize: 13.5 }}
            >
              {o.name}{o.user_suggested ? ' *' : ''}
            </div>
          ))}
          {trimmedQuery && !hasExactMatch && (
            <div
              onMouseDown={handleCreate}
              style={{ padding: '8px 11px', cursor: creating ? 'default' : 'pointer', fontSize: 13.5, color: '#1a1a2e', fontWeight: 600, borderTop: filtered.length ? '1px solid #e2e8f0' : 'none' }}
            >
              {creating ? 'Adding…' : `+ Add "${trimmedQuery}" as new`}
            </div>
          )}
          {filtered.length === 0 && !trimmedQuery && (
            <div style={{ padding: '8px 11px', fontSize: 12, color: '#64748b' }}>Type to search or add one</div>
          )}
        </div>
      )}
    </div>
  );
}

// A citizen typing their own name doesn't always capitalize it —
// display-only, never changes the stored value.
function toTitleCase(str) {
  if (!str) return str;
  return str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '9px 11px',
  fontSize: 13.5,
  width: '100%',
};

const buttonStyle = {
  background: '#1a1a2e',
  color: '#e8a020',
  border: 'none',
  borderRadius: 7,
  padding: '11px 16px',
  fontSize: 14,
  fontWeight: 600,
};
