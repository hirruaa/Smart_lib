# Smart Lib — Product Requirements Document

**Version:** 2.0
**Status:** Product baseline and release requirements
**Last updated:** 2026-10-09
**Product owner:** Smart Lib project team
**Audience:** School stakeholders, library staff, product/design, and engineering

> This PRD distinguishes the behavior present in the repository from desired release requirements and future work. “Implemented” means that a UI, route, or database workflow is present in the source; it does not prove that production configuration, Supabase migrations, scheduled jobs, or third-party services are live. Do not treat an implemented feature as production-verified until its release checks pass.

## 1. Product overview

Smart Lib is a school library and study workspace for students, faculty, and administrators/librarians. It combines digital learning resources with a separate physical-book circulation workflow. Members can discover resources, access eligible digital files, organize study work, contribute materials, and track points. Library staff manage membership, digital resources, physical inventory, QR labels, circulation, contribution decisions, and payment evidence.

### Product vision

Make useful academic resources easier to discover and access while preserving privacy, equitable physical-book circulation, and accountable library operations.

### Product principles

1. **Digital and physical access are different products.** An e-book does not become unavailable because a physical copy is borrowed.
2. **No unnecessary approval for earned digital access.** Eligible free and points-based e-books unlock automatically after the database confirms access.
3. **Physical handover remains staff-controlled.** A request or payment submission is not a checkout; a librarian verifies the transaction and copy before handover.
4. **AI assists; accountable people decide.** AI contribution screening and payment-reference extraction are advisory, not final approval or proof of payment.
5. **Least privilege and private-by-default records.** Public availability must never reveal borrower identity, payment evidence, or account activity.
6. **The database is authoritative.** Client-side UI states cannot grant access, assign roles, confirm payments, or allocate physical copies.

## 2. Goals and non-goals

### Goals

- Provide reliable member authentication and role-aware student, faculty, and administrator experiences.
- Make digital materials and physical-book availability discoverable.
- Grant eligible free or points-based e-book access promptly and protect the corresponding files.
- Support copy-level physical inventory, QR identification, fair waitlists, receipts, returns, and exception handling.
- Let members submit academic materials and see review/points outcomes.
- Bring study tools, points, notifications, and an academic assistant into the member experience.
- Give staff a coherent place to manage members, resources, requests, and circulation.
- Establish measurable security, accessibility, reliability, and release-readiness criteria.

### Non-goals for the current release

- Replacing the physical book, librarian judgment, or the school's official student-information system.
- Treating AI output, OCR, uploaded images, or a typed payment reference as payment settlement.
- Enabling paid e-book checkout before a provider can verify a payment server-to-server.
- Claiming that browser UI controls can prevent operating-system screenshots or external photography.
- Guaranteeing 24/7 availability solely through application code; uptime also depends on hosting, database, operations, and support arrangements.
- Building a full learning-management system, gradebook, institutional email suite, or general-purpose AI chatbot.

## 3. Users, roles, and access

| Persona / role | Primary needs | Expected capabilities |
|---|---|---|
| Student | Find resources, read, borrow, study, and understand points/access status | Member dashboard, digital access, physical requests/waitlists, reader and study tools, profile, contributions, points, notifications, assistant |
| Faculty | Locate course-relevant materials and borrow/access library resources | Member workspace and eligible student-like access; faculty rank and taught-course details |
| Administrator / librarian (`admin`) | Maintain the collection and member records; decide staff-controlled workflows | Admin dashboard, catalog/material management, account and academic-catalog management, request/contribution review, physical circulation, fee/payment verification, access grants, points/recognition, analytics and audit surfaces |
| Public visitor | Check the physical collection before visiting | Read-only public physical-catalog information and aggregate availability; no account data or borrower identities |

Application roles are `student`, `faculty`, and `admin`; librarian is represented by `admin`, not a separate role. New self-registered accounts default to student. Role changes are privileged administrative actions and must not be available through ordinary member profile editing.

Student profile attributes include name, school, department, course/program, and year level. Faculty profiles can include school, department, academic rank, and multiple taught courses. School and department are currently free-text profile fields; faculty ranks and academic courses have administrator-managed lists. A member may update permitted personal fields, but cannot self-promote or alter protected role/rank assignments.

## 4. Scope, priority, and implementation status

