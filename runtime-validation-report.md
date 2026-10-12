# Runtime Validation Report

**Generated**: 2026-10-12
**Target**: `C:\Users\hirrua\Documents\GitHub\Smart_lib`

## Behavioral QA Follow-up (2026-10-12)

Playwright coverage includes unauthenticated private API access, protected reader access across refresh, invalid QR-link recovery across refresh, and local sitemap/robots output. One prior `npm test` run passed 6/6 browser tests; a subsequent run exited 1 with 5/6 passing because the invalid-QR test encountered the cookie-consent dialog while the physical catalog was still loading. The test now dismisses that dialog before asserting the catalog, but this adjustment has not yet been rerun. The current Playwright configuration requires a local-only `.env.test.local`; a safe `npx playwright test --list` attempt exited 1 because that file is not configured, and correctly prevented the suite from starting against the unverified `.env.local` project.

The database workflow suite at `supabase/tests/database/workflows.pgtap.sql` now has 34 assertions for profile-role escalation, private profile/loan/progress visibility, reading-progress persistence, digital access and return, physical-copy reservation and competing claims, contribution approval and duplicate reward prevention, librarian checkout/return, and faculty role/rank/course assignment. It was **not executed**: this checkout has no Supabase CLI, PostgreSQL client, Docker runtime, or isolated test database. The contribution file migration was also corrected to declare its `owner_path` variable; neither that migration nor the suite has been applied to a database.

The browser suite was run with the application's `.env.local` Supabase configuration, whose isolation status is unknown. These runs made no deliberate application-record writes, but must not be treated as isolated database validation. Authenticated student, faculty, and librarian workflows, database RLS behavior, and persistence against Supabase remain unverified pending a confirmed isolated test environment and test accounts.

Verification: both `npm audit` and `npm audit --omit=dev` report zero vulnerabilities. `npm run build` passed after adapting dynamic route params and Supabase cookies to Next.js 15's asynchronous APIs. `npx tsc --noEmit` and the latest `git diff --check` passed. The most recent complete browser run exited 1 (5/6 browser tests passed); the earlier run exited 0 (6/6). Local sitemap and robots tests passed in both complete runs. Playwright has not been rerun since the test fix because `.env.test.local` is absent; its fail-closed configuration was verified to refuse execution. The database pgTAP suite was authored but not run due to missing isolated database/tooling prerequisites.

## Summary

| Step | Status | Exit Code | Details |
|---|---|---:|---|
| Repository system check | PASS | 0 | Existing system check passed; 17 schema object names and 5 required application files verified |
| Playwright behavioral suite | FAIL / BLOCKED | 1 | Last complete `npm test`; 5/6 passed. The subsequent `npx playwright test --list` exited 1 as designed because `.env.test.local` is absent; no app or database was contacted. |
| Production build | PASS | 0 | `npm run build`; compilation, type checks, static generation, and build tracing completed |
| Full dependency audit | PASS | 0 | `npm audit`; zero vulnerabilities |
| Production dependency audit | PASS | 0 | `npm audit --omit=dev`; zero vulnerabilities |
| TypeScript validation | PASS | 0 | `npx tsc --noEmit`; includes the latest Playwright config and test code |
| Whitespace validation | PASS | 0 | Latest `git diff --check` |
| Guest workflow checks | PARTIAL | 1 | Reader gate passed; invalid QR test failed on latest run; both passed on the earlier run |
| Private API authorization | PASS | 0 | Unauthenticated reader, progress, notifications, loans, contribution file, and admin member creation paths returned 401 |
| Authenticated workflows and persistence | UNVERIFIED | n/a | Requires test accounts and a separate isolated Supabase database |
| Database pgTAP suite | AUTHORED / NOT RUN | n/a | 34 assertions; requires disposable Supabase/PostgreSQL environment |
| Deployed sitemap | UNVERIFIED | n/a | Requires the deployed canonical origin |

## Browser and Environment

