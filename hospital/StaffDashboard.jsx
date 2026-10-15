// src/pages/grievance/StaffDashboard.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import EvidenceGallery from './EvidenceGallery';
import { CATEGORY_EMOJI, StageBadge } from './CitizenPortal';
import { FeedbackWidget } from '../shared/FeedbackWidget';
import { fetchStaffQueue, fetchOverdueCount, slaInfo, fetchComplaintHistory, fetchComplaintFeedback, advanceComplaint, updateAssignedDepartment, fetchCategories, fetchConstituencies, fetchMandals, fetchVillages, uploadStaffPhoto, updateStaffProfile, resolveComplaintPlaces, fetchComplaintPlaces } from './grievanceApi';
import { placeName, homeName, gpsText, mapUrl, placeListLine } from './complaintPlace';
import GrievanceNav from './GrievanceNav';
import { PERIOD_PRESETS, presetRange, fmtIstDate, fmtIstDateTime } from './istDates';

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
  // Deadline tools (12-10-2026): show only complaints past their response
  // deadline, and/or list the oldest first so nothing waits at the bottom.
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [oldestFirst, setOldestFirst] = useState(false);
  const [overdueCount, setOverdueCount] = useState(null);
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
    fetchStaffQueue({ page: pageNum, pageSize: PAGE_SIZE, search, category: categoryFilter, priority: priorityFilter, handled: activeTab === 'handled', constituencyId: constituencyFilter, mandalId: mandalFilter, villageId: villageFilter, dateFrom, dateTo, overdueOnly, oldestFirst })
      .then(({ data, count }) => {
        setGridData((prev) => (replace ? data : [...prev, ...data]));
        setGridHasMore((pageNum + 1) * PAGE_SIZE < count);
      })
      .finally(() => setGridLoading(false));
  }, [search, categoryFilter, priorityFilter, activeTab, constituencyFilter, mandalFilter, villageFilter, dateFrom, dateTo, overdueOnly, oldestFirst]);

  // Same filter/tab changes that reset the mobile page also restart
  // the grid from scratch — a stale grid full of the wrong filter's
  // rows would be far more confusing than an empty one refilling.
  useEffect(() => {
    setGridPage(0);
    setGridHasMore(true);
    loadGridPage(0, true);
    if (gridScrollRef.current) gridScrollRef.current.scrollTop = 0;
  }, [search, categoryFilter, priorityFilter, activeTab, tenant?.appId, constituencyFilter, mandalFilter, villageFilter, dateFrom, dateTo, overdueOnly, oldestFirst]);

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
    fetchStaffQueue({ page, pageSize: PAGE_SIZE, search, category: categoryFilter, priority: priorityFilter, handled: activeTab === 'handled', constituencyId: constituencyFilter, mandalId: mandalFilter, villageId: villageFilter, dateFrom, dateTo, overdueOnly, oldestFirst })
      .then(({ data, count }) => { setListData(data); setTotalCount(count); })
      .finally(() => setListLoading(false));
  }, [page, search, categoryFilter, priorityFilter, activeTab, constituencyFilter, mandalFilter, villageFilter, dateFrom, dateTo, overdueOnly, oldestFirst]);

  useEffect(() => {
    if (tenant) reload();
  }, [tenant, reload]);

  // The overdue number in the header and on the Overdue button is a small
  // separate count, fetched once and again after any status change (not on
  // every keystroke of the search box). If it fails the number is simply left
  // out; the queue itself is unaffected.
  const refreshOverdue = useCallback(() => {
    fetchOverdueCount().then(setOverdueCount).catch(() => setOverdueCount(null));
  }, []);
  useEffect(() => {
    if (tenant) refreshOverdue();
  }, [tenant, refreshOverdue]);

  useEffect(() => {
    if (tenant?.appId) fetchCategories(tenant.appId).then(setCategories).catch(() => {});
  }, [tenant?.appId]);

  // Where each listed complaint's problem is (14-10-2026). Names are looked up in a few batched
  // requests for the rows on screen; a complaint already looked up is not asked for again. If it
  // fails, the lists simply show no place line -- nothing else on the screen depends on it.
  const [places, setPlaces] = useState({});
  const placesRef = useRef({});
  placesRef.current = places;
  useEffect(() => {
    // The phone list and the desktop grid hold the same complaints; ask for each only once.
    const missing = [...new Map([...listData, ...gridData].filter((r) => r && !placesRef.current[r.id]).map((r) => [r.id, r])).values()];
    if (missing.length === 0) return undefined;
    let live = true;
    resolveComplaintPlaces(missing)
      .then((m) => { if (live) setPlaces((prev) => ({ ...prev, ...m })); })
      .catch(() => {});
    return () => { live = false; };
  }, [listData, gridData]);

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
  useEffect(() => { setPage(0); }, [search, categoryFilter, priorityFilter, activeTab, constituencyFilter, mandalFilter, villageFilter, dateFrom, dateTo, overdueOnly, oldestFirst]);

  // Both early-exit states previously showed CenteredNote with zero
  // navigation — if tenantLoading ever hung, or a wrong-role user
  // landed here, there was no way back at all.
  if (tenantLoading || !tenant) return <><CenteredNote>Loading…</CenteredNote><GrievanceNav /></>;

  // FIX 1: Single role check — duplicate removed
  if (!['representative', 'authority', 'grievance_admin', 'grievance_staff'].includes(tenant.role)) {
    return <><CenteredNote>This dashboard is for representatives, authorities, or grievance admins.</CenteredNote><GrievanceNav /></>;
  }

  const emptyText = activeTab === 'pending' ? (overdueOnly ? 'Nothing is overdue.' : 'Queue clear.') : 'Nothing here yet.';
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
              {totalCount} {activeTab === 'pending' ? (overdueOnly ? 'overdue' : 'pending') : 'handled'}
              {activeTab === 'pending' && !overdueOnly && overdueCount > 0 && (
                <span style={{ color: '#9B3C2E', fontWeight: 700 }}> · {overdueCount} overdue</span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <Link to="/portal/dashboard" style={{ fontSize: 12, color: '#15213A', textDecoration: 'none', fontWeight: 600 }}>🏠 Home</Link>
            <button onClick={() => setShowFeedback(true)} style={{ fontSize: 12, color: '#15213A', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
              💬 Feedback
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {[{ key: 'pending', label: 'Pending action' }, { key: 'handled', label: 'Handled' }].map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{ padding: '7px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                background: activeTab === t.key ? '#15213A' : '#fff', color: activeTab === t.key ? '#fff' : '#5B6473',
                border: activeTab === t.key ? 'none' : '1px solid #D9D5C8' }}>
              {t.label}
            </button>
          ))}
          {activeTab === 'pending' && (
            <>
              <button onClick={() => setOverdueOnly((v) => !v)} aria-pressed={overdueOnly}
                style={{ padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  background: overdueOnly ? '#9B3C2E' : '#fff', color: overdueOnly ? '#fff' : '#9B3C2E',
                  border: '1px solid #9B3C2E' }}>
                ⏰ Overdue{overdueCount > 0 ? ` (${overdueCount})` : ''}
              </button>
              <select id="staff-dash-sort" name="staff-dash-sort" aria-label="Sort order" value={oldestFirst ? 'oldest' : 'newest'} onChange={(e) => setOldestFirst(e.target.value === 'oldest')}
                style={{ padding: '7px 10px', border: '1px solid #D9D5C8', borderRadius: 20, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#5B6473', fontWeight: 600 }}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </>
          )}
        </div>

        {/* Search + filter bar — sticky, stays visible while scrolling
            through a long list, so it's never necessary to scroll back
            up just to search or change a filter */}
        <div style={{ position: 'sticky', top: 56, background: '#f0f4f8', zIndex: 20, paddingBottom: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input id="staff-dash-search" name="staff-dash-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or case no…"
              style={{ flex: '1 1 160px', padding: '9px 12px', border: '1px solid #D9D5C8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
            />
            <select id="staff-dash-category-filter" name="staff-dash-category-filter" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ padding: '9px 10px', border: '1px solid #D9D5C8', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.label_en}>{c.label_en}</option>)}
            </select>
            <select id="staff-dash-priority-filter" name="staff-dash-priority-filter" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}
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
              params.set('status', activeTab === 'pending' ? (overdueOnly ? 'OVERDUE' : 'PENDING_ONLY') : 'HANDLED_ONLY');
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
              <p style={{ fontSize: 11, fontWeight: 700, color: '#5B6473', letterSpacing: 0.5, margin: '0 0 6px' }}>PERIOD</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {PERIOD_PRESETS.map((label) => ({
                  label,
                  // Indian-time periods (see istDates.js) -- not the device's UTC date
                  apply: () => { const r = presetRange(label); setDateFrom(r.from); setDateTo(r.to); },
                })).map((preset) => (
                  <button key={preset.label} onClick={preset.apply}
                    style={{ padding: '5px 12px', borderRadius: 14, border: '1px solid #D9D5C8', background: '#F7F6F2', color: '#5B6473', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input id="staff-dash-date-from" name="staff-dash-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid #D9D5C8', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit' }} />
                <input id="staff-dash-date-to" name="staff-dash-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid #D9D5C8', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit' }} />
              </div>

              <p style={{ fontSize: 11, fontWeight: 700, color: '#5B6473', letterSpacing: 0.5, margin: '0 0 6px' }}>PLACE OF THE PROBLEM</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select id="staff-dash-constituency-filter" name="staff-dash-constituency-filter" value={constituencyFilter} onChange={(e) => setConstituencyFilter(e.target.value)}
                  style={{ flex: '1 1 140px', padding: '7px 10px', border: '1px solid #D9D5C8', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' }}>
                  <option value="">All constituencies</option>
                  {constituencyOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select id="staff-dash-mandal-filter" name="staff-dash-mandal-filter" value={mandalFilter} onChange={(e) => setMandalFilter(e.target.value)} disabled={!constituencyFilter}
                  style={{ flex: '1 1 140px', padding: '7px 10px', border: '1px solid #D9D5C8', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', background: '#fff', opacity: constituencyFilter ? 1 : 0.5 }}>
                  <option value="">All mandals</option>
                  {mandalOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select id="staff-dash-village-filter" name="staff-dash-village-filter" value={villageFilter} onChange={(e) => setVillageFilter(e.target.value)} disabled={!mandalFilter}
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
          <CenteredNote>{emptyText}</CenteredNote>
        ) : (
          <>
            <p style={{ fontSize: 11.5, color: '#5B6473', margin: '0 0 10px' }}>
              {totalCount} total · showing {page * PAGE_SIZE + 1}–{Math.min(totalCount, (page + 1) * PAGE_SIZE)}
            </p>
            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              {activeTab === 'pending' ? listData.map((c) => (
                <ComplaintCard
                  key={c.id}
                  complaint={c}
                  place={places[c.id]}
                  role={tenant.role}
                  actorName={tenant.fullName}
                  onOpen={() => setActiveComplaint(c)}
                  onAction={() => { reload(); refreshOverdue(); }}
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
                    <PlaceLine place={places[c.id]} />
                    <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><StageBadge stage={c.stage} /><ReopenBadge complaint={c} /></div>
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
          <p style={{ fontSize: 11.5, color: '#5B6473', margin: '0 0 10px' }}>
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
                  {['Case No.', 'Title', 'Category', 'Priority', 'Stage', 'Filed', ...(activeTab === 'pending' ? ['Deadline'] : [])].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid #D9D5C8', fontSize: 11.5, color: '#5B6473', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridData.length === 0 && !gridLoading ? (
                  <tr><td colSpan={activeTab === 'pending' ? 7 : 6} style={{ padding: 20, textAlign: 'center', color: '#5B6473' }}>{emptyText}</td></tr>
                ) : gridData.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setActiveComplaint(c)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveComplaint(c); } }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open complaint ${c.case_no}: ${c.title}`}
                    style={{ cursor: 'pointer', borderBottom: '1px solid #EFEDE6' }}
                  >
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11.5, color: '#5B6473' }}>{c.case_no}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                      {CATEGORY_EMOJI[c.category] || '📄'} {c.title}
                      <PlaceLine place={places[c.id]} />
                    </td>
                    <td style={{ padding: '10px 14px', color: '#5B6473' }}>{c.category}</td>
                    <td style={{ padding: '10px 14px' }}>{c.priority === 'Urgent' ? <span style={{ color: '#9B3C2E', fontWeight: 700 }}>🚨 Urgent</span> : 'Normal'}</td>
                    <td style={{ padding: '10px 14px' }}><StageBadge stage={c.stage} /> <ReopenBadge complaint={c} /></td>
                    <td style={{ padding: '10px 14px', color: '#5B6473', whiteSpace: 'nowrap' }}>{fmtIstDate(c.created_at)}</td>
                    {activeTab === 'pending' && <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}><SlaChip complaint={c} /></td>}
                  </tr>
                ))}
                {gridLoading && (
                  <tr><td colSpan={activeTab === 'pending' ? 7 : 6} style={{ padding: 14, textAlign: 'center', color: '#5B6473', fontSize: 12 }}>Loading more…</td></tr>
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
              refreshOverdue();
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
          <label htmlFor="staff-dash-phone" style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6473' }}>📱 Contact number</span>
            <input id="staff-dash-phone" name="staff-dash-phone" value={phone} onChange={(e) => setPhone(e.target.value)} required style={fieldStyle} />
          </label>
          <label htmlFor="staff-dash-alternate-phone" style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6473' }}>🚨 Emergency/alternate contact number</span>
            <input id="staff-dash-alternate-phone" name="staff-dash-alternate-phone" value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} required style={fieldStyle} />
          </label>
          <label htmlFor="staff-dash-file" style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#5B6473' }}>📷 Photo (entirely optional)</span>
            <input id="staff-dash-file" name="staff-dash-file" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
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

// Deadline chip: red when past the deadline, amber in the last 2 days, quiet
// green otherwise. Shown only while a complaint is still open.
export function SlaChip({ complaint }) {
  const sla = slaInfo(complaint);
  if (!sla || sla.closed) return null;
  const tone = sla.status === 'overdue'
    ? { color: '#9B3C2E', bg: '#9B3C2E20' }
    : sla.status === 'soon'
      ? { color: '#A8762C', bg: '#A8762C20' }
      : { color: '#3E5C45', bg: '#3E5C4520' };
  return (
    <span title={`Response due within ${sla.allowedDays} days of ${sla.reopened ? 'the citizen reopening it' : 'filing'}`}
      style={{ fontSize: 11.5, fontWeight: 700, color: tone.color, background: tone.bg, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>
      ⏰ {sla.label}
    </span>
  );
}

// What each role may do to a complaint at each stage -- one list used by the
// Queue card and the detail drawer, so the two can never disagree. The database
// enforces the same rules; this only decides which buttons are worth showing.
const OPEN_STAGES = ['Submitted', 'Acknowledged', 'In Progress', 'Escalated'];
const ACT = {
  ack:      { stage: 'Acknowledged', label: '👀 Acknowledge' },
  start:    { stage: 'In Progress', label: '🔧 Start work' },
  resolve:  { stage: 'Resolved', label: '✅ Mark resolved', color: '#3E5C45' },
  escalate: { stage: 'Escalated', label: '⬆️ Escalate', color: '#9B3C2E', visibility: 'internal' },
  decline:  { stage: 'Declined', label: '💬 Decline, with reason', color: '#6B5B73' },
  sanction: { stage: 'Sanctioned', label: '💰 Approve & sanction', color: '#A8762C' },
  sendBack: { stage: 'In Progress', label: '↩️ Send back', visibility: 'internal' },
};

export function actionsFor(role, stage) {
  const list = [];
  if (role === 'representative' || role === 'grievance_staff') {
    if (stage === 'Submitted') list.push(ACT.ack);
    if (stage === 'Acknowledged') list.push(ACT.start);
    if (['Acknowledged', 'In Progress'].includes(stage)) list.push(ACT.resolve, ACT.escalate);
    if (['Submitted', 'Acknowledged', 'In Progress'].includes(stage)) list.push(ACT.decline);
  } else if (role === 'authority') {
    if (stage === 'Escalated') list.push(ACT.sanction, ACT.sendBack, ACT.decline);
  } else if (role === 'grievance_admin') {
    // Acknowledge only makes sense on a brand-new complaint; Resolve and
    // Decline are offered on any complaint that is still open, and never on a
    // finished one.
    if (stage === 'Submitted') list.push(ACT.ack);
    if (OPEN_STAGES.includes(stage)) list.push(ACT.resolve, ACT.decline);
  }
  return list;
}

function ActionButtons({ role, stage, busy, onAct }) {
  const list = actionsFor(role, stage);
  if (list.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {list.map((a) => (
        <ActionBtn key={a.label} onClick={() => onAct(a.stage, a.visibility)} disabled={busy} color={a.color}>{a.label}</ActionBtn>
      ))}
    </div>
  );
}

// Small marker for a complaint the citizen reopened after it was resolved.
export function ReopenBadge({ complaint }) {
  const n = Number(complaint?.reopen_count) || 0;
  if (n < 1) return null;
  return (
    <span title="The citizen said this was not really solved and reopened it"
      style={{ fontSize: 11, fontWeight: 700, color: '#9B3C2E', border: '1px solid #9B3C2E', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      🔁 Reopened{n > 1 ? ` ×${n}` : ''}
    </span>
  );
}

// The ratings a citizen gave, as seen by staff.
function FeedbackSummary({ rows, resolved }) {
  if (!rows || rows.length === 0) {
    return resolved ? <p style={{ fontSize: 12, color: '#5B6473', margin: '4px 0' }}>No citizen rating yet.</p> : null;
  }
  return (
    <div style={{ background: '#F7F6F2', border: '1px solid #D9D5C8', borderRadius: 8, padding: '8px 10px', margin: '8px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5B6473', marginBottom: 4 }}>CITIZEN RATING</div>
      {rows.map((r) => (
        <div key={r.cycle} style={{ fontSize: 12.5, color: '#1A1A2E', marginBottom: 3 }}>
          <span aria-label={`${r.rating} out of 5`} style={{ color: '#A8762C', letterSpacing: 1 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
          {' '}<strong>{r.rating}/5</strong>
          {(rows.length > 1 || r.cycle > 0) && <span style={{ color: '#5B6473' }}> · {r.cycle === 0 ? 'first resolution' : `after reopening ${r.cycle}`}</span>}
          {r.comment && <div style={{ color: '#3A4250', marginTop: 1 }}>“{r.comment}”</div>}
        </div>
      ))}
    </div>
  );
}

// One line under a complaint in the lists: where the problem is. Nothing is drawn until the place
// is known, or when there is nothing to say.
function PlaceLine({ place }) {
  const line = placeListLine(place);
  if (!line) return null;
  return <div style={{ fontSize: 12, fontWeight: 400, color: '#3A4250', marginTop: 4, overflowWrap: 'anywhere' }}>{line}</div>;
}

// "Where is the problem" in the detail drawer. Read-only: the citizen's choice is final.
// 📍 = the citizen chose the place; 🏠 = nothing separate was chosen (or an older complaint), so
// the problem is taken to be in the citizen's own area.
function PlaceBlock({ place }) {
  if (!place) return null;
  const where = placeName(place, true);
  const home = homeName(place);
  const gps = gpsText(place);
  const link = mapUrl(place);
  return (
    <div style={{ background: '#F7F6F2', border: '1px solid #D9D5C8', borderRadius: 8, padding: '8px 10px', margin: '8px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5B6473', marginBottom: 4 }}>WHERE IS THE PROBLEM</div>
      {place.basis === 'problem' ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', overflowWrap: 'anywhere' }}>📍 {where || 'Place chosen by the citizen'}</div>
      ) : (
        <div style={{ fontSize: 12.5, color: '#1A1A2E', overflowWrap: 'anywhere' }}>
          🏠 Same as the citizen's home area{where ? ` — ${where}` : ''}
        </div>
      )}
      {place.basis === 'problem' && place.differs && home && (
        <div style={{ fontSize: 12, color: '#5B6473', marginTop: 2 }}>Citizen's home area: {home}</div>
      )}
      {place.landmark && (
        <div style={{ fontSize: 12.5, color: '#3A4250', marginTop: 4, overflowWrap: 'anywhere' }}><strong>Landmark:</strong> {place.landmark}</div>
      )}
      {gps && (
        <div style={{ fontSize: 12.5, color: '#3A4250', marginTop: 4, overflowWrap: 'anywhere' }}>
          📌 GPS {gps}
          {link && (
            <div style={{ marginTop: 2 }}>
              <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: '#15213A', fontWeight: 600 }}>Open in Google Maps ↗</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function roleLabel(role) {
  if (role === 'representative') return 'Representative Queue';
  if (role === 'authority') return 'Authority Decisions';
  return 'Grievance Admin';
}

function CenteredNote({ children }) {
  return <div style={{ padding: 30, textAlign: 'center', color: '#5B6473', fontSize: 13.5 }}>{children}</div>;
}

function ComplaintCard({ complaint, place, role, actorName, onOpen, onAction }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(false);
  const [err, setErr] = useState('');

  // The database now refuses a status change that is not allowed and says why;
  // that message is shown here instead of the button silently doing nothing.
  async function act(stage, visibility = 'public') {
    if (stage === 'Declined' && !note.trim()) { setWarn(true); return; }
    setWarn(false);
    setErr('');
    setBusy(true);
    let ok = false;
    try {
      await advanceComplaint({ complaintId: complaint.id, stage, byName: actorName, note, visibility });
      ok = true;
    } catch (e) {
      setErr(e.message || 'Could not update this complaint. Please try again.');
    } finally {
      setBusy(false);
    }
    if (ok) { setNote(''); onAction(); }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #D9D5C8', borderRadius: 9, padding: 14 }}>
      <div
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        tabIndex={0}
        role="button"
        aria-label={`Open complaint ${complaint.case_no}: ${complaint.title}`}
        style={{ cursor: 'pointer', marginBottom: 10, display: 'flex', gap: 12 }}
      >
        <span style={{ fontSize: 28, flexShrink: 0 }}>{CATEGORY_EMOJI[complaint.category] || '📄'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#5B6473', fontFamily: 'monospace' }}>{complaint.case_no}</div>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{complaint.title}</div>
          <div style={{ fontSize: 12, color: '#5B6473', marginTop: 3 }}>{complaint.description}</div>
          <PlaceLine place={place} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
            <StageBadge stage={complaint.stage} />
            <ReopenBadge complaint={complaint} />
            {complaint.priority === 'Urgent' && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#9B3C2E', background: '#9B3C2E20', borderRadius: 20, padding: '3px 10px' }}>
                🚨 Urgent
              </span>
            )}
            <SlaChip complaint={complaint} />
          </div>
        </div>
      </div>

      <input id="staff-dash-note" name="staff-dash-note"
        value={note}
        onChange={(e) => { setNote(e.target.value); if (warn) setWarn(false); }}
        placeholder="Add a note — required if declining"
        style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, border: '1px solid #D9D5C8', borderRadius: 6, marginBottom: 8 }}
      />

      <ActionButtons role={role} stage={complaint.stage} busy={busy} onAct={act} />
      {warn && <p style={{ fontSize: 11, color: '#9B3C2E', marginTop: 6 }}>Add a reason before declining — the citizen will see it.</p>}
      {err && <p role="alert" style={{ fontSize: 11.5, color: '#9B3C2E', marginTop: 6 }}>{err}</p>}
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
  const [err, setErr] = useState('');
  const [feedback, setFeedback] = useState([]);
  const [deptError, setDeptError] = useState('');
  const [place, setPlace] = useState(null);

  useEffect(() => {
    fetchComplaintHistory(complaint.id).then(setHistory);
  }, [complaint.id]);

  // Where the problem is (14-10-2026). Looked up here by id so it works the same whichever screen
  // opened this drawer (Queue, grid, Reports). If it cannot be read, the block is simply left out.
  useEffect(() => {
    let live = true;
    setPlace(null);
    fetchComplaintPlaces([complaint.id]).then((m) => { if (live) setPlace(m[complaint.id] || null); }).catch(() => {});
    return () => { live = false; };
  }, [complaint.id]);

  // The citizen's ratings for this complaint (empty if none, or if the table
  // cannot be read -- the drawer works the same without it).
  useEffect(() => {
    let live = true;
    fetchComplaintFeedback(complaint.id).then((rows) => { if (live) setFeedback(rows); }).catch(() => { if (live) setFeedback([]); });
    return () => { live = false; };
  }, [complaint.id]);

  async function act(stage, visibility = 'public') {
    if (stage === 'Declined' && !note.trim()) { setWarn(true); return; }
    setWarn(false);
    setErr('');
    setBusy(true);
    let ok = false;
    try {
      await advanceComplaint({ complaintId: complaint.id, stage, byName: actorName, note, visibility });
      ok = true;
    } catch (e) {
      setErr(e.message || 'Could not update this complaint. Please try again.');
    } finally {
      setBusy(false);
    }
    if (ok) {
      setNote('');
      onAction?.();
      onClose();
    }
  }

  async function handleSaveDepartment() {
    setSavingDept(true);
    setDeptSaved(false);
    setDeptError('');
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
    } catch (e) {
      setDeptError(e.message || 'Could not save. Please try again.');
    } finally {
      setSavingDept(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 100 }} onClick={onClose}>
      <div style={{ width: 400, background: '#fff', height: '100%', padding: 20, overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" style={{ float: 'right', border: 'none', background: 'none' }}>✕</button>
        <div style={{ fontSize: 11, color: '#5B6473', fontFamily: 'monospace' }}>{complaint.case_no}</div>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>{complaint.title}</h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0' }}>
          <StageBadge stage={complaint.stage} />
          <ReopenBadge complaint={complaint} />
          <SlaChip complaint={complaint} />
          {slaInfo(complaint)?.closed && (
            <span style={{ fontSize: 11.5, color: '#5B6473' }}>{slaInfo(complaint).label} (allowed {slaInfo(complaint).allowedDays}d)</span>
          )}
        </div>
        {complaint.reopened_at && (
          <p style={{ fontSize: 12, color: '#9B3C2E', margin: '4px 0' }}>
            🔁 Reopened by the citizen {Number(complaint.reopen_count) > 1 ? `${complaint.reopen_count} times` : 'once'} · last on {fmtIstDate(complaint.reopened_at)}. The deadline restarted on that day.
          </p>
        )}
        <FeedbackSummary rows={feedback} resolved={complaint.stage === 'Resolved'} />
        <p style={{ fontSize: 13, color: '#3A4250', margin: '10px 0' }}>{complaint.description}</p>
        <PlaceBlock place={place} />
        {complaint.suggested_solution && (
          <p style={{ fontSize: 12.5, color: '#5B6473', background: '#F7F6F2', padding: 8, borderRadius: 6 }}>
            <strong>Citizen's suggested solution:</strong> {complaint.suggested_solution}
          </p>
        )}

        {/* Status actions — same role/stage rules as ComplaintCard */}
        <input id="staff-dash-note-2" name="staff-dash-note-2"
          value={note}
          onChange={(e) => { setNote(e.target.value); if (warn) setWarn(false); }}
          placeholder="Add a note — required if declining"
          style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, border: '1px solid #D9D5C8', borderRadius: 6, margin: '10px 0 8px', boxSizing: 'border-box' }}
        />
        <div style={{ marginBottom: 10 }}>
          <ActionButtons role={role} stage={complaint.stage} busy={busy} onAct={act} />
        </div>
        {warn && <p style={{ fontSize: 11, color: '#9B3C2E', marginTop: -4, marginBottom: 10 }}>Add a reason before declining — the citizen will see it.</p>}
        {err && <p role="alert" style={{ fontSize: 11.5, color: '#9B3C2E', marginTop: -4, marginBottom: 10 }}>{err}</p>}

        <div style={{ background: '#F7F6F2', border: '1px solid #D9D5C8', borderRadius: 8, padding: 12, margin: '12px 0' }}>
          <label htmlFor="staff-dash-department" style={{ fontSize: 11, fontWeight: 600, color: '#5B6473', display: 'block', marginBottom: 4 }}>
            Assigned Department (from Collector's response)
          </label>
          <input id="staff-dash-department" name="staff-dash-department"
            value={department}
            onChange={(e) => { setDepartment(e.target.value); setDeptSaved(false); }}
            placeholder="e.g. Public Health Department"
            style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #D9D5C8', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box' }}
          />
          <label htmlFor="staff-dash-remark" style={{ fontSize: 11, fontWeight: 600, color: '#5B6473', display: 'block', marginBottom: 4 }}>
            Remark (optional — internal note, won't change complaint status)
          </label>
          <input id="staff-dash-remark" name="staff-dash-remark"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="e.g. Collector's office confirmed inspection scheduled"
            style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #D9D5C8', borderRadius: 6, marginBottom: 8, boxSizing: 'border-box' }}
          />
          <button onClick={handleSaveDepartment} disabled={savingDept}
            style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 700, background: '#15213A', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            {savingDept ? 'Saving…' : deptSaved ? '✓ Saved' : 'Save'}
          </button>
          {deptError && <p role="alert" style={{ fontSize: 11.5, color: '#9B3C2E', margin: '8px 0 0' }}>{deptError}</p>}
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
            <div style={{ fontSize: 11, color: '#5B6473' }}>{h.by_name} · {fmtIstDateTime(h.created_at)}</div>
            {h.note && <div style={{ fontSize: 12.5, marginTop: 3 }}>{h.note}</div>}
          </div>
        ))}
        <EvidenceGallery complaintId={complaint.id} uploaderUserId={staffUserId} canUpload />
        {/* FIX 3: GrievanceNav removed from here — it is in main return */}
      </div>
    </div>
  );
}