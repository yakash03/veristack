// VeriStack — Cryptographically Signed HttpOnly Workspace Session Isolation

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { VERISTACK_CONFIG } from "../config";

const FALLBACK_DEV_SECRET = "veristack-local-dev-ephemeral-key-not-for-prod";

function getSigningSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) return envSecret;
  if (process.env.NODE_ENV === "production") {
    // Derive stable per-process ephemeral key when SESSION_SECRET isn't explicitly set
    const globalHolder = globalThis as unknown as { __veristack_ws_secret__?: string };
    if (!globalHolder.__veristack_ws_secret__) {
      globalHolder.__veristack_ws_secret__ = crypto.randomBytes(32).toString("hex");
    }
    return globalHolder.__veristack_ws_secret__;
  }
  return FALLBACK_DEV_SECRET;
}

function signWorkspaceId(workspaceId: string): string {
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(workspaceId)
    .digest("base64url");
  return `${workspaceId}.${sig}`;
}

export function verifyWorkspaceToken(token: string | undefined): string | null {
  if (!token || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [workspaceId, providedSig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(workspaceId)
    .digest("base64url");

  const bufA = Buffer.from(providedSig, "utf8");
  const bufB = Buffer.from(expectedSig, "utf8");
  if (bufA.length !== bufB.length) return null;
  return crypto.timingSafeEqual(bufA, bufB) ? workspaceId : null;
}

/**
 * Resolve verified workspace ID from incoming request cookie or create a new isolated workspace.
 * Never allows client-supplied headers/query params to spoof another user's workspaceId.
 */
export function resolveWorkspaceSession(request: NextRequest): {
  workspaceId: string;
  isNewCookie: boolean;
  cookieValue: string;
} {
  const existingCookie = request.cookies.get(VERISTACK_CONFIG.security.sessionCookieName)?.value;
  const verified = verifyWorkspaceToken(existingCookie);
  if (verified && existingCookie) {
    return {
      workspaceId: verified,
      isNewCookie: false,
      cookieValue: existingCookie,
    };
  }

  const freshId = crypto.randomUUID();
  return {
    workspaceId: freshId,
    isNewCookie: true,
    cookieValue: signWorkspaceId(freshId),
  };
}

export function attachWorkspaceCookie<T>(
  response: NextResponse<T>,
  session: { isNewCookie: boolean; cookieValue: string }
): NextResponse<T> {
  if (session.isNewCookie) {
    response.cookies.set({
      name: VERISTACK_CONFIG.security.sessionCookieName,
      value: session.cookieValue,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
  return response;
}
