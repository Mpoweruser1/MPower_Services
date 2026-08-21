// shared/WelfareSchemesPanel.jsx — FINAL
import React, { useState, useEffect } from 'react';
import {
  getStudentWelfareSchemes,
  getPatientWelfareSchemes,
  getGrievanceWelfareSchemes,
  markSchemeIdentified,
} from './WelfareSchemeHelper';

const SCHEME_TYPE_CONFIG = {
  school_scholarship:       { icon: '🎓', color: '#9A8AE0', label: 'Scholarship' },
  school_hostel:            { icon: '🏠', color: '#5A9ADF', label: 'Hostel' },
  school_fee_reimbursement: { icon: '💰', color: '#6AAA90', label: 'Fee Reimbursement' },
  hospital_insurance:       { icon: '🏥', color: '#E8A020', label: 'Health Insurance' },
  hospital_govt_scheme:     { icon: '💊', color: '#6AAA90', label: 'Govt Health Scheme' },
  pension:                  { icon: '👴', color: '#E8A020', label: 'Pension' },
  ration:                   { icon: '🌾', color: '#6AAA90', label: 'Ration' },
  housing:                  { icon: '🏗️', color: '#5A9ADF', label: 'Housing' },
  agriculture:              { icon: '🌱', color: '#6AAA90', label: 'Agriculture' },
  caste_corporation:        { icon: '🏛️', color: '#9A8AE0', label: 'Corporation' },
  grievance_welfare:        { icon: '📋', color: '#E8A020', label: 'Welfare' },
};

const STATUS_CONFIG = {
  identified: { color: '#9A8AE0', label: 'Eligible — not yet applied' },
  applied:    { color: '#E8A020', label: 'Applied' },
  approved:   { color: '#6AAA90', label: 'Approved' },
  rejected:   { color: '#E05A5A', label: 'Rejected' },
  receiving:  { color: '#6AAA90', label: 'Currently receiving' },
  stopped:    { color: '#E05A5A', label: 'Stopped' },
};

