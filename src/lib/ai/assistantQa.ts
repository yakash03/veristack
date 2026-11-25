// VeriStack — Grounded Q&A Engine Over Scanned Dependency Telemetry

import { AiChatResponse, AudiencePersona, StackAuditReport } from "../schemas/supplyChain";
import { generateGeminiContent, sanitizeForPrompt } from "./geminiClient";
import { validateAiTextAgainstReport } from "./outputValidator";

function buildDeterministicQaFallback(question: string, report: StackAuditReport): AiChatResponse {
  const qLower = question.toLowerCase();
  const matchedPkg = report.packages.find((p) => qLower.includes(p.name.toLowerCase()));

  if (matchedPkg) {
    const advSummary =
      matchedPkg.vulnerabilities.length > 0
        ? `has ${matchedPkg.vulnerabilities.length} OSV advisory(ies) (${matchedPkg.vulnerabilities.map((v) => v.id).join(", ")})`
        : "has 0 active OSV advisories at the evaluated baseline";
    const upgradePart = matchedPkg.recommendedSafeVersion
      ? ` Recommended version target: ${matchedPkg.recommendedSafeVersion} (${matchedPkg.upgradeDelta}).`
      : "";
    const answer = `${matchedPkg.name}@${matchedPkg.analyzedVersion} ${advSummary}, SPDX license "${matchedPkg.spdxLicense ?? "UNKNOWN"}" (${matchedPkg.licenseStatus}), risk score ${matchedPkg.riskScore}/100.${upgradePart}`;

    return {
      answer,
      source: "DETERMINISTIC_FALLBACK",
      citedPackages: [matchedPkg.name],
      citedAdvisories: matchedPkg.vulnerabilities.map((v) => v.id),
      generatedAt: new Date().toISOString(),
    };
  }

  if (qLower.includes("license") || qLower.includes("gpl") || qLower.includes("legal")) {
    const nonPass = report.packages.filter((p) => p.licenseStatus !== "PASS");
    const answer =
      nonPass.length > 0
        ? `Under "${report.policy.name}", ${nonPass.length} package(s) need attention: ${nonPass
            .slice(0, 4)
            .map((p) => `${p.name} (${p.spdxLicense ?? "UNKNOWN"} - ${p.licenseStatus})`)
            .join(", ")}.`
        : `All ${report.summary.totalPackages} evaluated packages satisfy "${report.policy.name}" license rules.`;

    return {
      answer,
      source: "DETERMINISTIC_FALLBACK",
      citedPackages: nonPass.slice(0, 4).map((p) => p.name),
      citedAdvisories: [],
      generatedAt: new Date().toISOString(),
    };
  }

  if (qLower.includes("upgrade") || qLower.includes("fix") || qLower.includes("patch")) {
    const patchable = report.packages.filter(
      (p) => p.vulnerabilities.length > 0 && p.recommendedSafeVersion
    );
    const answer =
      patchable.length > 0
        ? `Priority fixes: ${patchable
            .slice(0, 4)
            .map((p) => `${p.name} -> ${p.recommendedSafeVersion} (${p.upgradeDelta})`)
            .join("; ")}. Non-major bumps can usually be verified quickly with automated tests.`
        : `No vulnerability fixes required across the ${report.summary.totalPackages} audited packages.`;

    return {
      answer,
      source: "DETERMINISTIC_FALLBACK",
      citedPackages: patchable.slice(0, 4).map((p) => p.name),
      citedAdvisories: patchable.flatMap((p) => p.vulnerabilities.map((v) => v.id)).slice(0, 6),
      generatedAt: new Date().toISOString(),
    };
  }

  const topRisk = report.packages.filter((p) => p.riskScore >= 15).slice(0, 3);
  const answer =
    topRisk.length > 0
      ? `${report.projectName} scored ${report.overallHealthScore}/100 health (${report.overallRiskTier} risk) with ${report.summary.totalAdvisories} OSV advisories. Highest-risk dependencies: ${topRisk
          .map((p) => `${p.name} (risk ${p.riskScore}/100)`)
          .join(", ")}.`
      : `${report.projectName} scored ${report.overallHealthScore}/100 health across ${report.summary.totalPackages} dependencies with no elevated vulnerabilities or license blocks.`;

  return {
    answer,
    source: "DETERMINISTIC_FALLBACK",
    citedPackages: topRisk.map((p) => p.name),
    citedAdvisories: topRisk.flatMap((p) => p.vulnerabilities.map((v) => v.id)).slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
}

/** Answer a developer/security question grounded strictly in the audited telemetry report. */
export async function answerAuditQuestion(
  question: string,
  report: StackAuditReport,
  persona: AudiencePersona
): Promise<AiChatResponse> {
  const safeQuestion = sanitizeForPrompt(question, 800);
  const fallback = buildDeterministicQaFallback(safeQuestion, report);

  const scanContext = {
    projectName: sanitizeForPrompt(report.projectName, 80),
    healthScore: report.overallHealthScore,
    riskTier: report.overallRiskTier,
    policy: report.policy.name,
    packages: report.packages.slice(0, 20).map((p) => ({
      name: p.name,
      version: p.analyzedVersion,
      latest: p.latestVersion,
      recommended: p.recommendedSafeVersion,
      delta: p.upgradeDelta,
      license: p.spdxLicense,
      licenseStatus: p.licenseStatus,
      deprecated: p.deprecatedNotice,
      riskScore: p.riskScore,
      advisories: p.vulnerabilities.map(
        (v) => `${v.id}(${v.severity}, fix:${v.fixedVersion ?? "none"})`
      ),
    })),
  };

  const prompt = `You are VeriStack Assistant helping a ${persona}.
Answer concisely (2-4 sentences) using ONLY facts present in SCAN_CONTEXT.
Do NOT invent CVE/GHSA identifiers, package names, or version numbers. If a package is absent from SCAN_CONTEXT, state it was not part of the audited dependency set.

SCAN_CONTEXT:
${JSON.stringify(scanContext)}

USER_QUESTION:
${safeQuestion}`;

  const rawAnswer = await generateGeminiContent({
    prompt,
    maxOutputTokens: 350,
    temperature: 0.2,
  });

  if (!rawAnswer) return fallback;

  const grounding = validateAiTextAgainstReport(rawAnswer, report);
  if (!grounding.isValid) {
    console.warn(`[VeriStack AI] Q&A rejected: ${grounding.reason}`);
    return fallback;
  }

  return {
    answer: rawAnswer,
    source: "GEMINI_VERIFIED",
    citedPackages: grounding.citedPackages,
    citedAdvisories: grounding.citedAdvisories,
    generatedAt: new Date().toISOString(),
  };
}
