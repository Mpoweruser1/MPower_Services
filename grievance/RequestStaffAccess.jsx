// grievance/RequestStaffAccess.jsx
// MLA/MP office requests access to the grievance portal
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { fetchAppIdBySlug, fetchConstituencies } from './grievanceApi';

export default function RequestStaffAccess() {
  const { stateSlug } = useParams();
  const [form, setForm] = useState({
    officeName: '',
    constituencyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    role: 'MLA',
  });
  const [constituencies, setConstituencies] = useState([]);
  const [loadingConstituencies, setLoadingConstituencies] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Constituency was previously free text — meaning a typo, or a name
  // that simply doesn't exist, would only surface as a failure much
  // later when an admin tries to approve it. Fetching the real list
  // (scoped to this state and the selected MLA/MP/MLC tier) and
  // presenting it as a dropdown means only a real, existing
  // constituency can ever be submitted in the first place.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingConstituencies(true);
      const appId = await fetchAppIdBySlug(stateSlug || 'andhra-pradesh');
      if (!appId) { if (!cancelled) setLoadingConstituencies(false); return; }
      const list = await fetchConstituencies(appId, form.role);
      if (!cancelled) {
        setConstituencies(list);
        setForm((f) => ({ ...f, constituencyName: '' }));
        setLoadingConstituencies(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [stateSlug, form.role]);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.officeName || !form.constituencyName || !form.contactPerson || !form.phone) {
      setError('Please fill all required fields.');
      return;
    }
    setBusy(true);
    setError('');

    try {
      const { error: err } = await supabase.from('staff_access_requests').insert({
        state_slug: stateSlug || 'andhra-pradesh',
        office_name: form.officeName,
        constituency_name: form.constituencyName,
        contact_person: form.contactPerson,
        phone: form.phone,
        email: form.email || null,
        role_requested: form.role,
        status: 'pending',
      });

      if (err) throw err;
      setDone(true);
    } catch (e) {
      setError('Submission failed. Please try again or contact MPower support.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Request Submitted</div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>
            Thank you. MPower team will verify your details and activate your portal within 1 working day. You will receive a confirmation on WhatsApp at {form.phone}.
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#15803d' }}>
            Reference: {form.constituencyName} · {new Date().toLocaleDateString('en-IN')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#e8a020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#1a1a2e', fontSize: 15 }}>M</div>
          <div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>MPower CTS</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>MLA / MP Office Registration</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 40px' }}>

        {/* Info box */}
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>🏛️ Register your constituency portal</div>
          <div style={{ fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
            Fill this form to get your free grievance management portal. MPower team will verify and activate within 1 working day. Setup is completely free.
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>

          {/* Role */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>I am an *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['MLA', 'MP', 'MLC'].map(r => (
                <button
                  key={r} type="button"
                  onClick={() => update('role', r)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    border: `2px solid ${form.role === r ? '#1a1a2e' : '#e2e8f0'}`,
                    background: form.role === r ? '#1a1a2e' : '#fff',
                    color: form.role === r ? '#e8a020' : '#64748b',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{r}</button>
              ))}
            </div>
          </div>

          {/* Office name */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Office / Organisation Name *</label>
            <input
              value={form.officeName}
              onChange={e => update('officeName', e.target.value)}
              placeholder="e.g. Office of MLA Mandapeta"
              required
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          {/* Constituency */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Constituency *</label>
            <select
              value={form.constituencyName}
              onChange={e => update('constituencyName', e.target.value)}
              required
              disabled={loadingConstituencies}
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            >
              <option value="" disabled>
                {loadingConstituencies ? 'Loading constituencies...' : `Select your ${form.role} constituency`}
              </option>
              {constituencies.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Contact person */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Contact Person Name *</label>
            <input
              value={form.contactPerson}
              onChange={e => update('contactPerson', e.target.value)}
              placeholder="Name of MLA/MP or office in-charge"
              required
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          {/* Phone */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>WhatsApp Mobile Number *</label>
            <input
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              placeholder="+91XXXXXXXXXX"
              required
              type="tel"
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          {/* Email optional */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Email (Optional)</label>
            <input
              value={form.email}
              onChange={e => update('email', e.target.value)}
              placeholder="office@example.com"
              type="email"
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: '100%', padding: '13px 16px',
              background: busy ? '#94a3b8' : '#1a1a2e',
              color: busy ? '#fff' : '#e8a020',
              border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {busy ? 'Submitting...' : '🏛️ Submit Registration Request'}
          </button>

          <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
            Setup is completely free · mpowerind.in · support@mpowerind.in
          </div>

        </form>
      </div>
    </div>
  );
}