// controlpanel/OnboardingWizard.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import ControlPanelNav from '../shared/ControlPanelNav';
import NextActions from '../shared/NextActions';
import { ScreenVideoButton } from '../shared/HelpWidget';
import BugReporter from '../shared/BugReporter';

const STEPS = ['Account', 'Org info', 'Classes/Depts', 'Fee/Billing setup', 'Users', 'Hardware'];

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
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', padding: 20, fontFamily: 'sans-serif' }}>
      <p style={{ fontSize: 14, color: '#888' }}>No client selected. Open this wizard from a client's record.</p>
    </div>
  );

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: '#888' }}>Loading onboarding status...</div>;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', fontFamily: 'sans-serif', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Client Onboarding</h2>
        <ScreenVideoButton screenCode="onboarding_wizard" />
      </div>

      {/* Step progress */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, overflowX: 'auto' }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: i + 1 < step ? '#E1F5EE' : i + 1 === step ? '#185FA5' : '#f0f0f0', color: i + 1 < step ? '#085041' : i + 1 === step ? '#fff' : '#999' }}>
                {i + 1 < step ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 12, color: i + 1 === step ? '#222' : '#999' }}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, minWidth: 10, height: 2, background: i + 1 < step ? '#1D9E75' : '#eee', margin: '0 4px' }} />}
          </React.Fragment>
        ))}
      </div>

      {step === 2 && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Step 2 — Organisation information</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <input placeholder="Organisation name" value={orgInfo.name} onChange={(e) => setOrgInfo((o) => ({ ...o, name: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }} />
            <input placeholder="District" value={orgInfo.district} onChange={(e) => setOrgInfo((o) => ({ ...o, district: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }} />
            <input placeholder="Contact person" value={orgInfo.contactPerson} onChange={(e) => setOrgInfo((o) => ({ ...o, contactPerson: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }} />
            <input placeholder="Phone" value={orgInfo.phone} onChange={(e) => setOrgInfo((o) => ({ ...o, phone: e.target.value }))} style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }} />
          </div>
        </div>
      )}

      {step !== 2 && step < STEPS.length && (
        <div style={{ background: '#f7f7f7', borderRadius: 8, padding: 20, textAlign: 'center', marginBottom: 16, fontSize: 13, color: '#888' }}>
          Step {step} — {STEPS[step - 1]} configuration
        </div>
      )}

      {step < STEPS.length && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setStep(step - 1)} disabled={step === 1} style={{ padding: '8px 16px', fontSize: 12, border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: step === 1 ? 'not-allowed' : 'pointer', opacity: step === 1 ? 0.5 : 1 }}>← Back</button>
          <button onClick={next} disabled={saving} style={{ flex: 1, padding: '8px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, background: saving ? '#ccc' : '#185FA5', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving...' : 'Save & continue →'}
          </button>
        </div>
      )}

      {step === STEPS.length && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Go-Live Acknowledgement</h3>
          {!ackComplete ? (
            <>
              <p style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Confirm setup is complete. Client signs digitally to start support SLA.</p>
              
              <input placeholder="Principal/Owner mobile number" value={ackPhone}
                            onChange={(e) => setAckPhone(e.target.value.replace(/[^0-9+\s-]/g, '').slice(0, 15))}
                             inputMode="numeric"
                             style={{ ...existing_style, border: ackPhone && ackPhone.replace(/\D/g,'').length !== 10 && ackPhone.length > 5 ? '1px solid #E05A5A' : '1px solid #ccc' }} />

                                    {ackPhone && ackPhone.replace(/\D/g,'').length !== 10 && ackPhone.length > 5 && (
                            <p style={{ fontSize: 12, color: '#E05A5A', marginTop: 4 }}>⚠ Enter a valid 10-digit phone number</p>
)}
              {!otpSent ? (
                <button onClick={sendOtp} style={{ width: '100%', padding: 10, background: '#185FA5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Send OTP & sign</button>
              ) : (
                <>
                  <input placeholder="Enter OTP" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, marginBottom: 8, textAlign: 'center', fontSize: 16, letterSpacing: 4 }} />
                  <button onClick={verifyAndSign} style={{ width: '100%', padding: 10, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Verify & sign</button>
                </>
              )}
            </>
          ) : (
            <>
              <div style={{ background: '#E1F5EE', borderRadius: 8, padding: 14, textAlign: 'center', marginBottom: 4 }}>
                <p style={{ fontSize: 22, margin: 0 }}>🎉</p>
                <p style={{ fontWeight: 600, color: '#085041', margin: '4px 0' }}>Client is live!</p>
                <p style={{ fontSize: 12, color: '#666', margin: 0 }}>{ackNumber || 'Acknowledgement recorded'} · Support SLA active.</p>
              </div>
              <NextActions
                title="Client is live — what next?"
                actions={[
                  { icon: '🎫', label: 'View support tickets', description: 'Monitor any early issues', href: '/control/tickets', color: '#185FA5' },
                  { icon: '💳', label: 'Set up billing', description: 'Create first invoice for this client', href: '/control/billing', color: '#1D9E75' },
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

      <ControlPanelNav />
      <BugReporter screenName="onboarding_wizard" />
    </div>
  );
}