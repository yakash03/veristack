// VeriStack — Saved Workspace Audits List API (GET /api/audits)

import { NextRequest } from "next/server";
import { repository } from "@/lib/db/sqliteStore";
import { attachWorkspaceCookie, resolveWorkspaceSession } from "@/lib/security/session";
import { jsonErr, jsonOk } from "@/lib/api/http";

export async function GET(request: NextRequest) {
  const session = resolveWorkspaceSession(request);

  try {
    const audits = await repository.listAudits(session.workspaceId);
    return attachWorkspaceCookie(jsonOk(audits), session);
  } catch (error: unknown) {
    return attachWorkspaceCookie(jsonErr(error, "Unable to retrieve saved audits."), session);
  }
}
