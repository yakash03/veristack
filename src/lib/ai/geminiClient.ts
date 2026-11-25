// VeriStack — Grounded Gemini 2.0 Flash Client (Header Auth, Timeout, Retry & Safe Sanitization)

import { VERISTACK_CONFIG } from "../config";

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/** Return true when a server-side Gemini API key is configured. */
export function hasGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== "your_gemini_api_key_here");
}

/** Sanitize untrusted external or user text to prevent control-char and delimiter prompt injection. */
export function sanitizeForPrompt(text: string, maxLength = 500): string {
  return text
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/```/g, "'''")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Execute a structured Gemini request server-side using x-goog-api-key header with timeout & single retry. */
export async function generateGeminiContent(options: {
  prompt: string;
  responseMimeType?: "application/json" | "text/plain";
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return null;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERISTACK_CONFIG.ai.timeoutMs);

    try {
      const response = await fetch(VERISTACK_CONFIG.ai.geminiEndpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: options.prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
            ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
          },
        }),
      });

      if (!response.ok) {
        if (attempt === 1 && (response.status === 429 || response.status >= 500)) {
          continue;
        }
        console.warn(`[VeriStack AI] Gemini upstream status ${response.status}; using fallback.`);
        return null;
      }

      const data = (await response.json()) as GeminiApiResponse;
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    } catch {
      if (attempt === 1) continue;
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

/** Parse JSON safely from LLM text, stripping optional markdown fences. */
export function parseJsonFromModel(rawText: string): unknown {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as unknown;
}
