// VeriStack — Custom Policy Delete Route (DELETE /api/policies/[id])
// Strictly scoped to authenticated workspace ownership.

import { NextRequest } from "next/server";
import { repository } from "@/lib/db/sqliteStore";
import { attachWorkspaceCookie, resolveWorkspaceSession } from "@/lib/security/session";
import { ApiValidationError, jsonErr, jsonOk } from "@/lib/api/http";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = resolveWorkspaceSession(request);

  try {
    const { id } = await context.params;
    const deleted = await repository.deleteCustomPolicy(session.workspaceId, id);
    if (!deleted) {
      throw new ApiValidationError("Policy not found in this workspace.", 404);
    }
    return attachWorkspaceCookie(jsonOk({ deletedId: id }), session);
  } catch (error: unknown) {
    return attachWorkspaceCookie(jsonErr(error, "Unable to delete custom policy."), session);
  }
}
