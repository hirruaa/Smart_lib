# Smart Lib Capstone Readiness Report

## Executive assessment

**Status: NOT READY FOR FINAL CAPSTONE SIGN-OFF.** The application builds and the reviewed source contains most of the named product modules. That establishes implementation evidence, not demonstrated end-to-end correctness. The thesis objectives requiring evaluation and deployment evidence remain unverified, the isolated database/browser suites have not passed in a confirmed test environment, and one thesis-to-implementation mismatch needs an explicit decision.

This review uses the approved Chapter 1 objectives and scope supplied by the user, repository source and documentation, and the validation evidence in [runtime-validation-report.md](./runtime-validation-report.md). No production database or credentials were inspected or changed.

## Objective traceability

| Objective | Repository evidence | Readiness |
|---|---|---|
| 1. Process analysis of physical borrowing, inventory, circulation, and discovery | The thesis describes the current process, but source code cannot establish that observations, interviews, or requirements analysis were actually conducted. | **NOT VERIFIED** — retain field notes, interview records, or an approved requirements-analysis artifact. |
| 2. Specify functional/non-functional requirements, roles, workflows, data protection, and authorization | Requirements and acceptance criteria are documented in [PRD.md](./PRD.md); schema and application source provide implementation evidence. | **PARTIAL** — requirements are documented; coverage and stakeholder approval are not independently evidenced here. |
| 3. Design architecture, relational data, access control, and responsive interfaces for the named user groups | [supabase/COMPLETE_SCHEMA.sql](./supabase/COMPLETE_SCHEMA.sql), application routes, and UI pages demonstrate these elements in source. | **PARTIAL** — code exists, but approved design artifacts and the distinction between library personnel and system administrators need confirmation. Current application roles are student, faculty, and admin; the admin role covers staff duties rather than proving separate least-privilege staff roles. |
| 4. Build catalog, QR lookup, physical circulation, time-limited free/points access, and PDF study tools | Relevant catalog, physical library, reader, loan, study-tool, and database workflow code/tests are present. | **PARTIAL** — source coverage is present; isolated behavioral, RLS, and persistence validation is still missing. |
| 5. Build predefined-intent library assistance and administration | [app/api/recommend/route.ts](./app/api/recommend/route.ts) classifies search, research, loans, and policy inquiries, grounds replies in catalog results and the signed-in user's loan data, and includes administrative routes/pages. | **PARTIAL** — implemented in source. Verify privacy, data boundaries, and permitted assistant scope through isolated authenticated tests. |
| 6. Integrate Gemini for receipt-reference extraction and provide AI-assisted contribution screening with staff approval | Contribution screening uses Gemini and preserves human approval in [app/api/admin/contributions/[contributionId]/screen/route.ts](./app/api/admin/contributions/[contributionId]/screen/route.ts). Receipt reference scanning is implemented in [utils/gcashReceipt.ts](./utils/gcashReceipt.ts) and uses browser-side Tesseract OCR, not Gemini; [README.md](./README.md) documents that behavior. | **PARTIAL / SCOPE MISMATCH** — contribution screening aligns; receipt OCR does not satisfy the Gemini-specific objective as written. Resolve by obtaining approval to revise the objective or by separately approving a privacy-reviewed implementation change. OCR output must not be treated as payment verification. |
| 7. Implement RBAC, server-side authorization, RLS, and protected digital-resource controls | Application authorization, storage policies, and database workflow tests are present. This audit corrected the final contribution-file storage policy so permanent grants with `expires_at IS NULL` remain readable, matching the access-grant logic and permanent-purchase workflow. The reader and contribution-file routes now distinguish unexpected auth/database/storage failures from missing or unauthorized resources. | **PARTIAL** — source controls exist and fixes compile; RLS/storage behavior is **NOT VERIFIED** until the database suite runs against isolated Supabase. |
| 8. Evaluate functionality, performance, usability, ISO/IEC 25010 characteristics, and SUS | [PRD.md](./PRD.md) defines product metrics and release criteria; [runtime-validation-report.md](./runtime-validation-report.md) records earlier browser and static-test evidence and its limitations. | **NOT VERIFIED** — no completed isolated end-to-end evaluation, measured performance results, documented ISO/IEC 25010 assessment, or SUS results were found in the reviewed evidence. Do not claim these solely from feature presence or a successful build. |
| 9. Deploy to Vercel and evaluate the deployed application | [README.md](./README.md) documents deployment configuration; the runtime report says the canonical deployed URL and production verification were not supplied. | **NOT VERIFIED** — deployment, live schema compatibility, uptime/monitoring, and deployed operational behavior have not been established by this audit. |

