// website/siteLang.jsx — NEW
// Shared English / Telugu switch for the public website pages.
// No provider needed: the choice lives in one small store, is remembered in the
// browser, and every page that calls useLang() updates together.
import React, { useSyncExternalStore } from 'react';

const KEY = 'mpower_lang';
const listeners = new Set();

function readSaved() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'te' ? 'te' : 'en';
  } catch { return 'en'; }
}

let current = readSaved();

function apply(l) {
  try { document.documentElement.lang = l; } catch { /* ignore */ }
}
apply(current);

export function setLang(l) {
  const next = l === 'te' ? 'te' : 'en';
  if (next === current) return;
  current = next;
  try { localStorage.setItem(KEY, next); } catch { /* private mode etc. */ }
  apply(next);
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useLang() {
  const lang = useSyncExternalStore(subscribe, () => current, () => 'en');
  // pick(enText, teText) returns the text for the chosen language
  const pick = (en, te) => (lang === 'te' && te != null && te !== '' ? te : en);
  return { lang, setLang, pick };
}

// Small two-button switch for the top menu.
export function LangSwitch() {
  const { lang } = useLang();
  const btn = (code, label, aria) => (
    <button
      type="button"
      onClick={() => setLang(code)}
      aria-label={aria}
      aria-pressed={lang === code}
      style={{
        padding: '5px 11px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
        fontFamily: code === 'te' ? "'Noto Sans Telugu', 'Inter', sans-serif" : 'inherit',
        background: lang === code ? '#E8A020' : 'transparent',
        color: lang === code ? '#111113' : 'rgba(255,255,255,0.65)',
      }}>
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Language / భాష"
      style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 16, overflow: 'hidden' }}>
      {btn('en', 'EN', 'English')}
      {btn('te', 'తెలుగు', 'తెలుగు')}
    </div>
  );
}
