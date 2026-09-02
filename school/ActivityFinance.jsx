// school/ActivityFinance.jsx — NEW
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTenant } from '../context/TenantContext';
import SchoolNav from '../shared/SchoolNav';
import BugReporter from '../shared/BugReporter';

function currency(n) { return `\u20b9${Number(n || 0).toLocaleString('en-IN')}`; }

const S = {
  page: { fontFamily: "'Inter', -apple-system, sans-serif", background: '#1C1C1E', minHeight: '100vh', color: '#fff', paddingBottom: 100 },
  inner: { maxWidth: 720, margin: '0 auto', padding: '24px 20px' },
  card: { background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 12 },
};

export default function ActivityFinance() {
  const { tenant } = useTenant();
  const [activities, setActivities] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [payments, setPayments] = useState({});
  const [expenses, setExpenses] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (tenant?.appId) load();
  }, [tenant?.appId]);

  async function load() {
    setLoading(true);
    const { data: acts } = await supabase
      .from('activities').select('id, activity_name, activity_type, activity_date')
      .eq('app_id', tenant.appId).order('activity_date', { ascending: false });
    setActivities(acts || []);

    const ids = (acts || []).map((a) => a.id);
    if (ids.length > 0) {
      const { data: budgetRows } = await supabase.from('activity_budgets').select('*').in('activity_id', ids);
      setBudgets(Object.fromEntries((budgetRows || []).map((b) => [b.activity_id, b])));

      const { data: paymentRows } = await supabase.from('activity_fee_payments').select('activity_id, amount_paid').in('activity_id', ids);
      const paymentMap = {};
      (paymentRows || []).forEach((p) => {
        if (!paymentMap[p.activity_id]) paymentMap[p.activity_id] = { count: 0, total: 0 };
        paymentMap[p.activity_id].count++;
        paymentMap[p.activity_id].total += Number(p.amount_paid);
      });
      setPayments(paymentMap);

      const { data: expenseRows } = await supabase.from('activity_expenses').select('activity_id, estimated_amount, actual_amount').in('activity_id', ids);
      const expenseMap = {};
      (expenseRows || []).forEach((e) => {
        if (!expenseMap[e.activity_id]) expenseMap[e.activity_id] = { estimated: 0, actual: 0 };
        expenseMap[e.activity_id].estimated += Number(e.estimated_amount || 0);
        expenseMap[e.activity_id].actual += Number(e.actual_amount || 0);
      });
      setExpenses(expenseMap);
    }
    setLoading(false);
  }

  async function setupBudget(activity, feePerStudent, studentCount) {
    await supabase.from('activity_budgets').upsert({
      app_id: tenant.appId, activity_id: activity.id,
      fee_per_student: feePerStudent, student_count: studentCount,
      created_by: tenant.userRowId,
    }, { onConflict: 'activity_id' });
    load();
  }

  if (loading) return <div style={{ ...S.page, textAlign: 'center', paddingTop: 60 }}><p style={{ color: 'rgba(255,255,255,0.3)' }}>Loading...</p><SchoolNav /></div>;

  return (
    <div style={S.page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div style={S.inner}>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Finance</p>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>Activity Finance</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>Budget, collect, and track spending per activity or trip.</p>
        </div>

        {activities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#161618', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No activities yet — add one in Activities & Coaching first.</p>
          </div>
        ) : (
          activities.map((a) => {
            const budget = budgets[a.id];
            const payment = payments[a.id] || { count: 0, total: 0 };
            const expense = expenses[a.id] || { estimated: 0, actual: 0 };
            const expectedTotal = budget ? budget.fee_per_student * budget.student_count : 0;
            const collectionPct = expectedTotal > 0 ? Math.round((payment.total / expectedTotal) * 100) : 0;
            const balance = payment.total - expense.actual;
            const isExpanded = expanded === a.id;

            return (
              <div key={a.id} style={S.card}>
                <button onClick={() => setExpanded(isExpanded ? null : a.id)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{isExpanded ? '▼' : '▶'} {a.activity_name}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{a.activity_type}</span>
                </button>

                {!budget ? (
                  isExpanded && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <BudgetSetupForm onSubmit={(fee, count) => setupBudget(a, fee, count)} />
                    </div>
                  )
                ) : (
                  <>
                    <div style={{ background: '#111113', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', background: '#6AAA90', width: `${Math.min(collectionPct, 100)}%` }} />
                    </div>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                      {payment.count}/{budget.student_count} paid · {currency(payment.total)} of {currency(expectedTotal)} collected ({collectionPct}%)
                    </p>

                    {isExpanded && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                          <div style={{ background: '#111113', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                            <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#6AAA90' }}>{currency(payment.total)}</p>
                            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '2px 0 0' }}>Collected</p>
                          </div>
                          <div style={{ background: '#111113', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                            <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#E05A5A' }}>{currency(expense.actual)}</p>
                            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '2px 0 0' }}>Spent</p>
                          </div>
                          <div style={{ background: '#111113', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                            <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: balance >= 0 ? '#6AAA90' : '#E05A5A' }}>{currency(balance)}</p>
                            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '2px 0 0' }}>Balance</p>
                          </div>
                        </div>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                          Fee per student: {currency(budget.fee_per_student)} · {budget.student_count} students expected
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      <SchoolNav />
      <BugReporter screenName="activity_finance" />
    </div>
  );
}

function BudgetSetupForm({ onSubmit }) {
  const [fee, setFee] = useState('');
  const [count, setCount] = useState('');
  return (
    <div>
      <p style={{ fontSize: 12, color: '#E8A020', fontWeight: 600, marginBottom: 10 }}>Set up budget for this activity</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4, display: 'block' }}>Fee per student (₹)</label>
          <input value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, ''))} placeholder="500"
            style={{ width: '100%', padding: '8px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#fff', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4, display: 'block' }}>Expected students</label>
          <input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} placeholder="30"
            style={{ width: '100%', padding: '8px 12px', background: '#111113', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#fff', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>
      </div>
      <button onClick={() => fee && count && onSubmit(Number(fee), Number(count))}
        style={{ width: '100%', padding: 9, border: 'none', borderRadius: 7, background: '#E8A020', color: '#111113', fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
        Set budget
      </button>
    </div>
  );
}
