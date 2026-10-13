# Smart Lib Master Blueprint

**Version:** 1.0  
**Prepared:** 2026-10-09  
**Purpose:** Source-grounded product and technical blueprint for the current Smart Lib project.

## How to read this blueprint

- **Current** describes behavior visible in the repository at the time of review. It does not establish that database migrations have been applied or that a production deployment is running.
- **Recommended** describes a proposed improvement, not a completed feature.
- This is a static source/document review. No tests, build, database, payment-provider, Gemini, email, or deployment checks were run.
- The checked-in [PRD](./PRD.md) and [schema notes](./SCHEMA.md) contain older statements in places. This master blueprint is the current product direction; align those documents before using them as release acceptance criteria.

## Document 1 — Product Requirements Document (PRD)

### 1.1 Vision

Smart Lib is a low-cost, hybrid school library workspace that helps students and faculty discover available physical books before visiting the library, borrow physical copies through librarian-confirmed circulation, access approved digital resources, and keep their study work together.

It augments the librarian's manual inventory and service; it does not replace staff judgment, payment verification, or the physical book itself.

### 1.2 Objectives

1. Give members a current, searchable view of the physical collection and copy availability.
2. Reduce paper/manual tracking through individual-copy records, QR labels, requests, checkouts, returns, receipts, and reminders.
3. Offer digital reading where a file is available, with access rules independent of physical stock.
4. Keep membership details, borrowing activity, payment evidence, study notes, and staff actions protected by role-aware access control.
5. Keep operational cost and staff workflow simple enough for a school with limited funding.

### 1.3 Personas and primary use cases

| Persona | Needs | Primary use cases |
|---|---|---|
| Student | Know whether a useful physical title is worth a library visit; borrow and study with minimal friction | Search collection; inspect location/availability; request or join waitlist; show QR/request at desk; receive receipt/reminder; use e-books and study tools |
| Faculty member | Find course-relevant references and use the library as a teaching resource | Browse; request physical books; access digital resources; maintain rank and taught-course details |
| Administrator / librarian | Maintain catalog and copy records, handle circulation and money carefully, and manage members | Add/update title and copies; print QR labels; set loan options; verify payment; checkout/return; resolve missing/damaged books; manage profiles and contributions |
| Public visitor (recommended) | Check the collection before traveling to the school | Browse public, read-only title details, library location/hours, and aggregate availability without seeing members or transaction data |

Admin and librarian are one role (`admin`). Faculty currently shares the student workspace and is represented by the `faculty` profile role; there is no separate librarian role.

### 1.4 Scope and priority

| Priority | Requirement | Current status |
|---|---|---|
| MVP | Email/password registration, sign-in, profile provisioning, student/faculty/admin routing | UI and profile flow exist; verify against a staged database and confirm role/RLS behavior before launch |
| MVP | Read-only physical catalog with title, author, category, description, cover, copy availability, location, and expected returns | Authenticated and anonymous read-only catalog projections exist; public RPC migration and access grants require live-database verification |
| MVP | Admin can create a physical title and initial copy inventory from the web; add more copies later | UI and SQL workflow present in working tree; requires migration and database verification |
| MVP | Copy-specific QR labels; reserve/request; librarian confirms checkout and payment; return/damage/loss; digital receipt | Workflow is implemented in the current source set; production readiness depends on applying/verifying migrations |
| MVP | Digital e-book access without a stock limit; free/points access unlocks immediately | Implemented in the digital-loan RPC; access is automatic when its migration is installed |
| Next | Paid e-book checkout unlocks automatically from a trusted payment-provider webhook | Not available yet; no payment gateway account is configured. Manual receipt submission is paused; legacy requests are retained for reconciliation |
| MVP | Private member profiles and requests; admin-only operational actions; no borrower identity exposed in public browsing | Schema policies are present for key physical resources; review every role/RLS rule before release |
| MVP | Due/overdue in-app reminders | Reminder endpoint and SQL job logic exist; a scheduler must call it at least every 15 minutes. Email delivery is not implemented by that endpoint |
| MVP | Clear handling of missing, lost, damaged, or unencoded books | Admin lost-item resolution exists; first-time inventory reconciliation remains a launch operation |
| MVP hardening | Public catalog metadata and aggregate availability only; never expose borrower or request/payment data | Public read-only RPCs exist in the source; verify live grants, RLS, and data projection in staging |
| MVP hardening | FIFO waitlist offers, one reserved copy at a time per offered member, and an expiry that advances the queue | Included in `supabase/COMPLETE_SCHEMA.sql`; verify scheduler and concurrent flows in staging |
| Next | Audit trail for every catalog, membership, fee, payment, checkout, return, and status change | Audit table exists and the new hardening migration records key circulation/offer transitions; expand coverage and verify actor attribution |
| Next | Email delivery worker/provider and delivery/retry status | Future; email queue is not itself an email sender |
| Future | Aggregate book ratings/public review browsing, richer discovery/recommendations, accessibility improvements to reader | Existing review/search/reader foundations; improve after circulation reliability |
| Future | Automated payment-provider verification, barcode/ISBN lookup, analytics, self-service kiosk | Optional, contingent on budget, provider access, and school policy |

