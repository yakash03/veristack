// VeriStack — Workspace Compliance Policies API (GET, POST /api/policies)

import { NextRequest } from "next/server";
import { CreatePolicyInputSchema } from "@/lib/schemas/supplyChain";
import { DEFAULT_POLICIES } from "@/lib/engine/licensePolicy";
import { repository } from "@/lib/db/sqliteStore";
import { attachWorkspaceCookie, resolveWorkspaceSession } from "@/lib/security/session";
import { jsonErr, jsonOk, parseAndValidateBody } from "@/lib/api/http";

export async function GET(request: NextRequest) {
  const session = resolveWorkspaceSession(request);

  try {
    const customPolicies = await repository.listCustomPolicies(session.workspaceId);
    return attachWorkspaceCookie(
      jsonOk({
        presets: DEFAULT_POLICIES,
        custom: customPolicies,
      }),
      session
    );
  } catch (error: unknown) {
    return attachWorkspaceCookie(jsonErr(error, "Unable to load compliance policies."), session);
  }
}

export async function POST(request: NextRequest) {
  const session = resolveWorkspaceSession(request);

  try {
    const input = await parseAndValidateBody(request, CreatePolicyInputSchema);
    const created = await repository.createCustomPolicy(session.workspaceId, input);
    return attachWorkspaceCookie(jsonOk(created, 201), session);
  } catch (error: unknown) {
    return attachWorkspaceCookie(jsonErr(error, "Unable to create compliance policy."), session);
  }
}
