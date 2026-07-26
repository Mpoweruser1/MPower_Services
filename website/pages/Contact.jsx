// website/pages/Contact.jsx — FINAL
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useFormValidation, validators, sanitize } from '../../shared/useFormValidation';
import FormField from '../../shared/FormField';

const CONTACT_OPTIONS = [
  { value: 'school',    label: '🏫 School enquiry' },
  { value: 'hospital',  label: '🏥 Hospital enquiry' },
  { value: 'grievance', label: '🏛️ CTS / Grievance enquiry' },
  { value: 'support',   label: '🛠️ Support — existing client' },
  { value: 'other',     label: '📌 Other' },
];

const RULES = {
  name:    [validators.required, validators.nameField],
  message: [validators.required, validators.minLength(20)],
};

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
  inner: { maxWidth: 560, margin: '0 auto', padding: '100px 24px 80px' },
};

export default function Contact() {
  const [form, setForm] = useState({
    name: '', org: '', phone: '', email: '', type: 'school', message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);

  const { errors, touched, validate, touch, onChange: onValidate } =
    useFormValidation(RULES);

  function update(field, value) {
    let v = value;
    if (field === 'phone') v = sanitize.phone(value);
    if (field === 'name')  v = value.replace(/[0-9]/g, '');
    setForm((f) => ({ ...f, [field]: v }));
    onValidate(field, v);
  }

  async function submit() {
    if (!validate(form)) return;

    if (form.phone && form.phone.replace(/\D/g, '').length !== 10) {
      touch('phone', form.phone);
      return;
    }

    if (!form.phone.trim() && !form.email.trim()) {
      touch('phone', '');
      return;
    }

    setSubmitting(true);

    const { data: client } = await supabase
      .from('crm_clients')
      .insert({
        org_name:       form.org.trim() || form.name.trim(),
        app_type:       ['school', 'hospital', 'grievance'].includes(form.type) ? form.type : 'school',
        contact_person: form.name.trim(),
        phone:          form.phone.trim() || null,
        status:         'trial',
      })
      .select()
      .single();

    if (client) {
      await supabase.from('support_tickets').insert({
        client_id:   client.id,
        ticket_no:   'TKT-' + Date.now(),
        type:        'billing',
        priority:    'P3',
        subject:     `Website enquiry — ${form.name} (${form.type})`,
        description: `Phone: ${form.phone || '—'} · Email: ${form.email || '—'}\n\n${form.message}`,
        status:      'open',
      });

      await supabase.functions.invoke('send-whatsapp', {
        body: { type: 'website_enquiry', clientId: client.id, name: form.name, enquiryType: form.type },
      });
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={S.page}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
        <div style={{ ...S.inner, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', textAlign: 'center' }}>
          <p style={{ fontSize: 56, marginBottom: 16 }}>✅</p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#6AAA90', margin: '0 0 10px' }}>Message received!</h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 28px', lineHeight: 1.7 }}>
            We will get back to you within 24–48 hours via WhatsApp or email.
          </p>
          <Link to="/" style={{ padding: '12px 28px', background: '#E8A020', color: '#111113', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>

      <div style={{ background: '#111113', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '14px 24px', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 13 }}>M</div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>MPower</span>
          </Link>
          <Link to="/portal/login" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>Login →</Link>
        </div>
      </div>

      <div style={S.inner}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, color: '#fff', margin: '0 0 10px', letterSpacing: -1 }}>Contact us</h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6 }}>
            Questions, demo requests, support — we respond within 24–48 hours.<br />
            WhatsApp: <strong style={{ color: '#E8A020' }}>+91 99999 00000</strong>
          </p>
        </div>

        <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '28px 24px' }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 20 }}>Send a message</p>

          <FormField
            label="What are you enquiring about?"
            name="type"
            type="select"
            value={form.type}
            onChange={update}
            onBlur={touch}
            error={errors.type}
            touched={touched.type}
            options={CONTACT_OPTIONS}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField
              label="Your name"
              name="name"
              value={form.name}
              onChange={update}
              onBlur={touch}
              error={errors.name}
              touched={touched.name}
              required
              placeholder="Full name"
              hint="Letters only"
            />
            <FormField
              label="Organisation name"
              name="org"
              value={form.org}
              onChange={update}
              onBlur={touch}
              error={errors.org}
              touched={touched.org}
              placeholder="School / Hospital name"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField
              label="WhatsApp phone"
              name="phone"
              type="phone"
              value={form.phone}
              onChange={update}
              onBlur={touch}
              error={errors.phone}
              touched={touched.phone}
              placeholder="+91 XXXXX XXXXX"
              hint="Or provide email below"
            />
            <FormField
              label="Email (optional)"
              name="email"
              type="email"
              value={form.email}
              onChange={update}
              onBlur={touch}
              error={errors.email}
              touched={touched.email}
              placeholder="your@email.com"
            />
          </div>

          {!form.phone.trim() && !form.email.trim() && touched.name && (
            <div style={{ background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#E05A5A' }}>
              ⚠ Please provide at least a phone number or email so we can reach you
            </div>
          )}

          <FormField
            label="How can we help?"
            name="message"
            type="textarea"
            value={form.message}
            onChange={update}
            onBlur={touch}
            error={errors.message}
            touched={touched.message}
            required
            placeholder="Tell us about your school / hospital. How many students or beds? What are you looking for?"
            rows={4}
            maxLength={1000}
          />

          <button onClick={submit} disabled={submitting}
            style={{ width: '100%', padding: 14, background: submitting ? 'rgba(255,255,255,0.08)' : '#E8A020', color: submitting ? 'rgba(255,255,255,0.3)' : '#111113', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {submitting ? 'Sending...' : 'Send message →'}
          </button>
        </div>
      </div>
    </div>
  );
}