# Smart Lib

## Make room for your best ideas.

Smart Lib is a capstone project, welcoming space for learning, reading, and discovery. It brings your academic library, notes, and research tools together so you can spend less time hunting for resources and more time following your curiosity.

## Everything in one place

### Find your next favorite read

Explore a thoughtfully organized collection of academic resources and borrow the books that spark your interest.

### Turn reading into progress

Read, highlight, and write as you go. Keep your important ideas, notes, and discoveries close at hand so they are easy to return to later.

### A little help, right on time

Smart Lib’s assistant can help you discover resources, explore research topics, understand library policies, and keep track of your reading journey.

## A better rhythm for learning

1. **Choose what interests you** — Explore a library made for curious minds.
2. **Make it yours** — Save thoughts, highlights, and notes as you learn.
3. **Keep moving forward** — Return to your ideas whenever inspiration strikes.

Smart Lib is made for focused study, small steps, and big progress.

## Local testing and deployment configuration

Playwright requires a separate `.env.test.local` file and refuses remote Supabase URLs. This prevents local tests from inheriting production credentials from `.env.local`.

1. Install and start Docker Desktop with WSL 2 enabled, then install the Supabase CLI.
2. Start a local Supabase instance and copy `.env.test.example` to `.env.test.local`.
3. Fill the test file with the local API URL, anon key, and service-role key reported by `supabase status -o env`. Keep this file local; never commit it or use production keys here.
4. Apply and verify the schema only in the local instance before running database tests. For a fresh database, run `supabase/COMPLETE_SCHEMA.sql` once; it includes the current schema, exact-copy checkout changes (`20261108`), and program-based faculty departments, so do not apply those migrations again afterward. For an existing database, do not run the complete schema: review and test only pending migrations against a backup in staging first. `supabase/ALL_MIGRATIONS.sql` is a convenience bundle of every SQL file currently in `supabase/migrations/`, ordered by migration version and retaining each migration's transaction boundaries. It is not a fresh-install schema or a complete migration history. Do not apply it if any included migration has already been applied; executing it manually also does not update Supabase's migration tracking. The migration files are not a complete migration history, so verify their order and effects against the actual database's migration history before applying them to any populated environment.
5. Disable public account sign-ups in Supabase Auth (`enable_signup = false`) for both local and deployed projects. Administrator-created accounts use Supabase Auth invitations; a database trigger cannot distinguish those from public sign-ups.

Digital borrowing is automatic: free books unlock immediately, and points-based books unlock immediately after the member's balance is checked and charged in the same database transaction. The Study Room brings authorized PDF books, per-book reading progress, and a cross-book notebook of saved notes and highlights into one workspace. Opening a notebook entry returns to its book and page; switching books preserves each book's saved progress. Paid e-book checkout and online payment-proof submissions are retired; historical purchase records are retained for audit. Physical borrowing supports member-submitted cash checkout requests and librarian walk-in checkout. Cash is collected and recorded by library staff at checkout; requests do not reserve a copy. The librarian looks up the student's or faculty member's institutional ID, verifies the physical ID, and manually enters or selects the accession tag printed on the copy. A scanner is not required. The member profile stays open for issuing multiple books, returning selected books, or renewing an eligible loan. Members can opt into physical-book availability alerts; an alert goes to all eligible subscribers when inventory changes from none available to at least one available copy. Alerts do not reserve a copy, and borrowing remains first come, first served.

Administrators manage member accounts, catalog, policy, digital access, and financial oversight. Librarians own the physical circulation desk workflow, including checkout, returns, and incident handling. The admin overview may show read-only physical desk counts, but physical checkout and return controls are available only in the librarian workspace.

The librarian workspace uses a sidebar for requests, active checkouts, lost items, daily records, and inventory. Daily records show the selected day's cash collected, books checked out, and borrowing list; older dates remain available by changing the record date.

Digital e-book expiration is enforced at access time: the reader and protected storage checks require an approved loan whose `due_date` is still in the future. No scheduled job is required to block expired access. The approved physical borrowing policy uses a 14-day loan, a two-day grace period, and ₱5 per chargeable overdue day (excluding Sundays and staff-entered public holidays), capped at ₱500 per item; items overdue for 30 days are classified as lost. Fine totals and lost-item classifications recalculate when members or staff trigger relevant workflows and through `/api/cron/physical-reminders`. The current `vercel.json` schedule runs that endpoint daily at 16:00 UTC (midnight Asia/Manila); deployments needing more frequent updates must configure an external scheduler with `CRON_SECRET` and monitor job results. Physical availability alerts are event-triggered and do not depend on that schedule.
6. Run `npm test` for the system check and Playwright suite. The pgTAP workflow suite at `supabase/tests/database/workflows.pgtap.sql` is a separate database test and must be run explicitly against the isolated local database; `npm test` does not execute it.

For deployment, configure the real Supabase project values in the Vercel project's environment settings using `.env.example` as a variable-name reference. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin. Do not deploy `.env.test.local` values or include service-role/provider secrets in `NEXT_PUBLIC_*` variables.

