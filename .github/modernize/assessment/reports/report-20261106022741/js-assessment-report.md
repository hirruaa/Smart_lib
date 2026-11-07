# JavaScript Dependency Assessment

**Generated:** 2026-11-06 02:27 UTC  
**Project:** `Smart_lib`  
**Tool:** npm-check-updates 19.6.3

This report compares declared dependency ranges in `package.json` with available package releases. It does not determine upgrade compatibility or replace an advisory scan.

## Patch updates

| Dependency | Declared | Available |
|---|---:|---:|
| `@tailwindcss/postcss` | `^4.3.3` | `^4.3.4` |
| `postcss` | `^8.5.29` | `^8.5.32` |
| `tailwindcss` | `^4.3.3` | `^4.3.4` |

## Minor updates

| Dependency | Declared | Available |
|---|---:|---:|
| `@playwright/test` | `^1.64.0` | `^1.65.0` |
| `@supabase/supabase-js` | `^2.112.2` | `^2.119.0` |

## Major updates requiring compatibility review

| Dependency | Declared | Available |
|---|---:|---:|
| `@types/node` | `^20.14.0` | `^26.6.6` |
| `@types/react` | `^18.3.3` | `^19.3.0` |
| `@types/react-dom` | `^18.3.0` | `^19.3.0` |
| `dotenv` | `^16.1.4` | `^18.0.9` |
| `googleapis` | `^178.0.0` | `^189.0.0` |
| `next` | `^15.5.24` | `^16.4.5` |
| `pdfjs-dist` | `^4.8.69` | `^6.5.438` |
| `react` | `^18.3.1` | `^19.3.1` |
| `react-dom` | `^18.3.1` | `^19.3.1` |
| `react-pdf` | `^9.2.1` | `^11.0.0` |
| `typescript` | `^5.6.0` | `^7.0.2` |

## Major-version-zero updates

| Dependency | Declared | Available |
|---|---:|---:|
| `@supabase/ssr` | `^0.12.4` | `^0.12.7` |

## Security remediation update — 2026-11-06

Next.js was patched within the existing major line to `15.5.28`; its previously reported critical/high advisories no longer appear in the advisory scan. A subsequent, non-forced `npm audit fix` updated the lockfile's Google API dependency tree: `gaxios` to `7.3.1`, `gcp-metadata` to `8.1.2`, `googleapis-common` to `8.0.1`, and `qs` to `6.17.1`; vulnerable `glob`, `minimatch`, and `rimraf` entries are no longer resolved. It did not add overrides or change the declared Google API version.

Verification after remediation: full `npm audit` and `npm audit --omit=dev` report **0 vulnerabilities**. The GitHub Security Advisories scan of the previously affected Google API packages found no known CVEs. The earlier `EALLOWREMOTE` failure was not bypassed; the authorized audit-fix operation later completed successfully.

The profile-provisioning function was also hardened: new Auth users now receive the student role regardless of caller-controlled metadata, and the trusted administrator invitation workflow assigns any higher role afterward. The consolidated schema and forward migration are updated; pgTAP covers both the untrusted metadata rejection and the administrator role assignment.

Validation on 2026-11-06: production build passed using isolated loopback Supabase settings; the system check passed; all 5 production Playwright flows passed, including concurrent duplicate physical requests and concurrent staff checkouts; and all 84 local pgTAP workflow assertions passed. The database migration `20261062_serialize_duplicate_physical_requests.sql` serializes same-member requests for the same title, preventing the duplicate-check race.

Local dependency and workflow checks are green. Production Supabase Auth/RLS settings, deployment environment and cron execution, alert delivery, a real backup restore, finance-owner correction procedures, and representative staging load/performance remain unverified and are explicit release blockers in `README.md`. Install scripts for optional/native `canvas` and `tesseract.js` packages remain allowlist-controlled; the build and current E2E suite passed, but native OCR/PDF behavior after a fresh install has not been separately validated.
