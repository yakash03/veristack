// VeriStack — Liveness & Capability Health Check Endpoint

import { jsonOk } from "@/lib/api/http";
import { hasGeminiKey } from "@/lib/ai/geminiClient";

export async function GET() {
  return jsonOk({
    service: "veristack",
    status: "ok",
    aiMode: hasGeminiKey() ? "GEMINI_CONFIGURED" : "DETERMINISTIC_FALLBACK",
  });
}
