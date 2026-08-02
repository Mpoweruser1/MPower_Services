// shared/usePowerSearch.js — FINAL
// Powerful Google-like search for MPower
// Features:
//   ✅ Fuzzy/typo-tolerant matching via pg_trgm
//   ✅ Full-text search via tsvector
//   ✅ Multi-word token parsing
//   ✅ Intent detection (absent, fee due, SC, village etc)
//   ✅ Cross-module results (students, patients, complaints, fees, receipts)
//   ✅ Ranked results — exact > prefix > fuzzy
//   ✅ Debounced — instant as you type
//   ✅ Search history saved to DB
//   ✅ Recent searches from localStorage

import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

// ─── Intent patterns ───────────────────────────────────────
const INTENTS = [
  // Attendance intents
  { pattern: /\babsent\b/i,          type: 'attendance', filter: 'absent',     label: 'Absent today' },
  { pattern: /\bpresent\b/i,         type: 'attendance', filter: 'present',    label: 'Present today' },
  { pattern: /\blow attendance\b/i,  type: 'attendance', filter: 'low',        label: 'Below 75%' },

  // Fee intents
  { pattern: /\bfee due\b|\bdue\b|\bdefaulter\b/i, type: 'fee', filter: 'due', label: 'Fee defaulters' },
  { pattern: /\bfee paid\b|\bpaid\b/i,             type: 'fee', filter: 'paid', label: 'Fee paid' },

  // Caste/welfare intents
  { pattern: /\bsc\b/i,    type: 'welfare', caste: 'SC',    label: 'SC students' },
  { pattern: /\bst\b/i,    type: 'welfare', caste: 'ST',    label: 'ST students' },
  { pattern: /\bbc\b/i,    type: 'welfare', caste: 'BC',    label: 'BC students' },
  { pattern: /\bews\b/i,   type: 'welfare', caste: 'EWS',   label: 'EWS students' },

  // Gender intents
  { pattern: /\bgirls?\b/i,  type: 'gender', gender: 'Female', label: 'Girl students' },
  { pattern: /\bboys?\b/i,   type: 'gender', gender: 'Male',   label: 'Boy students' },

  // Hostel intent
  { pattern: /\bhostel\b/i, type: 'hostel', label: 'Hostel students' },

  // IPD/admitted intent
  { pattern: /\badmitted\b|\bipd\b/i, type: 'ipd', label: 'Admitted patients' },
];

function detectIntents(query) {
  return INTENTS.filter((intent) => intent.pattern.test(query));
}

function extractClassInfo(query) {
  // Detect "class 6", "6A", "6-A", "class VI"
  const classMatch = query.match(/\b(?:class\s*)?(\d{1,2})\s*[-]?\s*([A-Z])?\b/i);
  if (classMatch) return { className: classMatch[1], section: classMatch[2]?.toUpperCase() };
  return null;
}

