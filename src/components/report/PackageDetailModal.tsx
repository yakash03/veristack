"use client";

import React from "react";
import { PackageAuditResult } from "@/lib/schemas/supplyChain";
import { getLicenseTone, getRiskTone, StatusBadge } from "../ui/Badge";
import { ModalShell } from "../ui/ModalShell";

interface PackageDetailModalProps {
  pkg: PackageAuditResult | null;
  onClose: () => void;
}

export function PackageDetailModal({ pkg, onClose }: PackageDetailModalProps) {
  if (!pkg) return null;

  return (
    <ModalShell
      isOpen={true}
      onClose={onClose}
      titleId="pkg-detail-title"
      title={`${pkg.name} @ ${pkg.analyzedVersion}`}
      subtitle={`Requested spec "${pkg.requestedSpec}" (${pkg.section}) · Latest npm: ${pkg.latestVersion ?? "Unknown"}`}
    >
      <div className="space-y-5 text-xs">
        {/* Telemetry provenance badges */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={`Risk ${pkg.riskScore}/100 (${pkg.riskTier})`}
            tone={getRiskTone(pkg.riskTier)}
          />
          <StatusBadge
            label={`License: ${pkg.spdxLicense ?? "UNKNOWN"} (${pkg.licenseStatus})`}
            tone={getLicenseTone(pkg.licenseStatus)}
          />
          <StatusBadge label={`OSV: ${pkg.telemetryStatus.osv}`} tone="slate" />
          <StatusBadge label={`OpenSSF: ${pkg.telemetryStatus.openssf}`} tone="slate" />
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <p className="font-semibold text-slate-900">License Evaluation</p>
          <p className="text-slate-700">{pkg.licenseReason}</p>
        </div>

        {pkg.deprecatedNotice && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-1">
            <p className="font-bold">npm Deprecation Warning</p>
            <p>{pkg.deprecatedNotice}</p>
          </div>
        )}

        {/* OSV Vulnerabilities */}
        <div className="space-y-2">
          <h3 className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
            Verified OSV Advisories ({pkg.vulnerabilities.length})
          </h3>
          {pkg.vulnerabilities.length === 0 ? (
            <p className="text-slate-600">
              No active advisories returned for this baseline version.
            </p>
          ) : (
            <div className="space-y-2">
              {pkg.vulnerabilities.map((vuln) => (
                <div
                  key={vuln.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{vuln.id}</span>
                      <StatusBadge label={vuln.severity} tone={getRiskTone(vuln.severity)} />
                      {vuln.cvssScore !== null && (
                        <span className="font-mono text-slate-700">CVSS {vuln.cvssScore}</span>
                      )}
                    </div>
                    {vuln.fixedVersion && (
                      <span className="font-mono font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                        Fixed in {vuln.fixedVersion}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-700 leading-relaxed">{vuln.summary}</p>
                  {vuln.referenceUrl && (
                    <a
                      href={vuln.referenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-sky-700 hover:underline font-semibold"
                    >
                      View OSV Advisory Details →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* OpenSSF Scorecard */}
        {pkg.openssf && (
          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
              OpenSSF Security Scorecard ({pkg.openssf.score}/10 — {pkg.openssf.repoName})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {pkg.openssf.checks.map((chk) => (
                <div
                  key={chk.name}
                  className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between"
                >
                  <span className="text-slate-700 truncate">{chk.name}</span>
                  <span className="font-mono font-bold text-slate-900">{chk.score}/10</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
