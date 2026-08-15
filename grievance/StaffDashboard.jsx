// src/pages/grievance/StaffDashboard.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import EvidenceGallery from './EvidenceGallery';
import { CATEGORY_EMOJI, StageBadge } from './CitizenPortal';
import { FeedbackWidget } from '../shared/FeedbackWidget';
import { fetchStaffQueue, fetchComplaintHistory, advanceComplaint, updateAssignedDepartment, fetchCategories, fetchConstituencies, fetchMandals, fetchVillages, uploadStaffPhoto, updateStaffProfile } from './grievanceApi';
import GrievanceNav from './GrievanceNav';

const TERMINAL_STAGES = ['Resolved', 'Sanctioned', 'Declined'];

export default function StaffDashboard() {
  const navigate = useNavigate();
  const { tenant, loading: tenantLoading } = useTenant();
  const [activeTab, setActiveTab] = useState('pending');
  const [listData, setListData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categories, setCategories] = useState([]);
  // More filters — date range + geography. Kept behind a toggle so the
  // primary search bar stays clean for the common case (just search or
  // category/priority), with these available when actually needed.
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [constituencyFilter, setConstituencyFilter] = useState('');
  const [mandalFilter, setMandalFilter] = useState('');
  const [villageFilter, setVillageFilter] = useState('');
  const [constituencyOptions, setConstituencyOptions] = useState([]);
  const [mandalOptions, setMandalOptions] = useState([]);
  const [villageOptions, setVillageOptions] = useState([]);
  const [activeComplaint, setActiveComplaint] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const PAGE_SIZE = 25;

  // Desktop grid — deliberately separate from the mobile card state
  // above. Mobile keeps its proven Prev/Next pagination exactly as
  // it was; the grid instead accumulates rows via infinite scroll,
  // loading more automatically as the user nears the bottom, so it
  // never shows a "Page X of Y" at all.
  const [gridData, setGridData] = useState([]);
  const [gridPage, setGridPage] = useState(0);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridHasMore, setGridHasMore] = useState(true);
  const gridScrollRef = useRef(null);

  const loadGridPage = useCallback((pageNum, replace) => {
    setGridLoading(true);
    fetchStaffQueue({ page: pageNum, pageSize: PAGE_SIZE, search, category: categoryFilter, priority: priorityFilter, handled: activeTab === 'handled', constituencyId: constituencyFilter, mandalId: mandalFilter, villageId: villageFilter, dateFrom, dateTo })
      .then(({ data, count }) => {
        setGridData((prev) => (replace ? data : [...prev, ...data]));
        setGridHasMore((pageNum + 1) * PAGE_SIZE < count);
      })
      .finally(() => setGridLoading(false));
  }, [search, categoryFilter, priorityFilter, activeTab, constituencyFilter, mandalFilter, villageFilter, dateFrom, dateTo]);

  // Same filter/tab changes that reset the mobile page also restart
  // the grid from scratch — a stale grid full of the wrong filter's
  // rows would be far more confusing than an empty one refilling.
  useEffect(() => {
    setGridPage(0);
    setGridHasMore(true);
    loadGridPage(0, true);
    if (gridScrollRef.current) gridScrollRef.current.scrollTop = 0;
  }, [search, categoryFilter, priorityFilter, activeTab, tenant?.appId, constituencyFilter, mandalFilter, villageFilter, dateFrom, dateTo]);

  function handleGridScroll(e) {
    const el = e.target;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom && !gridLoading && gridHasMore) {
      const next = gridPage + 1;
      setGridPage(next);
      loadGridPage(next, false);
    }
  }

  const reload = useCallback(() => {
    setListLoading(true);
    fetchStaffQueue({ page, pageSize: PAGE_SIZE, search, category: categoryFilter, priority: priorityFilter, handled: activeTab === 'handled', constituencyId: constituencyFilter, mandalId: mandalFilter, villageId: villageFilter, dateFrom, dateTo })
      .then(({ data, count }) => { setListData(data); setTotalCount(count); })
      .finally(() => setListLoading(false));
  }, [page, search, categoryFilter, priorityFilter, activeTab, constituencyFilter, mandalFilter, villageFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (tenant) reload();
  }, [tenant, reload]);

  useEffect(() => {
    if (tenant?.appId) fetchCategories(tenant.appId).then(setCategories).catch(() => {});
  }, [tenant?.appId]);

  useEffect(() => {
    if (tenant?.appId) fetchConstituencies(tenant.appId).then(setConstituencyOptions).catch(() => {});
  }, [tenant?.appId]);

  useEffect(() => {
    setMandalFilter('');
    setVillageFilter('');
    if (!constituencyFilter) { setMandalOptions([]); return; }
    fetchMandals(constituencyFilter).then(setMandalOptions).catch(() => {});
  }, [constituencyFilter]);

  useEffect(() => {
    setVillageFilter('');
    if (!mandalFilter) { setVillageOptions([]); return; }
    fetchVillages(mandalFilter).then(setVillageOptions).catch(() => {});
  }, [mandalFilter]);

  // Any filter or tab change starts back at page 1 — staying on, say,
  // page 4 after narrowing the search would very likely land on an
  // empty page that no longer has anything on it.
  useEffect(() => { setPage(0); }, [search, categoryFilter, priorityFilter, activeTab, constituencyFilter, mandalFilter, villageFilter, dateFrom, dateTo]);

  if (tenantLoading || !tenant) return <CenteredNote>Loading…</CenteredNote>;

  // FIX 1: Single role check — duplicate removed
  if (!['representative', 'authority', 'grievance_admin', 'grievance_staff'].includes(tenant.role)) {
    return <CenteredNote>This dashboard is for representatives, authorities, or grievance admins.</CenteredNote>;
  }

  const profileIncomplete = !tenant.phone || !tenant.alternatePhone;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    // FIX 2: paddingBottom 80px so content clears fixed GrievanceNav
    <div style={{ background: '#f0f4f8', minHeight: '100vh', color: '#1a1a2e', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 80px' }}>

        {profileIncomplete && !bannerDismissed && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            background: '#FFF8E8', border: '1px solid #A8762C40', borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          }}>
            <span style={{ fontSize: 12.5, color: '#5B4A2A' }}>
              📋 Complete your profile — contact number &amp; emergency contact on file for {tenant.fullName}.
            </span>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setShowProfileSetup(true)} style={{ fontSize: 12, fontWeight: 700, color: '#A8762C', background: 'none', border: 'none' }}>
                Complete now
              </button>
              <button onClick={() => setBannerDismissed(true)} style={{ fontSize: 12, color: '#5B6473', background: 'none', border: 'none' }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div style={{ position: 'sticky', top: 0, zIndex: 30, background: '#f0f4f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', marginBottom: 4 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              {roleLabel(tenant.role)} — {tenant.fullName}
            </h1>
            <p style={{ fontSize: 12.5, color: '#5B6473', margin: 0 }}>
              {totalCount} {activeTab === 'pending' ? 'pending' : 'handled'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <a href="/portal/dashboard" style={{ fontSize: 12, color: '#15213A', textDecoration: 'none', fontWeight: 600 }}>🏠 Home</a>
            <button onClick={() => setShowFeedback(true)} style={{ fontSize: 12, color: '#15213A', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
              💬 Feedback
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[{ key: 'pending', label: 'Pending action' }, { key: 'handled', label: 'Handled' }].map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{ padding: '7px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                background: activeTab === t.key ? '#15213A' : '#fff', color: activeTab === t.key ? '#fff' : '#5B6473',
                border: activeTab === t.key ? 'none' : '1px solid #D9D5C8' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search + filter bar — sticky, stays visible while scrolling
            through a long list, so it's never necessary to scroll back
            up just to search or change a filter */}
        <div style={{ position: 'sticky', top: 56, background: '#f0f4f8', zIndex: 20, paddingBottom: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title…"
              style={{ flex: '1 1 160px', padding: '9px 12px', border: '1px solid #D9D5C8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
            />
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ padding: '9px 10px', border: '1px solid #D9D5C8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.label_en}>{c.label_en}</option>)}
            </select>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}
              style={{ padding: '9px 10px', border: '1px solid #D9D5C8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
              <option value="">All priorities</option>
              <option value="Normal">Normal</option>
              <option value="Urgent">Urgent</option>
            </select>
            <button onClick={() => setShowMoreFilters((s) => !s)}
              style={{ padding: '9px 14px', border: `1px solid ${showMoreFilters ? '#15213A' : '#D9D5C8'}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: showMoreFilters ? '#15213A' : '#fff', color: showMoreFilters ? '#fff' : '#5B6473', cursor: 'pointer', fontWeight: 600 }}>
              {showMoreFilters ? '▲' : '▼'} More filters
            </button>
            <button onClick={() => {
              const params = new URLSearchParams();
              params.set('mode', 'staff_batch');
              params.set('status', activeTab === 'pending' ? 'PENDING_ONLY' : 'HANDLED_ONLY');
              if (search.trim()) params.set('search', search.trim());
              if (categoryFilter) params.set('category', categoryFilter);
              if (priorityFilter) params.set('priority', priorityFilter);
              if (constituencyFilter) params.set('constituencyId', constituencyFilter);
              if (mandalFilter) params.set('mandalId', mandalFilter);
              if (villageFilter) params.set('villageId', villageFilter);
              if (dateFrom) params.set('dateFrom', dateFrom);
              if (dateTo) params.set('dateTo', dateTo);
              navigate(`/grievance/print?${params.toString()}`);
            }}
              style={{ padding: '9px 14px', border: '1px solid #D9D5C8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#5B6473', cursor: 'pointer', fontWeight: 600 }}>
              🖨️ Print this view
            </button>
          </div>

          {showMoreFilters && (
            <div style={{ background: '#fff', border: '1px solid #D9D5C8', borderRadius: 8, padding: 12, marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#8B9099', letterSpacing: 0.5, margin: '0 0 6px' }}>PERIOD</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {[
                  { label: 'Today', apply: () => { const d = new Date().toISOString().slice(0, 10); setDateFrom(d); setDateTo(d); } },
                  { label: 'This week', apply: () => { const now = new Date(); const first = new Date(now); first.setDate(now.getDate() - now.getDay()); setDateFrom(first.toISOString().slice(0, 10)); setDateTo(now.toISOString().slice(0, 10)); } },
                  { label: 'This month', apply: () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); setDateFrom(first.toISOString().slice(0, 10)); setDateTo(now.toISOString().slice(0, 10)); } },
                  { label: 'All time', apply: () => { setDateFrom(''); setDateTo(''); } },
                ].map((preset) => (
                  <button key={preset.label} onClick={preset.apply}
                    style={{ padding: '5px 12px', borderRadius: 14, border: '1px solid #D9D5C8', background: '#F7F6F2', color: '#5B6473', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid #D9D5C8', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit' }} />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid #D9D5C8', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit' }} />
              </div>

              <p style={{ fontSize: 11, fontWeight: 700, color: '#8B9099', letterSpacing: 0.5, margin: '0 0 6px' }}>LOCATION</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={constituencyFilter} onChange={(e) => setConstituencyFilter(e.target.value)}
                  style={{ flex: '1 1 140px', padding: '7px 10px', border: '1px solid #D9D5C8', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' }}>
                  <option value="">All constituencies</option>
                  {constituencyOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={mandalFilter} onChange={(e) => setMandalFilter(e.target.value)} disabled={!constituencyFilter}
                  style={{ flex: '1 1 140px', padding: '7px 10px', border: '1px solid #D9D5C8', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', background: '#fff', opacity: constituencyFilter ? 1 : 0.5 }}>
                  <option value="">All mandals</option>
                  {mandalOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select value={villageFilter} onChange={(e) => setVillageFilter(e.target.value)} disabled={!mandalFilter}
                  style={{ flex: '1 1 140px', padding: '7px 10px', border: '1px solid #D9D5C8', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', background: '#fff', opacity: mandalFilter ? 1 : 0.5 }}>
                  <option value="">All villages</option>
                  {villageOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        <style>{`
          .mobile-queue-view { display: block; }
          .desktop-queue-grid { display: none; }
          @media (min-width: 900px) {
            .mobile-queue-view { display: none; }
            .desktop-queue-grid { display: block; }
          }
        `}</style>

        <div className="mobile-queue-view">
        {listLoading ? (
          <CenteredNote>Loading…</CenteredNote>
        ) : listData.length === 0 ? (
          <CenteredNote>{activeTab === 'pending' ? 'Queue clear.' : 'Nothing here yet.'}</CenteredNote>
        ) : (
          <>
            <p style={{ fontSize: 11.5, color: '#8B9099', margin: '0 0 10px' }}>
              {totalCount} total · showing {page * PAGE_SIZE + 1}–{Math.min(totalCount, (page + 1) * PAGE_SIZE)}
            </p>
            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              {activeTab === 'pending' ? listData.map((c) => (
                <ComplaintCard
                  key={c.id}
                  complaint={c}
                  role={tenant.role}
                  actorName={tenant.fullName}
                  onOpen={() => setActiveComplaint(c)}
                  onAction={reload}
                />
              )) : listData.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveComplaint(c)}
                  style={{ textAlign: 'left', padding: 12, border: '1px solid #D9D5C8', borderRadius: 8, background: '#fff', display: 'flex', gap: 10, alignItems: 'center' }}
                >
                  <span style={{ fontSize: 20 }}>{CATEGORY_EMOJI[c.category] || '📄'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</div>
                    <div style={{ marginTop: 4 }}><StageBadge stage={c.stage} /></div>
                  </div>
                </button>
              ))}
            </div>

            {/* Pagination — a fixed, always-reachable spot to move
                between pages, instead of needing to scroll through the
                whole list to get anywhere */}
            {totalPages > 1 && (
              <div style={{ position: 'sticky', bottom: 76, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #D9D5C8', borderRadius: 20, padding: '8px 18px', width: 'fit-content', margin: '0 auto', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: page === 0 ? '#D9D5C8' : '#15213A', cursor: page === 0 ? 'default' : 'pointer' }}>
                  ← Prev
                </button>
                <span style={{ fontSize: 12.5, color: '#5B6473', fontWeight: 600 }}>Page {page + 1} of {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: page >= totalPages - 1 ? '#D9D5C8' : '#15213A', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
        </div>

        {/* Desktop grid — sticky header, infinite scroll, no page
            numbers at all. Wider screens only; mobile keeps the card
            view above completely untouched. */}
        <div className="desktop-queue-grid">
          <p style={{ fontSize: 11.5, color: '#8B9099', margin: '0 0 10px' }}>
            {gridData.length} of {totalCount} loaded — scroll for more
          </p>
          <div
            ref={gridScrollRef}
            onScroll={handleGridScroll}
            style={{ maxHeight: '65vh', overflowY: 'auto', border: '1px solid #D9D5C8', borderRadius: 10, background: '#fff' }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: '#F7F6F2', zIndex: 1 }}>
                  {['Case No.', 'Title', 'Category', 'Priority', 'Stage', 'Filed'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid #D9D5C8', fontSize: 11.5, color: '#5B6473', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridData.length === 0 && !gridLoading ? (
                  <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#8B9099' }}>{activeTab === 'pending' ? 'Queue clear.' : 'Nothing here yet.'}</td></tr>
                ) : gridData.map((c) => (
                  <tr key={c.id} onClick={() => setActiveComplaint(c)} style={{ cursor: 'pointer', borderBottom: '1px solid #EFEDE6' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11.5, color: '#8B9099' }}>{c.case_no}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{CATEGORY_EMOJI[c.category] || '📄'} {c.title}</td>
                    <td style={{ padding: '10px 14px', color: '#5B6473' }}>{c.category}</td>
                    <td style={{ padding: '10px 14px' }}>{c.priority === 'Urgent' ? <span style={{ color: '#9B3C2E', fontWeight: 700 }}>🚨 Urgent</span> : 'Normal'}</td>
                    <td style={{ padding: '10px 14px' }}><StageBadge stage={c.stage} /></td>
                    <td style={{ padding: '10px 14px', color: '#8B9099', whiteSpace: 'nowrap' }}>{new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
                {gridLoading && (
                  <tr><td colSpan={6} style={{ padding: 14, textAlign: 'center', color: '#8B9099', fontSize: 12 }}>Loading more…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>


        {activeComplaint && (
          <ComplaintDetailDrawer
            complaint={activeComplaint}
            role={tenant.role}
            staffUserId={tenant.userRowId}
            actorName={tenant.fullName}
            onClose={() => setActiveComplaint(null)}
            onAction={() => {
              reload();
              setGridPage(0);
              setGridHasMore(true);
              loadGridPage(0, true);
              if (gridScrollRef.current) gridScrollRef.current.scrollTop = 0;
            }}
          />
        )}

        {showFeedback && (
          <FeedbackWidget
            appId={tenant.appId}
            userId={tenant.userRowId}
            context="staff_dashboard"
            onClose={() => setShowFeedback(false)}
          />
        )}

        {showProfileSetup && (
          <StaffProfileSetup tenant={tenant} onClose={() => setShowProfileSetup(false)} />
        )}
      </div>

      {/* FIX 2: GrievanceNav at correct level — outside content div, inside outer div */}
      <GrievanceNav />
    </div>
  );
}

function StaffProfileSetup({ tenant, onClose }) {
  const [phone, setPhone] = useState(tenant.phone || '');
  const [alternatePhone, setAlternatePhone] = useState(tenant.alternatePhone || '');
  const [photoFile, setPhotoFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phone.trim() || !alternatePhone.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let photoPath;
      if (photoFile) {
        photoPath = await uploadStaffPhoto({ userId: tenant.userRowId, file: photoFile });
      }
      await updateStaffProfile({
        userId: tenant.userRowId,
        phone: phone.trim(),
        alternatePhone: alternatePhone.trim(),
        photoUrl: photoPath,
      });
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Complete your profile</h2>
        <p style={{ fontSize: 12.5, color: '#5B6473', marginBottom: 18 }}>
          A contact number and emergency contact, kept on file for {tenant.fullName}.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6473' }}>📱 Contact number</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6473' }}>🚨 Emergency/alternate contact number</span>
            <input value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} required style={fieldStyle} />
          </label>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#8B9099' }}>📷 Photo (entirely optional)</span>
            <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
          </label>
          {error && <p style={{ fontSize: 12, color: '#9B3C2E' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy} style={{ flex: 1, background: '#15213A', color: '#fff', border: 'none', borderRadius: 7, padding: '11px 16px', fontSize: 14, fontWeight: 600 }}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid #D9D5C8', borderRadius: 7, fontSize: 14, fontWeight: 600, color: '#5B6473' }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const fieldStyle = { border: '1px solid #D9D5C8', borderRadius: 6, padding: '9px 11px', fontSize: 13.5, width: '100%' };

function roleLabel(role) {
  if (role === 'representative') return 'Representative Queue';
  if (role === 'authority') return 'Authority Decisions';
  return 'Grievance Admin';
}

function CenteredNote({ children }) {
  return <div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>{children}</div>;
}

function ComplaintCard({ complaint, role, actorName, onOpen, onAction }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(false);

  async function act(stage, visibility = 'public') {
    if (stage === 'Declined' && !note.trim()) { setWarn(true); return; }
    setWarn(false);
    setBusy(true);
    await advanceComplaint({ complaintId: complaint.id, stage, byName: actorName, note, visibility });
    setNote('');
    setBusy(false);
    onAction();
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #D9D5C8', borderRadius: 9, padding: 14 }}>
      <div onClick={onOpen} style={{ cursor: 'pointer', marginBottom: 10, display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 28, flexShrink: 0 }}>{CATEGORY_EMOJI[complaint.category] || '📄'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#8B9099', fontFamily: 'monospace' }}>{complaint.case_no}</div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{complaint.title}</div>
          <div style={{ fontSize: 12, color: '#5B6473', marginTop: 3 }}>{complaint.description}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <StageBadge stage={complaint.stage} />
            {complaint.priority === 'Urgent' && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#9B3C2E', background: '#9B3C2E20', borderRadius: 20, padding: '3px 10px' }}>
                🚨 Urgent
              </span>
            )}
          </div>
        </div>
      </div>

      <input
        value={note}
        onChange={(e) => { setNote(e.target.value); if (warn) setWarn(false); }}
        placeholder="Add a note — required if declining"
        style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, border: '1px solid #D9D5C8', borderRadius: 6, marginBottom: 8 }}
      />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(role === 'representative' || role === 'grievance_staff') && (
          <>
            {complaint.stage === 'Submitted' && <ActionBtn onClick={() => act('Acknowledged')} disabled={busy}>👀 Acknowledge</ActionBtn>}
            {complaint.stage === 'Acknowledged' && <ActionBtn onClick={() => act('In Progress')} disabled={busy}>🔧 Start work</ActionBtn>}
            {['Acknowledged', 'In Progress'].includes(complaint.stage) && (
              <>
                <ActionBtn onClick={() => act('Resolved')} disabled={busy} color="#3E5C45">✅ Mark resolved</ActionBtn>
                <ActionBtn onClick={() => act('Escalated', 'internal')} disabled={busy} color="#9B3C2E">⬆️ Escalate</ActionBtn>
              </>
            )}
            {['Submitted', 'Acknowledged', 'In Progress'].includes(complaint.stage) && (
              <ActionBtn onClick={() => act('Declined')} disabled={busy} color="#6B5B73">💬 Decline, with reason</ActionBtn>
            )}
          </>
        )}
        {role === 'authority' && complaint.stage === 'Escalated' && (
          <>
            <ActionBtn onClick={() => act('Sanctioned')} disabled={busy} color="#A8762C">💰 Approve &amp; sanction</ActionBtn>
            <ActionBtn onClick={() => act('In Progress', 'internal')} disabled={busy}>↩️ Send back</ActionBtn>
            <ActionBtn onClick={() => act('Declined')} disabled={busy} color="#6B5B73">💬 Decline, with reason</ActionBtn>
          </>
        )}
        {role === 'grievance_admin' && (
          <>
            <ActionBtn onClick={() => act('Acknowledged')} disabled={busy}>👀 Acknowledge</ActionBtn>
            <ActionBtn onClick={() => act('Resolved')} disabled={busy} color="#3E5C45">✅ Mark resolved</ActionBtn>
            <ActionBtn onClick={() => act('Declined')} disabled={busy} color="#6B5B73">💬 Decline, with reason</ActionBtn>
          </>
        )}
      </div>
      {warn && <p style={{ fontSize: 11, color: '#9B3C2E', marginTop: 6 }}>Add a reason before declining — the citizen will see it.</p>}
    </div>
  );
}

function ActionBtn({ onClick, disabled, color = '#15213A', children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 6,
        border: `1px solid ${color}`, background: 'transparent', color,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function ComplaintDetailDrawer({ complaint, role, staffUserId, actorName, onClose, onAction }) {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [department, setDepartment] = useState(complaint.assigned_department || '');
  const [remark, setRemark] = useState('');
  const [savingDept, setSavingDept] = useState(false);
  const [deptSaved, setDeptSaved] = useState(false);
  // Status-change action state — previously this drawer had NO way to
  // Acknowledge/Resolve/Escalate/Decline at all, only Department/
  // Remark/Print/History/Evidence. On desktop (the grid table view)
  // and on Reports, this drawer is the ONLY way to open a complaint —
  // there was no separate card with action buttons like mobile's Queue
  // has, so desktop/Reports users genuinely had no way to change a
  // complaint's status. Mobile was never broken; it uses ComplaintCard
  // directly, which already has these buttons. This mirrors that exact
  // same logic here so every entry point has equal, real functionality.
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    fetchComplaintHistory(complaint.id).then(setHistory);
  }, [complaint.id]);

  async function act(stage, visibility = 'public') {
    if (stage === 'Declined' && !note.trim()) { setWarn(true); return; }
    setWarn(false);
    setBusy(true);
    await advanceComplaint({ complaintId: complaint.id, stage, byName: actorName, note, visibility });
    setNote('');
    setBusy(false);
    onAction?.();
    onClose();
  }

  async function handleSaveDepartment() {
    setSavingDept(true);
    setDeptSaved(false);
    try {
      await updateAssignedDepartment(complaint.id, department.trim() || null);
      // A remark, if given, is logged as a normal history entry — same
      // stage as right now, so this never forces an unwanted status
      // change just to leave a note.
      if (remark.trim()) {
        await advanceComplaint({ complaintId: complaint.id, stage: complaint.stage, byName: actorName, note: remark.trim(), visibility: 'internal' });
        setRemark('');
        fetchComplaintHistory(complaint.id).then(setHistory);
      }
      setDeptSaved(true);
    } finally {
      setSavingDept(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 400, background: '#fff', height: '100%', padding: 20, overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ float: 'right', border: 'none', background: 'none' }}>✕</button>
        <div style={{ fontSize: 11, color: '#8B9099', fontFamily: 'monospace' }}>{complaint.case_no}</div>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>{complaint.title}</h3>
        <p style={{ fontSize: 13, color: '#3A4250', margin: '10px 0' }}>{complaint.description}</p>
        {complaint.suggested_solution && (
          <p style={{ fontSize: 12.5, color: '#5B6473', background: '#F7F6F2', padding: 8, borderRadius: 6 }}>
            <strong>Citizen's suggested solution:</strong> {complaint.suggested_solution}
          </p>
        )}

        {/* Status actions — same role/stage rules as ComplaintCard */}
        <input
          value={note}
          onChange={(e) => { setNote(e.target.value); if (warn) setWarn(false); }}
          placeholder="Add a note — required if declining"
          style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, border: '1px solid #D9D5C8', borderRadius: 6, margin: '10px 0 8px', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {(role === 'representative' || role === 'grievance_staff') && (
            <>
              {complaint.stage === 'Submitted' && <ActionBtn onClick={() => act('Acknowledged')} disabled={busy}>👀 Acknowledge</ActionBtn>}
              {complaint.stage === 'Acknowledged' && <ActionBtn onClick={() => act('In Progress')} disabled={busy}>🔧 Start work</ActionBtn>}
              {['Acknowledged', 'In Progress'].includes(complaint.stage) && (
                <>
                  <ActionBtn onClick={() => act('Resolved')} disabled={busy} color="#3E5C45">✅ Mark resolved</ActionBtn>
                  <ActionBtn onClick={() => act('Escalated', 'internal')} disabled={busy} color="#9B3C2E">⬆️ Escalate</ActionBtn>
                </>
              )}
              {['Submitted', 'Acknowledged', 'In Progress'].includes(complaint.stage) && (
                <ActionBtn onClick={() => act('Declined')} disabled={busy} color="#6B5B73">💬 Decline, with reason</ActionBtn>
              )}
            </>
          )}
          {role === 'authority' && complaint.stage === 'Escalated' && (
            <>
              <ActionBtn onClick={() => act('Sanctioned')} disabled={busy} color="#A8762C">💰 Approve &amp; sanction</ActionBtn>
              <ActionBtn onClick={() => act('In Progress', 'internal')} disabled={busy}>↩️ Send back</ActionBtn>
              <ActionBtn onClick={() => act('Declined')} disabled={busy} color="#6B5B73">💬 Decline, with reason</ActionBtn>
            </>
          )}
          {role === 'grievance_admin' && (
            <>
              <ActionBtn onClick={() => act('Acknowledged')} disabled={busy}>👀 Acknowledge</ActionBtn>
              <ActionBtn onClick={() => act('Resolved')} disabled={busy} color="#3E5C45">✅ Mark resolved</ActionBtn>
              <ActionBtn onClick={() => act('Declined')} disabled={busy} color="#6B5B73">💬 Decline, with reason</ActionBtn>
            </>
          )}
        </div>
        {warn && <p style={{ fontSize: 11, color: '#9B3C2E', marginTop: -4, marginBottom: 10 }}>Add a reason before declining — the citizen will see it.</p>}

        <div style={{ background: '#F7F6F2', border: '1px solid #D9D5C8', borderRadius: 8, padding: 12, margin: '12px 0' }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#5B6473', display: 'block', marginBottom: 4 }}>
            Assigned Department (from Collector's response)
          </label>
          <input
            value={department}
            onChange={(e) => { setDepartment(e.target.value); setDeptSaved(false); }}
            placeholder="e.g. Public Health Department"
            style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #D9D5C8', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box' }}
          />
          <label style={{ fontSize: 11, fontWeight: 600, color: '#5B6473', display: 'block', marginBottom: 4 }}>
            Remark (optional — internal note, won't change complaint status)
          </label>
          <input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="e.g. Collector's office confirmed inspection scheduled"
            style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #D9D5C8', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box' }}
          />
          <button onClick={handleSaveDepartment} disabled={savingDept}
            style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 700, background: '#15213A', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            {savingDept ? 'Saving…' : deptSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>

        {/* FIX 3: Print button */}
        <button
          onClick={() => navigate(`/grievance/print?case=${encodeURIComponent(complaint.case_no)}`)}
          style={{
            width: '100%', padding: '10px 14px', margin: '12px 0',
            background: '#fff', border: '1px solid #D9D5C8', borderRadius: 8,
            fontSize: 13, fontWeight: 600, color: '#15213A', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          🖨️ Print Representation Letter
        </button>

        <h4 style={{ fontSize: 13, fontWeight: 600, marginTop: 20 }}>Full history (including internal notes)</h4>
        {history.map((h) => (
          <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid #EFEDE6' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{h.stage}</span>
              {h.visibility === 'internal' && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#9B3C2E', border: '1px solid #9B3C2E', borderRadius: 10, padding: '1px 6px' }}>
                  INTERNAL
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#8B9099' }}>{h.by_name} · {new Date(h.created_at).toLocaleString()}</div>
            {h.note && <div style={{ fontSize: 12.5, marginTop: 3 }}>{h.note}</div>}
          </div>
        ))}
        <EvidenceGallery complaintId={complaint.id} uploaderUserId={staffUserId} canUpload />
        {/* FIX 3: GrievanceNav removed from here — it is in main return */}
      </div>
    </div>
  );
}