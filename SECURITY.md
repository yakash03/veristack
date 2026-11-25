# Security Architecture & Threat Controls — VeriStack

## 1. Secret Management

- **Server-Only AI Credentials**: `GEMINI_API_KEY` is read exclusively server-side in `src/lib/ai/geminiClient.ts` and transmitted via the `x-goog-api-key` HTTP request header (never appended as a URL query parameter and never imported inside `"use client"` modules).
- **Session Signing**: Workspace session cookies are signed using HMAC-SHA256 with `crypto.timingSafeEqual` verification (`src/lib/security/session.ts`). Production deployments should configure a strong `SESSION_SECRET`.
- **Safe Error Redaction**: Server exceptions caught by `jsonErr` log sanitized error messages server-side without returning stack traces, environment variables, or database internals to clients.

## 2. Authentication, Ownership & Anti-IDOR Isolation

- Every browser workspace receives an `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookie `veristack_ws`.
- Workspace-owned resources (`workspace_policies`, `workspace_audits`) store the caller's verified `workspace_id`.
- Every `GET`, `DELETE`, and `scan` lookup queries strictly with `WHERE id = ? AND workspace_id = ?`, returning HTTP `404` when an attacker attempts to reference another workspace's resource UUID.

## 3. Input Validation & Database Security

- All request bodies pass through strict Zod schemas (`ScanRequestSchema`, `CreatePolicyInputSchema`, `AiBriefRequestSchema`, `AiChatRequestSchema`) before reaching business logic.
- Package names must match `NPM_PACKAGE_NAME_REGEX`; raw manifest payloads are capped at 120 KB and 35 packages per scan; Q&A questions are capped at 800 characters.
- SQLite operations use prepared parameterized statements (`DatabaseSync.prepare(...)`), preventing SQL injection cleanly.

## 4. Prompt Injection & AI Guardrails

- User questions and package metadata pass through `sanitizeForPrompt` (stripping control bytes and escaping triple-backtick code fences).
- Generated briefings and chat responses are checked by `validateAiTextAgainstReport` to guarantee every mentioned `CVE-*` or `GHSA-*` advisory exists in the audited report payload; any hallucinated advisory triggers automatic deterministic fallback.

## 5. HTTP Security Headers & Rate Limiting

Configured in `next.config.ts`:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy` restricting script/style/connect/frame ancestors.
- Sliding-window per-workspace/IP rate limiter (`src/lib/security/rateLimiter.ts`) enforces ceilings on `/api/scan` and `/api/ai/*` returning HTTP `429`.

## Reporting Vulnerabilities

Please report potential security bugs responsibly via repository Issues without exposing exploit payloads publicly prior to remediation.
