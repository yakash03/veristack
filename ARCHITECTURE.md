# System Architecture — VeriStack

## 1. Design Principles & Lessons Learned

VeriStack applies architectural lessons distilled from prior production evaluations:

- **Single-Source Zod Schemas (`src/lib/schemas/supplyChain.ts`)**: Eliminates schema drift between API boundary validation, TypeScript strict interfaces, and SQLite row deserialization.
- **Zero Business Logic in Presentation Components**: Semver normalization, license compliance rules, risk scoring, and report aggregation reside strictly inside `src/lib/engine/`, enabling sub-millisecond deterministic Vitest coverage without browser rendering.
- **Centralized Shared Primitives**:
  - `src/lib/providers/httpClient.ts` encapsulates timeouts, single retries, and error classification across OSV, npm, and OpenSSF.
  - `src/lib/api/http.ts` standardizes JSON parsing, Zod error messages, and non-leaking 500 error envelopes.
  - `src/components/ui/ModalShell.tsx` enforces consistent keyboard `Escape`, backdrop click, focus capture, and focus restoration across all application dialogs.
- **No Unchecked Index Access**: Enabled `strict: true` and `noUncheckedIndexedAccess: true` in `tsconfig.json`.

## 2. Directory Layout

```
src/
├── app/
│   ├── api/
│   │   ├── health/route.ts         # Service health & AI configuration readiness
│   │   ├── scan/route.ts           # Live OSV/npm/OpenSSF orchestrator endpoint
│   │   ├── policies/route.ts       # List & create workspace policies
│   │   ├── policies/[id]/route.ts  # Workspace-owned policy deletion
│   │   ├── audits/route.ts         # List saved workspace audits
│   │   ├── audits/[id]/route.ts    # Read & delete owned audit snapshots
│   │   └── ai/
│   │       ├── brief/route.ts      # Persona-adapted executive remediation summary
│   │       └── chat/route.ts       # Grounded follow-up Q&A assistant
│   ├── layout.tsx                  # Font loading & root metadata
│   ├── globals.css                 # Focus-visible & reduced-motion accessibility rules
│   └── page.tsx                    # Client dashboard shell
├── components/
│   ├── ai/                         # Briefing & grounded Q&A components
│   ├── report/                     # Health radial SVG, dependency table, detail modal
│   ├── scanner/                    # Manifest uploader/editor & policy selector
│   ├── ui/                         # Icons, WCAG AA Badges, ModalShell
│   └── workspace/                  # Custom policy builder & audit history modals
└── lib/
    ├── ai/                         # Gemini REST client, prompt sanitizer, CVE validator
    ├── api/                        # Zod validation wrapper & HTTP responses
    ├── cache/                      # Bounded FIFO TTL cache
    ├── config/                     # Runtime endpoints, TTLs, and limits
    ├── constants/                  # Sample real manifests
    ├── db/                         # Parameterized SQLite store + atomic JSON fallback
    ├── engine/                     # Semver, parser, license evaluator, scorer
    ├── providers/                  # OSV.dev, npm Registry, OpenSSF clients
    ├── schemas/                    # Zod contracts
    └── security/                   # HMAC-SHA256 session cookies & sliding-window rate limiter
```

## 3. Data Flow & AI Grounding Boundaries

1. Client submits raw `package.json` text to `POST /api/scan`.
2. `parsePackageJsonText` enforces valid JSON, valid npm naming regex, and a 35-package per-scan cap.
3. `scanOrchestrator` queries OSV batch advisories (`api.osv.dev`) and npm `/latest` metadata concurrently (`mapWithConcurrency(..., 6)`), then fetches available OpenSSF Scorecards for GitHub repositories.
4. `scorePackageRisk` and `buildStackAuditReport` calculate deterministic package risk scores (`0..100`) and overall portfolio health.
5. AI routes (`/api/ai/brief`, `/api/ai/chat`) sanitize untrusted strings, call Gemini 2.0 Flash with `x-goog-api-key`, validate response schema via Zod, and run `validateAiTextAgainstReport` to block any fabricated CVE/GHSA IDs.
