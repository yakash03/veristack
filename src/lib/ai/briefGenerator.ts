// VeriStack — Persona-Adapted Remediation Briefing Engine (Gemini + Deterministic Fallback)

import { z } from "zod";
import { AiBriefResponse, AudiencePersona, StackAuditReport } from "../schemas/supplyChain";
import { generateGeminiContent, parseJsonFromModel, sanitizeForPrompt } from "./geminiClient";
import { validateAiTextAgainstReport } from "./outputValidator";

const GeminiBriefSchema = z.object({
  headline: z.string().trim().min(5).max(160),
  executiveSummary: z.string().trim().min(10).max(900),
  topPriorities: z.array(z.string().trim().min(3).max(240)).min(1).max(5),
  upgradePlaybook: z.string().trim().min(10).max(900),
});

function buildDeterministicBrief(
  report: StackAuditReport,
  persona: AudiencePersona
): AiBriefResponse {
  const s = report.summary;
  const vulnerablePkgs = report.packages.filter((p) => p.vulnerabilities.length > 0);
  const blockedPkgs = report.packages.filter((p) => p.licenseStatus === "BLOCKED");
  const deprecatedPkgs = report.packages.filter((p) => p.deprecatedNotice !== null);

  const priorities: string[] = [];
  for (const pkg of vulnerablePkgs.slice(0, 3)) {
    const topVuln = pkg.vulnerabilities[0];
    const target = pkg.recommendedSafeVersion
      ? ` -> upgrade to ${pkg.recommendedSafeVersion} (${pkg.upgradeDelta})`
      : "";
    priorities.push(
      `Remediate ${pkg.name}@${pkg.analyzedVersion} (${topVuln?.id ?? "advisory"}, ${topVuln?.severity ?? "MEDIUM"})${target}.`
    );
  }
  for (const pkg of blockedPkgs.slice(0, 2)) {
    priorities.push(
      `Replace or obtain legal exception for ${pkg.name} due to blocked SPDX license "${pkg.spdxLicense ?? "UNKNOWN"}".`
    );
  }
  for (const pkg of deprecatedPkgs.slice(0, 2)) {
    if (priorities.length < 4) {
      priorities.push(`Phase out deprecated package ${pkg.name}: ${pkg.deprecatedNotice}.`);
    }
  }
  if (priorities.length === 0) {
    priorities.push(
      `All ${s.totalPackages} evaluated packages pass ${report.policy.name} without active OSV advisories.`
    );
  }

  const upgradeCommands = vulnerablePkgs
    .filter((p) => p.recommendedSafeVersion)
    .slice(0, 5)
    .map((p) => `${p.name}@${p.recommendedSafeVersion}`)
    .join(" ");

  const safePlaybook = upgradeCommands
    ? `Targeted dependency updates: npm install ${upgradeCommands}. Re-run unit and integration test suites before merging major version bumps.`
    : "No mandatory security patch upgrades identified across inspected direct dependencies. Schedule periodic dependency reviews cleanly.";

  let headline = `${report.projectName}: Supply-Chain Health ${report.overallHealthScore}/100 (${report.overallRiskTier} Risk)`;
  let executiveSummary = `Scanned ${s.totalPackages} direct dependencies against ${report.policy.name}: found ${s.totalAdvisories} OSV advisories across ${s.vulnerablePackages} packages, ${s.blockedLicenses} blocked licenses, and ${s.deprecatedPackages} deprecated modules.`;

  if (persona === "CTO_LEAD") {
    headline = `Executive Posture for ${report.projectName}: ${report.overallHealthScore}/100 (${report.overallRiskTier})`;
    executiveSummary = `Under "${report.policy.name}", ${s.vulnerablePackages} of ${s.totalPackages} direct dependencies carry verified OSV advisories (${s.criticalAdvisories} critical, ${s.highAdvisories} high). License review flagged ${s.blockedLicenses} blocked and ${s.reviewLicenses} review-required licenses.`;
  } else if (persona === "SECURITY_AUDITOR") {
    headline = `Security & Compliance Finding Summary (${s.totalAdvisories} Advisories)`;
    executiveSummary = `OSV batch telemetry identified ${s.totalAdvisories} advisories affecting ${s.vulnerablePackages} dependencies, with ${s.majorUpgradesNeeded} requiring breaking major-version bumps and ${s.deprecatedPackages} flagged as deprecated on npm.`;
  }

  return {
    persona,
    source: "DETERMINISTIC_FALLBACK",
    headline,
    executiveSummary,
    topPriorities: priorities.slice(0, 5),
    upgradePlaybook: safePlaybook,
    limitationsNotice:
      "Grounded strictly in verified OSV.dev, npm Registry, and OpenSSF telemetry for declared dependencies. Deterministic rule metrics decide risk scores; AI summaries never alter scores.",
    generatedAt: new Date().toISOString(),
  };
}

