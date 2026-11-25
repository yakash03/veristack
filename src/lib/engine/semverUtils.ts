// VeriStack — Deterministic Semver Parsing, Comparison & Upgrade Classification

import { UpgradeDelta } from "../schemas/supplyChain";

export interface SemverParts {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}

const SEMVER_CAPTURE_RE = /(\d+)\.(\d+)\.(\d+)/;

/** Extract concrete X.Y.Z semver tuple from ranges like "^4.17.15", "~1.2.3", ">=2.0.0". */
export function parseConcreteSemver(spec: string): SemverParts | null {
  const match = spec.trim().match(SEMVER_CAPTURE_RE);
  if (!match || !match[1] || !match[2] || !match[3]) return null;
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }
  return { major, minor, patch, raw: `${major}.${minor}.${patch}` };
}

/** Normalize a dependency spec string for OSV querying (returns "" if non-semver URL/tag). */
export function normalizeVersionSpec(spec: string): string {
  const trimmed = spec.trim();
  if (/^(workspace:|file:|link:|git\+|https?:|npm:)/i.test(trimmed)) {
    return "";
  }
  const parsed = parseConcreteSemver(trimmed);
  if (parsed) return parsed.raw;

  // Handle partial major.minor or major tags cleanly (e.g. "^18" -> "18.0.0")
  const shortMatch = trimmed.match(/^[\^~>=<\s]*(\d+)(?:\.(\d+))?$/);
  if (shortMatch && shortMatch[1]) {
    return `${shortMatch[1]}.${shortMatch[2] ?? "0"}.0`;
  }
  return "";
}

/** Compare two X.Y.Z tuples (<0 if a < b, 0 if equal, >0 if a > b). */
export function compareSemver(a: SemverParts, b: SemverParts): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/** Classify upgrade impact between analyzedVersion and target/latest version. */
export function classifyUpgradeDelta(
  currentSpec: string,
  targetSpec: string | null | undefined
): UpgradeDelta {
  if (!targetSpec) return "UNKNOWN";
  const cur = parseConcreteSemver(currentSpec);
  const target = parseConcreteSemver(targetSpec);
  if (!cur || !target) return "UNKNOWN";

  if (compareSemver(cur, target) >= 0) return "NONE";
  if (target.major > cur.major) return "MAJOR";
  if (target.minor > cur.minor) return "MINOR";
  if (target.patch > cur.patch) return "PATCH";
  return "NONE";
}

/** Pick the highest clean fixed version across advisories or fall back to latestVersion. */
export function resolveRecommendedSafeVersion(
  fixedVersions: Array<string | null>,
  latestVersion: string | null
): string | null {
  const parsedFixed = fixedVersions
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => parseConcreteSemver(v))
    .filter((p): p is SemverParts => p !== null)
    .sort((a, b) => compareSemver(b, a));

  if (parsedFixed[0]) {
    // Prefer latestVersion if it meets or exceeds the highest required fix
    const latestParsed = latestVersion ? parseConcreteSemver(latestVersion) : null;
    if (latestParsed && compareSemver(latestParsed, parsedFixed[0]) >= 0) {
      return latestParsed.raw;
    }
    return parsedFixed[0].raw;
  }

  return latestVersion;
}