Priorities: **P0** = required before public production launch; **P1** = core product capability; **P2** = planned enhancement; **P3** = optional/future. Status is source-based and subject to deployment verification.

| Priority | Capability | Status at PRD update |
|---|---|---|
| P0 | Authentication, role authorization, private member data, and production secrets | Present in source; authorization, Supabase RLS, environment configuration, and recovery flows require release verification |
| P0 | Reliable schema/deployment setup against the target Supabase project | Consolidated schema exists for a fresh project; existing populated projects require a reviewed, staged upgrade path and backup |
| P0 | Reliable physical checkout/return and no duplicate copy allocation | Transactional functions and UI exist; live database, concurrency, and recovery tests still required |
| P0 | Automatic eligible free/points digital access; protected PDF authorization | Implemented in source/schema; verify database functions, grants, and storage privacy in staging |
| P0 | Error reporting, operational monitoring, backup/restore, and scheduled reminder setup | Not fully verified/configured by the QA pass; release gate |
| P1 | Student and faculty dashboards, profile details, member self-service | Present; profile role and data policies require validation |
| P1 | Digital catalog, access requests, reader, reading progress, notes, highlights, and drawings | Present; verify end-to-end with protected files and test accounts |
| P1 | Physical catalog, copy records, printable QR labels, requests, payment evidence, FIFO waitlist, receipts, return/lost-item handling | Present in source/schema; public privacy, job scheduling, and full circulation test required |
| P1 | Contribution upload, revision, AI screening, administrator decision, and post-approval points | Present in source; AI remains advisory and points are tied to human approval |
| P1 | Member points wallet, transaction history, recognition/rewards/achievements surfaces | Present in source/schema; confirm policy, transaction integrity, and optional-table behavior |
| P1 | Admin member management, academic rank/course lists, library operations, audit/access-grant surfaces | Present in source; validate staff-only authorization and data integrity |
| P2 | Verified paid e-book purchase with immediate automatic access | Not available; checkout is paused until a payment provider and trusted webhook are implemented |
| P2 | OCR-assisted physical-book table-of-contents entry during registration | Proposed enhancement; not represented as a currently delivered workflow |
| P2 | Admin-configurable contribution point bonuses and broader reward campaigns | Existing approval/points foundations; configurable award policy needs product definition and implementation |
| P2 | Outbound email notification worker and delivery status | Email queue exists, but the application does not itself prove delivery; worker/provider required |
| P2 | Public reviews/aggregate ratings, enhanced catalog filters, and richer discovery | Partial/future; do not promise public ratings unless enabled and verified |
| P3 | Automated ISBN lookup, self-service circulation kiosk, advanced analytics, and richer AI recommendations | Optional, dependent on school policy, budget, privacy review, and operational capacity |

## 5. Core user journeys

### 5.1 Account creation and sign-in

1. A member registers with email and password or receives an administrator-created account.
2. A new self-registered account receives the student role by default.
3. The member verifies/signs in as required by configured authentication policy.
4. The application reads the trusted profile role and routes the member to the appropriate workspace.
5. A missing profile, disabled account, expired session, or failed auth service produces a recoverable message; it must not grant broader access or create a redirect loop.
6. Members can sign out and use configured password-recovery flows.

### 5.2 Digital browse, access, and reading

1. A student or faculty member searches or browses digital books/materials.
2. The catalog clearly presents whether access is free, points-based, restricted, or premium/paused, plus the available access duration.
3. The member requests eligible free or points access.
4. The server/database validates the member, resource, duration, existing access, and point balance. It grants free access or atomically deducts points and grants access.
5. On success, the member can read immediately; no administrator approval is inserted into this eligible free/points flow.
6. Only an authorized member with a current loan/grant, an allowed contributor entitlement, or an administrator role can retrieve the protected PDF.
7. The reader may use visible identity watermarking and limited interaction deterrents. The product must describe these as deterrence, not screenshot prevention.
8. Members can view progress and manage their own notes, highlights, and study drawings.

The current dashboard offers access durations of 1, 3, 7, 14, and 30 days. Product policy may change these values; the UI and database validation must always agree.

### 5.3 Paid digital access

Paid e-book checkout is paused. A user-uploaded receipt, OCR extraction, or typed reference must not unlock a premium e-book. Once an approved payment provider is integrated, a verified, idempotent server-to-server payment event should issue the access grant and receipt automatically, without routine administrator approval. Staff reconciliation is reserved for exceptions, disputes, or legacy submissions.