/** Generate a verified briefing using Gemini 2.0 Flash when configured, with deterministic fallback. */
export async function generateSupplyChainBrief(
  report: StackAuditReport,
  persona: AudiencePersona
): Promise<AiBriefResponse> {
  const fallback = buildDeterministicBrief(report, persona);

  const compactContext = {
    projectName: sanitizeForPrompt(report.projectName, 80),
    policyName: sanitizeForPrompt(report.policy.name, 60),
    healthScore: report.overallHealthScore,
    riskTier: report.overallRiskTier,
    summary: report.summary,
    flaggedPackages: report.packages.slice(0, 12).map((p) => ({
      name: p.name,
      version: p.analyzedVersion,
      recommended: p.recommendedSafeVersion,
      delta: p.upgradeDelta,
      license: p.spdxLicense,
      licenseStatus: p.licenseStatus,
      deprecated: Boolean(p.deprecatedNotice),
      openssfScore: p.openssf?.score ?? null,
      advisories: p.vulnerabilities.slice(0, 4).map((v) => ({
        id: v.id,
        severity: v.severity,
        fixedVersion: v.fixedVersion,
      })),
    })),
  };

  const prompt = `You are VeriStack AI, a Staff Software Supply-Chain Security Architect.
Audience Persona: ${persona}
STRICT RULES:
1. Cite ONLY exact package names, version strings, and CVE/GHSA advisory IDs present in VERIFIED_SCAN_JSON.
2. NEVER invent CVE IDs, GHSA IDs, CVSS numbers, or unverified packages.
3. Tailor tone:
   - CTO_LEAD: concise business risk, release impact, compliance blockers.
   - SECURITY_AUDITOR: exact advisory IDs, CVSS/policy threshold compliance, license exposure.
   - DEVELOPER: concrete upgrade order distinguishing non-breaking PATCH/MINOR fixes vs MAJOR migrations.
4. Return strict valid JSON with keys:
{ "headline": string, "executiveSummary": string, "topPriorities": string[], "upgradePlaybook": string }

VERIFIED_SCAN_JSON:
${JSON.stringify(compactContext)}`;

  const rawText = await generateGeminiContent({
    prompt,
    responseMimeType: "application/json",
    maxOutputTokens: 700,
    temperature: 0.2,
  });

  if (!rawText) return fallback;

  try {
    const parsedJson = parseJsonFromModel(rawText);
    const validatedSchema = GeminiBriefSchema.safeParse(parsedJson);
    if (!validatedSchema.success) return fallback;

    const combined = `${validatedSchema.data.headline} ${validatedSchema.data.executiveSummary} ${validatedSchema.data.topPriorities.join(" ")} ${validatedSchema.data.upgradePlaybook}`;
    const grounding = validateAiTextAgainstReport(combined, report);
    if (!grounding.isValid) {
      console.warn(`[VeriStack AI] Brief rejected: ${grounding.reason}`);
      return fallback;
    }

    return {
      persona,
      source: "GEMINI_VERIFIED",
      headline: validatedSchema.data.headline,
      executiveSummary: validatedSchema.data.executiveSummary,
      topPriorities: validatedSchema.data.topPriorities,
      upgradePlaybook: validatedSchema.data.upgradePlaybook,
      limitationsNotice: fallback.limitationsNotice,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return fallback;
  }
}
