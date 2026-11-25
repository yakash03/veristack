// VeriStack — Centralized Runtime Configuration & Constants

export const VERISTACK_CONFIG = {
  telemetry: {
    osvBaseUrl: process.env.OSV_API_URL || "https://api.osv.dev/v1",
    npmBaseUrl: process.env.NPM_REGISTRY_URL || "https://registry.npmjs.org",
    openssfBaseUrl: process.env.OPENSFF_SCORECARD_URL || "https://api.securityscorecards.dev",
    osvTimeoutMs: 7000,
    npmTimeoutMs: 5000,
    openssfTimeoutMs: 3500,
    maxPackagesPerScan: 35,
    upstreamConcurrency: 6,
  },
  cache: {
    npmMetadataTtlMs: 30 * 60 * 1000, // 30 min
    osvBatchTtlMs: 15 * 60 * 1000, // 15 min
    openssfTtlMs: 6 * 60 * 60 * 1000, // 6 hours
    maxEntries: 600,
  },
  rateLimit: {
    scanWindowMs: 60 * 1000,
    scanMaxRequests: 30,
    aiWindowMs: 60 * 1000,
    aiMaxRequests: 40,
  },
  ai: {
    geminiEndpoint:
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    timeoutMs: 8000,
    maxQuestionChars: 800,
  },
  security: {
    maxPackageJsonChars: 120_000,
    sessionCookieName: "veristack_ws",
  },
} as const;
