# Smart Lib Product Requirements Document

**Status:** Current-system baseline
**Date:** 2026-09-08
**Product:** Smart Lib

## 1. Product Summary

Smart Lib is a role-based digital library and study workspace. It allows students to discover library resources, request temporary digital access, read PDF materials, manage study notes and highlights, and use an assistant for catalog, policy, and account questions. Administrators manage books, PDF links, users, roles, and borrowing requests.

The product should prioritize direct access to the working library experience over promotional content.

## 2. Goals

- Provide secure student and administrator access.
- Make the resource catalog easy to search and browse.
- Support a complete digital lending lifecycle.
- Provide a focused reading and study workflow.
- Offer a conversational assistant grounded in catalog and account data.
- Give administrators clear control over users, resources, and requests.
- Keep authorization decisions in Supabase policies and protected functions.

## 3. Users and Roles

### Student

Students can:

- Create an account or receive an account created by an administrator.
- Sign in with email and password.
- Browse and search resources.
- Request temporary digital access for 7 to 90 days.
- View request and access status.
- Read approved PDF resources.
- Renew eligible loans up to the configured renewal limit.
- Return active digital access.
- Save resources to a wishlist.
- Submit or update one review per resource.
- Create notes and highlights in the reader.
- View due-date notifications and unpaid fines.
- Use assistant chat sessions.
- Update profile information.

### Administrator

Administrators can:

- Sign in to the admin dashboard.
- View system metrics.
- Add and delete books.
- Add or update PDF resource links.
- Review, approve, and reject borrowing requests.
- View student activity.
- Assign `student` or `admin` roles.
- Create student accounts with email and password.
- Use responsive foldable navigation and theme controls.

Role values are restricted to `student` and `admin`. New accounts default to `student`.

## 4. Core User Journeys

### 4.1 Student registration and login

1. User opens the registration page.
2. User creates an email/password account.
3. Supabase provisions a matching `public.profiles` row as `student`.
4. User signs in.
5. Dashboard resolves the role from `public.profiles`.
6. User is routed to the student dashboard.

### 4.2 Administrator bootstrap

1. Create and verify an account through the application.
2. Run an administrator promotion statement in Supabase SQL Editor.
3. Sign out and sign in again.
4. The user is routed to the admin dashboard.

### 4.3 Digital lending

1. Student selects a resource and access period.
2. Student submits a digital loan request.
3. `request_digital_loan()` validates authentication, duration, active-loan limits, and duplicate requests.
4. Admin approves or rejects the pending request.
5. Approval sets the due date and enables reader access.
6. Student reads the PDF while access is active.
7. Student may renew within the allowed limit or return access.
8. Overdue loans may generate fines.

### 4.4 Study workflow

1. Student opens an approved PDF resource.
2. Student creates notes tied to a book and page.
3. Student creates geometry-based highlights.
4. Notes and highlights are scoped to the authenticated user.
5. Updated notes receive a refreshed timestamp.

### 4.5 Assistant workflow

1. Student opens the research desk or dedicated `/assistant` page.
2. A session is created or an existing session is selected.
3. Student sends a catalog, policy, research, or loan question.
4. The assistant API searches the catalog or returns account loan data.
5. The conversation, results, and loan data are stored in the assistant session.

## 5. Functional Requirements

### Authentication and authorization

- **FR-001:** The system shall authenticate users through Supabase Auth.
- **FR-002:** The system shall provision a student profile for newly created users.
- **FR-003:** The system shall support exactly two application roles: `student` and `admin`.
- **FR-004:** The system shall enforce role access through profile checks, RLS, and server-side authorization.
- **FR-005:** Service-role credentials shall be used only in server-side admin routes.
- **FR-006:** The system shall not expose service-role credentials to browser code or `NEXT_PUBLIC_*` variables.

### Catalog

- **FR-010:** Administrators shall create books with title, author, category, ISBN, description, copy counts, and optional PDF URL.
- **FR-011:** Authenticated users shall browse books.
- **FR-012:** The system shall support catalog search by title, author, category, and description.
- **FR-013:** Full-text search shall use the `search_books()` RPC and ranked results.
- **FR-014:** Digital access eligibility shall not depend on physical copy counts.

### Lending

- **FR-020:** Students shall request digital access for a duration between 7 and 90 days.
- **FR-021:** The system shall enforce a maximum of three active digital loans per student.
- **FR-022:** The system shall reject duplicate pending or active requests for the same resource.
- **FR-023:** Administrators shall approve or reject pending requests through protected RPC functions.
- **FR-024:** Students shall view active, pending, rejected, and returned requests.
- **FR-025:** Students shall renew eligible access no more than the configured renewal limit.
- **FR-026:** Students shall return active digital access.
- **FR-027:** Approved access shall be required before a student can open a protected PDF resource.

### Reader and study tools

- **FR-030:** The reader shall display an approved book PDF.
- **FR-031:** Students shall create, update, and delete page-based notes.
- **FR-032:** Students shall create highlights with page coordinates, color, and optional note links.
- **FR-033:** Students shall only manage their own notes and highlights unless they are administrators.

