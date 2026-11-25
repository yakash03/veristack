// VeriStack — npm Registry Metadata Provider (/latest compact manifest)

import { VERISTACK_CONFIG } from "../config";
import { telemetryCache } from "../cache/ttlCache";
import { fetchJsonWithTimeout } from "./httpClient";

export interface NpmPackageTelemetry {
  verified: boolean;
  latestVersion: string | null;
  spdxLicense: string | null;
  deprecatedNotice: string | null;
  githubRepoSlug: string | null;
}

interface RawNpmLatestResponse {
  version?: string;
  license?: string | { type?: string };
  deprecated?: string;
  repository?: string | { url?: string };
}

/** Extract clean "owner/repo" slug when a GitHub repository URL is declared. */
export function extractGithubSlug(
  repository: string | { url?: string } | undefined
): string | null {
  const rawUrl = typeof repository === "string" ? repository : repository?.url;
  if (!rawUrl) return null;
  const match = rawUrl.match(/github\.com[:/]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git|\/|#|$)/i);
  return match && match[1] ? match[1] : null;
}

function normalizeLicenseField(raw: string | { type?: string } | undefined): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw.trim() || null;
  if (typeof raw.type === "string") return raw.type.trim() || null;
  return null;
}

/** Fetch compact latest package metadata from the public npm Registry with TTL cache. */
export async function fetchNpmPackageTelemetry(packageName: string): Promise<NpmPackageTelemetry> {
  const cacheKey = `npm:latest:${packageName}`;
  const cached = telemetryCache.get<NpmPackageTelemetry>(cacheKey);
  if (cached) return cached;

  // Scoped packages must preserve "/" inside registry path when encoding scope/name segments
  const encodedPath = packageName.startsWith("@")
    ? `@${encodeURIComponent(packageName.slice(1)).replace("%2F", "/")}`
    : encodeURIComponent(packageName);

  try {
    const data = await fetchJsonWithTimeout<RawNpmLatestResponse>(
      `${VERISTACK_CONFIG.telemetry.npmBaseUrl}/${encodedPath}/latest`,
      {
        provider: "npm-registry",
        timeoutMs: VERISTACK_CONFIG.telemetry.npmTimeoutMs,
      }
    );

    const result: NpmPackageTelemetry = {
      verified: true,
      latestVersion: typeof data.version === "string" ? data.version : null,
      spdxLicense: normalizeLicenseField(data.license),
      deprecatedNotice:
        typeof data.deprecated === "string" && data.deprecated.trim().length > 0
          ? data.deprecated.trim().slice(0, 200)
          : null,
      githubRepoSlug: extractGithubSlug(data.repository),
    };

    telemetryCache.set(cacheKey, result, VERISTACK_CONFIG.cache.npmMetadataTtlMs);
    return result;
  } catch {
    return {
      verified: false,
      latestVersion: null,
      spdxLicense: null,
      deprecatedNotice: null,
      githubRepoSlug: null,
    };
  }
}
