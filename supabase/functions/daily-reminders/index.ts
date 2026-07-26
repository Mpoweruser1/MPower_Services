// supabase/functions/daily-reminders/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const TWILIO_ACCOUNT_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')!;
const TWILIO_AUTH_TOKEN    = Deno.env.get('TWILIO_AUTH_TOKEN')!;
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM')!;

const today     = new Date();
const dayOfWeek = today.getDay();
const isMonday  = dayOfWeek === 1;
const log: string[] = [];

async function sendWA(to: string, message: string) {
  if (!to || !TWILIO_ACCOUNT_SID) return false;
  const phone     = to.replace(/\D/g, '');
  const formatted = phone.startsWith('91') ? `+${phone}` : `+91${phone}`;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
          To:   `whatsapp:${formatted}`,
          Body: message,
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function feeDefaulterReminders() {
  const { data: overdue } = await supabase
    .from('fee_dues')
    .select(`
      id, amount_due, amount_paid, due_date, fee_type,
      students(id, full_name, sid, parent_phone, parent_name,
               apps(org_name))
    `)
    .lt('due_date', today.toISOString().slice(0, 10))
    .filter('amount_paid', 'lt', 'amount_due');

  if (!overdue || overdue.length === 0) return;

  const byStudent: Record<string, any> = {};
  for (const due of overdue) {
    const s = due.students as any;
    if (!s?.parent_phone) continue;
    if (!byStudent[s.id]) {
      byStudent[s.id] = {
        name:    s.full_name,
        sid:     s.sid,
        parent:  s.parent_name,
        phone:   s.parent_phone,
        orgName: s.apps?.org_name,
        dues:    [],
      };
    }
    const balance = Number(due.amount_due) - Number(due.amount_paid);
    byStudent[s.id].dues.push({
      type: due.fee_type, balance, dueDate: due.due_date,
    });
  }

  for (const student of Object.values(byStudent)) {
    const total   = student.dues.reduce((s: number, d: any) => s + d.balance, 0);
    const dueList = student.dues
      .map((d: any) => `  • ${d.type}: ₹${d.balance.toLocaleString('en-IN')} (due ${d.dueDate})`)
      .join('\n');

    const message = [
      `📚 *${student.orgName} — Fee Reminder*`,
      ``,
      `Dear ${student.parent || 'Parent'},`,
      ``,
      `Fees pending for *${student.name}* (${student.sid}):`,
      ``,
      dueList,
      ``,
      `*Total pending: ₹${total.toLocaleString('en-IN')}*`,
      ``,
      `Please pay at the school office or use the payment link sent earlier.`,
    ].join('\n');

    const sent = await sendWA(student.phone, message);
    if (sent) log.push(`Fee reminder → ${student.name}`);
  }
}

async function trialExpiryWarnings() {
  const { data: trials } = await supabase
    .from('crm_clients')
    .select('id, org_name, phone, contact_person, trial_ended_at, tier')
    .eq('status', 'trial')
    .not('trial_ended_at', 'is', null);

  if (!trials) return;

  for (const client of trials) {
    const daysLeft = Math.ceil(
      (new Date(client.trial_ended_at).getTime() - today.getTime()) / 86400000
    );
    if (![7, 3, 1].includes(daysLeft)) continue;

    const urgency = daysLeft === 1
      ? '🚨 *FINAL WARNING*'
      : daysLeft === 3
      ? '⚠️ *3 days remaining*'
      : '📅 *7 days remaining*';

    const message = [
      `${urgency} — MPower Trial Ending`,
      ``,
      `Dear ${client.contact_person || client.org_name},`,
      ``,
      `Your MPower free trial ends in *${daysLeft} day${daysLeft > 1 ? 's' : ''}*.`,
      ``,
      daysLeft === 1
        ? `⚠️ After today your account moves to read-only mode.`
        : `Upgrade to continue without interruption.`,
      ``,
      `💳 Plans start at ₹299/month`,
      `🔗 mpowerapp.in/pricing`,
    ].join('\n');

    if (client.phone) {
      const sent = await sendWA(client.phone, message);
      if (sent) log.push(`Trial expiry (${daysLeft}d) → ${client.org_name}`);
    }
  }
}

async function invoiceOverdueReminders() {
  const { data: invoices } = await supabase
    .from('billing_invoices_platform')
    .select(`
      id, invoice_no, amount, due_date, reminder_count,
      crm_clients(org_name, phone, contact_person)
    `)
    .eq('status', 'pending')
    .lt('due_date', today.toISOString().slice(0, 10))
    .lt('reminder_count', 3);

  if (!invoices) return;

  for (const inv of invoices) {
    const client     = inv.crm_clients as any;
    if (!client?.phone) continue;

    const daysOverdue = Math.floor(
      (today.getTime() - new Date(inv.due_date).getTime()) / 86400000
    );
    const reminderNum = (inv.reminder_count || 0) + 1;
    const final       = reminderNum >= 3;

    const message = [
      `💳 *MPower — Invoice Overdue${final ? ' (Final Reminder)' : ''}*`,
      ``,
      `Dear ${client.contact_person || client.org_name},`,
      ``,
      `Invoice *${inv.invoice_no}* for ₹${Number(inv.amount).toLocaleString('en-IN')} is *${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue*.`,
      ``,
      final
        ? `⚠️ Final reminder — please pay immediately to avoid suspension.`
        : `Please pay to avoid account suspension.`,
      ``,
      `🔗 mpowerapp.in/portal/account`,
    ].join('\n');

    const sent = await sendWA(client.phone, message);
    if (sent) {
      log.push(`Invoice overdue → ${client.org_name}`);
      await supabase
        .from('billing_invoices_platform')
        .update({ reminder_count: reminderNum, status: final ? 'overdue' : 'pending' })
        .eq('id', inv.id);
    }
  }
}

async function lowAttendanceWarnings() {
  if (!isMonday) return;

  const { data: students } = await supabase
    .from('students')
    .select(`id, full_name, sid, parent_phone, parent_name, apps(org_name)`)
    .eq('status', 'active')
    .not('parent_phone', 'is', null);

  if (!students) return;

  for (const student of students) {
    const yearStart = `${today.getFullYear()}-06-01`;

    const { count: totalDays } = await supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', student.id)
      .gte('date', yearStart);

    const { count: presentDays } = await supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', student.id)
      .eq('status', 'P')
      .gte('date', yearStart);

    if (!totalDays || totalDays < 10) continue;

    const pct = Math.round(((presentDays || 0) / totalDays) * 100);
    if (pct >= 75) continue;

    const s = student as any;
    const message = [
      `⚠️ *${s.apps?.org_name} — Low Attendance Alert*`,
      ``,
      `Dear ${s.parent_name || 'Parent'},`,
      ``,
      `*${s.full_name}* (${s.sid}) has *${pct}% attendance* this year.`,
      `Present: ${presentDays || 0} of ${totalDays} working days.`,
      ``,
      `Minimum required: 75%`,
      ``,
      pct < 65
        ? `🚨 Critically low — may affect welfare scheme eligibility.`
        : `Please ensure regular attendance.`,
    ].join('\n');

    const sent = await sendWA(s.parent_phone, message);
    if (sent) log.push(`Low attendance (${pct}%) → ${s.full_name}`);
  }
}

async function labResultPendingAlerts() {
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: pending } = await supabase
    .from('lab_tests')
    .select(`id, test_name, created_at, patients(full_name, app_id)`)
    .eq('status', 'pending')
    .lt('created_at', yesterday);

  if (!pending || pending.length === 0) return;

  const byApp: Record<string, any[]> = {};
  for (const test of pending) {
    const appId = (test.patients as any)?.app_id;
    if (!appId) continue;
    if (!byApp[appId]) byApp[appId] = [];
    byApp[appId].push(test);
  }

  for (const [appId, tests] of Object.entries(byApp)) {
    const { data: staff } = await supabase
      .from('users')
      .select('phone, full_name')
      .eq('app_id', appId)
      .in('role', ['doctor', 'nurse', 'developer'])
      .not('phone', 'is', null)
      .limit(1);

    if (!staff || staff.length === 0) continue;

    const testList = tests
      .slice(0, 10)
      .map((t: any) => `  • ${(t.patients as any)?.full_name} — ${t.test_name}`)
      .join('\n');

    const message = [
      `🔬 *MPower — Lab Results Pending*`,
      ``,
      `${tests.length} result${tests.length > 1 ? 's' : ''} pending over 24 hours:`,
      ``,
      testList,
      tests.length > 10 ? `  ... and ${tests.length - 10} more` : '',
      ``,
      `Please enter results to notify patients.`,
    ].filter(Boolean).join('\n');

    const sent = await sendWA(staff[0].phone, message);
    if (sent) log.push(`Lab pending → ${staff[0].full_name} (${tests.length} tests)`);
  }
}