### 1.5 Core product rules

- A physical **title** is catalog metadata; each physical **copy** is individually inventoried and has its own status and QR token.
- E-books are online resources and do not run out. Legacy `books.total_copies` and `available_copies` must not grant or deny digital access.
- QR scan identifies the title/copy; it must not itself authorize checkout or expose a borrower.
- A request is not a checkout. The staff confirmation at the desk is the source of truth for physical handover and payment receipt.
- OCR and AI output are advisory. Never treat an image, extracted reference, or model score as payment verification or as the final contribution decision.
- A late/missing physical book triggers a library follow-up and an explicit staff decision. Any monetary fine, grace period, or replacement charge requires an approved school policy; do not invent or automatically charge one.

### 1.6 MVP success criteria

- A visitor can find the collection and understand whether a trip is worthwhile.
- A member can see a physical title's available count and location without seeing who borrowed other copies.
- Staff can add one title with initial copies, generate QR labels, record checkout/return, and recover from a missing or damaged copy.
- A test account cannot access another member's profile, requests, payment proof, receipts, annotations, or assistant history.
- Digital access works independently from physical stock.
- Every payment status shown to members matches the staff decision and resulting access/receipt.
- Reminder delivery is configured and operationally observable before the first real loan is issued.

## Document 2 — Technical Requirements Document (TRD)

### 2.1 Current technology

| Layer | Current implementation | Recommended direction |
|---|---|---|
| Web app | Next.js 14 App Router, React 18, TypeScript 5.6 | Keep the existing stack for MVP; upgrade deliberately, not as part of circulation feature work |
| Data/API | Supabase Postgres, Supabase Auth, JS client, SQL functions/RPCs, RLS | Keep business invariants in transactional database functions; keep UI/API as thin callers |
| File storage | Supabase Storage; optional Google Drive integration; protected PDFs and private payment proof buckets | Keep covers public catalog assets, payment evidence private, and e-books private behind reader authorization |
| Reader | `react-pdf` / `pdfjs-dist` optional dependencies and server-side PDF access route | Treat focus/visibility blur and watermark as deterrents, never promise screenshot prevention |
| AI | Google Gemini server-side utility for contribution screening and optional receipt-reference OCR | Optional feature behind server-only credentials, clear consent, strict size limits, and human review |
| QR | `qrcode` library creates per-copy labels | QR encodes a locator only; revalidate current status and eligibility server-side |
| Hosting / scheduler | Deployment host is not established by the source review; a reminder route expects a cron caller | Choose one managed Node host and a reliable scheduler running at least every 15 minutes; document health, secrets, backups, and restore procedure |

