// src/hooks/useGrievanceTranslations.js
//
// Composes bilingual labels — "English | Telugu" — matching the source
// paper form's convention (every field shows both, always, not a
// language toggle). Falls back to English-only where no translation
// exists yet (Hindi/Marathi for UP/Maharashtra — not fabricated, see
// migration 3's notes).

import { useState, useEffect } from 'react';
import { fetchUiLabels, fetchUiLabelTranslations } from './grievanceApi';

export function useGrievanceTranslations(appId, language) {
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [defs, translations] = await Promise.all([
        fetchUiLabels(appId),
        fetchUiLabelTranslations(language),
      ]);
      if (cancelled) return;

      const map = {};
      defs.forEach((d) => {
        map[d.label_key] = { en: d.label_en, translated: translations[d.id] || null };
      });
      setLabels(map);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [appId, language]);

  // Returns "English | Telugu" when a translation exists and differs from
  // English; otherwise just the English label. Never a language toggle.
  function t(key, fallbackEn) {
    const entry = labels[key];
    const en = entry?.en || fallbackEn || key;
    const translated = entry?.translated;
    if (translated && translated !== en) {
      return `${en} | ${translated}`;
    }
    return en;
  }

  return { t, loading };
}