### 5.4 Physical book discovery and circulation

1. A visitor/member browses the physical catalog and sees title details and aggregate availability, not borrower identities.
2. A member chooses an available loan option, requests a copy, and submits the configured payment details/evidence if required.
3. The request is pending, not checked out. A librarian validates member eligibility, copy availability, payment status, and loan terms.
4. The librarian confirms checkout at handover. The system associates one copy with one active loan and creates a due date and receipt.
5. The member can view request/loan status and receipt. When no copy is available, the member can join the FIFO waitlist.
6. When a copy is returned, at most one eligible member receives an expiring offer; expiry or decline advances the queue.
7. The librarian records return, damage, loss, or a justified resolution. Fines or replacement charges require an approved school policy and must not be invented or silently charged.
8. Each physical copy has an individual identifier and QR token. Scanning identifies a copy or public availability, but does not itself authorize checkout or reveal a borrower.

### 5.5 Contribution review and recognition

1. A signed-in member submits academic material metadata and a PDF, or revises an eligible prior submission.
2. The system validates file type and size and stores the document privately.
3. Optional AI screening summarizes relevance, usefulness, and concerns for a human reviewer.
4. An administrator reviews the material and makes the final approve/reject decision with feedback.
5. Points are awarded only according to the recorded approved decision and configured policy; AI scores alone do not award points.
6. The contributor can see status, feedback, and points history.

### 5.6 Administrator operations

Administrators sign in and manage member profiles/roles, faculty rank and course catalogs, digital records/materials, physical titles/copies/QR labels, borrow requests, contributions, payment evidence, access grants, points/recognition, and operational reports. Sensitive actions require server/database authorization, confirmation for destructive actions, clear success/failure messages, and an audit record where applicable.

### 5.7 Notifications and reminders

Members see in-app notifications for relevant account and circulation events. A scheduled process must invoke the physical reminder/offer expiry workflow at its configured interval. An email queue alone is not an email delivery service; email notifications are not considered delivered until a worker/provider reports success.

## 6. Functional requirements

Every requirement is testable. Status reflects the current source baseline; production launch requires evidence against the live/staging environment.