### Continuous integration

GitHub Actions runs dependency auditing, repository system-contract checks, a production build, and axe-core WCAG 2.2 A/AA scans of the public policy pages on pull requests and pushes to `main`. The build and public-page scan use placeholder Supabase configuration and do not connect to a database. Authenticated Playwright workflows and pgTAP still require the isolated local Supabase test environment described above.

Before relying on this as a release gate, require the `CI / verify` status check in GitHub branch protection and configure Vercel to wait for the required Git checks before production deployment. Confirm those controls in the actual project settings; the workflow alone does not prevent an automatic deployment.

## Production release verification

The following checks require access to the actual Supabase and hosting projects; local tests cannot prove these settings. Record the date and evidence for each check before opening the service to users:

- [ ] Disable public Supabase Auth sign-ups and verify an ordinary public registration is rejected while a trusted administrator invitation can still be completed.
- [ ] Review the deployed migration history and apply pending migrations only after a staging/backup review. Confirm role-provisioning, physical-request serialization, cash-only payment, and exact-copy checkout migrations `20261061`, `20261062`, `20261107`, and `20261108` are present.
- [ ] Apply `20261114110000_shared_api_rate_limits.sql` and verify `consume_api_rate_limit` executes only as `service_role`; API mutations fail closed with HTTP 503 if shared rate limiting cannot be reached.
- [ ] Confirm RLS is enabled and policies are correct for member, financial, audit, and storage data. Never expose the Supabase service-role key to the browser.
- [ ] Verify production environment variables, canonical HTTPS origin, and the daily physical-reminder cron schedule in the hosting provider. Observe a safe scheduled run and configure alerts for function failures; the handler writes failures to server logs.
- [ ] Create a private Drive backup and verify the archive exists. Enable Supabase native backup/PITR retention appropriate to the recovery objectives, restore a backup into an isolated project, and record measured recovery time and data-loss window. A successful export alone is not a restore test.
- [ ] Configure alert delivery for hosting function errors and Supabase database/service health. Review logs for secret or personal-data leakage and test that alerts reach an on-call owner.
- [ ] Run a representative load test against staging with realistic catalog/member/loan volumes. Record latency/error thresholds and capacity; no production-scale performance result is implied by local functional tests.
- [ ] Have library finance owners document correction/refund procedures for mistaken transactions and confirm corrections preserve the original audit trail.

`npm audit` should report no known dependency vulnerabilities, `npm test` exercises the system check and authenticated browser flows, `npm run test:a11y` runs the public-page accessibility scan against a production build, and `supabase/tests/database/workflows.pgtap.sql` verifies database invariants. These are necessary gates, not substitutes for the project-setting, backup/restore, alert-delivery, or capacity checks above.

## Google Drive backups

Smart Lib can create a compressed logical snapshot in Google Drive when an administrator triggers it from **Admin → Backups**. Scheduled Vercel backups are disabled. No old backup is deleted automatically.

1. Create a dedicated Google Drive folder for backups and restrict its access to the people authorized to handle student, faculty, and library records. Do not use a broadly shared folder.
2. Configure the server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` values already used by Drive integration, plus `GOOGLE_DRIVE_BACKUP_FOLDER_ID` with that folder's ID. The OAuth account must be able to create files in it and read existing Smart Lib PDFs.
3. Set `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` in Vercel's server environment. Never expose these values with a `NEXT_PUBLIC_` prefix. `CRON_SECRET` is only needed if you manually call the optional maintenance endpoint.
4. Deploy the project. Scheduled Vercel backups are disabled; use **Admin → Backups → Create backup now** to create a snapshot, then check the Vercel function logs and the Drive folder.

Each `.jsonl.gz` archive contains application table rows, Supabase Auth account IDs and metadata (not passwords, password hashes, sessions, or tokens), every Supabase Storage object, and Smart Lib PDFs in Drive referenced by books and contributions. Missing optional tables are listed in the archive's final summary; other export or upload errors fail the run. These are logical exports, not point-in-time database dumps: use Supabase's native backup/PITR facilities as an additional disaster-recovery layer, and test any restoration procedure against an isolated project before relying on it. Data in Drive folders not referenced by the book/contribution records is not copied.

Legacy Drive PDFs without Smart Lib-specific `appProperties` remain eligible for retrieval when their database record identifies the file; contradictory metadata is still rejected. This compatibility has not yet been verified against a live Drive account. Contributions stored outside the supported Drive records or the owner-scoped Supabase paths require a reviewed migration before approval or access; do not broaden file access to arbitrary external URLs.

The library chat assistant uses the server-only `GEMINI_API_KEY` to generate responses grounded in authenticated catalog search results and, for loan questions, the signed-in user's own limited loan details. Configure the key in local `.env.local` for development and in the hosting provider's server-side environment settings for deployment. User prompts and a short recent chat history are sent to Google Gemini; see the Privacy Policy for details.

---

Created with care by **H-STUDIO**.