### 2.2 Architecture

```text
Browser (public catalog / member workspaces / admin)
        |
        +-- Next.js pages and route handlers
        |       +-- authenticated Supabase session
        |       +-- server-side Gemini (optional)
        |
        +-- Supabase Auth
        +-- Postgres + RLS + transactional RPC functions
        +-- Supabase Storage (private PDFs/proofs; public covers)
        +-- notification/email outbox
                    +-- in-app notification reads
                    +-- scheduled job / future email worker
```

The database is the source of truth for roles, copy state, holds, payments, grants, and receipts. Do not rely on client-side disable states for access control. The Next.js server routes must authenticate the caller and database policies/functions must independently authorize privileged mutations.

### 2.3 Constraints and proposed service targets

These are **proposed acceptance targets**, not measured current performance:

- Catalog: first useful results render within 2 seconds at the 95th percentile on a typical school connection; search response within 1 second at the 95th percentile for the initial collection size.
- Availability: a 24/7 uptime target requires a selected hosting plan, database/service availability targets, monitoring, and recovery arrangements; application code alone cannot guarantee that the website is always online. No production hosting SLA was verified during this review.
- Circulation: inventory changes and checkout/return operations commit atomically; a copy cannot be allocated to two active requests.
- Availability: display the aggregate count with a visible “last updated” time; show expected return only when known.
- Uploads: enforce allowed file types and limits in both browser and server/database policies; reject malformed/oversized content with a visible error.
- Reliability: a failed email send must not undo checkout, payment verification, or return; retry from an outbox with idempotency.
- Accessibility: keyboard-operable controls, labels and focus states; target WCAG 2.2 AA review for launch.
- Operations: automated database backups, migration history, secret rotation, error logging, and a restore rehearsal before real member data is loaded.

### 2.4 Security and privacy requirements