| ID | Priority | Requirement | Baseline |
|---|---|---|---|
| FR-001 | P0 | The system shall authenticate members and associate each session with a trusted member profile. | Implemented; verify provider configuration |
| FR-002 | P0 | Self-registration shall assign the least-privileged member role by default. | Implemented in source/schema |
| FR-003 | P0 | Role checks shall be enforced by the server/database for every privileged read or mutation, not only by hiding UI controls. | Implemented in parts; full policy audit required |
| FR-004 | P1 | Student and faculty members shall have member workspaces; administrators shall have separate administrative tools. | Implemented |
| FR-005 | P1 | Members shall view and update only permitted profile fields; role and privileged academic assignments shall not be self-editable. | Implemented in parts; verify all paths |
| FR-006 | P1 | Member profiles shall support full name, school, department, student course/program and year; faculty may have an academic rank and multiple assigned courses. | Implemented in source/schema; check data policy |
| FR-007 | P1 | Administrators shall be able to manage available faculty ranks and academic courses and edit eligible member profiles. | Implemented in source/schema |
| FR-008 | P1 | Members shall browse and search the digital library and view each resource's access mode and duration terms. | Implemented; verify catalog/schema alignment |
| FR-009 | P1 | Administrators shall create and maintain digital resource metadata and protected file references. | Implemented; verify file access and storage rules |
| FR-010 | P0 | A valid free digital-access request shall grant access without administrator approval. | Implemented in source/schema; staging test required |
| FR-011 | P0 | A valid points-based digital-access request shall atomically verify and deduct the required points and create access; failure shall not partially charge the member. | Implemented in source/schema; concurrency test required |
| FR-012 | P0 | Eligible free/points digital access shall not depend on physical stock or a librarian decision. | Implemented as product flow |
| FR-013 | P1 | Members shall view their pending, active, expired, returned, or otherwise resolved digital access state. | Implemented in member workspace |
| FR-014 | P1 | Members shall renew or return eligible digital access within the configured limits and receive a clear result. | Implemented in source/schema |
| FR-015 | P0 | Protected digital files shall be retrievable only after current authorization, except for explicitly authorized admin/contributor cases. | Implemented in source; security test required |
| FR-016 | P1 | The reader shall support reading progress and member-owned notes, highlights, and drawings without exposing another member's study data. | Implemented in source/schema |
| FR-017 | P0 | Paid digital checkout shall remain disabled until payment is confirmed by a trusted provider integration; uploaded evidence or AI extraction alone shall never grant access. | Paused/required guardrail |
| FR-018 | P2 | After provider integration, verified paid digital payment shall create a single access grant and receipt automatically; duplicate webhook delivery shall not duplicate grants or charges. | Future |
| FR-019 | P1 | Public physical-catalog views shall disclose title metadata and aggregate availability only, with no member, request, payment, or private QR-token data. | Implemented via public projection; privacy-test required |
| FR-020 | P1 | Administrators shall create/update physical titles and register individual copies with distinct copy codes and QR tokens. | Implemented in source/schema |
| FR-021 | P1 | A member shall request a physical copy or join the waitlist when no eligible copy is available. | Implemented in source/schema |
| FR-022 | P0 | Checkout shall require authorized staff confirmation and shall atomically associate no more than one active loan with a copy. | Implemented in source/schema; concurrency-test required |
| FR-023 | P1 | Physical payment evidence shall remain pending until verified by authorized staff; AI/OCR extraction may assist entry but shall not confirm payment. | Implemented in source; verify policy |
| FR-024 | P1 | The system shall issue a receipt and due date after successful physical checkout and record return, renewal where allowed, and closure outcomes. | Implemented in source/schema |
| FR-025 | P1 | Physical waitlist offers shall be FIFO, exclusive to one eligible member/copy at a time, and expire under a configured rule. | Implemented in schema; scheduled processing required |
| FR-026 | P1 | Administrators shall record physical-copy damage/loss and resolve the associated hold through an explicit staff action. | Implemented in source/schema |
| FR-027 | P1 | QR scanning shall resolve the identified physical copy or safe public information without granting checkout rights or revealing borrower identity. | Implemented in source/schema |
| FR-028 | P2 | Physical title registration shall support optional table-of-contents text; image capture/OCR assistance shall be added only with human review and privacy controls. | Proposed; not currently delivered |
| FR-029 | P1 | Members shall submit new academic contributions and revise eligible submissions, receiving a visible status and review feedback. | Implemented in source/schema |
| FR-030 | P1 | AI contribution screening shall provide advisory relevance/usefulness/concern signals to reviewers and shall not make the final approval decision. | Implemented in source; verify Gemini config and failure path |
| FR-031 | P1 | Contribution points shall be awarded only after a human-approved decision according to the recorded policy. | Implemented in source/schema |
| FR-032 | P1 | Members shall view their point balance and transaction history; mutations shall be auditable and resistant to duplicate awards/deductions. | Implemented in source/schema; verify integrity |
| FR-033 | P2 | Administrators shall configure contribution/reward point policies and any bonus award; published policies shall be clear to members. | Partially supported; configuration policy not complete |
| FR-034 | P1 | Members shall manage their own wishlist and review submissions and see applicable recognition/achievement information. | Implemented in source/schema; verify member ownership |
| FR-035 | P1 | Members shall view and update in-app notifications; unauthenticated requests shall receive an authentication response rather than an internal-server error. | API exists; unauthenticated path failed QA |
| FR-036 | P0 | Scheduled reminders and expiring physical offers shall be processed at the configured interval with authenticated, observable job execution. | Endpoint/schema present; scheduler not verified |
| FR-037 | P1 | The assistant shall answer supported catalog, policy, or member-loan questions using only data the caller is authorized to access. | Implemented foundation; response fidelity and scope require testing |
| FR-038 | P1 | Assistant sessions and messages shall be private to their owner, with authorized session deletion. | Implemented in source/schema; RLS test required |
| FR-039 | P1 | Administrators shall see actionable metrics and manage requests, members, resources, contributions, access grants, points, and audit information permitted by their role. | Implemented in source; verify each surface |
| FR-040 | P0 | Errors, empty states, loading states, and validation failures shall be understandable and shall not present a failed operation as successful. | Partially implemented; test and fix before launch |
| FR-041 | P1 | Users shall be able to reach privacy, terms, cookie, authentication recovery, and branded error/not-found experiences. | Pages present; deployed links/configuration require verification |

