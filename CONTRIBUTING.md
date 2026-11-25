# Contributing to VeriStack

We welcome bug fixes, telemetry adapters, policy presets, and test improvements.

## Development Workflow

1. Fork or branch from `main`.
2. Keep business logic inside `src/lib/engine/` free of HTTP/UI dependencies.
3. Validate every external payload or API request with explicit **Zod schemas** in `src/lib/schemas/`.
4. Follow single-responsibility modularity (keep components and helpers concise without duplicated code).
5. Add unit/integration coverage in `tests/` for every new rule, endpoint, or bug fix.

## Required Checks Before Opening a Pull Request

```bash
npm run format
npm run qa
npm run build
npm run test:e2e
```

All checks must pass with zero ESLint warnings, zero TypeScript errors, zero failing Vitest/Playwright tests, and zero Axe accessibility violations.
