import { describe, expect, it, vi } from "vitest";
import {
  classifyUpgradeDelta,
  compareSemver,
  normalizeVersionSpec,
  parseConcreteSemver,
  resolveRecommendedSafeVersion,
} from "@/lib/engine/semverUtils";
import { parsePackageJsonText } from "@/lib/engine/packageParser";
import {
  DEFAULT_POLICIES,
  evaluateLicenseCompliance,
  getPolicyById,
} from "@/lib/engine/licensePolicy";
import { buildStackAuditReport, scorePackageRisk } from "@/lib/engine/riskScorer";
import { BoundedTtlCache } from "@/lib/cache/ttlCache";
import { PackageAuditResult } from "@/lib/schemas/supplyChain";

describe("Semver Normalization & Upgrade Delta Classification", () => {
  it("normalizes common npm range prefixes and skips non-semver protocols", () => {
    expect(normalizeVersionSpec("^4.17.15")).toBe("4.17.15");
    expect(normalizeVersionSpec("~1.2.3")).toBe("1.2.3");
    expect(normalizeVersionSpec("^18")).toBe("18.0.0");
    expect(normalizeVersionSpec("workspace:*")).toBe("");
    expect(normalizeVersionSpec("git+https://github.com/org/repo.git")).toBe("");
  });

  it("compares semver tuples and classifies PATCH/MINOR/MAJOR/NONE cleanly", () => {
    const a = parseConcreteSemver("4.17.15")!;
    const b = parseConcreteSemver("4.17.21")!;
    expect(compareSemver(a, b)).toBeLessThan(0);

    expect(classifyUpgradeDelta("4.17.15", "4.17.21")).toBe("PATCH");
    expect(classifyUpgradeDelta("4.17.15", "4.18.0")).toBe("MINOR");
    expect(classifyUpgradeDelta("8.5.1", "9.0.2")).toBe("MAJOR");
    expect(classifyUpgradeDelta("19.3.0", "19.3.0")).toBe("NONE");
    expect(classifyUpgradeDelta("19.3.0", null)).toBe("UNKNOWN");
  });

  it("picks the highest required safe fixed version or latest release", () => {
    expect(resolveRecommendedSafeVersion(["4.17.20", "4.17.21"], "4.17.21")).toBe("4.17.21");
    expect(resolveRecommendedSafeVersion(["0.21.2"], "1.7.7")).toBe("1.7.7");
    expect(resolveRecommendedSafeVersion([null], null)).toBeNull();
  });
});

describe("package.json Parser & Boundary Guardrails", () => {
  it("extracts dependencies and devDependencies while deduplicating overlapping entries", () => {
    const raw = JSON.stringify({
      name: "demo-app",
      dependencies: { express: "^4.18.2", lodash: "4.17.15" },
      devDependencies: { lodash: "4.17.21", vitest: "^3.1.1" },
    });
    const parsed = parsePackageJsonText(raw);
    expect(parsed.projectName).toBe("demo-app");
    expect(parsed.packages).toHaveLength(3);
    expect(parsed.packages.find((p) => p.name === "lodash")?.section).toBe("dependencies");
  });

  it("rejects malformed JSON, non-object manifests, and empty dependencies", () => {
    expect(() => parsePackageJsonText("{invalid")).toThrow(/Invalid JSON/i);
    expect(() => parsePackageJsonText(JSON.stringify({ name: "empty" }))).toThrow(/No valid/i);
  });
});

describe("SPDX License Compliance Evaluator", () => {
  const strictPolicy = getPolicyById("commercial-strict");

  it("blocks strong copyleft licenses under Commercial SaaS Strict", () => {
    const res = evaluateLicenseCompliance("GPL-3.0-only", strictPolicy);
    expect(res.status).toBe("BLOCKED");
  });

  it("flags weak copyleft licenses for legal review", () => {
    const res = evaluateLicenseCompliance("MPL-2.0", strictPolicy);
    expect(res.status).toBe("REVIEW");
  });

  it("permits dual-licensed packages that offer a compliant permissive branch", () => {
    const res = evaluateLicenseCompliance("(MIT OR GPL-3.0)", strictPolicy);
    expect(res.status).toBe("PASS");
  });

  it("reports UNKNOWN cleanly when manifest omits SPDX metadata", () => {
    expect(evaluateLicenseCompliance(null, strictPolicy).status).toBe("UNKNOWN");
  });
});

describe("Deterministic Risk Scorer & Report Assembly", () => {
  const policy = DEFAULT_POLICIES[0]!;

  it("scores critical CVEs + blocked licenses accurately within 0..100 bounds", () => {
    const critical = scorePackageRisk(
      {
        vulnerabilities: [
          {
            id: "GHSA-test-1234-5678",
            aliases: ["CVE-2021-9999"],
            summary: "Prototype pollution",
            severity: "CRITICAL",
            cvssScore: 9.8,
            fixedVersion: "4.17.21",
            referenceUrl: null,
          },
        ],
        licenseStatus: "BLOCKED",
        deprecatedNotice: null,
        openssf: { score: 3.1, date: "2026-01-01", repoName: "org/pkg", checks: [] },
        upgradeDelta: "MAJOR",
      },
      policy
    );
    expect(critical.riskScore).toBeGreaterThanOrEqual(60);
    expect(critical.riskScore).toBeLessThanOrEqual(100);
    expect(critical.riskTier).toBe("CRITICAL");

    const cleanPkg: PackageAuditResult = {
      name: "zod",
      requestedSpec: "^3.24.2",
      analyzedVersion: "3.24.2",
      section: "dependencies",
      latestVersion: "3.24.2",
      upgradeDelta: "NONE",
      deprecatedNotice: null,
      spdxLicense: "MIT",
      licenseStatus: "PASS",
      licenseReason: "MIT complies",
      vulnerabilities: [],
      recommendedSafeVersion: "3.24.2",
      openssf: null,
      riskScore: 0,
      riskTier: "LOW",
      telemetryStatus: { osv: "VERIFIED", npm: "VERIFIED", openssf: "NOT_INDEXED" },
    };
    const report = buildStackAuditReport("clean-app", policy, [cleanPkg], 0);
    expect(report.overallHealthScore).toBe(100);
    expect(report.overallRiskTier).toBe("LOW");
  });
});

describe("Bounded TTL Cache", () => {
  it("expires entries after TTL and evicts oldest entry at max capacity", () => {
    vi.useFakeTimers();
    const cache = new BoundedTtlCache(2);
    cache.set("a", 1, 1000);
    cache.set("b", 2, 5000);
    vi.advanceTimersByTime(1500);
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe(2);

    cache.set("c", 3, 5000);
    cache.set("d", 4, 5000);
    expect(cache.size()).toBe(2);
    expect(cache.get("b")).toBeNull();
    expect(cache.get("d")).toBe(4);
    vi.useRealTimers();
  });
});