## 7. Data and information model

The system's core entities and responsibilities are:

| Entity | Purpose and key relationships |
|---|---|
| Profile | Member identity, role, contact, school/department, student course/year, points, and optional faculty rank |
| Faculty rank, academic course, faculty-course assignment | Controlled academic attributes and many-to-many faculty course associations |
| Book | Digital or physical/hybrid title metadata; digital entitlement is independent of copy inventory |
| Physical book copy | One individually identified item, QR token, location/status, and due-date state |
| Digital borrow request / access grant | Time-limited or other eligible digital entitlement, points paid, status, and expiry |
| Physical request / waitlist entry | Member's request, loan terms/payment state, offer, checkout/return, due date, and receipt |
| Contribution | Member-submitted academic material, private file reference, AI advisory result, review status/feedback, and points outcome |
| Point transaction, recognition award, reward, achievement | Immutable/accountable point ledger and member reward/recognition state |
| Study note, highlight, drawing, reading progress | Member-owned study artifacts associated with a digital resource |
| Notification, email queue, reminder event | In-app event and queued/scheduled communication state |
| Assistant session/message | Member-owned conversation and stored assistant exchange |
| Review, wishlist, fine, audit log | Member feedback/saved resources, policy-based amounts, and administrative action history |

Data retention periods, account deletion rules, consent language, and school-specific records obligations must be decided and documented before real member data is used. Private PDFs, payment proofs, study records, assistant content, and account details must not be exposed through public catalog responses.

## 8. UX, accessibility, and content requirements

- Provide clear role-specific navigation and preserve context when returning from a detail or workflow screen.
- Show skeleton/loading states only while loading; display a distinct error state when data cannot be retrieved.
- Explain access price/points, access duration, physical loan period/fee, waitlist status, due date, and next steps before the member commits.
- Distinguish “requested,” “payment submitted,” “payment verified,” “checked out,” “returned,” and “access granted”; never use ambiguous “approved” labels where they imply something else.
- Give each destructive or money-related action an explicit confirmation, actor, result, and recovery/support path.
- Ensure keyboard operation, visible focus, form labels, meaningful headings, status announcements, usable touch targets, and readable color contrast. Target WCAG 2.2 AA review.
- Support mobile layouts for common member and administrator tasks, including catalog, profile, request tracking, and physical circulation.
- Reader protection may include personalized visible watermarks and browser-level deterrents, but help/content must disclose that screenshots and external photography cannot be prevented reliably.
- Legal/policy copy must be approved by the school; the application must not imply guarantees it cannot enforce.

## 9. Non-functional requirements

Targets below are release objectives, not measured claims. Record actual test evidence before declaring compliance.

| ID | Area | Requirement / target |
|---|---|---|
| NFR-001 | Availability | Target at least 99.5% monthly service availability after launch, excluding announced maintenance, subject to hosting/database SLAs and a monitored incident response plan. |
| NFR-002 | Performance | On a typical school connection, primary catalog content should be usable within 2 seconds at p95; catalog search results should return within 1 second at p95 for the agreed initial collection size. Measure from the deployed environment. |
| NFR-003 | Integrity | Points deduction/grant, physical copy allocation, payment decision, checkout, return, and receipt issuance must be transactional/idempotent where applicable. |
| NFR-004 | Security | Enforce server-side authentication and authorization, row-level data ownership, least privilege, input validation, private file storage, and protected secret handling. |
| NFR-005 | Privacy | Public endpoints expose only approved catalog fields and aggregate counts. Minimize personal data sent to third-party AI services and document purpose, retention, and consent. |
| NFR-006 | Reliability | Failure of optional AI, email, or analytics services must produce an explicit user/staff state and must not corrupt core circulation, access, or point transactions. |
| NFR-007 | Accessibility | Meet WCAG 2.2 AA for core journeys, with keyboard-only and screen-reader checks and no color-only status meaning. |
| NFR-008 | Compatibility | Validate current stable Chrome, Edge, Firefox, and Safari, including mobile Safari and common Android/desktop viewport sizes. |
| NFR-009 | Observability | Capture structured server errors, failed privileged mutations, payment/circulation outcomes, scheduled-job health, and uptime without logging credentials or private file contents. |
| NFR-010 | Recovery | Backups must be automatic, access-controlled, and restore-tested; document recovery time and data-loss objectives approved by the school. |
| NFR-011 | Maintainability | Database setup and upgrade instructions must distinguish a fresh-project baseline from a safe migration of an existing populated database. |
| NFR-012 | Configuration | Production must use HTTPS, a configured canonical site origin, non-placeholder secrets, and environment-specific values outside source control. |

