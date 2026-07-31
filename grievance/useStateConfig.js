// grievance/useStateConfig.js
// Loads state configuration dynamically from URL slug
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const STATE_CACHE = {};

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

    supabase
      .from('cts_states')
      .select('*')
      .eq('slug', slug)
      .single()
      .then(({ data }) => {
        if (data) {
          STATE_CACHE[slug] = data;
          setStateConfig(data);
        }
        setLoading(false);
      });
  }, [slug]);

  return { stateConfig, loading, slug };
}