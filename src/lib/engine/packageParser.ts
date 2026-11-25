// VeriStack — Strict package.json Dependency Extractor

import { z } from "zod";
import { NPM_PACKAGE_NAME_REGEX, PackageDependency } from "../schemas/supplyChain";
import { VERISTACK_CONFIG } from "../config";
import { normalizeVersionSpec } from "./semverUtils";

const RawPackageJsonSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

export interface ParsedPackageJsonResult {
  projectName: string;
  packages: PackageDependency[];
  truncatedCount: number;
  skippedEntries: string[];
}

/**
 * Safely parse raw package.json text, validate dependency names and specs,
 * and bound total packages per scan to protect latency and upstream quotas.
 */
export function parsePackageJsonText(rawText: string): ParsedPackageJsonResult {
  let rawObj: unknown;
  try {
    rawObj = JSON.parse(rawText);
  } catch {
    throw new Error("Invalid JSON syntax in package.json input.");
  }

  const parsed = RawPackageJsonSchema.safeParse(rawObj);
  if (!parsed.success) {
    throw new Error("package.json must be an object with valid string dependency maps.");
  }

  const allEntries: PackageDependency[] = [];
  const skippedEntries: string[] = [];

  const collectSection = (
    map: Record<string, string> | undefined,
    section: "dependencies" | "devDependencies"
  ) => {
    if (!map) return;
    for (const [name, spec] of Object.entries(map)) {
      const cleanName = name.trim();
      if (!NPM_PACKAGE_NAME_REGEX.test(cleanName) || spec.trim().length === 0) {
        skippedEntries.push(cleanName || "(empty)");
        continue;
      }
      // Deduplicate if package appears in both sections (runtime dependency takes precedence)
      if (allEntries.some((item) => item.name === cleanName)) continue;

      allEntries.push({
        name: cleanName,
        spec: spec.trim().slice(0, 64),
        normalizedVersion: normalizeVersionSpec(spec),
        section,
      });
    }
  };

  collectSection(parsed.data.dependencies, "dependencies");
  collectSection(parsed.data.devDependencies, "devDependencies");

  if (allEntries.length === 0) {
    throw new Error("No valid dependencies or devDependencies found in package.json.");
  }

  const limit = VERISTACK_CONFIG.telemetry.maxPackagesPerScan;
  const truncatedCount = Math.max(0, allEntries.length - limit);

  return {
    projectName: parsed.data.name || "untitled-project",
    packages: allEntries.slice(0, limit),
    truncatedCount,
    skippedEntries,
  };
}
