// VeriStack — Compliance Policy Presets & Deterministic SPDX License Evaluator

import { CompliancePolicy, LicenseStatus } from "../schemas/supplyChain";

export const DEFAULT_POLICIES: readonly CompliancePolicy[] = [
  {
    id: "commercial-strict",
    name: "Commercial SaaS Strict",
    description:
      "Blocks strong copyleft & unlicensed packages, flags weak copyleft, enforces CVSS <= 7.0 and zero deprecated packages.",
    maxAllowedCvss: 6.9,
    blockDeprecated: true,
    blockedLicenses: ["GPL-2.0", "GPL-3.0", "AGPL-3.0", "SSPL-1.0", "UNLICENSED", "PROPRIETARY"],
    reviewLicenses: ["LGPL-2.1", "LGPL-3.0", "MPL-2.0", "EPL-2.0"],
  },
  {
    id: "permissive-balanced",
    name: "Balanced Engineering",
    description:
      "Blocks critical CVEs (CVSS >= 9.0) and AGPL/unlicensed software while allowing dual-licensed permissive libraries.",
    maxAllowedCvss: 8.9,
    blockDeprecated: false,
    blockedLicenses: ["AGPL-3.0", "SSPL-1.0", "UNLICENSED"],
    reviewLicenses: ["GPL-2.0", "GPL-3.0", "LGPL-3.0", "MPL-2.0"],
  },
  {
    id: "open-source-project",
    name: "Open-Source Maintainer",
    description:
      "Prioritizes eliminating known critical/high security vulnerabilities while allowing standard OSI-approved OSS licenses.",
    maxAllowedCvss: 8.9,
    blockDeprecated: false,
    blockedLicenses: ["UNLICENSED", "PROPRIETARY"],
    reviewLicenses: ["AGPL-3.0", "SSPL-1.0"],
  },
] as const;

export function getPolicyById(policyId?: string): CompliancePolicy {
  if (!policyId) return DEFAULT_POLICIES[0]!;
  return DEFAULT_POLICIES.find((p) => p.id === policyId) ?? DEFAULT_POLICIES[0]!;
}

/** Normalize license strings from npm metadata into uppercase tokens cleanly. */
function tokenizeSpdx(rawLicense: string): string[] {
  return rawLicense
    .replace(/[()]/g, " ")
    .split(/\s+(?:OR|AND|\/|,)\s+/i)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

function matchesRuleList(token: string, ruleList: string[]): boolean {
  const clean = token.replace(/-ONLY$|-OR-LATER$/i, "");
  return ruleList.some((rule) => {
    const upperRule = rule.toUpperCase();
    return clean === upperRule || clean.startsWith(`${upperRule}-`);
  });
}

/**
 * Evaluate an SPDX license string deterministically against the active compliance policy.
 * Dual-licensed expressions ("(MIT OR GPL-3.0)") pass if at least one branch is non-blocked/non-review.
 */
export function evaluateLicenseCompliance(
  spdxLicense: string | null,
  policy: CompliancePolicy
): { status: LicenseStatus; reason: string } {
  if (!spdxLicense || spdxLicense.trim().length === 0) {
    return {
      status: "UNKNOWN",
      reason: "No explicit SPDX license metadata published in npm registry manifest.",
    };
  }

  const trimmed = spdxLicense.trim();
  const isOrExpression = /\s+OR\s+/i.test(trimmed);
  const tokens = tokenizeSpdx(trimmed);

  if (tokens.length === 0) {
    return {
      status: "UNKNOWN",
      reason: "Unable to parse SPDX license tokens.",
    };
  }

  if (isOrExpression) {
    const anyClean = tokens.some(
      (t) =>
        !matchesRuleList(t, policy.blockedLicenses) && !matchesRuleList(t, policy.reviewLicenses)
    );
    if (anyClean) {
      return {
        status: "PASS",
        reason: `Dual-licensed (${trimmed}) includes a policy-compliant permissive option.`,
      };
    }
  }

  const blockedHits = tokens.filter((t) => matchesRuleList(t, policy.blockedLicenses));
  if (blockedHits.length > 0) {
    return {
      status: "BLOCKED",
      reason: `License "${blockedHits.join(", ")}" violates ${policy.name} policy constraints.`,
    };
  }

  const reviewHits = tokens.filter((t) => matchesRuleList(t, policy.reviewLicenses));
  if (reviewHits.length > 0) {
    return {
      status: "REVIEW",
      reason: `License "${reviewHits.join(", ")}" requires legal attribution/copyleft review.`,
    };
  }

  return {
    status: "PASS",
    reason: `SPDX "${trimmed}" complies with ${policy.name}.`,
  };
}
