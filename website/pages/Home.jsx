// website/pages/Home.jsx — FINAL
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLang, LangSwitch } from '../siteLang';

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff' },
};

function Nav() {
  const { pick } = useLang();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: scrolled ? 'rgba(28,28,30,0.95)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : 'none', transition: 'all 0.3s', padding: '14px 24px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 16 }}>M</div>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: -0.5 }}>MPower</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to="/products" style={{ padding: '8px 16px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 14 }}>{pick('Products', 'ఉత్పత్తులు')}</Link>
          <Link to="/pricing" style={{ padding: '8px 16px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 14 }}>{pick('Pricing', 'ధరలు')}</Link>
          <Link to="/contact" style={{ padding: '8px 16px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 14 }}>{pick('Contact', 'సంప్రదించండి')}</Link>
          <Link to="/portal/login" style={{ padding: '8px 16px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontSize: 14 }}>{pick('Login', 'లాగిన్')}</Link>
          <LangSwitch />
          <Link to="/registration" style={{ padding: '9px 20px', background: '#E8A020', color: '#111113', borderRadius: 20, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>{pick('Start free →', 'ఉచితంగా ప్రారంభించండి →')}</Link>
        </div>
      </div>
    </nav>
  );
}

const PRODUCTS = [
  { icon: '🏫', name: 'MPower School', desc: ['Attendance, fees, TC, certificates, hostel, transport — all in one. Telugu + English.', 'హాజరు, ఫీజులు, టీసీ, సర్టిఫికెట్లు, హాస్టల్, రవాణా — అన్నీ ఒకే చోట. తెలుగు + ఇంగ్లీష్.'], href: '/products/school', directHref: '/registration?type=school', color: '#6AAA90' },
  { icon: '🏥', name: 'MPower Hospital', desc: ['OPD, IPD, lab, billing, ABHA linking, Aarogyasri and PMJAY — for small to mid hospitals.', 'ఓపీ, ఐపీ, ల్యాబ్, బిల్లింగ్, ఆభా లింకింగ్, ఆరోగ్యశ్రీ, పీఎంజేఏవై — చిన్న, మధ్యస్థ ఆసుపత్రుల కోసం.'], href: '/products/hospital', directHref: '/registration?type=hospital', color: '#5A9ADF' },
  { icon: '🙏', name: 'MPower CTS', desc: ["Your concern won't stop until it reaches your leader — no delay, no silence, no forgetting.", 'మీ సమస్య మీ నాయకుడి వద్దకు చేరే వరకు ఆగదు — ఆలస్యం లేదు, మౌనం లేదు, మర్చిపోవడం లేదు.'], href: '/products/grievance', directHref: '/grievance', color: '#E8A020' },
];

// Each text is [English, Telugu].
const FEATURES = [
  { icon: '📱', title: ['WhatsApp alerts — coming soon', 'వాట్సాప్ అలర్ట్‌లు — త్వరలో'], desc: ['Attendance, fee, lab-result and complaint updates will reach parents and citizens on WhatsApp — no app install needed. Available on selected plans.', 'హాజరు, ఫీజు, ల్యాబ్ ఫలితాలు, ఫిర్యాదు అప్‌డేట్‌లు తల్లిదండ్రులకు, పౌరులకు వాట్సాప్‌లో చేరతాయి — యాప్ ఇన్‌స్టాల్ అవసరం లేదు. ఎంపిక చేసిన ప్లాన్‌లలో లభిస్తుంది.'] },
  { icon: '🌐', title: ['Telugu + English', 'తెలుగు + ఇంగ్లీష్'], desc: ['Key screens and notices in Telugu and English. Designed for AP and Telangana.', 'ముఖ్యమైన స్క్రీన్‌లు, నోటీసులు తెలుగు, ఇంగ్లీష్‌లలో. ఆంధ్రప్రదేశ్, తెలంగాణ కోసం రూపొందించబడింది.'] },
  { icon: '🔒', title: ['Bank-grade security', 'బ్యాంక్-గ్రేడ్ భద్రత'], desc: ['RLS row-level security, idle timeout, audit logs, encrypted data. Each organisation sees only their own data.', 'రో-లెవల్ సెక్యూరిటీ, ఇడిల్ టైమ్‌అవుట్, ఆడిట్ లాగ్‌లు, ఎన్‌క్రిప్ట్ చేసిన డేటా. ప్రతి సంస్థకు తమ డేటా మాత్రమే కనిపిస్తుంది.'] },
  { icon: '📊', title: ['Real reports', 'నిజమైన నివేదికలు'], desc: ['Attendance trends, fee defaulters, caste-wise welfare eligibility, complaint breakdowns — one click, printable.', 'హాజరు ట్రెండ్‌లు, ఫీజు బకాయిదారులు, కులాల వారీ సంక్షేమ అర్హత, ఫిర్యాదుల విభజన — ఒక్క క్లిక్‌తో, ప్రింట్ చేయవచ్చు.'] },
  { icon: '🏥', title: ['ABHA & Aarogyasri', 'ఆభా & ఆరోగ్యశ్రీ'], desc: ['Hospital patients can link ABHA Health ID and use Aarogyasri / PMJAY cashless treatment — all in the app.', 'ఆసుపత్రి రోగులు ఆభా హెల్త్ ఐడీని లింక్ చేసి ఆరోగ్యశ్రీ / పీఎంజేఏవై నగదు రహిత చికిత్స పొందవచ్చు — అన్నీ యాప్‌లోనే.'] },
  { icon: '💳', title: ['3-way fee payment', '3 విధాలుగా ఫీజు చెల్లింపు'], desc: ['Collect fees at counter, online on this device, or send WhatsApp payment link to parent. All three in one screen.', 'కౌంటర్‌లో, ఈ పరికరంలో ఆన్‌లైన్‌లో, లేదా తల్లిదండ్రులకు వాట్సాప్ పేమెంట్ లింక్ పంపి ఫీజు వసూలు చేయండి. మూడూ ఒకే స్క్రీన్‌లో.'] },
];

export default function Home() {
  const navigate = useNavigate();
  const { pick } = useLang();
  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+Telugu:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
      `}</style>

      <Nav />

      {/* Hero + Products — merged into one section. Previously the
          "One platform for..." headline dominated a full-viewport
          hero on its own, with Products as a separate section further
          down the page. Now the headline is a small supporting line
          and the three product cards are what the section is
          actually built around. */}
      <section style={{ padding: '120px 24px 60px', position: 'relative', overflow: 'hidden' }}>
        {/* Background gradient */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(232,160,32,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1080, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <p style={{ fontSize: 'clamp(13px, 1.5vw, 17px)', color: 'rgba(255,255,255,0.45)', margin: '0 0 6px', lineHeight: 1.6 }}>
            {pick(
              <>One platform for <span style={{ color: '#E8A020' }}>Schools, Hospitals</span> and <span style={{ color: '#E8A020' }}>Every Citizen's Voice</span></>,
              <><span style={{ color: '#E8A020' }}>పాఠశాలలు, ఆసుపత్రులు</span> మరియు <span style={{ color: '#E8A020' }}>ప్రతి పౌరుని గొంతుకు</span> ఒకే వేదిక</>
            )}
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: '0 0 40px', fontFamily: "'Noto Sans Telugu', sans-serif" }}>
            {pick('పాఠశాలలు · ఆసుపత్రులు · ప్రతి పౌరుని సమస్య', 'Schools · Hospitals · Every citizen\'s concern')}
          </p>

          <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 700, color: '#fff', margin: '0 0 32px', letterSpacing: -0.5 }}>{pick('Three apps. One login.', 'మూడు యాప్‌లు. ఒకే లాగిన్.')}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, textAlign: 'left' }}>
            {PRODUCTS.map((p) => (
              <div key={p.name} style={{ padding: '28px 24px', background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, transition: 'border-color 0.2s' }}>
                <button onClick={() => navigate(p.directHref)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 36, display: 'block', marginBottom: 14 }}>{p.icon}</span>
                  <h3 style={{ fontSize: 20, fontWeight: 600, color: '#fff', margin: '0 0 10px' }}>{p.name}</h3>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px', lineHeight: 1.7 }}>{pick(p.desc[0], p.desc[1])}</p>
                </button>
                <Link to={p.href} style={{ fontSize: 13, color: p.color, fontWeight: 500, textDecoration: 'none' }}>{pick('Learn more →', 'మరింత తెలుసుకోండి →')}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ fontSize: 12, color: '#E8A020', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 12 }}>{pick('Features · విశేషాలు', 'విశేషాలు · Features')}</p>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700, color: '#fff', margin: 0, letterSpacing: -1 }}>{pick('Everything you need', 'మీకు కావలసినవన్నీ')}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={{ padding: '24px', background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>
                <span style={{ fontSize: 28, display: 'block', marginBottom: 12 }}>{f.icon}</span>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>{pick(f.title[0], f.title[1])}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.7 }}>{pick(f.desc[0], f.desc[1])}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why MPower — honest "we're new" framing, replaces fabricated testimonials */}
      <section style={{ padding: '80px 24px', background: '#161618' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: '#E8A020', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 12 }}>{pick('Why MPower', 'ఎందుకు MPower')}</p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700, color: '#fff', margin: '0 0 24px', letterSpacing: -1 }}>
            {pick("We're new. That's exactly why it works.", 'మేము కొత్త. అందుకే ఇది పనిచేస్తుంది.')}
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.65)', lineHeight: 1.8, margin: 0 }}>
            {pick(
              "MPower launched in 2026, built by a single developer working directly with the schools, hospitals, and constituency offices it's made for — not a legacy platform padded with features nobody asked for. Every part of it exists because a real institution needed it. As one of our first clients, you get direct access to the person actually building this, pricing that won't change once we scale, and a platform still young enough to be shaped by what you need.",
              'MPower 2026లో ప్రారంభమైంది. ఇది ఎవరి కోసం తయారైందో ఆ పాఠశాలలు, ఆసుపత్రులు, నియోజకవర్గ కార్యాలయాలతో నేరుగా పనిచేసే ఒక డెవలపర్ దీన్ని రూపొందించారు — ఎవరూ అడగని ఫీచర్లతో నిండిన పాత ప్లాట్‌ఫామ్ కాదు. ప్రతి భాగం ఒక నిజమైన సంస్థ అవసరం నుంచే పుట్టింది. మా మొదటి క్లయింట్లలో ఒకరిగా, దీన్ని నిర్మిస్తున్న వ్యక్తితో నేరుగా మాట్లాడే అవకాశం, మేము పెరిగిన తర్వాత కూడా మారని ధరలు, మీ అవసరాలను బట్టి తీర్చిదిద్దగల కొత్త ప్లాట్‌ఫామ్ మీకు లభిస్తాయి.'
            )}
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700, color: '#fff', margin: '0 0 16px', letterSpacing: -1 }}>
            {pick('Ready to get started?', 'ప్రారంభించడానికి సిద్ధమా?')}
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', margin: '0 0 32px', lineHeight: 1.6 }}>
            {pick('6 months free on Basic tier. No credit card. Setup in 10 minutes.', 'బేసిక్ టైర్‌పై 6 నెలలు ఉచితం. క్రెడిట్ కార్డ్ అవసరం లేదు. 10 నిమిషాల్లో సెటప్.')}<br />
            <span style={{ fontFamily: "'Noto Sans Telugu', sans-serif", fontSize: 15 }}>{pick('6 నెలలు ఉచితం. Credit card అవసరం లేదు.', '6 months free. No credit card needed.')}</span>
          </p>
          <Link to="/registration"
            style={{ display: 'inline-block', padding: '15px 40px', background: '#E8A020', color: '#111113', borderRadius: 10, textDecoration: 'none', fontSize: 16, fontWeight: 700 }}>
            {pick('Start your free trial →', 'ఉచిత ట్రయల్ ప్రారంభించండి →')}
          </Link>
          <p style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            {pick('Already have an account?', 'ఖాతా ఉందా?')} <Link to="/portal/login" style={{ color: '#E8A020', textDecoration: 'none' }}>{pick('Log in →', 'లాగిన్ →')}</Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '40px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#111113' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E8A020', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#111113', fontSize: 13 }}>M</div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>MPower</span>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { to: '/products', label: ['Products', 'ఉత్పత్తులు'] },
              { to: '/pricing',  label: ['Pricing', 'ధరలు'] },
              { to: '/contact',  label: ['Contact', 'సంప్రదించండి'] },
              { to: '/privacy',  label: ['Privacy', 'గోప్యత'] },
              { to: '/terms',    label: ['Terms', 'నిబంధనలు'] },
              { to: '/refund-policy', label: ['Refund', 'రీఫండ్'] },
            ].map((l) => (
              <Link key={l.to} to={l.to} style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>{pick(l.label[0], l.label[1])}</Link>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            © {new Date().getFullYear()} MPower Services · {pick('Operated by Suribabu Kommana, Sole Proprietor · Made in Andhra Pradesh', 'నిర్వహణ: Suribabu Kommana, సోల్ ప్రొప్రైటర్ · ఆంధ్రప్రదేశ్‌లో రూపొందించబడింది')} 🇮🇳
          </p>
        </div>
      </footer>
    </div>
  );
}