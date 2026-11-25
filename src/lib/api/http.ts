// VeriStack — Shared API Route Parsing, Validation & Error Envelope Helpers

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiEnvelope } from "../schemas/supplyChain";
import { UpstreamHttpError } from "../providers/httpClient";

export class ApiValidationError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ApiValidationError";
    this.statusCode = statusCode;
  }
}

export async function parseAndValidateBody<T>(
  request: NextRequest,
  schema: z.ZodType<T>
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiValidationError("Request body must be valid JSON.", 400);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join(".") || "input"}: ${firstIssue.message}`
      : "Request payload failed schema validation.";
    throw new ApiValidationError(message, 400);
  }

  return parsed.data;
}

export function jsonOk<T>(data: T, status = 200): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json<ApiEnvelope<T>>(
    {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

export function jsonErr<T>(error: unknown, fallbackMessage: string): NextResponse<ApiEnvelope<T>> {
  if (error instanceof ApiValidationError) {
    return NextResponse.json<ApiEnvelope<T>>(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof UpstreamHttpError) {
    const status = error.statusCode >= 500 ? 502 : error.statusCode;
    return NextResponse.json<ApiEnvelope<T>>(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status }
    );
  }

  console.error(
    "[VeriStack API Error]:",
    error instanceof Error ? error.message : "Unknown failure"
  );
  return NextResponse.json<ApiEnvelope<T>>(
    {
      success: false,
      error: fallbackMessage,
      timestamp: new Date().toISOString(),
    },
    { status: 500 }
  );
}

export function getClientRateKey(request: NextRequest, workspaceId: string, scope: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `${scope}:${workspaceId}:${forwardedFor}`;
}
