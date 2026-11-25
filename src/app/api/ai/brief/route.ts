// VeriStack — Persona-Adapted AI Executive Briefing Route (POST /api/ai/brief)

import { NextRequest } from "next/server";
import { AiBriefRequestSchema } from "@/lib/schemas/supplyChain";
import { generateSupplyChainBrief } from "@/lib/ai/briefGenerator";
import { VERISTACK_CONFIG } from "@/lib/config";
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
      getClientRateKey(request, session.workspaceId, "ai-brief"),
      VERISTACK_CONFIG.rateLimit.aiWindowMs,
      VERISTACK_CONFIG.rateLimit.aiMaxRequests
    );
    if (!rate.allowed) {
      throw new ApiValidationError(
        `AI request rate limit reached. Retry in ${rate.retryAfterSec}s.`,
        429
      );
    }

    const body = await parseAndValidateBody(request, AiBriefRequestSchema);
    const brief = await generateSupplyChainBrief(body.report, body.persona ?? "CTO_LEAD");

    return attachWorkspaceCookie(jsonOk(brief), session);
  } catch (error: unknown) {
    return attachWorkspaceCookie(
      jsonErr(error, "Failed to generate supply-chain briefing."),
      session
    );
  }
}
