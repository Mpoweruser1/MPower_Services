**Purpose & context**

Surya is the primary developer and product owner of **MPower**, a multi-tenant SaaS platform targeting schools, hospitals, and government/civic institutions in Andhra Pradesh and Telangana, India. The platform is built on **React + Vite + Supabase (PostgreSQL, Edge Functions, Auth, RLS) + Netlify** and comprises four modules:

- **School** – student management, attendance, fees, TC issuance, hostel, transport, academics, HRMS
- **Hospital** – patient management, billing, analytics, online payments
- **CTS (Citizen Grievance Tracking)** – citizen-facing grievance filing routed to MLA/MP/MLC representatives, with AP/TG state-specific welfare scheme categories
- **Control Panel** – super-admin/subscription management

Domain context is deeply India-specific: Telugu-language terminology, AP/TG state welfare schemes (Talliki Vandanam, Arogyasri, Amma Vodi, Dalit Bandhu, Rythu Bharosa, etc.), government identifiers (APAAR, ABHA, UDISE+), and Indian payment infrastructure (UPI, Razorpay, DD). The platform uses Indian Labour Code 2025 compliance defaults for HRMS payroll.

**Build sequencing** (explicitly agreed): School → Hospital → HRMS → CTS features. Real deployed usage is expected to surface practical issues before HRMS design resumes.

---

**Current state**

The platform has recently completed an intensive pre-launch preparation phase (as of early September 2026) covering all four modules. Major work completed:

- **Systematic bug audit** across all four modules with real user testing driving discovery
- **Database schema audit**: CHECK constraints, UNIQUE constraints, NOT NULL fields — several critical mismatches found and fixed (see Key Learnings)
- **Accessibility pass** across all ~89 files (~184 fields fixed with proper labels/ids)
- **Route audit** — verified zero missing routes (after fixing a false-negative bug in the first audit pass caused by catch-all `<Route path="*">`)
- **UPI QR payment feature** built; School and Hospital billing use both QR and PayButton; Control Panel subscription billing uses PayButton only
- **Four test accounts** (Mother Theresa School, City Care Hospital, Government of Andhra Pradesh, MLA Anaparthi) upgraded to highest subscription tier for full report testing
- **TC issuance** hard-blocks when no fee records exist — requires override reason rather than just a warning
- **RBAC permissions system** — fully database-driven with no hardcoded defaults; owner roles (principal, doctor) always receive full access as a lockout safety net
- **CTS geographic data** — AP districts and several coastal AP districts' mandal/constituency data seeded; Telangana data partially seeded (blocked by GHMC trifurcation ward map uncertainty)

**Still open at last session end:**
- `verify-otp` 400 error in CTS (never received Network tab response body to diagnose)
- GoTrueClient multiple-instances console warning (confirmed non-breaking)
- GHMC trifurcation (GHMC/MMC/CMC) and NTR district VMC ward redelimitation leaving some urban Telangana mandal data deferred
- HRMS module design and build (deliberately paused pending School launch)

---

**On the horizon**

- Resuming HRMS design and build after School goes live in production
- Completing Telangana geographic data once GHMC ward maps are finalized
- Resolving the CTS `verify-otp` 400 error with full Network tab diagnostics
- Potential CTS logout visibility issue across platform modules (flagged but not yet resolved)

---

**Key learnings & principles**

**Critical bugs found — costly to re-encounter:**
- `pass_fail` CHECK constraint requires lowercase `'pass'`/`'fail'`; sending `'Pass'`/`'Fail'` caused silent save failures
- Student graduation: `PromoteStudents.jsx` wrote `'graduated'` but constraint only allows `'passed_out'` — graduation had never successfully completed
- `fee_dues.amount_paid` was never updated by real payments — causing stale fee balances everywhere it was read
- Race condition in TransferCertificate: slower prior student's fee fetch could overwrite a newer student's data
- Hostel meal attendance used `date` instead of real column `meal_date` in both read and write
- `transport_stops.arrival_time` doesn't exist — real column is `pickup_time`
- Registration RLS error: `auth.uid()` is null when Supabase email confirmation is enabled
- `/control/feedback` route was missing despite FeedbackOverview.jsx being fully built
- 12 instances of plain `<a href>` tags causing full-page reloads wiping in-memory sessions (`persistSession: false` is deliberate by design for shared-device security)
- `userId` vs `userRowId` mismatch: `auth.users.id` ≠ `users.id` — found across 6 files; always confirm which ID is the correct FK reference
- DB migration silent no-ops: UPDATE statements against non-existent rows appear successful — always use direct INSERTs with NOT EXISTS guards

**Architecture facts to preserve:**
- `current_app_id()` only resolves for staff sessions, not anonymous citizens
- `seed_default_client_data()` trigger auto-creates classes/wards on registration — adding "create from scratch" code is not just redundant but dangerous
- `persistSession: false` is intentional (shared-device security)
- CTS uses both `'grievance'` and `'government'` as `app_type` values inconsistently — known debt
- Cross-district constituencies assigned to whichever district contains the majority of their mandals
- Mandals with constituency boundaries splitting at village/ward level modeled as `coverage_type = 'partial'` in `mandal_constituencies`

**Regression prevention:**
- A significant regression occurred when four files (AdminVerificationQueue, CrmClientView, ReportsDashboard, StaffDashboard) were provided using stale base files, overwriting previously fixed functionality. **Always check for previously-fixed versions before using a fresh upload as a base.**

---

**Approach & patterns**

- **Direct, iterative working style**: Surya frequently responds with single words ("Ok," "Yes," "Continue") to advance work and pushes back when Claude is overly cautious or deferring unnecessarily. When asked to make a product decision, Claude should provide a concrete recommendation with reasoning rather than handing the question back.
- **Real evidence-driven debugging**: Surya uploads actual database query results, error screenshots, and build logs rather than describing problems abstractly — diagnosis should be grounded in that evidence.
- **Verify before proposing**: Study existing code and real database state before proposing changes. Never assume a pattern proven in one module applies identically elsewhere without checking.
- **Geography/data integrity**: Follow "verify, don't fabricate" standard — use authoritative sources and explicitly flag conflicts rather than guessing.
- **Sequencing discipline**: Finish and deploy each module before designing the next (School → Hospital → HRMS).
- **Session handoffs**: At the end of long sessions, comprehensive handoff documents covering all modules, decisions, open issues, and working norms are produced for continuity.

---

**Tools & resources**

- **Stack**: React, Vite, Supabase (PostgreSQL, Auth, RLS, Edge Functions), Netlify
- **Payments**: Razorpay (UPI QR + PayButton)
- **Messaging**: WhatsApp notifications via Edge Function
- **Identity/health standards**: APAAR, ABHA, UDISE+
- **Geographic reference sources**: Wikipedia division articles, official district portals, 2008 ECI Delimitation Order
- **Test accounts**: Mother Theresa School, City Care Hospital, Government of Andhra Pradesh, MLA Anaparthi (all on highest subscription tier)