async function ipdLongStayAlerts() {
  const sevenDaysAgo = new Date(
    today.getTime() - 7 * 24 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

  const { data: admissions } = await supabase
    .from('ipd_admissions')
    .select(`id, bed_no, admission_date, patients(full_name, app_id)`)
    .is('discharge_date', null)
    .lt('admission_date', sevenDaysAgo);

  if (!admissions || admissions.length === 0) return;

  const byApp: Record<string, any[]> = {};
  for (const adm of admissions) {
    const appId = (adm.patients as any)?.app_id;
    if (!appId) continue;
    if (!byApp[appId]) byApp[appId] = [];
    byApp[appId].push(adm);
  }

  for (const [appId, adms] of Object.entries(byApp)) {
    const { data: staff } = await supabase
      .from('users')
      .select('phone, full_name')
      .eq('app_id', appId)
      .in('role', ['doctor', 'developer'])
      .not('phone', 'is', null)
      .limit(1);

    if (!staff || staff.length === 0) continue;

    const admList = adms.map((a: any) => {
      const days = Math.floor(
        (today.getTime() - new Date(a.admission_date).getTime()) / 86400000
      );
      return `  • ${(a.patients as any)?.full_name} — Bed ${a.bed_no} — ${days} days`;
    }).join('\n');

    const message = [
      `🛏️ *MPower — IPD Long Stay Alert*`,
      ``,
      `${adms.length} patient${adms.length > 1 ? 's' : ''} admitted over 7 days:`,
      ``,
      admList,
      ``,
      `Please review for discharge or care plan update.`,
    ].join('\n');

    const sent = await sendWA(staff[0].phone, message);
    if (sent) log.push(`IPD long stay → ${staff[0].full_name} (${adms.length} patients)`);
  }
}

Deno.serve(async () => {
  try {
    await Promise.allSettled([
      feeDefaulterReminders(),
      trialExpiryWarnings(),
      invoiceOverdueReminders(),
      lowAttendanceWarnings(),
      labResultPendingAlerts(),
      ipdLongStayAlerts(),
    ]);

    return new Response(
      JSON.stringify({ success: true, log, date: today.toISOString() }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});