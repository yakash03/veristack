// VeriStack — Accessible Status Badges with WCAG AA Contrast

import React from "react";
import { LicenseStatus, RiskTier, SeverityLevel, UpgradeDelta } from "@/lib/schemas/supplyChain";

type Tone = "slate" | "emerald" | "sky" | "amber" | "rose";

const TONE_STYLES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-800 border-slate-300",
  emerald: "bg-emerald-50 text-emerald-900 border-emerald-300",
  sky: "bg-sky-50 text-sky-900 border-sky-300",
  amber: "bg-amber-50 text-amber-900 border-amber-300",
  rose: "bg-rose-50 text-rose-900 border-rose-300",
};

export function StatusBadge({ label, tone = "slate" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold tracking-tight ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  );
}

export function getRiskTone(tier: RiskTier | SeverityLevel): Tone {
  if (tier === "CRITICAL" || tier === "HIGH") return "rose";
  if (tier === "MODERATE" || tier === "MEDIUM") return "amber";
  if (tier === "LOW") return "emerald";
  return "slate";
}

export function getLicenseTone(status: LicenseStatus): Tone {
  if (status === "PASS") return "emerald";
  if (status === "BLOCKED") return "rose";
  if (status === "REVIEW") return "amber";
  return "slate";
}

export function getUpgradeTone(delta: UpgradeDelta): Tone {
  if (delta === "MAJOR") return "amber";
  if (delta === "MINOR" || delta === "PATCH") return "sky";
  if (delta === "NONE") return "emerald";
  return "slate";
}