1. Remove hardcoded email-to-role fallbacks from `/dashboard`; resolve roles only from trusted profile/claims and enforce authorization at the server/database layer. Current fallback can misroute demo accounts even if database RLS still blocks privileged data.
2. Fix role routing: profile data and admin screens support `faculty`, while the dashboard resolver currently normalizes only `admin` and `student`. Faculty must route into the intended member workspace, never an unresolved-role error.
3. Review all `SECURITY DEFINER` RPCs for fixed `search_path`, explicit role checks, caller ownership checks, parameter validation, transaction scope, and restricted execute grants.
4. Keep `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and `GEMINI_API_KEY` server-only. Never place them in `NEXT_PUBLIC_*` variables or client bundles.
5. Keep payment proof and protected reading files private; issue short-lived URLs or stream bytes only after authorization. Do not put references, proofs, or identity fields in public catalog responses.
6. Add rate limits to login-sensitive, OCR, contribution-screening, and request endpoints; impose upload and request quotas.
7. Validate uploaded files by actual content/signature where practical, not MIME declaration alone; use random storage object names and prevent path traversal.
8. Establish a consent/retention policy for sending extracted contribution text and GCash images to Gemini. Do not send unnecessary personal data; provide a manual fallback when AI is disabled or unavailable.
9. Use idempotency and duplicate-reference detection for payment submissions; log reviewer, amount, timestamp, decision, and receipt issuance.
10. Never claim browser blur prevents OS screenshots. Offer an accessible alternative and explain its limits.

### 2.5 Data-flow improvements recommended

1. **Browse before sign-in:** expose a safe read-only public catalog projection. Do not expose copy QR tokens, request rows, or borrower identity. Sign-in is required only when submitting a request, joining a waitlist, or viewing account details.
2. **Separate title and copy lifecycle:** maintain one title record plus copy rows. Mutations to copies recalculate the visible count from copy status; never maintain a second manually edited count. Digital resources keep no stock.
3. **Make waits fair:** when an available copy returns, create one expiring FIFO offer for the next eligible waitlisted member. On expiry/decline, advance the queue. This avoids “fastest click wins” and duplicate notifications.
4. **Use one transaction for checkout/return:** validate pending request, reservation expiry, copy status, payment state, borrower hold, and loan terms; update copy and request; issue receipt; enqueue notification; add audit event atomically.
5. **Protect against duplicate payment submissions:** normalize provider/reference and prevent re-use; preserve every attempt and staff decision instead of overwriting the history.
6. **Use an outbox:** transactional event records for notifications/email with unique event keys, retry count, `next_attempt_at`, `sent_at`, and terminal error. Email provider failure must not lose the underlying library event.
7. **Inventory reconciliation:** add a one-time “physical count” import/reconciliation process. Mark title records as needs-review when a requested title is not represented by real copies; do not imply that digital metadata creates a physical copy.
8. **Close the operational loop:** include location, published library hours/contact, availability timestamp, return expectations, and “ask librarian” guidance with public catalog results.

## Document 3 — App Flow & Architecture

### 3.1 Page hierarchy

| Area | Routes / screen | Current behavior |
|---|---|---|
| Public | `/`, `/login`, `/register`, `/verify-email`, `/reset-password`, `/privacy`, `/terms` | Landing/auth/legal screens; no public physical-catalog route today |
| Student and faculty | `/dashboard/student`, `/library`, `/reader/[bookId]`, `/assistant`, `/points`, `/profile`, `/contributions` | Main workspace plus unified digital and physical catalog, library, reader, in-reader notes/highlights/progress, assistant, profile, and points surfaces |
| Administrator | `/dashboard/admin`, `/dashboard/admin/physical`, `/dashboard/admin/ebook-payments` | Admin management, physical circulation, and reconciliation of legacy e-book payment submissions |
| Server/API | `/api/loans`, `/api/reader/[bookId]`, `/api/storage/upload`, `/api/notifications`, `/api/reading-progress`, `/api/study/*` (reader annotations only), `/api/assistant/sessions`, `/api/recommend`, `/api/cron/physical-reminders`, `/api/ai/extract-payment-reference`, `/api/admin/*` | Session-aware routes and database-backed actions; authorization should also be enforced by RPC/RLS |

### 3.2 Recommended navigation flow

```text
Public landing
  ├─ Browse physical catalog (read-only, no account required) [recommended]
  │    ├─ Search/filter title, author, category, location
  │    ├─ View cover, availability, expected return, hours/contact
  │    └─ Request / join waitlist → sign in or create account → return to same title
  ├─ Register → verify email → profile role = student by default
  └─ Sign in → resolve trusted profile role
       ├─ student/faculty → member dashboard
       │    ├─ Digital resource → free/points unlocks immediately; access expires automatically at the due date
       │    ├─ Physical title → select loan option/payment → pending reservation
       │    │    └─ Librarian verifies payment and identity → checkout + receipt
       │    │          └─ reminder → return / renew if policy allows / report missing
       │    ├─ Waitlist → offer → request/claim → checkout
       │    ├─ Continue reading → reader → in-reader notes/highlights/progress
       │    └─ Assistant / points / profile / contributions
       └─ admin → member and catalog management
            ├─ Add title and initial copies → create QR labels
            ├─ Configure fee/loan terms
            ├─ Verify cash or GCash at desk → checkout/return/lost resolution
            ├─ Reconcile pre-pause e-book payment submissions only
            └─ Review contributions (Gemini advisory; admin makes final decision)
```

### 3.3 Key state transitions

| Object | State sequence (target) | Owner of transition |
|---|---|---|
| Physical copy | available → reserved → borrowed → available / damaged / lost / withdrawn | Database RPC called by member request or admin |
| Physical request | pending → checked_out → returned; pending → rejected/cancelled/expired; checked_out → lost → resolved | Member may cancel own eligible request; admin confirms all circulation decisions |
| Waitlist offer | waiting → offered → claimed / declined / expired → next member | Database job/transaction, FIFO |
| Paid e-book checkout | Not currently available; future provider payment confirmation → automatic grant + receipt | Signed, verified provider webhook; no admin approval |
| Legacy e-book payment submission | Existing submitted/pending → approved (permanent grant + receipt) or rejected | Admin reconciliation only for submissions made before checkout was paused |
| Contribution | submitted → AI advisory (optional) → admin approved/rejected/revision requested | Admin owns final decision and points |

Treat every transition as a state machine with permitted transition rules, audit event, user-facing result, and safe retry behavior.

## Document 4 — Design Brief

### 4.1 Brand direction

- **Current visual language:** calm, welcoming “paper and forest” library workspace with warm neutral backgrounds, forest green, sage/pine accents, and pink/lavender/mint landing-page feature accents.
- **Current palette evidence:** paper `#f5f1e8`, panel `#fcfbf7`, deep forest `#263f3a`, sage `#78938a`, warm accent `#b28a5a`, danger `#a85c58`; dark mode uses forest surfaces and lighter sage.
- **Current typography:** Pretendard for application text; Quicksand is imported for friendly display/brand use.
- **Tone:** warm and plain-language, but exact about availability, fees, due dates, payment status, and AI limitations.

### 4.2 Shared interface rules

- Keep one primary action per card/step. Separate “request” from “checkout confirmed.”
- Every inventory state needs text, not color alone: “3 available,” “none available,” “not yet inventoried,” “reserved until …”.
- Show local library location and last-updated timestamp close to availability.
- Use cover art consistently with a neutral “No cover” fallback; preserve aspect ratio and meaningful alt text.
- Preserve light/dark mode, visible keyboard focus, readable contrast, and comfortable mobile/touch targets.
- Use confirmation dialogs for destructive actions and clear success/error messages for mutations.
- Never display real member or payment data in demo illustrations; mark prototypes and sample metrics explicitly.

### 4.3 Key screen specifications

| Screen | Layout and required content |
|---|---|
| Public collection | Search/filter toolbar; responsive cover cards; title/author/category/ISBN; available and total registered copies; shelf/location; expected return; as-of timestamp; library hours/contact; sign-in action for personal requests |
| Physical title details | Larger cover, description, location, live copy states, loan terms/fees, expected returns, waitlist/request button; clear message that only librarian checkout confirms borrowing/payment |
| Admin physical catalog | “Add title” form separate from “Add copies”; copy quantity and code prefix; cover/metadata; preview; generated QR batch download/print; availability list and lifecycle actions |
| Student dashboard | Continue reading, active/pending requests, reminders, points summary, quick links; distinct digital versus physical actions |
| Admin circulation | Queue prioritized by pending checkout/overdue/lost; borrower identity visible only to staff; proof/reference side-by-side; confirm/reject/return controls; audit details |
| Payment review | Amount, title, member, reference, proof, submission timestamp; staff verification checklist; disabled approval until proof loads; status and receipt result |
| Reader | Reading canvas, navigation/progress, notes/highlights, accessible session-cover explanation, error recovery; no false screenshot-protection claim |

### 4.4 Content and empty states

- “No copies recorded” differs from “all copies are borrowed.”
- “No cover uploaded” differs from a broken image.
- If a book has no fee terms, tell the user that the librarian has not configured them; do not show a fake zero price.
- If reminders or email are not configured, do not say that an email was sent.
- Landing-page graphs, study streaks, sample users, and example titles must either be backed by real user data or clearly labeled as illustrative. Do not imply real product usage statistics.

## Document 5 — Backend Schema & Data Model

### 5.1 Current entity groups

| Group | Entities | Relationships / purpose |
|---|---|---|
| Identity and academics | `profiles`, `faculty_ranks`, `academic_courses`, `faculty_courses` | Auth user has one profile/role; faculty may have a rank and many course assignments; student school/course/year fields are stored on profile |
| Catalog | `books` | Shared bibliographic record; `catalog_type` distinguishes digital, physical, hybrid; optional `cover_image_url`; legacy digital copy-count fields are not authoritative |
| Digital access | `borrow_requests`, `book_access_grants`, `point_transactions`, legacy `ebook_purchase_requests` | Free/points access is automatically granted in the digital-loan transaction; old GCash purchase rows are retained for reconciliation and new submissions are disabled |
| Physical circulation | `physical_book_copies`, `physical_loan_options`, `physical_book_requests`, `physical_book_waitlist`, `physical_reminder_events` | Each copy belongs to a title; requests bind member/title/copy/fee/payment; waitlist is member/title; reminder event is unique by loan/type/date |
| Learning | `reading_progress`, `study_notes`, `highlights`, `study_drawings`, `reviews`, `wishlists` | Member-owned reading progress, annotations, feedback, and saved titles |
| Engagement/admin | `notifications`, `email_queue`, `audit_logs`, `recognition_awards`, `rewards`, `achievements`, `user_achievements` | User messaging, async outbox, staff audit, points/reward/achievement features |
| Assistant | `assistant_sessions`, `assistant_messages` | User-owned conversation sessions/messages; `/api/recommend` currently provides rule-based intent plus catalog/account data, not a general Gemini chatbot |
| Contributions | `book_contributions` | Member submission reviewed by admin; optional AI screening result; approved contribution may link an approved book |

### 5.2 Relationship summary

```text
auth.users 1—1 profiles
profiles 1—N borrow_requests / physical_book_requests / ebook_purchase_requests
profiles 1—N study_notes / highlights / reading_progress / notifications
profiles N—N academic_courses (faculty_courses)
books 1—N physical_book_copies / physical_book_requests / physical_book_waitlist
books 1—N borrow_requests / book_access_grants / ebook_purchase_requests / reviews
physical_book_requests 0—1 physical_book_copies (active assignment)
borrow_requests 0—N fines (legacy digital fine model; policy and UI require review)
assistant_sessions 1—N assistant_messages
```

### 5.3 Access-control matrix

| Data/action | Anonymous visitor (recommended) | Authenticated member | Admin |
|---|---|---|---|
| Published title metadata, covers, aggregate copy availability | Read-only catalog projection | Read | Read/manage |
| Copy QR token, private request/payment proof, borrower identity | No | Only own records; no other member's identity | Operational access as required |
| Digital PDF | No | Only active loan/grant/contribution access | Read for administration |
| Own profile, notes, progress, requests, notifications | No | Read/update own permitted data | Read/manage only for supported admin tasks |
| Create physical request / waitlist membership | No | Own identity only via authenticated RPC | May manage via admin actions |
| Checkout, return condition, payment verification, lost resolution, role assignment | No | No | Admin-only RPC/server operation and audit |
| Gemini screening result | No | Only published decision/status intended for submitter | Admin initiates/reviews result; final decision remains human |

### 5.4 Data and privacy rules

- Do not return `physical_book_requests` or `physical_book_waitlist` to the public catalog.
- Availability is an aggregate computed from copy records; publish status and timestamp only.
- Keep proof images in private buckets and PDF storage protected; public covers contain no personal information.
- Store payment provider, normalized reference, amount, request, verifier, decision timestamp, and receipt number. Do not store card/bank credentials.
- Define deletion/retention for rejected payment proof, old study data, AI-transmitted text/images, and inactive member accounts.
- Profiles currently include free-text school/department/course/year fields; admin-managed rank/course catalogs exist. Normalize school/department only when the institution confirms the canonical lists and governance owner.
- Make database migrations the canonical, versioned source. The current repository contains a base schema plus sequential SQL change files; run them in documented order and avoid maintaining divergent handwritten schema descriptions.

## Document 6 — Execution Plan

| Phase | Priority | Work | Exit criteria |
|---|---|---|---|
| 0. Align requirements and repair docs | P0 | Confirm official fees/fines/grace period, queue offer duration, account verification, retention, and data-processing policies; keep this migration chain canonical | Admin/library policy decisions recorded; one tested migration order and one role glossary |
| 1. Database and authorization baseline | P0 | Apply the complete migration chain to a staging copy; verify role checks, RLS, RPC grants, storage policies, idempotency, and FIFO queue behavior | Student/faculty/admin and anonymous read-only access behave correctly; cross-user/private reads and unverified payment access are denied |
| 2. Inventory and discoverability | P0 | Load an authoritative initial physical inventory; allow read-only public catalog; expose availability/location/as-of; add public contact and opening hours; reconcile copy totals from copy rows | Librarian can reconcile a sample shelf; members/visitors see correct non-identifying availability |
| 3. Circulation operations | P0 | Verify add-title/copy/QR flow; implement fair expiring waitlist offers; atomic checkout/return/payment state and audit events; close overdue/missing/damaged handling | Staff completes a complete loan lifecycle and recovery without duplicate copy allocation |
| 4. Notifications and payments | P1 | Configure daily reminder schedule; deliver/monitor outbox events; select and configure a payment provider, signed webhooks, idempotency, and automatic grant/receipt issuance | Reminder retries observable; free/points access remains instant; after provider setup, confirmed payment unlocks without staff approval and unconfirmed payment grants nothing |
| 5. Learning, contribution, privacy | P1 | Validate reader file access, session blur messaging, data retention and Gemini disclosures; keep AI optional; admin contribution decision/reward remains final | Consent and privacy behavior documented; manual fallback works when AI unavailable |
| 6. Usability and accessibility | P1 | Mobile-first catalog/admin review screens, search filters, accessible forms/focus/contrast, clear empty/error states, print labels and receipts | Representative student/faculty/admin tasks pass keyboard and small-screen review |
| 7. Pilot and launch readiness | P0 release gate | Staff/member acceptance test, backup and restore rehearsal, monitoring, support contact, migration rollback plan, real data verification | Librarian signs off inventory and workflow; no unverified fee, payment, or access automation |
| 8. Post-launch | P2 | Review search terms, waitlist completion, circulation delays, notification delivery, catalog gaps; then consider ratings, barcode lookup, deeper analytics or provider integration | Enhancements prioritized from observed use and school feedback |

### Decisions to confirm before a live pilot

1. Should the physical catalog be public without sign-in? **Recommended:** yes, read-only, with no borrower/request data.
2. What are official physical loan durations, fees, renewals, late grace periods, and lost/damaged replacement rules? Do not automate a fine until approved in writing.
3. How long is a returned-copy waitlist offer held, and what constitutes a decline/expiry?
4. Is GCash the only online payment channel? Who checks the merchant account and what evidence satisfies verification?
5. Which school/department/course values are canonical, and who maintains them?
6. What notice/consent and retention limits apply to uploaded receipts, contribution PDFs, AI processing, and student study notes?

### Source files reviewed

- [PRD.md](./PRD.md)
- [SCHEMA.md](./SCHEMA.md)
- [package.json](./package.json)
- [supabase/COMPLETE_SCHEMA.sql](./supabase/COMPLETE_SCHEMA.sql)
- [app/dashboard/page.tsx](./app/dashboard/page.tsx)
- [components/PhysicalBorrowModal.tsx](./components/PhysicalBorrowModal.tsx)
- [app/dashboard/admin/physical/page.tsx](./app/dashboard/admin/physical/page.tsx)
- [app/dashboard/admin/ebook-payments/page.tsx](./app/dashboard/admin/ebook-payments/page.tsx)
- [app/api/loans/route.ts](./app/api/loans/route.ts)
- [app/api/reader/[bookId]/route.ts](./app/api/reader/[bookId]/route.ts)
