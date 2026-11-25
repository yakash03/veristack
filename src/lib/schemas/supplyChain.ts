// VeriStack — Single-Source-of-Truth Zod Schemas & TypeScript Contracts

import { z } from "zod";

export const NPM_PACKAGE_NAME_REGEX = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export const SeverityLevelSchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
export type SeverityLevel = z.infer<typeof SeverityLevelSchema>;

export const LicenseStatusSchema = z.enum(["PASS", "REVIEW", "BLOCKED", "UNKNOWN"]);
export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;

export const UpgradeDeltaSchema = z.enum(["NONE", "PATCH", "MINOR", "MAJOR", "UNKNOWN"]);
export type UpgradeDelta = z.infer<typeof UpgradeDeltaSchema>;

export const RiskTierSchema = z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]);
export type RiskTier = z.infer<typeof RiskTierSchema>;

export const AudiencePersonaSchema = z.enum(["CTO_LEAD", "SECURITY_AUDITOR", "DEVELOPER"]);
export type AudiencePersona = z.infer<typeof AudiencePersonaSchema>;

export const PackageDependencySchema = z.object({
  name: z.string().regex(NPM_PACKAGE_NAME_REGEX, "Invalid npm package name"),
  spec: z.string().min(1).max(64),
  normalizedVersion: z.string(),
  section: z.enum(["dependencies", "devDependencies"]),
});
export type PackageDependency = z.infer<typeof PackageDependencySchema>;

export const CompliancePolicySchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240),
  maxAllowedCvss: z.number().min(0).max(10),
  blockDeprecated: z.boolean(),
  blockedLicenses: z.array(z.string().trim().min(1).max(40)).max(30),
  reviewLicenses: z.array(z.string().trim().min(1).max(40)).max(30),
  createdAt: z.string().optional(),
});
export type CompliancePolicy = z.infer<typeof CompliancePolicySchema>;

export const CreatePolicyInputSchema = CompliancePolicySchema.omit({ id: true, createdAt: true });
export type CreatePolicyInput = z.infer<typeof CreatePolicyInputSchema>;

export const VulnerabilityAdvisorySchema = z.object({
  id: z.string(),
  aliases: z.array(z.string()),
  summary: z.string(),
  severity: SeverityLevelSchema,
  cvssScore: z.number().min(0).max(10).nullable(),
  fixedVersion: z.string().nullable(),
  referenceUrl: z.string().nullable(),
});
export type VulnerabilityAdvisory = z.infer<typeof VulnerabilityAdvisorySchema>;

export const OpenSsfPostureSchema = z.object({
  score: z.number().min(0).max(10),
  date: z.string(),
  repoName: z.string(),
  checks: z.array(
    z.object({
      name: z.string(),
      score: z.number(),
    })
  ),
});
export type OpenSsfPosture = z.infer<typeof OpenSsfPostureSchema>;

export const PackageAuditResultSchema = z.object({
  name: z.string(),
  requestedSpec: z.string(),
  analyzedVersion: z.string(),
  section: z.enum(["dependencies", "devDependencies"]),
  latestVersion: z.string().nullable(),
  upgradeDelta: UpgradeDeltaSchema,
  deprecatedNotice: z.string().nullable(),
  spdxLicense: z.string().nullable(),
  licenseStatus: LicenseStatusSchema,
  licenseReason: z.string(),
  vulnerabilities: z.array(VulnerabilityAdvisorySchema),
  recommendedSafeVersion: z.string().nullable(),
  openssf: OpenSsfPostureSchema.nullable(),
  riskScore: z.number().min(0).max(100),
  riskTier: RiskTierSchema,
  telemetryStatus: z.object({
    osv: z.enum(["VERIFIED", "UNAVAILABLE"]),
    npm: z.enum(["VERIFIED", "UNAVAILABLE"]),
    openssf: z.enum(["VERIFIED", "NOT_INDEXED", "UNAVAILABLE"]),
  }),
});
export type PackageAuditResult = z.infer<typeof PackageAuditResultSchema>;

export const StackAuditReportSchema = z.object({
  projectName: z.string(),
  scannedAt: z.string(),
  policy: CompliancePolicySchema,
  overallHealthScore: z.number().min(0).max(100),
  overallRiskTier: RiskTierSchema,
  summary: z.object({
    totalPackages: z.number().int().nonnegative(),
    vulnerablePackages: z.number().int().nonnegative(),
    totalAdvisories: z.number().int().nonnegative(),
    criticalAdvisories: z.number().int().nonnegative(),
    highAdvisories: z.number().int().nonnegative(),
    deprecatedPackages: z.number().int().nonnegative(),
    blockedLicenses: z.number().int().nonnegative(),
    reviewLicenses: z.number().int().nonnegative(),
    majorUpgradesNeeded: z.number().int().nonnegative(),
    truncatedCount: z.number().int().nonnegative(),
  }),
  packages: z.array(PackageAuditResultSchema),
  provenance: z.object({
    sources: z.array(z.string()),
    limitations: z.array(z.string()),
  }),
});
export type StackAuditReport = z.infer<typeof StackAuditReportSchema>;

export const ScanRequestSchema = z.object({
  packageJsonText: z.string().min(2).max(120_000),
  policyId: z.string().min(1).max(64).optional(),
  customPolicy: CompliancePolicySchema.optional(),
  saveAudit: z.boolean().optional(),
});

export const AiBriefRequestSchema = z.object({
  report: StackAuditReportSchema,
  persona: AudiencePersonaSchema.default("CTO_LEAD"),
});

export const AiBriefResponseSchema = z.object({
  persona: AudiencePersonaSchema,
  source: z.enum(["GEMINI_VERIFIED", "DETERMINISTIC_FALLBACK"]),
  headline: z.string(),
  executiveSummary: z.string(),
  topPriorities: z.array(z.string()).min(1).max(5),
  upgradePlaybook: z.string(),
  limitationsNotice: z.string(),
  generatedAt: z.string(),
});
export type AiBriefResponse = z.infer<typeof AiBriefResponseSchema>;

export const AiChatRequestSchema = z.object({
  question: z.string().trim().min(2).max(800),
  report: StackAuditReportSchema,
  persona: AudiencePersonaSchema.default("DEVELOPER"),
});

export const AiChatResponseSchema = z.object({
  answer: z.string(),
  source: z.enum(["GEMINI_VERIFIED", "DETERMINISTIC_FALLBACK"]),
  citedPackages: z.array(z.string()),
  citedAdvisories: z.array(z.string()),
  generatedAt: z.string(),
});
export type AiChatResponse = z.infer<typeof AiChatResponseSchema>;

export const SavedAuditSummarySchema = z.object({
  id: z.string(),
  projectName: z.string(),
  policyName: z.string(),
  healthScore: z.number(),
  overallRiskTier: RiskTierSchema,
  totalPackages: z.number().int(),
  vulnerablePackages: z.number().int(),
  createdAt: z.string(),
});
export type SavedAuditSummary = z.infer<typeof SavedAuditSummarySchema>;

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}
