// VeriStack — OpenSSF Security Scorecards Provider Client

import { VERISTACK_CONFIG } from "../config";
import { telemetryCache } from "../cache/ttlCache";
import { OpenSsfPosture } from "../schemas/supplyChain";
import { fetchJsonWithTimeout, UpstreamHttpError } from "./httpClient";

interface RawScorecardResponse {
  date?: string;
  score?: number;
  repo?: { name?: string };
  checks?: Array<{ name?: string; score?: number }>;
}

export interface OpenSsfFetchResult {
  posture: OpenSsfPosture | null;
  status: "VERIFIED" | "NOT_INDEXED" | "UNAVAILABLE";
}

/** Query OpenSSF Scorecard for a GitHub repository slug (e.g., "expressjs/express"). */
export async function fetchOpenSsfScorecard(repoSlug: string | null): Promise<OpenSsfFetchResult> {
  if (!repoSlug) {
    return { posture: null, status: "NOT_INDEXED" };
  }

  const cacheKey = `openssf:${repoSlug.toLowerCase()}`;
  const cached = telemetryCache.get<OpenSsfFetchResult>(cacheKey);
  if (cached) return cached;

  try {
    const raw = await fetchJsonWithTimeout<RawScorecardResponse>(
      `${VERISTACK_CONFIG.telemetry.openssfBaseUrl}/projects/github.com/${repoSlug}`,
      {
        provider: "openssf-scorecard",
        timeoutMs: VERISTACK_CONFIG.telemetry.openssfTimeoutMs,
        retries: 0,
      }
    );

    if (typeof raw.score !== "number") {
      return { posture: null, status: "NOT_INDEXED" };
    }

    const posture: OpenSsfPosture = {
      score: Math.round(raw.score * 10) / 10,
      date: raw.date ?? "",
      repoName: raw.repo?.name ?? `github.com/${repoSlug}`,
      checks: (raw.checks ?? [])
        .filter(
          (c): c is { name: string; score: number } =>
            typeof c.name === "string" && typeof c.score === "number"
        )
        .filter((c) => c.score >= 0)
        .slice(0, 6),
    };

    const result: OpenSsfFetchResult = { posture, status: "VERIFIED" };
    telemetryCache.set(cacheKey, result, VERISTACK_CONFIG.cache.openssfTtlMs);
    return result;
  } catch (err: unknown) {
    if (err instanceof UpstreamHttpError && err.statusCode === 404) {
      const notFound: OpenSsfFetchResult = { posture: null, status: "NOT_INDEXED" };
      telemetryCache.set(cacheKey, notFound, VERISTACK_CONFIG.cache.openssfTtlMs);
      return notFound;
    }
    return { posture: null, status: "UNAVAILABLE" };
  }
}