export default function WelfareSchemesPanel({
  mode = 'student',
  student = null,
  patient = null,
  category = null,
  appId = null,
  schoolType = null,
  existingSchemes = [],
  onSchemeMarked = null,
  compact = false,
}) {
  const [schemes, setSchemes]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState({});
  const [marking, setMarking]   = useState({});

  useEffect(() => { loadSchemes(); }, [mode, student?.caste_category, student?.religion, student?.annual_income, schoolType, patient?.id, category]);

  async function loadSchemes() {
    setLoading(true);
    let result = [];
    if (mode === 'student' && student)   result = await getStudentWelfareSchemes(student, schoolType);
    else if (mode === 'patient')         result = await getPatientWelfareSchemes();
    else if (mode === 'grievance' && category) result = await getGrievanceWelfareSchemes(category);
    setSchemes(result);
    setLoading(false);
  }

  async function handleMarkIdentified(scheme) {
    if (!student?.id || !appId) return;
    setMarking((m) => ({ ...m, [scheme.id]: true }));
    await markSchemeIdentified(student.id, scheme.id, appId);
    setMarking((m) => ({ ...m, [scheme.id]: false }));
    onSchemeMarked?.(scheme);
  }

  function getExistingStatus(schemeId) {
    return existingSchemes.find((e) => e.scheme_id === schemeId)?.status;
  }

  if (loading) return (
    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', padding: '8px 0' }}>
      Checking welfare eligibility...
    </p>
  );

  if (schemes.length === 0) return null;

  // Compact mode — just show scheme name tags
  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {schemes.slice(0, 4).map((s) => {
          const cfg = SCHEME_TYPE_CONFIG[s.scheme_type] || {};
          return (
            <span key={s.id} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}25`, whiteSpace: 'nowrap' }}>
              {cfg.icon} {s.scheme_name}
            </span>
          );
        })}
        {schemes.length > 4 && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', padding: '3px 0' }}>
            +{schemes.length - 4} more
          </span>
        )}
      </div>
    );
  }

  // Full mode
  return (
    <div style={{ background: 'rgba(154,138,224,0.06)', border: '1px solid rgba(154,138,224,0.2)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>

      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#9A8AE0' }}>
          💡 {schemes.length} welfare scheme{schemes.length > 1 ? 's' : ''} available
        </p>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          {mode === 'student'
            ? 'Based on caste, gender and income · కులం, లింగం మరియు ఆదాయం ఆధారంగా'
            : mode === 'patient'
            ? 'Applicable health schemes — verify eligibility with patient'
            : 'Welfare schemes related to this complaint'}
        </p>
      </div>

      {/* Scheme list */}
      <div style={{ padding: 12 }}>
        {schemes.map((scheme) => {
          const cfg = SCHEME_TYPE_CONFIG[scheme.scheme_type] || { icon: '📌', color: '#E8A020', label: 'Scheme' };
          const isExpanded = expanded[scheme.id];
          const existingStatus = getExistingStatus(scheme.id);

          return (
            <div key={scheme.id} style={{ background: '#111113', borderRadius: 10, marginBottom: 8, overflow: 'hidden', border: `1px solid ${cfg.color}20` }}>

              {/* Row header */}
              <div
                onClick={() => setExpanded((e) => ({ ...e, [scheme.id]: !e[scheme.id] }))}
                style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
              >
                <div style={{ flex: 1, marginRight: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#fff' }}>{scheme.scheme_name}</p>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}25` }}>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 20, background: scheme.scheme_level === 'central' ? 'rgba(90,154,223,0.12)' : 'rgba(106,170,144,0.12)', color: scheme.scheme_level === 'central' ? '#5A9ADF' : '#6AAA90' }}>
                      {scheme.scheme_level === 'central' ? '🇮🇳 Central' : '🏛️ State'}
                    </span>
                  </div>
                  {scheme.scheme_name_telugu && (
                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                      {scheme.scheme_name_telugu}
                    </p>
                  )}
                  {existingStatus && (
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, marginTop: 4, display: 'inline-block', background: `${STATUS_CONFIG[existingStatus]?.color}15`, color: STATUS_CONFIG[existingStatus]?.color }}>
                      {STATUS_CONFIG[existingStatus]?.label}
                    </span>
                  )}
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, flexShrink: 0 }}>
                  {isExpanded ? '▲' : '▼'}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>

                  {/* Benefit */}
                  <div style={{ background: '#1C1C1E', borderRadius: 8, padding: '10px 12px', margin: '12px 0' }}>
                    <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 500, color: '#fff' }}>Benefit / లాభం:</p>
                    <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                      {scheme.benefit_description}
                    </p>
                    {scheme.benefit_description_telugu && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8 }}>
                        {scheme.benefit_description_telugu}
                      </p>
                    )}
                    {scheme.benefit_amount_per_year && (
                      <p style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 600, color: '#6AAA90' }}>
                        ₹{Number(scheme.benefit_amount_per_year).toLocaleString('en-IN')}/year
                      </p>
                    )}
                  </div>

                  {/* Details */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {[
                      { label: 'How to apply', value: scheme.apply_via },
                      { label: 'దరఖాస్తు ఎక్కడ', value: scheme.apply_via_telugu },
                      { label: 'Max income', value: scheme.max_annual_income ? `₹${Number(scheme.max_annual_income).toLocaleString('en-IN')}/yr` : 'No limit' },
                      { label: '75% attendance needed', value: scheme.requires_75_attendance ? '✓ Yes' : '✗ No' },
                    ].filter((i) => i.value).map((item) => (
                      <div key={item.label}>
                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{item.label}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Documents */}
                  {scheme.documents_required?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ margin: '0 0 6px', fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>
                        DOCUMENTS NEEDED · కావలసిన పత్రాలు
                      </p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {scheme.documents_required.map((doc) => (
                          <span key={doc} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            📄 {doc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {mode === 'student' && student?.id && !existingStatus && (
                      <button
                        onClick={() => handleMarkIdentified(scheme)}
                        disabled={marking[scheme.id]}
                        style={{ flex: 1, padding: '8px 0', background: '#9A8AE0', color: '#111113', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}
                      >
                        {marking[scheme.id] ? 'Saving...' : '✓ Mark as identified'}
                      </button>
                    )}
                    {scheme.scheme_url && (
                      <button
                        onClick={() => window.open(`https://${scheme.scheme_url}`, '_blank')}
                        style={{ padding: '8px 14px', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', background: 'transparent', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'Inter, sans-serif' }}
                      >
                        🔗 Apply online
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', background: '#111113' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          ⚠️ Verify eligibility with the scheme authority before applying. · దరఖాస్తు చేసే ముందు అర్హత ధృవీకరించండి.
        </p>
      </div>
    </div>
  );
}