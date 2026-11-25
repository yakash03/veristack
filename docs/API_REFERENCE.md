# VeriStack API Reference & Data Sources

All routes return a unified envelope:

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-11-25T00:00:00.000Z"
}
```

## Endpoints

### `GET /api/health`

Returns service readiness and active AI mode (`GEMINI_CONFIGURED` or `DETERMINISTIC_FALLBACK`).

### `POST /api/scan`

Audits a `package.json` string against live OSV.dev, npm Registry, and OpenSSF Scorecards.

- **Body (`ScanRequestSchema`):** `{ packageJsonText: string, policyId?: string, saveAudit?: boolean }`
- **Rate Limit:** 30 requests / minute / workspace.
- **Returns:** `{ report: StackAuditReport, savedAudit: SavedAuditSummary | null }`.

### `POST /api/ai/brief`

Generates a persona-adapted remediation briefing (`CTO_LEAD | SECURITY_AUDITOR | DEVELOPER`).

- **Body:** `{ report: StackAuditReport, persona }`
- **Returns:** `AiBriefResponse` (`source: "GEMINI_VERIFIED" | "DETERMINISTIC_FALLBACK"`).

### `POST /api/ai/chat`

Answers developer questions strictly grounded in the provided `StackAuditReport`.

- **Body:** `{ question: string, report: StackAuditReport, persona }`

### `GET | POST /api/policies` & `DELETE /api/policies/:id`

Lists built-in presets + workspace custom policies, creates validated custom policies, or deletes workspace-owned policies.

### `GET /api/audits` & `GET | DELETE /api/audits/:id`

Lists, inspects, or deletes saved audit snapshots strictly scoped to the caller's signed `veristack_ws` cookie.

## External Data Sources

- **OSV.dev API (`https://api.osv.dev/v1`)**: Open Source Vulnerability database under Google Open Source Security.
- **npm Public Registry (`https://registry.npmjs.org`)**: Package manifests, latest versions, SPDX licenses, and deprecation flags.
- **OpenSSF Security Scorecards (`https://api.securityscorecards.dev`)**: Automated repository security hygiene checks.
