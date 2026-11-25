"use client";

import React, { useState } from "react";
import { StackAuditReport } from "@/lib/schemas/supplyChain";
import { DownloadIcon, InfoIcon } from "../ui/Icons";
import { getRiskTone, StatusBadge } from "../ui/Badge";
import { ModalShell } from "../ui/ModalShell";

interface AuditSummaryHeaderProps {
  report: StackAuditReport;
}

function buildMarkdownReport(report: StackAuditReport): string {
  const lines = [
    `# VeriStack Supply-Chain Audit: ${report.projectName}`,
    `- **Scanned At:** ${report.scannedAt}`,
    `- **Compliance Policy:** ${report.policy.name} (Max CVSS ${report.policy.maxAllowedCvss})`,
    `- **Portfolio Health Score:** ${report.overallHealthScore}/100 (${report.overallRiskTier} Risk)`,
    "",
    "## Package Findings",
    "| Package | Analyzed | Recommended | Upgrade | License | Advisories | Risk |",
    "|---|---|---|---|---|---|---|",
    ...report.packages.map(
      (p) =>
        `| ${p.name} | ${p.analyzedVersion} | ${p.recommendedSafeVersion ?? "-"} | ${p.upgradeDelta} | ${p.spdxLicense ?? "UNKNOWN"} (${p.licenseStatus}) | ${p.vulnerabilities.map((v) => v.id).join(", ") || "None"} | ${p.riskScore}/100 (${p.riskTier}) |`
    ),
  ];
  return lines.join("\n");
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditSummaryHeader({ report }: AuditSummaryHeaderProps) {
  const [showProvenance, setShowProvenance] = useState(false);

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (report.overallHealthScore / 100) * circumference;
  const gaugeStroke =
    report.overallHealthScore >= 80
      ? "#047857"
      : report.overallHealthScore >= 55
        ? "#b45309"
        : "#be123c";

  const cards = [
    {
      label: "OSV Advisories",
      value: `${report.summary.totalAdvisories}`,
      detail: `${report.summary.vulnerablePackages} vulnerable pkg(s)`,
    },
    {
      label: "License Posture",
      value: `${report.summary.blockedLicenses}`,
      detail: `${report.summary.reviewLicenses} review / ${report.summary.blockedLicenses} blocked`,
    },
    {
      label: "Maintenance Decay",
      value: `${report.summary.deprecatedPackages}`,
      detail: "Deprecated npm releases",
    },
    {
      label: "Major Fix Bumps",
      value: `${report.summary.majorUpgradesNeeded}`,
      detail: "Vulnerable pkgs needing major bump",
    },
  ];

  return (
    <section
      aria-labelledby="audit-summary-heading"
      className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-5">
          {/* Health Score Gauge */}
          <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88" aria-hidden="true">
              <circle cx="44" cy="44" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
              <circle
                cx="44"
                cy="44"
                r={radius}
                fill="none"
                stroke={gaugeStroke}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-extrabold text-slate-900 font-mono">
                {report.overallHealthScore}
              </span>
              <span className="text-[10px] font-semibold text-slate-600 uppercase">Health</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="audit-summary-heading" className="text-xl font-bold text-slate-900">
                {report.projectName}
              </h2>
              <StatusBadge
                label={`${report.overallRiskTier} RISK`}
                tone={getRiskTone(report.overallRiskTier)}
              />
            </div>
            <p className="text-xs text-slate-600">
              Policy: <strong className="text-slate-900">{report.policy.name}</strong> · Evaluated{" "}
              {report.summary.totalPackages} packages at{" "}
              {new Date(report.scannedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {report.summary.truncatedCount > 0 && (
              <p className="text-xs text-amber-800 font-medium">
                Note: {report.summary.truncatedCount} additional package(s) truncated by scan limit.
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowProvenance(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
          >
            <InfoIcon size={14} />
            <span>Provenance &amp; Scope</span>
          </button>

          <button
            type="button"
            onClick={() =>
              triggerDownload(
                `${report.projectName}-veristack-audit.md`,
                buildMarkdownReport(report),
                "text/markdown"
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
          >
            <DownloadIcon size={14} />
            <span>Export MD</span>
          </button>

          <button
            type="button"
            onClick={() =>
              triggerDownload(
                `${report.projectName}-veristack-audit.json`,
                JSON.stringify(report, null, 2),
                "application/json"
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
          >
            <DownloadIcon size={14} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-0.5"
          >
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
              {c.label}
            </p>
            <p className="text-2xl font-extrabold text-slate-900 font-mono">{c.value}</p>
            <p className="text-xs text-slate-600">{c.detail}</p>
          </div>
        ))}
      </div>

      <ModalShell
        isOpen={showProvenance}
        onClose={() => setShowProvenance(false)}
        titleId="provenance-modal-title"
        title="Data Provenance & Methodology Scope"
        subtitle="Verified sources powering deterministic scores and audit boundaries"
      >
        <div className="space-y-4 text-xs text-slate-700">
          <div>
            <h3 className="font-bold text-slate-900 mb-1.5 uppercase tracking-wide text-[11px]">
              Verified External Sources
            </h3>
            <ul className="list-disc pl-5 space-y-1">
              {report.provenance.sources.map((src) => (
                <li key={src}>{src}</li>
              ))}
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950">
            <h3 className="font-bold mb-1.5 text-[11px] uppercase tracking-wide">
              Known Scope Boundaries
            </h3>
            <ul className="list-disc pl-5 space-y-1">
              {report.provenance.limitations.map((lim) => (
                <li key={lim}>{lim}</li>
              ))}
            </ul>
          </div>
        </div>
      </ModalShell>
    </section>
  );
}
