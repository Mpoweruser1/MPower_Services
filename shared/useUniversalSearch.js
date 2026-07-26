// shared/useUniversalSearch.js — FINAL
import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useUniversalSearch(appId) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const search = useCallback(async (q) => {
    setQuery(q);
    if (!q || q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    const term = q.trim();

    try {
      const [students, patients, complaints, fees] = await Promise.allSettled([
        supabase.from('students')
          .select('id, full_name, sid, section, parent_phone, status')
          .eq('app_id', appId)
          .or(`full_name.ilike.%${term}%,sid.ilike.%${term}%,parent_phone.ilike.%${term}%`)
          .eq('status', 'active').limit(5),

        supabase.from('patients')
          .select('id, full_name, patient_uid, phone, abha_linked')
          .eq('app_id', appId)
          .or(`full_name.ilike.%${term}%,patient_uid.ilike.%${term}%,phone.ilike.%${term}%`)
          .limit(5),

        supabase.from('complaints')
          .select('id, case_no, title, stage, category')
          .or(`case_no.ilike.%${term}%,title.ilike.%${term}%`)
          .limit(5),

        supabase.from('fee_payments')
          .select('id, receipt_no, amount, paid_at')
          .ilike('receipt_no', `%${term}%`)
          .limit(3),
      ]);

      const combined = [
        ...((students.status === 'fulfilled' && students.value.data) || [])
          .map((s) => ({ ...s, _type: 'student', _label: s.full_name, _sub: `${s.sid} · Section ${s.section}`, _icon: '🎓', _path: '/school/search' })),
        ...((patients.status === 'fulfilled' && patients.value.data) || [])
          .map((p) => ({ ...p, _type: 'patient', _label: p.full_name, _sub: `UID: ${p.patient_uid}${p.abha_linked ? ' · ABHA ✓' : ''}`, _icon: '🏥', _path: '/hospital/opd' })),
        ...((complaints.status === 'fulfilled' && complaints.value.data) || [])
          .map((c) => ({ ...c, _type: 'complaint', _label: c.title, _sub: `${c.case_no} · ${c.stage}`, _icon: '🏛️', _path: `/grievance/track?case=${c.case_no}` })),
        ...((fees.status === 'fulfilled' && fees.value.data) || [])
          .map((f) => ({ ...f, _type: 'receipt', _label: `Receipt ${f.receipt_no}`, _sub: `₹${Number(f.amount).toLocaleString('en-IN')} · ${new Date(f.paid_at).toLocaleDateString('en-IN')}`, _icon: '💰', _path: '/school/fee-collection' })),
      ];

      setResults(combined);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  return { query, results, loading, search, setResults, setQuery };
}