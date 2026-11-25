# Testing Strategy & Quality Assurance — VeriStack

VeriStack maintains a three-tier automated test pyramid plus static formatting, linting, and strict TypeScript verification gates.

## 1. Test Tiers

| Tier                           | Tool                                                                 | Location                                                        | Scope                                                                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Static Quality Gates**       | Prettier, ESLint, TypeScript (`strict` + `noUncheckedIndexedAccess`) | Root configs                                                    | Code formatting, 0-warning lint rules, strict type safety                                                                                                                                                                                                                              |
| **Unit Tests**                 | Vitest                                                               | `tests/unit/engine.test.ts`, `tests/unit/aiAndSecurity.test.ts` | Semver normalization, `package.json` validation, SPDX rules, risk scoring, TTL cache eviction, CVE grounding validator, hallucination fallback, HMAC cookie verification, rate limiting                                                                                                |
| **API & DB Integration Tests** | Vitest (`NextRequest`)                                               | `tests/integration/apiRoutes.test.ts`                           | `/api/health`, `/api/policies`, `/api/scan`, `/api/audits`, parameterized SQLite CRUD, anti-IDOR isolation across independent user sessions, 400 error validation                                                                                                                      |
| **End-to-End & WCAG Audits**   | Playwright + `@axe-core/playwright`                                  | `tests/e2e/veristack.spec.ts`                                   | Real Chromium flows across desktop (`Desktop Chrome`) and mobile (`Pixel 5`), live scan execution, persona switch, grounded Q&A, modal keyboard `Escape` behavior, custom policy creation, error states, horizontal overflow checks, and zero-violation Axe WCAG 2.0/2.1/2.2 AA audits |

## 2. Running All Checks

```bash
# 1. Run static formatting, ESLint (zero warnings), strict tsc, and Vitest unit+integration tests:
npm run qa

# 2. Verify production Next.js build:
npm run build

# 3. Run real browser Playwright E2E + Axe WCAG 2.2 AA accessibility tests:
npm run test:e2e

# 4. Dependency audit:
npm audit --audit-level=high
```
