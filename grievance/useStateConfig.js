// grievance/useStateConfig.js
// Reads state config from cts_states table by slug
// Cached in memory — no repeated DB calls

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const cache = {};

export function useStateConfig(stateSlug) {
  const [config, setConfig] = useState(cache[stateSlug] || null);
  const [loading, setLoading] = useState(!cache[stateSlug]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!stateSlug) return;
    if (cache[stateSlug]) {
      setConfig(cache[stateSlug]);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from('cts_states')
        .select('*')
        .eq('state_slug', stateSlug)
        .eq('is_active', true)
        .single();

      if (err || !data) {
        setError('State not found or not active.');
        setLoading(false);
        return;
      }

      cache[stateSlug] = data;
      setConfig(data);
      setLoading(false);
    }

    load();
  }, [stateSlug]);

  return { config, loading, error };
}