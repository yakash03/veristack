// VeriStack — Deterministic Supply-Chain Risk Scoring & Report Assembly

import {
  CompliancePolicy,
  PackageAuditResult,
  RiskTier,
  StackAuditReport,
} from "../schemas/supplyChain";

/** Compute deterministic 0..100 risk score (100 = highest risk) for a single package. */
export function scorePackageRisk(
  pkg: Pick<
    PackageAuditResult,
    "vulnerabilities" | "licenseStatus" | "deprecatedNotice" | "openssf" | "upgradeDelta"
  >,
  policy: CompliancePolicy
): { riskScore: number; riskTier: RiskTier } {
  let score = 0;

  for (const vuln of pkg.vulnerabilities) {
    if (vuln.severity === "CRITICAL" || (vuln.cvssScore !== null && vuln.cvssScore >= 9)) {
      score += 42;
    } else if (
      vuln.severity === "HIGH" ||
      (vuln.cvssScore !== null && vuln.cvssScore > policy.maxAllowedCvss)
    ) {
      score += 26;
    } else if (vuln.severity === "MEDIUM") {
      score += 12;
    } else {
      score += 5;
    }
  }

  if (pkg.licenseStatus === "BLOCKED") {
    score += 35;
  } else if (pkg.licenseStatus === "REVIEW") {
    score += 14;
  } else if (pkg.licenseStatus === "UNKNOWN") {
    score += 8;
  }

  if (pkg.deprecatedNotice) {
    score += policy.blockDeprecated ? 25 : 15;
  }

  if (pkg.openssf && pkg.openssf.score < 4.0) {
    score += 10;
  }

  if (pkg.upgradeDelta === "MAJOR") {
    score += 4;
  }

  const clamped = Math.min(100, Math.round(score));
  const riskTier: RiskTier =
    clamped >= 60 ? "CRITICAL" : clamped >= 35 ? "HIGH" : clamped >= 15 ? "MODERATE" : "LOW";

  return { riskScore: clamped, riskTier };
}

/** Assemble complete audited stack report with aggregated metrics & strict provenance. */
export function buildStackAuditReport(
  projectName: string,
  policy: CompliancePolicy,
  packages: PackageAuditResult[],
  truncatedCount: number
): StackAuditReport {
  const sorted = [...packages].sort((a, b) => b.riskScore - a.riskScore);

  let vulnerablePackages = 0;
  let totalAdvisories = 0;
  let criticalAdvisories = 0;
  let highAdvisories = 0;
  let deprecatedPackages = 0;
  let blockedLicenses = 0;
  let reviewLicenses = 0;
  let majorUpgradesNeeded = 0;

  for (const pkg of sorted) {
    if (pkg.vulnerabilities.length > 0) vulnerablePackages += 1;
    totalAdvisories += pkg.vulnerabilities.length;
    for (const v of pkg.vulnerabilities) {
      if (v.severity === "CRITICAL") criticalAdvisories += 1;
      else if (v.severity === "HIGH") highAdvisories += 1;
    }
    if (pkg.deprecatedNotice) deprecatedPackages += 1;
    if (pkg.licenseStatus === "BLOCKED") blockedLicenses += 1;
    if (pkg.licenseStatus === "REVIEW") reviewLicenses += 1;
    if (pkg.upgradeDelta === "MAJOR" && pkg.vulnerabilities.length > 0) majorUpgradesNeeded += 1;
  }

  const avgRisk =
    sorted.length > 0 ? sorted.reduce((acc, p) => acc + p.riskScore, 0) / sorted.length : 0;
  const maxRisk = sorted.length > 0 ? (sorted[0]?.riskScore ?? 0) : 0;
  // Blend average portfolio risk with worst offender so a single critical CVE visibly affects posture
  const weightedRisk = Math.min(100, Math.round(avgRisk * 0.45 + maxRisk * 0.55));
  const overallHealthScore = Math.max(0, 100 - weightedRisk);

  const overallRiskTier: RiskTier =
    criticalAdvisories > 0 || blockedLicenses > 0 || overallHealthScore < 45
      ? "CRITICAL"
      : highAdvisories > 0 || overallHealthScore < 70
        ? "HIGH"
        : overallHealthScore < 90
          ? "MODERATE"
          : "LOW";

  return {
    projectName,
    scannedAt: new Date().toISOString(),
    policy,
    overallHealthScore,
    overallRiskTier,
    summary: {
      totalPackages: sorted.length,
      vulnerablePackages,
      totalAdvisories,
      criticalAdvisories,
      highAdvisories,
      deprecatedPackages,
      blockedLicenses,
      reviewLicenses,
      majorUpgradesNeeded,
      truncatedCount,
    },
    packages: sorted,
    provenance: {
      sources: [
        "OSV.dev Vulnerability Database (https://api.osv.dev/v1)",
        "npm Public Registry Manifests (https://registry.npmjs.org)",
        "OpenSSF Security Scorecards API (https://api.securityscorecards.dev)",
        `VeriStack Deterministic Policy Engine (${policy.name})`,
      ],
      limitations: [
        "Direct dependencies and devDependencies declared in package.json are evaluated; deep transitive lockfile trees require a lockfile parser.",
        "Range specs (^ or ~) are evaluated at their baseline declared semver floor unless pinned to an exact version.",
        "OpenSSF Scorecard telemetry requires a public GitHub repository URL and may read NOT_INDEXED for smaller packages.",
      ],
    },
  };
}