function stripIntentWords(query) {
  // Remove known intent words to get the name part
  return query
    .replace(/\babsent\b|\bpresent\b|\bfee due\b|\bdefaulter\b|\bpaid\b|\bsc\b|\bst\b|\bbc\b|\bews\b|\bgirls?\b|\bboys?\b|\bhostel\b|\badmitted\b|\bipd\b|\bclass\b|\blow attendance\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Main hook ─────────────────────────────────────────────
export function usePowerSearch(appId, userId) {
  const [results, setResults]           = useState([]);
  const [loading, setLoading]           = useState(false);
  const [query, setQuery]               = useState('');
  const [intentLabel, setIntentLabel]   = useState('');
  const [recentSearches, setRecent]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('mpower_searches') || '[]'); }
    catch { return []; }
  });

  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const search = useCallback(async (q) => {
    setQuery(q);
    const trimmed = q.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setIntentLabel('');
      setLoading(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setIntentLabel('');

      // Detect intents
      const intents = detectIntents(trimmed);
      const classInfo = extractClassInfo(trimmed);
      const namePart = stripIntentWords(trimmed);

      // Build label for detected intents
      if (intents.length > 0) {
        setIntentLabel(intents.map((i) => i.label).join(' + '));
      }

      try {
        const combined = [];

        // .in() needs an actual array of ids, not an unresolved query
        // builder — resolve this app's student ids once, cached so the
        // attendance and fee-due blocks below share one fetch if a
        // single search triggers both intents at once.
        let studentIds = null;
        async function getStudentIds() {
          if (studentIds) return studentIds;
          const { data } = await supabase.from('students').select('id').eq('app_id', appId);
          studentIds = (data || []).map((s) => s.id);
          return studentIds;
        }

        // ── Intent: attendance ────────────────────────────
        const attendanceIntent = intents.find((i) => i.type === 'attendance');
        if (attendanceIntent) {
          const today = new Date().toISOString().slice(0, 10);
          let attendanceQuery = supabase
            .from('attendance')
            .select('student_id, status, students(id, full_name, sid, section, parent_phone, class_id)')
            .eq('date', today)
            .in('student_id', await getStudentIds());

          if (attendanceIntent.filter === 'absent') attendanceQuery = attendanceQuery.eq('status', 'A');
          if (attendanceIntent.filter === 'present') attendanceQuery = attendanceQuery.eq('status', 'P');

          const { data: attData } = await attendanceQuery.limit(20);
          (attData || []).forEach((a) => {
            if (!a.students) return;
            const s = a.students;
            if (namePart && !s.full_name?.toLowerCase().includes(namePart.toLowerCase())) return;
            combined.push({
              id: s.id, _type: 'student',
              _icon: attendanceIntent.filter === 'absent' ? '❌' : '✅',
              _label: s.full_name,
              _sub: `${s.sid} · Section ${s.section} · ${attendanceIntent.label}`,
              _score: 90,
              _tag: attendanceIntent.label,
              _tagColor: attendanceIntent.filter === 'absent' ? '#E05A5A' : '#6AAA90',
              _path: '/school/attendance',
              _module: 'school',
            });
          });
        }

        // ── Intent: fee due ───────────────────────────────
        const feeIntent = intents.find((i) => i.type === 'fee');
        if (feeIntent && feeIntent.filter === 'due') {
          const { data: dueData } = await supabase
            .from('fee_dues')
            .select('id, fee_type, amount_due, amount_paid, students(id, full_name, sid, section)')
            .eq('status', 'pending')
            .in('student_id', await getStudentIds())
            .limit(20);

          (dueData || []).forEach((d) => {
            if (!d.students) return;
            const s = d.students;
            if (namePart && !s.full_name?.toLowerCase().includes(namePart.toLowerCase())) return;
            const balance = Number(d.amount_due) - Number(d.amount_paid);
            combined.push({
              id: d.id, _type: 'fee_due',
              _icon: '💰',
              _label: s.full_name,
              _sub: `${s.sid} · ${d.fee_type} · Balance ₹${balance.toLocaleString('en-IN')}`,
              _score: 85,
              _tag: 'Fee due',
              _tagColor: '#E8A020',
              _path: '/school/fee-collection',
              _module: 'school',
            });
          });
        }

        // ── Intent: welfare/caste ────────────────────────
        const welfareIntent = intents.find((i) => i.type === 'welfare');
        if (welfareIntent) {
          let wq = supabase.from('students')
            .select('id, full_name, sid, section, caste_category, gender')
            .eq('app_id', appId)
            .eq('status', 'active');

          // BC matches BC-A, BC-B, BC-C, BC-D, BC-E
          if (welfareIntent.caste === 'BC') {
            wq = wq.ilike('caste_category', 'BC%');
          } else {
            wq = wq.eq('caste_category', welfareIntent.caste);
          }
          if (namePart) wq = wq.ilike('full_name', `%${namePart}%`);

          const { data: wData } = await wq.limit(15);
          (wData || []).forEach((s) => {
            combined.push({
              id: s.id, _type: 'student',
              _icon: '🎓',
              _label: s.full_name,
              _sub: `${s.sid} · Section ${s.section} · ${s.caste_category}`,
              _score: 80,
              _tag: `${s.caste_category} — Welfare eligible`,
              _tagColor: '#9A8AE0',
              _path: '/school/admission',
              _module: 'school',
            });
          });
        }

        // ── Intent: gender ───────────────────────────────
        const genderIntent = intents.find((i) => i.type === 'gender');
        if (genderIntent) {
          let gq = supabase.from('students')
            .select('id, full_name, sid, section, gender')
            .eq('app_id', appId)
            .eq('status', 'active')
            .eq('gender', genderIntent.gender);
          if (namePart) gq = gq.ilike('full_name', `%${namePart}%`);
          const { data: gData } = await gq.limit(15);
          (gData || []).forEach((s) => {
            combined.push({
              id: s.id, _type: 'student',
              _icon: genderIntent.gender === 'Female' ? '👧' : '👦',
              _label: s.full_name,
              _sub: `${s.sid} · Section ${s.section}`,
              _score: 80,
              _tag: genderIntent.label,
              _tagColor: '#5A9ADF',
              _path: '/school/attendance',
              _module: 'school',
            });
          });
        }

        // ── Intent: hostel ───────────────────────────────
        if (intents.find((i) => i.type === 'hostel')) {
          let hq = supabase.from('students')
            .select('id, full_name, sid, section, student_type')
            .eq('app_id', appId)
            .eq('status', 'active')
            .eq('student_type', 'hostel');
          if (namePart) hq = hq.ilike('full_name', `%${namePart}%`);
          const { data: hData } = await hq.limit(15);
          (hData || []).forEach((s) => {
            combined.push({
              id: s.id, _type: 'student',
              _icon: '🏠',
              _label: s.full_name,
              _sub: `${s.sid} · Section ${s.section} · Hostel`,
              _score: 80,
              _tag: 'Hostel student',
              _tagColor: '#5A9ADF',
              _path: '/school/hostel',
              _module: 'school',
            });
          });
        }

        // ── Intent: IPD admitted ─────────────────────────
        if (intents.find((i) => i.type === 'ipd')) {
          const { data: ipdData } = await supabase
            .from('ipd_admissions')
            .select('id, bed_no, admission_date, patients(id, full_name, patient_uid, phone)')
            .is('discharge_date', null)
            .limit(15);
          (ipdData || []).forEach((a) => {
            if (!a.patients) return;
            if (namePart && !a.patients.full_name?.toLowerCase().includes(namePart.toLowerCase())) return;
            combined.push({
              id: a.patients.id, _type: 'patient',
              _icon: '🛏️',
              _label: a.patients.full_name,
              _sub: `${a.patients.patient_uid} · Bed ${a.bed_no} · Since ${a.admission_date}`,
              _score: 88,
              _tag: 'IPD admitted',
              _tagColor: '#E8A020',
              _path: '/hospital/ipd',
              _module: 'hospital',
            });
          });
        }

        // ── Name/ID search — students (no specific intent or name part found) ──
        if (!attendanceIntent && !feeIntent && (!welfareIntent && !genderIntent)) {

          // Run 3 parallel queries for students:
          // 1. Exact prefix match (highest score)
          // 2. Full text search (medium score)
          // 3. Trigram fuzzy (lower score, catches typos)
          const [exactStudents, ftStudents, fuzzyStudents] = await Promise.allSettled([

            // Exact / prefix
            supabase.from('students')
              .select('id, full_name, sid, section, parent_phone, caste_category, village_name, status, class_id')
              .eq('app_id', appId)
              .eq('status', 'active')
              .or(`full_name.ilike.${trimmed}%,sid.ilike.${trimmed}%,parent_phone.ilike.%${trimmed}%`)
              .limit(5),

            // Full-text
            supabase.from('students')
              .select('id, full_name, sid, section, parent_phone, caste_category, village_name, status')
              .eq('app_id', appId)
              .eq('status', 'active')
              .textSearch('search_vector', trimmed.split(' ').join(' & '), { config: 'simple' })
              .limit(8),

            // Trigram fuzzy — handles typos like "ravii" → "ravi"
            supabase.rpc('search_students_fuzzy', {
              p_app_id: appId,
              p_query: trimmed,
              p_limit: 8,
              p_threshold: 0.2,
            }),
          ]);

          const seenStudentIds = new Set();

          // Exact matches — score 100
          ((exactStudents.status === 'fulfilled' && exactStudents.value.data) || []).forEach((s) => {
            if (seenStudentIds.has(s.id)) return;
            seenStudentIds.add(s.id);
            combined.push({
              id: s.id, _type: 'student', _icon: '🎓',
              _label: s.full_name,
              _sub: `${s.sid} · Section ${s.section}${s.village_name ? ` · ${s.village_name}` : ''}${s.caste_category ? ` · ${s.caste_category}` : ''}`,
              _score: 100,
              _path: `/school/students/${s.id}`,
              _module: 'school',
            });
          });

          // Full-text — score 80
          ((ftStudents.status === 'fulfilled' && ftStudents.value.data) || []).forEach((s) => {
            if (seenStudentIds.has(s.id)) return;
            seenStudentIds.add(s.id);
            combined.push({
              id: s.id, _type: 'student', _icon: '🎓',
              _label: s.full_name,
              _sub: `${s.sid} · Section ${s.section}${s.village_name ? ` · ${s.village_name}` : ''}`,
              _score: 80,
              _path: `/school/students/${s.id}`,
              _module: 'school',
            });
          });

          // Fuzzy — score 60
          ((fuzzyStudents.status === 'fulfilled' && fuzzyStudents.value) || []).forEach((s) => {
            if (seenStudentIds.has(s.id)) return;
            seenStudentIds.add(s.id);
            combined.push({
              id: s.id, _type: 'student', _icon: '🎓',
              _label: s.full_name,
              _sub: `${s.sid} · Section ${s.section} · ~fuzzy match`,
              _score: 60,
              _tag: 'Similar name',
              _tagColor: 'rgba(255,255,255,0.3)',
              _path: `/school/students/${s.id}`,
              _module: 'school',
            });
          });
        }

        // ── Patients ───────────────────────────────────────
        const seenPatientIds = new Set();
        const [exactPatients, ftPatients, fuzzyPatients] = await Promise.allSettled([
          supabase.from('patients')
            .select('id, full_name, patient_uid, phone, abha_linked, gender')
            .eq('app_id', appId)
            .or(`full_name.ilike.${trimmed}%,patient_uid.ilike.${trimmed}%,phone.ilike.%${trimmed}%`)
            .limit(5),

          supabase.from('patients')
            .select('id, full_name, patient_uid, phone, abha_linked')
            .eq('app_id', appId)
            .textSearch('search_vector', trimmed.split(' ').join(' & '), { config: 'simple' })
            .limit(5),

          supabase.rpc('search_patients_fuzzy', {
            p_app_id: appId,
            p_query: trimmed,
            p_limit: 5,
            p_threshold: 0.2,
          }),
        ]);

        ((exactPatients.status === 'fulfilled' && exactPatients.value.data) || []).forEach((p) => {
          if (seenPatientIds.has(p.id)) return;
          seenPatientIds.add(p.id);
          combined.push({
            id: p.id, _type: 'patient', _icon: '🏥',
            _label: p.full_name,
            _sub: `${p.patient_uid}${p.phone ? ` · ${p.phone}` : ''}${p.abha_linked ? ' · ABHA ✓' : ''}`,
            _score: 100,
            _path: `/hospital/patients/${p.id}`,
            _module: 'hospital',
          });
        });

        ((ftPatients.status === 'fulfilled' && ftPatients.value.data) || []).forEach((p) => {
          if (seenPatientIds.has(p.id)) return;
          seenPatientIds.add(p.id);
          combined.push({
            id: p.id, _type: 'patient', _icon: '🏥',
            _label: p.full_name,
            _sub: `${p.patient_uid}${p.phone ? ` · ${p.phone}` : ''}`,
            _score: 80,
            _path: `/hospital/patients/${p.id}`,
            _module: 'hospital',
          });
        });

        ((fuzzyPatients.status === 'fulfilled' && fuzzyPatients.value) || []).forEach((p) => {
          if (seenPatientIds.has(p.id)) return;
          seenPatientIds.add(p.id);
          combined.push({
            id: p.id, _type: 'patient', _icon: '🏥',
            _label: p.full_name,
            _sub: `${p.patient_uid} · ~fuzzy match`,
            _score: 60,
            _tag: 'Similar name',
            _tagColor: 'rgba(255,255,255,0.3)',
            _path: `/hospital/patients/${p.id}`,
            _module: 'hospital',
          });
        });

        // ── Complaints ────────────────────────────────────
        const { data: complaintData } = await supabase
          .from('complaints')
          .select('id, case_no, title, stage, category, mandal_name')
          .or(`case_no.ilike.${trimmed}%,title.ilike.%${trimmed}%,title.ilike.${trimmed}%`)
          .limit(5);

        (complaintData || []).forEach((c) => {
          combined.push({
            id: c.id, _type: 'complaint', _icon: '🏛️',
            _label: c.title,
            _sub: `${c.case_no} · ${c.stage}${c.mandal_name ? ` · ${c.mandal_name}` : ''}`,
            _score: c.case_no.toLowerCase().startsWith(trimmed.toLowerCase()) ? 95 : 75,
            _path: `/grievance/track?case=${c.case_no}`,
            _module: 'grievance',
          });
        });

        // ── Fee receipts ───────────────────────────────────
        const { data: receiptData } = await supabase
          .from('fee_payments')
          .select('id, receipt_no, amount, paid_at')
          .ilike('receipt_no', `%${trimmed}%`)
          .limit(3);

        (receiptData || []).forEach((f) => {
          combined.push({
            id: f.id, _type: 'receipt', _icon: '🧾',
            _label: `Receipt ${f.receipt_no}`,
            _sub: `₹${Number(f.amount).toLocaleString('en-IN')} · ${new Date(f.paid_at).toLocaleDateString('en-IN')}`,
            _score: 85,
            _path: '/school/fee-collection',
            _module: 'school',
          });
        });

        // Class filter — if class detected, filter student results
        if (classInfo && classInfo.className) {
          const { data: classData } = await supabase
            .from('classes')
            .select('id')
            .eq('app_id', appId)
            .ilike('class_name', `%${classInfo.className}%`)
            .limit(1)
            .single();

          if (classData) {
            let classStudentQ = supabase.from('students')
              .select('id, full_name, sid, section, parent_phone, caste_category')
              .eq('app_id', appId)
              .eq('status', 'active')
              .eq('class_id', classData.id);
            if (classInfo.section) classStudentQ = classStudentQ.eq('section', classInfo.section);
            if (namePart) classStudentQ = classStudentQ.ilike('full_name', `%${namePart}%`);

            const { data: classStudents } = await classStudentQ.limit(20);
            const existingIds = new Set(combined.map((r) => r.id));
            (classStudents || []).forEach((s) => {
              if (existingIds.has(s.id)) return;
              combined.push({
                id: s.id, _type: 'student', _icon: '🎓',
                _label: s.full_name,
                _sub: `${s.sid} · Section ${s.section}${s.caste_category ? ` · ${s.caste_category}` : ''}`,
                _score: 90,
                _tag: `Class ${classInfo.className}${classInfo.section ? `-${classInfo.section}` : ''}`,
                _tagColor: '#5A9ADF',
                _path: '/school/attendance',
                _module: 'school',
              });
            });
          }
        }

        // Sort by score descending
        combined.sort((a, b) => b._score - a._score);

        // Deduplicate by id+type
        const seen = new Set();
        const deduped = combined.filter((r) => {
          const key = `${r._type}:${r.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setResults(deduped.slice(0, 25));

        // Save to search history
        if (appId && deduped.length > 0) {
          const entityTypes = [...new Set(deduped.map((r) => r._type))];
          supabase.from('search_history').insert({
            app_id: appId,
            user_id: userId || null,
            query: trimmed,
            result_count: deduped.length,
            entity_types: entityTypes,
          }).then(() => {});
        }

        // Save to recent searches (localStorage)
        setRecent((prev) => {
          const updated = [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, 8);
          try { localStorage.setItem('mpower_searches', JSON.stringify(updated)); } catch {}
          return updated;
        });

      } catch (err) {
        console.error('Search error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280); // 280ms debounce

  }, [appId, userId]);

  function clearResults() {
    setResults([]);
    setQuery('');
    setIntentLabel('');
  }

  function removeRecent(term) {
    setRecent((prev) => {
      const updated = prev.filter((r) => r !== term);
      try { localStorage.setItem('mpower_searches', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  return {
    query, results, loading, intentLabel,
    recentSearches, search, clearResults, removeRecent,
  };
}