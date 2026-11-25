// VeriStack — OSV.dev Live Vulnerability Telemetry Client
// Uses POST /v1/querybatch + GET /v1/vulns/<id> with TTL caching.

import { VERISTACK_CONFIG } from "../config";
import { telemetryCache } from "../cache/ttlCache";
import { PackageDependency, SeverityLevel, VulnerabilityAdvisory } from "../schemas/supplyChain";
import { fetchJsonWithTimeout, mapWithConcurrency } from "./httpClient";

interface OsvBatchResponse {
  results?: Array<{
    vulns?: Array<{ id: string; modified?: string }>;
  }>;
}

interface OsvVulnDetail {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  database_specific?: {
    severity?: string;
    cvss?: { score?: number };
  };
  severity?: Array<{
    type?: string;
    score?: string;
  }>;
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    ranges?: Array<{
      events?: Array<{ introduced?: string; fixed?: string }>;
    }>;
  }>;
  references?: Array<{ type?: string; url?: string }>;
}

function mapSeverity(raw: OsvVulnDetail): { severity: SeverityLevel; cvssScore: number | null } {
  const dbScore = raw.database_specific?.cvss?.score;
  const numericScore =
    typeof dbScore === "number" && Number.isFinite(dbScore)
      ? Math.min(10, Math.max(0, dbScore))
      : null;

  const label = raw.database_specific?.severity?.toUpperCase();
  if (label === "CRITICAL") return { severity: "CRITICAL", cvssScore: numericScore ?? 9.5 };
  if (label === "HIGH") return { severity: "HIGH", cvssScore: numericScore ?? 7.8 };
  if (label === "MODERATE" || label === "MEDIUM") {
    return { severity: "MEDIUM", cvssScore: numericScore ?? 5.5 };
  }
  if (label === "LOW") return { severity: "LOW", cvssScore: numericScore ?? 2.8 };

  if (numericScore !== null) {
    if (numericScore >= 9.0) return { severity: "CRITICAL", cvssScore: numericScore };
    if (numericScore >= 7.0) return { severity: "HIGH", cvssScore: numericScore };
    if (numericScore >= 4.0) return { severity: "MEDIUM", cvssScore: numericScore };
    return { severity: "LOW", cvssScore: numericScore };
  }

  return { severity: "MEDIUM", cvssScore: null };
}

function extractFixedVersion(raw: OsvVulnDetail, packageName: string): string | null {
  for (const aff of raw.affected ?? []) {
    if (aff.package?.name && aff.package.name !== packageName) continue;
    for (const range of aff.ranges ?? []) {
      for (const evt of range.events ?? []) {
        if (evt.fixed) return evt.fixed;
      }
    }
  }
  return null;
}

async function fetchVulnDetail(id: string): Promise<OsvVulnDetail | null> {
  const cacheKey = `osv:vuln:${id}`;
  const cached = telemetryCache.get<OsvVulnDetail>(cacheKey);
  if (cached) return cached;

  try {
    const detail = await fetchJsonWithTimeout<OsvVulnDetail>(
      `${VERISTACK_CONFIG.telemetry.osvBaseUrl}/vulns/${encodeURIComponent(id)}`,
      {
        provider: "osv-dev",
        timeoutMs: VERISTACK_CONFIG.telemetry.osvTimeoutMs,
      }
    );
    telemetryCache.set(cacheKey, detail, VERISTACK_CONFIG.cache.osvBatchTtlMs);
    return detail;
  } catch {
    return null;
  }
}

/**
 * Batch-query OSV.dev for all parsed dependencies and resolve full advisory details cleanly.
 * Returns per-package vulnerability arrays plus an overall verification flag.
 */
export async function fetchBatchOsvAdvisories(packages: PackageDependency[]): Promise<{
  byPackage: Map<string, VulnerabilityAdvisory[]>;
  osvVerified: boolean;
}> {
  const byPackage = new Map<string, VulnerabilityAdvisory[]>();
  const queryable = packages.filter((p) => p.normalizedVersion.length > 0);
  if (queryable.length === 0) {
    return { byPackage, osvVerified: true };
  }

  const batchKey = `osv:batch:${queryable.map((q) => `${q.name}@${q.normalizedVersion}`).join(",")}`;
  let batchResponse = telemetryCache.get<OsvBatchResponse>(batchKey);

  if (!batchResponse) {
    try {
      batchResponse = await fetchJsonWithTimeout<OsvBatchResponse>(
        `${VERISTACK_CONFIG.telemetry.osvBaseUrl}/querybatch`,
        {
          provider: "osv-dev",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queries: queryable.map((pkg) => ({
              version: pkg.normalizedVersion,
              package: { name: pkg.name, ecosystem: "npm" },
            })),
          }),
          timeoutMs: VERISTACK_CONFIG.telemetry.osvTimeoutMs,
        }
      );
      telemetryCache.set(batchKey, batchResponse, VERISTACK_CONFIG.cache.osvBatchTtlMs);
    } catch {
      return { byPackage, osvVerified: false };
    }
  }

  const results = batchResponse.results ?? [];
  const uniqueIds = new Set<string>();
  const packageToIds = new Map<string, string[]>();

  for (let i = 0; i < queryable.length; i++) {
    const pkg = queryable[i];
    const vulns = results[i]?.vulns ?? [];
    if (!pkg || vulns.length === 0) continue;

    // Limit per-package detail fetches cleanly to top 8 recent IDs
    const ids = vulns.slice(0, 8).map((v) => v.id);
    packageToIds.set(pkg.name, ids);
    for (const id of ids) uniqueIds.add(id);
  }

  const detailMap = new Map<string, OsvVulnDetail>();
  if (uniqueIds.size > 0) {
    const details = await mapWithConcurrency(
      Array.from(uniqueIds).slice(0, 30),
      VERISTACK_CONFIG.telemetry.upstreamConcurrency,
      async (id) => ({ id, detail: await fetchVulnDetail(id) })
    );
    for (const entry of details) {
      if (entry.detail) detailMap.set(entry.id, entry.detail);
    }
  }

  for (const [pkgName, ids] of packageToIds.entries()) {
    const advisories: VulnerabilityAdvisory[] = ids.map((id) => {
      const detail = detailMap.get(id);
      if (!detail) {
        return {
          id,
          aliases: [],
          summary: "Security advisory recorded in OSV database.",
          severity: "MEDIUM",
          cvssScore: null,
          fixedVersion: null,
          referenceUrl: `https://osv.dev/vulnerability/${encodeURIComponent(id)}`,
        };
      }
      const { severity, cvssScore } = mapSeverity(detail);
      const rawText = (detail.summary || detail.details || "Security vulnerability advisory")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, 260);
      return {
        id: detail.id,
        aliases: (detail.aliases ?? []).slice(0, 4),
        summary: rawText,
        severity,
        cvssScore,
        fixedVersion: extractFixedVersion(detail, pkgName),
        referenceUrl:
          detail.references?.find((r) => r.url?.startsWith("https://"))?.url ??
          `https://osv.dev/vulnerability/${encodeURIComponent(detail.id)}`,
      };
    });
    byPackage.set(pkgName, advisories);
  }

  return { byPackage, osvVerified: true };
}
