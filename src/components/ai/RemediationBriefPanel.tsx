"use client";

import React, { useEffect, useState } from "react";
import { AiBriefResponse, AudiencePersona, StackAuditReport } from "@/lib/schemas/supplyChain";
import { SparklesIcon } from "../ui/Icons";
import { StatusBadge } from "../ui/Badge";

interface RemediationBriefPanelProps {
  report: StackAuditReport;
  persona: AudiencePersona;
  onChangePersona: (p: AudiencePersona) => void;
}

const PERSONAS: ReadonlyArray<{ id: AudiencePersona; label: string }> = [
  { id: "CTO_LEAD", label: "Engineering Lead" },
  { id: "SECURITY_AUDITOR", label: "Security Auditor" },
  { id: "DEVELOPER", label: "Developer" },
];

export function RemediationBriefPanel({
  report,
  persona,
  onChangePersona,
}: RemediationBriefPanelProps) {
  const requestKey = `${report.scannedAt}:${persona}`;
  const [loaded, setLoaded] = useState<{ key: string; brief: AiBriefResponse | null }>({
    key: "",
    brief: null,
  });

  const isLoading = loaded.key !== requestKey;
  const brief = loaded.brief;

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    async function fetchBrief() {
      try {
        const res = await fetch("/api/ai/brief", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report, persona }),
        });
        const json = (await res.json()) as { success?: boolean; data?: AiBriefResponse };
        if (mounted && json.success && json.data) {
          setLoaded({ key: requestKey, brief: json.data });
        } else if (mounted) {
          setLoaded({ key: requestKey, brief: null });
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (mounted) setLoaded({ key: requestKey, brief: null });
      }
    }

    fetchBrief();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [report, persona, requestKey]);

  return (
    <section
      aria-labelledby="ai-brief-heading"
      className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-sky-50 text-sky-700">
            <SparklesIcon size={18} />
          </div>
          <div>
            <h2 id="ai-brief-heading" className="text-base font-bold text-slate-900">
              Grounded Remediation Briefing
            </h2>
            <p className="text-xs text-slate-600">
              AI translates verified scan outputs without altering risk scores or inventing CVEs.
            </p>
          </div>
        </div>

        <div
          role="group"
          aria-label="Briefing audience persona"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 self-start sm:self-auto"
        >
          {PERSONAS.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={persona === item.id}
              onClick={() => onChangePersona(item.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                persona === item.id
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div role="status" className="py-6 text-center text-xs text-slate-600">
          Generating verified {persona.replace("_", " ").toLowerCase()} remediation brief...
        </div>
      ) : brief ? (
        <div className="space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">{brief.headline}</h3>
            <StatusBadge
              label={
                brief.source === "GEMINI_VERIFIED" ? "Gemini 2.0 Verified" : "Deterministic Engine"
              }
              tone={brief.source === "GEMINI_VERIFIED" ? "sky" : "slate"}
            />
          </div>

          <p className="text-slate-700 leading-relaxed">{brief.executiveSummary}</p>

          <div className="space-y-1.5">
            <h4 className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
              Prioritized Actions
            </h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              {brief.topPriorities.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed">
            {brief.upgradePlaybook}
          </div>

          <p className="text-[11px] text-slate-600 border-t border-slate-200 pt-3">
            {brief.limitationsNotice}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-600">Remediation summary temporarily unavailable.</p>
      )}
    </section>
  );
}
