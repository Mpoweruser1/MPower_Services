// supabase/functions/parent-get-data/index.ts
//
// Every request re-validates the session token server-side before
// returning anything — a client can never bypass this by crafting
// its own phone number, since the token is what's actually trusted,
// not anything the client claims.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { token } = await req.json();
    if (!token) return json({ error: 'Missing session token' }, 401);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: session } = await adminClient
      .from('parent_sessions').select('phone, expires_at').eq('token', token).maybeSingle();

    if (!session) return json({ error: 'Invalid session' }, 401);
    if (new Date(session.expires_at) < new Date()) return json({ error: 'Session expired — please log in again.' }, 401);

    const { data: students } = await adminClient
      .from('students')
      .select('id, full_name, sid, class_id, classes(class_name)')
      .eq('parent_phone', session.phone).eq('status', 'active');

    if (!students || students.length === 0) return json({ children: [] });

    const studentIds = students.map((s) => s.id);
    const classIds = [...new Set(students.map((s) => s.class_id).filter(Boolean))];

    const { data: attendance } = await adminClient
      .from('attendance').select('student_id, status').in('student_id', studentIds)
      .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

    const { data: dues } = await adminClient
      .from('fee_dues').select('id, student_id, amount_due, due_date, fee_payments(amount)').in('student_id', studentIds);

    const { data: homework } = classIds.length > 0
      ? await adminClient
          .from('homework_entries').select('class_id, subject, homework_date, description')
          .in('class_id', classIds)
          .order('homework_date', { ascending: false }).limit(10)
      : { data: [] };

    const children = students.map((s) => {
      const att = (attendance || []).filter((a) => a.student_id === s.id);
      const present = att.filter((a) => a.status === 'P' || a.status === 'L').length;
      const attendanceRate = att.length > 0 ? Math.round((present / att.length) * 100) : null;

      const studentDues = (dues || []).filter((d) => d.student_id === s.id);
      const totalDue = studentDues.reduce((sum, d) => sum + Number(d.amount_due), 0);
      const totalPaid = studentDues.reduce((sum, d) => sum + (d.fee_payments || []).reduce((s2, p) => s2 + Number(p.amount), 0), 0);

      const childHomework = (homework || [])
        .filter((h) => h.class_id === s.class_id)
        .slice(0, 5);

      return {
        id: s.id, name: s.full_name, sid: s.sid, className: s.classes?.class_name,
        attendanceRate, feeOutstanding: Math.max(0, totalDue - totalPaid),
        recentHomework: childHomework,
      };
    });

    return json({ children });
  } catch (err) {
    console.error(err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