## 10. Security, privacy, and abuse prevention

1. Enforce role and ownership checks in server routes and database policies/functions; treat client UI state as untrusted.
2. Keep Supabase service-role, Gemini, cron, and provider credentials server-side only. Do not expose them as public client variables.
3. Require private storage and authorization checks for protected PDFs and payment proof files. Use short-lived access or authorized server streaming.
4. Validate upload size, file extension, MIME, and actual content where feasible; use non-user-controlled storage keys and clean up orphaned uploads after failed submissions.
5. Rate-limit authentication-sensitive, upload, AI, request, and expensive search paths; define abuse quotas and alerting.
6. Make payment confirmations and point changes idempotent, auditable, and attributable. Avoid logging full payment proofs or credentials.
7. Use least-privilege database grants and review every privileged/security-definer function for a fixed search path, caller authorization, validation, and safe execute grants.
8. Restrict public physical catalog functions to minimal metadata and aggregate availability. Never return member names, private QR tokens, request records, or payment data.
9. Document if/when Gemini receives contribution content or payment images, what data is sent, retention expectations, failure fallback, and required school approval.
10. Maintain a tested incident and credential-rotation process.

## 11. Technical context and constraints

The current application is a Next.js web application using React/TypeScript and Supabase Auth, PostgreSQL/RLS/RPC, and Storage. Optional integrations include Google Gemini for AI assistance/screening and Google Drive for storage. There is no verified production payment-provider integration or outbound email delivery worker in the current baseline.

### System boundaries

- Browser application: public landing/catalog, authentication, member workspaces, reader-based notes/highlights/progress, and admin workflows.
- Application server/API routes: session-aware protected file access, member/admin operations, notifications, AI calls, and scheduled job entry points.
- Supabase: authoritative authentication/profile data, relational records, transaction/authorization functions, and storage.
- Optional external services: Gemini, Google Drive, payment provider (future), and email delivery worker/provider (future).

### Database installation rule

[`supabase/COMPLETE_SCHEMA.sql`](./supabase/COMPLETE_SCHEMA.sql) is a consolidated schema intended for a fresh Supabase project. It must not be blindly rerun against an existing populated project as an upgrade. Existing installations need a reviewed migration derived from the actual deployed schema, tested in staging with a verified backup and rollback/recovery plan. Confirm the live database contains every column, table, function, trigger, and policy required by the deployed application.

## 12. Success metrics and acceptance criteria

### Product success metrics

- At least 95% of test members complete registration/sign-in and reach the correct role workspace without staff intervention.
- At least 95% of eligible points-based access tests either grant access and debit the exact amount once, or fail without a debit.
- 100% of physical test checkouts require authorized staff confirmation and associate exactly one available copy.
- 100% of public physical-catalog test responses omit borrower identity, private requests, payment evidence, and private QR tokens.
- At least 95% of contribution submissions can be followed from submission through decision, feedback, and correct points outcome.
- At least 95% of representative members complete core tasks on mobile without horizontal overflow or blocked controls.
- Meet the availability and performance objectives in NFR-001 and NFR-002 after instrumenting the deployed service.

### Release acceptance criteria

Production launch is eligible for sign-off only when:

