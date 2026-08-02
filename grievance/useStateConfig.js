// grievance/useStateConfig.js — CORRECTED
// Loads state configuration dynamically from URL slug.
//
// Was querying cts_states.eq('slug', ...) — but cts_states has no
// slug column at all (confirmed via a real Postgres error earlier:
// "column slug of relation cts_states does not exist"). That query
// always failed silently, so stateConfig never populated and every
// state's landing page fell back to the hardcoded defaults —
// "Andhra Pradesh" / 175 constituencies — even for Telangana.
//
// Fixed to reuse the same, already-correct path CitizenPortal.jsx
// relies on: app_settings.state_slug -> apps.state_name /
// apps.max_constituencies. No separate cts_states table needed.
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const STATE_CACHE = {};

// apps has no Telugu-name column — kept here for the states actually
// live today. Falls back to the English name if a state isn't listed.
const LOCAL_NAMES = {
  'andhra-pradesh': 'ఆంధ్రప్రదేశ్',
  'telangana': 'తెలంగాణ',
};

export function useStateConfig() {
  const { stateSlug } = useParams();
  const slug = stateSlug || 'andhra-pradesh';
  const [stateConfig, setStateConfig] = useState(STATE_CACHE[slug] || null);
  const [loading, setLoading] = useState(!STATE_CACHE[slug]);

  useEffect(() => {
    if (STATE_CACHE[slug]) {
      setStateConfig(STATE_CACHE[slug]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      const { data: settingsRow } = await supabase
        .from('app_settings')
        .select('app_id')
        .eq('state_slug', slug)
        .maybeSingle();

      if (!settingsRow) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: appRow } = await supabase
        .from('apps')
        .select('state_name, max_constituencies')
        .eq('id', settingsRow.app_id)
        .maybeSingle();

      if (!cancelled && appRow) {
        const config = {
          name_en: appRow.state_name,
          name_local: LOCAL_NAMES[slug] || appRow.state_name,
          total_constituencies: appRow.max_constituencies,
        };
        STATE_CACHE[slug] = config;
        setStateConfig(config);
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [slug]);

  return { stateConfig, loading, slug };
}