- Node.js: available, v24.19.0.
- Docker: unavailable in this environment.
- Playwright Chromium: installed; the repository contains a Playwright suite. Current run is gated on `.env.test.local`.
- Supabase CLI, PostgreSQL client, Docker runtime, and isolated database: unavailable.
- Playwright browser installation attempt (`npx playwright install --with-deps chromium`): exit 0.
- The earlier browser runs used the Supabase settings in `.env.local`; their environment is unconfirmed. No deliberate application-record writes were made. The latest Playwright invocation was safely blocked before startup because `.env.test.local` is absent.
- The user selected the production Supabase project as the online database. Write/persistence workflows and the pgTAP suite were not run against production; Playwright remains restricted to loopback Supabase. The deployed canonical site URL was not supplied, so the read-only deployed sitemap check is still pending.

## Flows Exercised

1. Open `/reader/1` as a guest, refresh, and verify the sign-in gate remains.
2. Open the public physical catalog with a malformed QR copy id, refresh, and verify the invalid-label message and guest catalog remain available.
3. Probe unauthenticated reader, reading-progress, notifications, digital-loan, contribution-file, and admin member-creation API paths; each returned 401.
4. Earlier exploratory QA (2026-10-09) visited admin dashboard/circulation/payment panels, an unknown route, and a 375px layout. Those were view-level checks, not complete authenticated workflows.

## Issues Found

| # | Severity | Finding | Evidence |
|---|---|---|---|
| 1 | FIXED | Missing Supabase sessions made `GET /api/notifications` return 500 instead of 401. | Reproduced in the first Playwright run; fixed and verified at 401. |
| 2 | FIXED | Guests were shown an auth-service failure instead of browsing the physical catalog. | Reproduced in browser QA; fixed and verified with invalid QR handling plus refresh. |
| 3 | RESOLVED LOCALLY / DEPLOYMENT PENDING | `/sitemap.xml` and `/robots.txt` return valid local output when `NEXT_PUBLIC_SITE_URL` is set. Deployed origin still needs verification. | Playwright sitemap tests passed; deployed canonical URL not provided. |
| 4 | LOW / INVESTIGATE | Next dev emitted `SyntaxError: Unexpected end of JSON input` on `/reader/1` in a test run; the reader guest-gate test still passed. | Browser/server log during latest `npm test`; Supabase environment is not confirmed isolated. |
| 5 | TEST FLAKE | Invalid QR E2E test timed out while cookie consent was open and the physical catalog was still loading. The test now dismisses cookie consent before asserting. | Latest Playwright trace/error context; rerun pending in an isolated test environment. |
| 6 | LOW / UNCONFIRMED | One earlier browser load reported `column books.premium_price` does not exist; it disappeared after restarting the dev server. | Observed once on 2026-10-09; not rechecked against an isolated database. |

## Test Execution Notes

- Playwright starts and stops its own development server. The production build was run after the browser suite to avoid concurrent `.next` use.
- Earlier tests made no deliberate application-record writes. Their configured Supabase environment was not verified as staging/local. The latest test invocation did not start because local-only configuration is missing; do not run write tests until isolation is confirmed.
- The Supabase schema/migration and pgTAP suite have not been applied to any database.

## Verdict

```yaml
environment:
  docker: UNAVAILABLE — Docker CLI/daemon not available
  node: AVAILABLE — v24.19.0
  supabase_cli: UNAVAILABLE
  postgres_client: UNAVAILABLE
  infra-tier: UNVERIFIED — pgTAP suite authored; isolated database unavailable
  playwright: AVAILABLE — Chromium installed; latest test-list attempt exited 1 because .env.test.local is not configured, and safely refused startup
  browser-tier: FAIL / BLOCKED — last complete run 5/6, exit_code: 1; test-list attempt exit_code: 1 (expected safety gate, no suite executed); earlier run 6/6, exit_code: 0
startup: PASS — `npm run build` succeeded; Playwright webServer started
integration: UNVERIFIED — 34 pgTAP assertions authored, not executed; isolated Supabase/PostgreSQL unavailable
e2e: FAIL / BLOCKED — last complete `npm test` exit_code: 1, 5 passed/1 failed; latest guarded invocation did not execute tests because `.env.test.local` is absent
overall: FAIL — the last complete browser suite exited nonzero; the follow-up suite and database workflows need an isolated local Supabase environment; authenticated workflows and deployed sitemap remain unverified
```

An earlier Playwright run reproduced and fixed the unauthenticated notifications 500 and guest physical-catalog failure. Local sitemap/robots checks now pass. The latest test failure and non-fatal JSON parse log remain unresolved, and the suite must be rerun against a confirmed isolated test configuration before signing off.
