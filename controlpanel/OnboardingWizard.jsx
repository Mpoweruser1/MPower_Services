// controlpanel/OnboardingWizard.jsx — restyled to match the current dark-theme standard
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import ControlPanelNav from '../shared/ControlPanelNav';
import NextActions from '../shared/NextActions';
import { ScreenVideoButton } from '../shared/HelpWidget';
import BugReporter from '../shared/BugReporter';

const STEPS = ['Account', 'Org info', 'Classes/Depts', 'Fee/Billing setup', 'Users', 'Hardware'];

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 680, margin: '0 auto', padding: '24px 20px' },
  input: { padding: '10px 14px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
};

export default function OnboardingWizard({ clientId }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgInfo, setOrgInfo] = useState({ name: '', district: '', contactPerson: '', phone: '' });
  const [ackPhone, setAckPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [ackComplete, setAckComplete] = useState(false);
  const [ackNumber, setAckNumber] = useState(null);

  useEffect(() => { if (clientId) loadProgress(); else setLoading(false); }, [clientId]);

  async function loadProgress() {
    setLoading(true);
    const { data: client } = await supabase.from('crm_clients').select('*').eq('id', clientId).single();
    if (client) setOrgInfo({ name: client.org_name || '', district: client.district || '', contactPerson: client.contact_person || '', phone: client.phone || '' });

    const { data: progress } = await supabase.from('setup_wizard_progress').select('*').eq('client_id', clientId).order('step_number', { ascending: false }).limit(1).single();
    if (progress) setStep(Math.min(progress.step_number + 1, STEPS.length));

    const { data: onboarding } = await supabase.from('client_onboarding').select('ack_signed').eq('client_id', clientId).maybeSingle();
    if (onboarding?.ack_signed) setAckComplete(true);
    setLoading(false);
  }

  async function saveStepProgress(stepNumber, stepName, snapshot) {
    await supabase.from('setup_wizard_progress').upsert(
      { client_id: clientId, step_number: stepNumber, step_name: stepName, status: 'done', completed_at: new Date().toISOString(), data_snapshot: snapshot },
      { onConflict: 'client_id,step_number' }
    );
  }

  async function next() {
    setSaving(true);
    if (step === 2) {
      const { error } = await supabase.from('crm_clients').update({ org_name: orgInfo.name, district: orgInfo.district, contact_person: orgInfo.contactPerson, phone: orgInfo.phone }).eq('id', clientId);
      if (error) { console.error(error); alert('Failed to save.'); setSaving(false); return; }
      await saveStepProgress(2, 'Org info', orgInfo);
    } else {
      await saveStepProgress(step, STEPS[step - 1], {});
    }
    setSaving(false);
    if (step < STEPS.length) setStep(step + 1);
  }

  async function sendOtp() {
    if (!ackPhone.trim()) { alert('Enter mobile number.'); return; }
    const { error } = await supabase.functions.invoke('send-otp', { body: { phone: ackPhone, purpose: 'go_live_ack' } });
    if (error) { alert('Failed to send OTP.'); return; }
    setOtpSent(true);
  }

  async function verifyAndSign() {
    if (otp.length < 4) { alert('Enter OTP.'); return; }
    const { data: verifyData, error } = await supabase.functions.invoke('verify-otp', { body: { phone: ackPhone, otp, purpose: 'go_live_ack' } });
    if (error || !verifyData?.verified) { alert('OTP verification failed.'); return; }

    const ackNo = `ACK-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
    await supabase.from('client_onboarding').upsert(
      { client_id: clientId, golive_at: new Date().toISOString(), ack_signed: true, ack_signed_by: orgInfo.contactPerson, ack_signed_at: new Date().toISOString(), ack_otp_verified: true },
      { onConflict: 'client_id' }
    );
    await supabase.from('client_acknowledgements').insert({
      client_id: clientId, ack_number: ackNo, ack_type: 'golive',
      signed_by_name: orgInfo.contactPerson, signed_by_phone: ackPhone,
      otp_verified: true, signed_at: new Date().toISOString(),
    });
    await supabase.from('crm_clients').update({ status: 'active', trial_ended_at: new Date().toISOString() }).eq('id', clientId);
    await supabase.functions.invoke('send-whatsapp', { body: { clientId, type: 'golive_welcome', ackNumber: ackNo } });
    setAckNumber(ackNo);
    setAckComplete(true);
  }

  if (!clientId) return (
    <div style={S.page}>
      <div style={{ ...S.inner, textAlign: 'center', marginTop: 60 }}>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>No client selected. Open this wizard from a client's record.</p>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, zIndex: 50 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>Client Onboarding</p>
        <ScreenVideoButton screenCode="onboarding_wizard" />
      </nav>

      <div style={S.inner}>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Loading onboarding status...</p>
        ) : (
          <>
            {/* Step progress */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, overflowX: 'auto' }}>
              {STEPS.map((s, i) => (
                <React.Fragment key={s}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: i + 1 < step ? 'rgba(106,170,144,0.2)' : i + 1 === step ? '#E8A020' : 'rgba(255,255,255,0.08)', color: i + 1 < step ? '#6AAA90' : i + 1 === step ? '#111113' : 'rgba(255,255,255,0.3)' }}>
                      {i + 1 < step ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: 12, color: i + 1 === step ? '#E8A020' : 'rgba(255,255,255,0.4)' }}>{s}</span>
                  </div>
                  {i < STEPS.length - 1 && <div style={{ flex: 1, minWidth: 12, height: 1, background: i + 1 < step ? '#6AAA90' : 'rgba(255,255,255,0.08)', margin: '0 6px' }} />}
                </React.Fragment>
              ))}
            </div>

            {step === 2 && (
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#fff' }}>Step 2 — Organisation information</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                  <input placeholder="Organisation name" value={orgInfo.name} onChange={(e) => setOrgInfo((o) => ({ ...o, name: e.target.value }))} style={S.input} />
                  <input placeholder="District" value={orgInfo.district} onChange={(e) => setOrgInfo((o) => ({ ...o, district: e.target.value }))} style={S.input} />
                  <input placeholder="Contact person" value={orgInfo.contactPerson} onChange={(e) => setOrgInfo((o) => ({ ...o, contactPerson: e.target.value }))} style={S.input} />
                  <input placeholder="Phone" value={orgInfo.phone} onChange={(e) => setOrgInfo((o) => ({ ...o, phone: e.target.value }))} style={S.input} />
                </div>
              </div>
            )}

            {step !== 2 && step < STEPS.length && (
              <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 24, textAlign: 'center', marginBottom: 20, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                Step {step} — {STEPS[step - 1]} configuration
              </div>
            )}

            {step < STEPS.length && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <button onClick={() => setStep(step - 1)} disabled={step === 1}
                  style={{ padding: '10px 18px', fontSize: 13, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: step === 1 ? 'not-allowed' : 'pointer', opacity: step === 1 ? 0.4 : 1, fontFamily: 'inherit' }}>
                  ← Back
                </button>
                <button onClick={next} disabled={saving}
                  style={{ flex: 1, padding: '10px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: saving ? 'rgba(255,255,255,0.08)' : '#E8A020', color: saving ? 'rgba(255,255,255,0.3)' : '#111113', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Saving...' : 'Save & continue →'}
                </button>
              </div>
            )}

            {step === STEPS.length && (
              <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: '#fff' }}>Go-Live Acknowledgement</h3>
                {!ackComplete ? (
                  <>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Confirm setup is complete. Client signs digitally to start support SLA.</p>

                    <input placeholder="Principal/Owner mobile number" value={ackPhone}
                      onChange={(e) => setAckPhone(e.target.value.replace(/[^0-9+\s-]/g, '').slice(0, 15))}
                      inputMode="numeric"
                      style={{ ...S.input, width: '100%', marginBottom: 6, border: ackPhone && ackPhone.replace(/\D/g, '').length !== 10 && ackPhone.length > 5 ? '1px solid #E05A5A' : '1px solid rgba(255,255,255,0.1)' }} />

                    {ackPhone && ackPhone.replace(/\D/g, '').length !== 10 && ackPhone.length > 5 && (
                      <p style={{ fontSize: 12, color: '#E05A5A', marginTop: 4, marginBottom: 10 }}>⚠ Enter a valid 10-digit phone number</p>
                    )}
                    {!otpSent ? (
                      <button onClick={sendOtp} style={{ width: '100%', padding: 12, background: '#E8A020', color: '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 10 }}>Send OTP & sign</button>
                    ) : (
                      <>
                        <input placeholder="Enter OTP" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6}
                          style={{ ...S.input, width: '100%', marginBottom: 10, textAlign: 'center', fontSize: 16, letterSpacing: 4 }} />
                        <button onClick={verifyAndSign} style={{ width: '100%', padding: 12, background: '#6AAA90', color: '#111113', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Verify & sign</button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ background: 'rgba(106,170,144,0.08)', border: '1px solid rgba(106,170,144,0.2)', borderRadius: 10, padding: 18, textAlign: 'center', marginBottom: 4 }}>
                      <p style={{ fontSize: 26, margin: 0 }}>🎉</p>
                      <p style={{ fontWeight: 600, color: '#6AAA90', margin: '6px 0' }}>Client is live!</p>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>{ackNumber || 'Acknowledgement recorded'} · Support SLA active.</p>
                    </div>
                    <NextActions
                      title="Client is live — what next?"
                      actions={[
                        { icon: '🎫', label: 'View support tickets', description: 'Monitor any early issues', href: '/control/tickets', color: '#5A9ADF' },
                        { icon: '💳', label: 'Set up billing', description: 'Create first invoice for this client', href: '/control/billing', color: '#6AAA90' },
                      ]}
                      secondaryActions={[
                        { icon: '🏢', label: 'Back to clients', href: '/control/clients' },
                        { icon: '🏠', label: 'Dashboard', href: '/portal/dashboard' },
                      ]}
                    />
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ControlPanelNav />
      <BugReporter screenName="onboarding_wizard" />
    </div>
  );
}
