# Smart Lib security and reliability hardening

## Implemented in the application

- Shared request security helpers in `utils/requestSecurity.ts`.
- `429` rate limits with `Retry-After` for assistant, uploads, digital loans,
  member creation, backups, contribution AI screening, and assistant-session
  writes.
- Same-origin checks for browser mutation requests.
- Request `Content-Length` limits on expensive JSON and upload endpoints.
- Assistant result/history payload limits.
- Existing authentication, Supabase RLS, storage policies, PDF signature
  checks, Gemini timeout/retry handling, cron bearer secrets, and security
  headers remain enabled.

## Production requirements

The in-process limiter is a fallback for local development and a single server.
For multiple instances, replace its storage with a shared Redis/Upstash-style
counter. Otherwise a user can bypass limits by sending requests to different
instances.

Configure these limits at the edge as a second layer:

| Area | Suggested starting limit |
| --- | ---: |
| AI assistant | 20 requests/user/minute; 100/hour |
| PDF uploads | 5/user/hour; 500 MB/user/day |
| Login/reset/OTP | 5/IP/15 minutes; provider limits enabled |
| Loan and payment actions | 10/user/minute; idempotency required |
| Admin AI screening | 10/admin/hour |
| Backup jobs | 2/admin/hour; scheduled job once/day |

## Still requiring deployment or operational work

1. Add shared Redis rate limiting and edge/WAF limits.
2. Add malware/virus scanning and quarantine for uploaded PDFs and payment
   images before review or publication.
3. Add centralized error tracking, request IDs, latency metrics, and alerts for
   repeated `429`, `5xx`, Gemini quota, upload, and cron failures.
4. Test a real backup restore in a separate Supabase project at least monthly.
5. Run `npm audit --audit-level=high` and dependency updates before releases.
6. Keep `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, Google credentials, and
   `CRON_SECRET` server-only; rotate them when staff or environments change.
7. Use separate staging and production Supabase projects, enforce HTTPS, and
   configure the production site URL and authentication redirect URLs.
8. Add idempotency keys or database uniqueness constraints to payment,
   contribution, loan, and reward commands before accepting repeated retries.
9. Perform keyboard, screen-reader, mobile, reduced-motion, contrast, and
   error-state testing before launch.

## Release gate

Before production deployment, verify:

- `cmd /c npx tsc --noEmit`
- `npm run build`
- `git diff --check`
- `npm audit --audit-level=high`
- authenticated ownership/RLS tests for every table and storage bucket
- duplicate-click tests for loans, payments, rewards, and admin actions
- expired-loan, expired-waitlist, failed-upload, failed-cron, and restore tests