## Scope statements to preserve

- The thesis itself acknowledges that authorization cannot prevent an authorized user from taking screenshots or recordings. Describe PDF protections as access and download controls, not screenshot prevention.
- Paid digital transactions are outside the stated enabled workflow. Keep the thesis, interface, and acceptance criteria consistent about this boundary.
- Gemini contribution screening and receipt OCR are decision support only. Staff remain responsible for approval and payment verification.
- The thesis limits the assistant to supported intents and system information. The application currently uses Gemini to generate conversational answers within those constraints; tests should verify it does not invent catalog, account, policy, or payment facts.

## Work completed in this continuation

- Hardened [app/api/reader/[bookId]/route.ts](./app/api/reader/[bookId]/route.ts) and [app/api/contributions/[contributionId]/file/route.ts](./app/api/contributions/[contributionId]/file/route.ts) to return explicit server errors for unexpected session, database, access-grant, and storage-provider failures, while preserving generic client-facing messages for logged errors.
- Fixed the effective storage policy in [supabase/COMPLETE_SCHEMA.sql](./supabase/COMPLETE_SCHEMA.sql): permanent book-access grants with a null expiry now authorize the storage read, consistent with permanent purchase grants and the reader route.
- Corrected the documented pgTAP assertion count in [runtime-validation-report.md](./runtime-validation-report.md) from 34 to 47. A static count confirmed `plan(47)` matches 47 assertion calls; this is not evidence that pgTAP executed.

## Latest verification

| Check | Result | Evidence boundary |
|---|---|---|
| `npx tsc --noEmit` | **PASS** | TypeScript only; does not exercise authenticated database behavior. |
| `npm run build` | **PASS** | Production build completed after the API route changes. |
| `node scripts/check_system.js` | **PASS** | Reports 19 schema object names and 8 application files; it is a static presence check, not SQL execution. |
| `git diff --check` | **PASS** | No whitespace errors; Git reports a line-ending normalization warning for the contribution route. |
| pgTAP workflow suite | **NOT RUN** | 47 assertions are present; no isolated Supabase/PostgreSQL environment is available. |
| Playwright/browser suite | **BLOCKED / PRIOR RUN FAILED** | The last complete run recorded in the runtime report exited nonzero (5/6); current guarded execution requires `.env.test.local`, which is absent. Do not use `.env.local` or production data to bypass the guard. |
| Deployed checks and SUS/performance evaluation | **NOT VERIFIED** | No confirmed deployment URL, isolated test accounts, or completed evaluation results were provided. |

## Prioritized actions before sign-off

1. **Create a confirmed isolated local Supabase test environment** and run the 47-assertion pgTAP suite plus the canonical Playwright suite. Resolve failures and record exit codes and test counts. Do not point either suite at production.
2. **Resolve the receipt-reference objective mismatch** with the thesis supervisor: either formally align the thesis with the existing browser-side OCR, or approve a privacy-reviewed Gemini integration. Keep human payment verification mandatory.
3. **Produce evaluation evidence** for the approved acceptance metrics, measured performance, ISO/IEC 25010 characteristics, and SUS. Record participants/test conditions and results without overstating the sample.
4. **Provide process-analysis evidence** (approved observations/interviews/requirements artifacts) and confirm whether the combined `admin` role is acceptable for both library personnel and system administrators.
5. **Verify the intended Vercel deployment in a controlled release process**: reconcile the exact Supabase schema, test restore/recovery and scheduled operations in staging, then verify the approved HTTPS deployment, sitemap/robots, monitoring, and operational checks.

## Limitations

This is a source-and-test-evidence assessment, not a security certification, live database audit, deployment inspection, or usability study. Existing historical browser results are reported as recorded and were not represented as isolated, reproducible evidence. No thesis objectives were inferred beyond the Chapter 1 material supplied by the user.
