// shared/WelfareSchemeHelper.js — FINAL
import { supabase } from '../lib/supabaseClient';

export async function getStudentWelfareSchemes(student) {
  const { data: schemes } = await supabase
    .from('master_welfare_schemes')
    .select('*')
    .contains('applicable_module', ['school'])
    .eq('is_active', true);
  if (!schemes) return [];

  return schemes.filter((scheme) => {
    if (scheme.eligible_caste_categories?.length > 0) {
      if (!student.caste_category) return false;
      if (!scheme.eligible_caste_categories.includes(student.caste_category)) return false;
    }
    if (scheme.eligible_genders?.length > 0) {
      if (!student.gender) return false;
      if (!scheme.eligible_genders.includes(student.gender)) return false;
    }
    if (scheme.eligible_religions?.length > 0) {
      if (!student.religion) return false;
      if (!scheme.eligible_religions.includes(student.religion)) return false;
    }
    if (scheme.max_annual_income && student.annual_income) {
      if (Number(student.annual_income) > scheme.max_annual_income) return false;
    }
    if (scheme.requires_govt_school && student.school_type !== 'government') return false;
    return true;
  });
}

export async function getPatientWelfareSchemes() {
  const { data: schemes } = await supabase
    .from('master_welfare_schemes')
    .select('*')
    .contains('applicable_module', ['hospital'])
    .eq('is_active', true);
  return schemes || [];
}

export async function getGrievanceWelfareSchemes(category) {
  const TYPE_MAP = {
    pensions:  ['pension'],
    ration:    ['ration'],
    health:    ['hospital_govt_scheme', 'hospital_insurance'],
    education: ['school_scholarship', 'school_hostel', 'school_fee_reimbursement'],
    housing:   ['housing'],
    agriculture: ['agriculture'],
  };
  const types = TYPE_MAP[category];
  if (!types) return [];
  const { data } = await supabase
    .from('master_welfare_schemes')
    .select('*')
    .in('scheme_type', types)
    .eq('is_active', true);
  return data || [];
}

export async function markSchemeIdentified(studentId, schemeId, appId) {
  await supabase.from('student_welfare_schemes').upsert(
    { student_id: studentId, scheme_id: schemeId, app_id: appId, status: 'identified' },
    { onConflict: 'student_id,scheme_id' }
  );
}

export async function updateSchemeStatus(studentId, schemeId, status, remarks = '') {
  await supabase.from('student_welfare_schemes')
    .update({ status, remarks, updated_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .eq('scheme_id', schemeId);
}