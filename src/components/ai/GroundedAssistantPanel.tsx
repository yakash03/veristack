"use client";

import React, { useState } from "react";
import { AiChatResponse, AudiencePersona, StackAuditReport } from "@/lib/schemas/supplyChain";
import { SparklesIcon } from "../ui/Icons";
import { StatusBadge } from "../ui/Badge";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  source?: AiChatResponse["source"];
  citedPackages?: string[];
  citedAdvisories?: string[];
}

interface GroundedAssistantPanelProps {
  report: StackAuditReport;
  persona: AudiencePersona;
}

const SUGGESTED_QUESTIONS = [
  "Which upgrade fixes vulnerabilities without a breaking major bump?",
  "Are there any license compliance blockers under the active policy?",
  "Summarize the highest-risk dependency in this scan.",
];

let turnCounter = 0;
function buildTurn(partial: Omit<ChatTurn, "id">): ChatTurn {
  turnCounter += 1;
  return { id: `turn-${turnCounter}`, ...partial };
}

export function GroundedAssistantPanel({ report, persona }: GroundedAssistantPanelProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);

  const askQuestion = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isSending) return;

    setTurns((prev) => [...prev, buildTurn({ role: "user", content: trimmed })]);
    setQuestion("");
    setIsSending(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, report, persona }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: AiChatResponse;
        error?: string;
      };
      if (json.success && json.data) {
        setTurns((prev) => [
          ...prev,
          buildTurn({
            role: "assistant",
            content: json.data?.answer ?? "",
            source: json.data?.source,
            citedPackages: json.data?.citedPackages,
            citedAdvisories: json.data?.citedAdvisories,
          }),
        ]);
      } else {
        setTurns((prev) => [
          ...prev,
          buildTurn({ role: "assistant", content: json.error || "Unable to retrieve answer." }),
        ]);
      }
    } catch {
      setTurns((prev) => [
        ...prev,
        buildTurn({ role: "assistant", content: "Network error contacting VeriStack assistant." }),
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section
      aria-labelledby="grounded-qa-heading"
      className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 pb-4">
        <div className="p-2 rounded-xl bg-slate-100 text-slate-800">
          <SparklesIcon size={18} />
        </div>
        <div>
          <h2 id="grounded-qa-heading" className="text-base font-bold text-slate-900">
            Ask VeriStack Assistant
          </h2>
          <p className="text-xs text-slate-600">
            Ask upgrade, license, or CVE questions grounded strictly in{" "}
            <strong className="text-slate-900">{report.projectName}</strong>.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">Quick queries:</span>
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            type="button"
            key={q}
            disabled={isSending}
            onClick={() => askQuestion(q)}
            className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 cursor-pointer disabled:opacity-50 text-left"
          >
            {q}
          </button>
        ))}
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label="Supply-chain assistant conversation"
        tabIndex={0}
        className="min-h-[110px] max-h-[280px] overflow-y-auto p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
      >
        {turns.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-6">
            Select a quick query above or ask about any dependency in this scan.
          </p>
        ) : (
          turns.map((turn) => (
            <div
              key={turn.id}
              className={`flex flex-col ${turn.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  turn.role === "user"
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-800"
                }`}
              >
                <p>{turn.content}</p>
                {turn.role === "assistant" && turn.source && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                    <StatusBadge
                      label={
                        turn.source === "GEMINI_VERIFIED"
                          ? "Gemini Verified"
                          : "Deterministic Fallback"
                      }
                      tone={turn.source === "GEMINI_VERIFIED" ? "sky" : "slate"}
                    />
                    {(turn.citedAdvisories ?? []).slice(0, 3).map((adv) => (
                      <StatusBadge key={adv} label={adv} tone="amber" />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {isSending && (
          <p role="status" className="text-xs text-slate-600">
            Checking scanned advisories...
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          askQuestion(question);
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor="veristack-qa-input" className="sr-only">
          Ask a question about this scan
        </label>
        <input
          id="veristack-qa-input"
          type="text"
          maxLength={800}
          disabled={isSending}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about CVE impact, SPDX compatibility, or upgrade path..."
          className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder-slate-500"
        />
        <button
          type="submit"
          disabled={isSending || question.trim().length === 0}
          className="px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
