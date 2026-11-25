// VeriStack — End-to-End Deterministic Supply-Chain Scan Orchestrator

import { VERISTACK_CONFIG } from "../config";
import { CompliancePolicy, PackageAuditResult, StackAuditReport } from "../schemas/supplyChain";
import { parsePackageJsonText } from "./packageParser";
import { evaluateLicenseCompliance } from "./licensePolicy";
import { classifyUpgradeDelta, resolveRecommendedSafeVersion } from "./semverUtils";
import { buildStackAuditReport, scorePackageRisk } from "./riskScorer";
import { fetchBatchOsvAdvisories } from "../providers/osvClient";
import { fetchNpmPackageTelemetry } from "../providers/npmClient";
import { fetchOpenSsfScorecard } from "../providers/openssfClient";
import { mapWithConcurrency } from "../providers/httpClient";

/**
 * Execute a full multi-source supply-chain scan from raw package.json text
 * under the specified compliance policy. Zero fabricated records.
 */
export async function scanPackageJsonStack(
  packageJsonText: string,
  policy: CompliancePolicy
): Promise<StackAuditReport> {
  const { projectName, packages, truncatedCount } = parsePackageJsonText(packageJsonText);

  const [osvOutcome, npmList] = await Promise.all([
    fetchBatchOsvAdvisories(packages),
    mapWithConcurrency(packages, VERISTACK_CONFIG.telemetry.upstreamConcurrency, async (pkg) => ({
      pkg,
      npm: await fetchNpmPackageTelemetry(pkg.name),
    })),
  ]);

  // Fetch OpenSSF Scorecards in parallel with bounded concurrency for packages with GitHub repos
  const openssfResults = await mapWithConcurrency(
    npmList,
    VERISTACK_CONFIG.telemetry.upstreamConcurrency,
    async ({ npm }) => fetchOpenSsfScorecard(npm.githubRepoSlug)
  );

  const auditedPackages: PackageAuditResult[] = npmList.map(({ pkg, npm }, idx) => {
    const vulnerabilities = osvOutcome.byPackage.get(pkg.name) ?? [];
    const openssfRes = openssfResults[idx] ?? { posture: null, status: "NOT_INDEXED" as const };
    const licenseEval = evaluateLicenseCompliance(npm.spdxLicense, policy);

    const recommendedSafeVersion = resolveRecommendedSafeVersion(
      vulnerabilities.map((v) => v.fixedVersion),
      npm.latestVersion
    );
    const upgradeDelta = classifyUpgradeDelta(
      pkg.normalizedVersion || pkg.spec,
      recommendedSafeVersion
    );

    const riskEval = scorePackageRisk(
      {
        vulnerabilities,
        licenseStatus: licenseEval.status,
        deprecatedNotice: npm.deprecatedNotice,
        openssf: openssfRes.posture,
        upgradeDelta,
      },
      policy
    );

    return {
      name: pkg.name,
      requestedSpec: pkg.spec,
      analyzedVersion: pkg.normalizedVersion || pkg.spec,
      section: pkg.section,
      latestVersion: npm.latestVersion,
      upgradeDelta,
      deprecatedNotice: npm.deprecatedNotice,
      spdxLicense: npm.spdxLicense,
      licenseStatus: licenseEval.status,
      licenseReason: licenseEval.reason,
      vulnerabilities,
      recommendedSafeVersion,
      openssf: openssfRes.posture,
      riskScore: riskEval.riskScore,
      riskTier: riskEval.riskTier,
      telemetryStatus: {
        osv: osvOutcome.osvVerified ? "VERIFIED" : "UNAVAILABLE",
        npm: npm.verified ? "VERIFIED" : "UNAVAILABLE",
        openssf: openssfRes.status,
      },
    };
  });

  return buildStackAuditReport(projectName, policy, auditedPackages, truncatedCount);
}
