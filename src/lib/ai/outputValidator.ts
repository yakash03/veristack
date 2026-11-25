// VeriStack — Strict AI Output Grounding Validator
// Rejects any generated response that cites fabricated CVE/GHSA identifiers
// not present in the verified OSV scan report.

import { StackAuditReport } from "../schemas/supplyChain";

const ADVISORY_ID_PATTERN = /\b(?:CVE-\d{4}-\d{4,7}|GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})\b/gi;

export interface GroundingValidationResult {
  isValid: boolean;
  reason?: string;
  hallucinatedAdvisories: string[];
  citedAdvisories: string[];
  citedPackages: string[];
}

/** Collect every verified advisory ID & alias from the scan payload. */
export function collectKnownAdvisoryIds(report: StackAuditReport): Set<string> {
  const known = new Set<string>();
  for (const pkg of report.packages) {
    for (const v of pkg.vulnerabilities) {
      known.add(v.id.toUpperCase());
      for (const alias of v.aliases) {
        known.add(alias.toUpperCase());
      }
    }
  }
  return known;
}

/** Validate generated text so zero unverified CVE or GHSA identifiers pass to the user. */
export function validateAiTextAgainstReport(
  text: string,
  report: StackAuditReport
): GroundingValidationResult {
  const knownAdvisories = collectKnownAdvisoryIds(report);
  const matches = text.match(ADVISORY_ID_PATTERN) ?? [];
  const citedSet = new Set(matches.map((m) => m.toUpperCase()));
  const hallucinated: string[] = [];

  for (const id of citedSet) {
    if (!knownAdvisories.has(id)) {
      hallucinated.push(id);
    }
  }

  const lowerText = text.toLowerCase();
  const citedPackages = report.packages
    .map((p) => p.name)
    .filter((name) => lowerText.includes(name.toLowerCase()));

  if (hallucinated.length > 0) {
    return {
      isValid: false,
      reason: `Rejected ungrounded advisory reference(s): ${hallucinated.join(", ")}`,
      hallucinatedAdvisories: hallucinated,
      citedAdvisories: Array.from(citedSet),
      citedPackages,
    };
  }

  return {
    isValid: true,
    hallucinatedAdvisories: [],
    citedAdvisories: Array.from(citedSet),
    citedPackages,
  };
}