### Assistant

- **FR-040:** The assistant shall support catalog search questions.
- **FR-041:** The assistant shall support account loan questions for authenticated users.
- **FR-042:** The assistant shall support basic lending-policy questions.
- **FR-043:** The assistant shall preserve conversation sessions and messages.
- **FR-044:** Students shall create a new chat and switch between recent sessions.
- **FR-045:** Assistant results shall identify catalog resources or account loans when applicable.

### Student engagement and account features

- **FR-050:** Students shall save and remove resources from a wishlist.
- **FR-051:** Students shall submit or update one review per book.
- **FR-052:** Students shall see pending-request and due-date notifications.
- **FR-053:** Students shall see the total of unpaid fines.
- **FR-054:** Students shall update their profile name.

### Administration

- **FR-060:** Administrators shall view counts for students, books, pending requests, and overdue loans.
- **FR-061:** Administrators shall filter borrowing requests by status.
- **FR-062:** Administrators shall assign `student` or `admin` roles through `admin_set_profile_role()`.
- **FR-063:** Administrators shall create student accounts through a server-only admin route.
- **FR-064:** The admin interface shall work on desktop and mobile.
- **FR-065:** Sidebar navigation shall support expanded, collapsed, and mobile drawer states.

## 6. Data and Security Requirements

The single initialization file is [`supabase/BASE_SCHEMA.sql`](supabase/BASE_SCHEMA.sql).

Core tables:

- `profiles`
- `books`
- `borrow_requests`
- `study_notes`
- `highlights`
- `reviews`
- `wishlists`
- `fines`
- `email_queue`
- `assistant_sessions`
- `assistant_messages`

Protected functions include:

- `request_digital_loan()`
- `admin_set_profile_role()`
- `admin_decide_borrow_request()`
- `renew_digital_loan()`
- `return_digital_loan()`
- `search_books()`

Security requirements:

- RLS shall remain enabled on user data and workflow tables.
- Students shall not directly insert borrow requests.
- Role changes shall be restricted to administrators or trusted SQL bootstrap operations.
- The Supabase service-role key shall exist only in server-side environment configuration.
- Passwords shall be sent only to Supabase Auth Admin API from a server route and shall never be stored in application tables.
- Email queue records shall not be readable by normal authenticated clients.

## 7. Non-Functional Requirements

- **NFR-001 Performance:** Dashboard routes should render without blocking on unrelated panels.
- **NFR-002 Reliability:** Supabase authorization errors must produce stable error states rather than redirect loops.
- **NFR-003 Accessibility:** Controls must have accessible labels, visible focus states, and usable touch targets.
- **NFR-004 Responsive design:** Student and admin workspaces must work on desktop, tablet, and mobile widths.
- **NFR-005 Theme support:** Light and dark modes must preserve readable text contrast.
- **NFR-006 Maintainability:** Database initialization remains consolidated in one schema file.
- **NFR-007 Validation:** `npm test` and `npm run build` must pass before release.
- **NFR-008 Secrets:** `.env` files must remain ignored by Git.

## 8. Current Implementation Status

### Implemented

- Supabase authentication and profile provisioning
- Student/admin routing
- Catalog management and ranked search
- Digital loan request and approval flow
- Renew and return RPCs
- Protected PDF reader access
- Study notes and highlights
- Assistant chat UI and stored sessions
- Wishlist and review workflows
- Fine calculation schema and student fine summary
- Responsive student and admin sidebars
- Admin-created student accounts
- Minimal non-promotional landing page

### Partially implemented

- Email queue is generated by database triggers but requires an external worker or Edge Function to send emails.
- Fine calculation exists as a callable database function but is not automatically scheduled.
- Assistant responses are catalog/account grounded but are not a general-purpose LLM conversation engine.
- Admin book deletion and PDF updates still use direct client Supabase operations protected by RLS rather than dedicated admin RPCs.
- Reviews currently use a lightweight modal and do not yet display aggregate ratings or public review lists.

## 9. Acceptance Criteria

- A new student can register, sign in, browse books, and see only student features.
- An administrator can sign in and access only admin features.
- An administrator can create a student account with an email and password when `SUPABASE_SERVICE_ROLE_KEY` is configured.
- A student can request, receive approval for, read, renew, and return digital access.
- Unauthorized users cannot read another user's notes, highlights, fines, or assistant sessions.
- Role assignment cannot be performed by a non-admin browser user.
- The assistant can create and reload a session.
- Student and admin navigation remain usable when expanded, collapsed, or viewed on mobile.
- The landing page contains no fabricated operational metrics or promotional feature claims.
- `npm test` and `npm run build` complete successfully.

## 10. Future Product Backlog

- Add a proper email notification worker using `email_queue`.
- Add scheduled fine calculation.
- Add admin audit log for role changes, approvals, and account creation.
- Move remaining privileged book mutations into protected RPCs.
- Add aggregate ratings and review browsing.
- Add password reset and account recovery UX.
- Add automated browser tests for role routing and the lending lifecycle.
- Add production observability and structured error reporting.
