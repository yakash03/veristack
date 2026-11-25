// VeriStack — Live Supply-Chain Scan Route (POST /api/scan)

import { NextRequest } from "next/server";
import { ScanRequestSchema, SavedAuditSummary, StackAuditReport } from "@/lib/schemas/supplyChain";
import { getPolicyById } from "@/lib/engine/licensePolicy";
import { scanPackageJsonStack } from "@/lib/engine/scanOrchestrator";
import { VERISTACK_CONFIG } from "@/lib/config";
import { repository } from "@/lib/db/sqliteStore";
import { apiRateLimiter } from "@/lib/security/rateLimiter";
import { attachWorkspaceCookie, resolveWorkspaceSession } from "@/lib/security/session";
import {
  ApiValidationError,
  getClientRateKey,
  jsonErr,
  jsonOk,
  parseAndValidateBody,
} from "@/lib/api/http";

export async function POST(request: NextRequest) {
  const session = resolveWorkspaceSession(request);

  try {
    const rate = apiRateLimiter.checkLimit(
      getClientRateKey(request, session.workspaceId, "scan"),
      VERISTACK_CONFIG.rateLimit.scanWindowMs,
      VERISTACK_CONFIG.rateLimit.scanMaxRequests
    );
    if (!rate.allowed) {
      return attachWorkspaceCookie(
        jsonErr(
          new ApiValidationError(`Rate limit reached. Try again in ${rate.retryAfterSec}s.`, 429),
          "Rate limit exceeded."
        ),
        session
      );
    }

    const body = await parseAndValidateBody(request, ScanRequestSchema);

    let activePolicy = body.customPolicy ?? getPolicyById(body.policyId);
    if (!body.customPolicy && body.policyId?.startsWith("pol-")) {
      const workspacePolicy = await repository.getCustomPolicy(session.workspaceId, body.policyId);
      if (workspacePolicy) activePolicy = workspacePolicy;
    }

    let report: StackAuditReport;
    try {
      report = await scanPackageJsonStack(body.packageJsonText, activePolicy);
    } catch (err: unknown) {
      throw new ApiValidationError(
        err instanceof Error ? err.message : "Invalid package.json manifest.",
        400
      );
    }

    let savedAudit: SavedAuditSummary | null = null;
    if (body.saveAudit) {
      savedAudit = await repository.saveAudit(session.workspaceId, report);
    }

    return attachWorkspaceCookie(jsonOk({ report, savedAudit }), session);
  } catch (error: unknown) {
    return attachWorkspaceCookie(jsonErr(error, "Unable to complete supply-chain scan."), session);
  }
}
