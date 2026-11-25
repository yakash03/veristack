// VeriStack — Grounded Q&A Assistant Route (POST /api/ai/chat)

import { NextRequest } from "next/server";
import { AiChatRequestSchema } from "@/lib/schemas/supplyChain";
import { answerAuditQuestion } from "@/lib/ai/assistantQa";
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
      getClientRateKey(request, session.workspaceId, "ai-chat"),
      VERISTACK_CONFIG.rateLimit.aiWindowMs,
      VERISTACK_CONFIG.rateLimit.aiMaxRequests
    );
    if (!rate.allowed) {
      throw new ApiValidationError(
        `AI assistant rate limit reached. Retry in ${rate.retryAfterSec}s.`,
        429
      );
    }

    const body = await parseAndValidateBody(request, AiChatRequestSchema);
    const response = await answerAuditQuestion(
      body.question,
      body.report,
      body.persona ?? "DEVELOPER"
    );

    return attachWorkspaceCookie(jsonOk(response), session);
  } catch (error: unknown) {
    return attachWorkspaceCookie(jsonErr(error, "Unable to answer question right now."), session);
  }
}
