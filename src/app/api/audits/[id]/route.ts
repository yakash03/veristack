// VeriStack — Single Saved Audit Detail & Deletion Route (GET, DELETE /api/audits/[id])
// Strictly verifies workspace ownership to block cross-workspace IDOR access.

import { NextRequest } from "next/server";
import { repository } from "@/lib/db/sqliteStore";
import { attachWorkspaceCookie, resolveWorkspaceSession } from "@/lib/security/session";
import { ApiValidationError, jsonErr, jsonOk } from "@/lib/api/http";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = resolveWorkspaceSession(request);

  try {
    const { id } = await context.params;
    const audit = await repository.getAuditById(session.workspaceId, id);
    if (!audit) {
      throw new ApiValidationError("Audit record not found in this workspace.", 404);
    }
    return attachWorkspaceCookie(jsonOk(audit), session);
  } catch (error: unknown) {
    return attachWorkspaceCookie(jsonErr(error, "Unable to fetch audit record."), session);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = resolveWorkspaceSession(request);

  try {
    const { id } = await context.params;
    const deleted = await repository.deleteAuditById(session.workspaceId, id);
    if (!deleted) {
      throw new ApiValidationError("Audit record not found in this workspace.", 404);
    }
    return attachWorkspaceCookie(jsonOk({ deletedId: id }), session);
  } catch (error: unknown) {
    return attachWorkspaceCookie(jsonErr(error, "Unable to delete audit record."), session);
  }
}
