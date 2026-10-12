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
4. Apply and verify the schema only in the local instance before running database tests. `supabase/COMPLETE_SCHEMA.sql` is for a fresh database, not a production upgrade. For an existing database, review and test the applicable SQL migrations in staging first. `20261012_harden_contribution_files.sql` tightens contribution-file validation while retaining owner access to the supported legacy `ebooks/contributions/{userId}/...` storage path and Google Drive records with a file ID; `20261013_faculty_signup_departments.sql` adds the department catalog and faculty self-registration. The SQL files are not a complete migration history, so review their order and effects against the actual database before applying them to any populated environment.
5. Run `npm test` for the system check and Playwright suite. The pgTAP workflow suite at `supabase/tests/database/workflows.pgtap.sql` is a separate database test and must be run explicitly against the isolated local database; `npm test` does not execute it.

For deployment, configure the real Supabase project values in the Vercel project's environment settings using `.env.example` as a variable-name reference. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin. Do not deploy `.env.test.local` values or include service-role/provider secrets in `NEXT_PUBLIC_*` variables.

## Google Drive backups

Smart Lib can create a daily compressed logical snapshot in Google Drive and lets administrators trigger one from **Admin → Backups**. Vercel schedules the backup at 02:00 UTC using [`vercel.json`](vercel.json). No old backup is deleted automatically.

1. Create a dedicated Google Drive folder for backups and restrict its access to the people authorized to handle student, faculty, and library records. Do not use a broadly shared folder.
2. Configure the server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` values already used by Drive integration, plus `GOOGLE_DRIVE_BACKUP_FOLDER_ID` with that folder's ID. The OAuth account must be able to create files in it and read existing Smart Lib PDFs.
3. Set `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, and a long random `CRON_SECRET` in Vercel's server environment. Never expose these values with a `NEXT_PUBLIC_` prefix. Vercel sends the cron secret as a bearer token.
4. Deploy the project and confirm the Vercel Cron entry is enabled. Use **Admin → Backups → Create backup now** for an initial snapshot, then check the Vercel function logs and the Drive folder after the scheduled run.

Each `.jsonl.gz` archive contains application table rows, Supabase Auth account IDs and metadata (not passwords, password hashes, sessions, or tokens), every Supabase Storage object, and Smart Lib PDFs in Drive referenced by books and contributions. Missing optional tables are listed in the archive's final summary; other export or upload errors fail the run. These are logical exports, not point-in-time database dumps: use Supabase's native backup/PITR facilities as an additional disaster-recovery layer, and test any restoration procedure against an isolated project before relying on it. Data in Drive folders not referenced by the book/contribution records is not copied.

Legacy Drive PDFs without Smart Lib-specific `appProperties` remain eligible for retrieval when their database record identifies the file; contradictory metadata is still rejected. This compatibility has not yet been verified against a live Drive account. Contributions stored outside the supported Drive records or the owner-scoped Supabase paths require a reviewed migration before approval or access; do not broaden file access to arbitrary external URLs.

GCash receipt reference scanning uses browser-side OCR to suggest a labeled numeric reference from the selected image; the receipt image is not sent to Gemini for extraction. OCR can misread characters, so the user must confirm the value and the librarian must verify payment independently. The scanner is not a payment-verification mechanism.

The library chat assistant uses the server-only `GEMINI_API_KEY` to generate responses grounded in authenticated catalog search results and, for loan questions, the signed-in user's own limited loan details. Configure the key in local `.env.local` for development and in the hosting provider's server-side environment settings for deployment. User prompts and a short recent chat history are sent to Google Gemini; see the Privacy Policy for details.

---

Created with care by **H-STUDIO**.