- `npm test` and `npm run build` pass in the release environment.
- Authentication, password recovery, role routing, and unauthorized requests have automated coverage.
- Student, faculty, and admin permissions pass positive and negative access-control tests.
- Digital free/points grant, point deduction, protected file access, renew/return, and duplicate/concurrent request behavior pass.
- Physical request, payment verification, checkout, receipt, return, lost/damaged resolution, FIFO offer/expiry, and QR lookup pass with isolated test data.
- Contribution upload, AI-unavailable fallback, human decision, resubmission, and post-approval points pass.
- No critical/high security finding remains unresolved; secrets, RLS, storage privacy, and API error handling have been reviewed.
- The Supabase production schema is reconciled with the exact release version; migration and rollback/restore are rehearsed in staging.
- `NEXT_PUBLIC_SITE_URL` is set to the approved canonical HTTPS domain; deployed sitemap and robots output are verified.
- Uptime/error monitoring, scheduled physical-reminder processing, backup alerts, and support ownership are active and tested.
- Privacy, terms, cookie notice, AI-processing disclosure, physical borrowing rules, fees, and screenshot-protection limitations have school approval.
- Cross-browser and accessibility checks for core journeys are complete, with known defects recorded and accepted by the product owner.

## 13. QA findings and open release risks

The 2026-10-09 targeted QA pass built the application and manually checked representative admin flows. It was not a full system certification.

| Finding | Impact | Required action |
|---|---|---|
| Unauthenticated `GET /api/notifications` returned 500 instead of 401 during QA. | Incorrect auth failure behavior; can obscure the real cause and pollute error monitoring. | Fix the auth error handling and add unauthenticated/expired-session tests. |
| `/sitemap.xml` returned 500 when `NEXT_PUBLIC_SITE_URL` was unset. | Deployment will fail to serve sitemap until canonical HTTPS origin is configured. | Set the production environment variable and verify sitemap/robots on the deployed domain. |
| A first dashboard load reported `books.premium_price` missing; after a server restart the dashboard loaded. | Possible stale/transient database/cache issue or schema drift; unresolved by local smoke testing. | Compare the deployed database against the release schema and run an end-to-end catalog query in staging. |
| `npm test` is a static system/schema-presence check; the repository had no automated browser/integration suite at QA time. | Core persistence, authorization boundaries, and concurrency are not proven by the current canonical test command. | Add and run automated tests for the critical journeys before launch. |
| Docker-backed isolated infrastructure, backup restoration, production uptime, load, and broader cross-browser checks were not performed. | Production operational readiness and scale behavior remain unknown. | Complete staging and operations gates; record evidence and accepted limits. |

Full evidence is recorded in [`runtime-validation-report.md`](./runtime-validation-report.md). Findings should be updated as each is resolved; do not silently remove a risk without test evidence.

## 14. Roadmap

### Phase 0 — Production foundation (P0)

- Reconcile Supabase schema, policies, storage buckets, grants, and environment configuration.
- Correct API authentication/error contracts and add automated test coverage.
- Add monitoring, alerting, backup/restore rehearsal, and operational ownership.
- Validate physical and digital workflows in a staging environment with isolated test identities/data.
- Complete privacy/security/accessibility and release acceptance reviews.

### Phase 1 — Core library launch (P1)

- Launch member/student/faculty workspaces and admin library operations.
- Operate the public-safe physical catalog and staff-confirmed physical circulation.
- Offer automatic free/points digital access and protected reading.
- Enable member study tools, contributions with human review, and points history.

### Phase 2 — Trusted payment and communication (P2)

- Integrate an approved payment provider for premium digital access using signed, idempotent webhooks.
- Add a transactional email worker with delivery/retry status.
- Add configurable contribution award policy and explicitly documented exception handling.
- Add table-of-contents capture/OCR as a reviewer-assisted optional physical catalog workflow.

### Phase 3 — Discovery and operational improvement (P2/P3)

- Expand public discovery, reviews/ratings, optional ISBN metadata lookup, analytics, and staff self-service tools based on usage and school policy.
- Reassess AI features against privacy, accuracy, cost, and user feedback evidence.

## 15. Assumptions and decisions

- The initial deployment serves one school/library organization; multi-tenant institution support is out of scope unless later approved.
- The school/librarian defines physical loan periods, fees, grace periods, fines, lost-item policy, contribution points, and retention schedules. The system must not invent those policies.
- Free and points-based digital access is automatic when eligible and confirmed. Premium paid e-book access remains paused until a trustworthy provider integration is operational.
- Physical-book checkout, payment verification, copy handover, return, and exception resolution remain staff-controlled.
- AI processing is optional and advisory; human review remains authoritative.
- The product may deter casual copying but cannot technically guarantee prevention of screenshots, photography, or redistribution.
- Performance and availability targets are proposed release objectives; the project owner must confirm hosting, traffic assumptions, and service-level expectations before promising them to users.
