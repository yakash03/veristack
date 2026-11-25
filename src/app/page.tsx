"use client";

import React, { useEffect, useState } from "react";
import {
  AudiencePersona,
  CompliancePolicy,
  SavedAuditSummary,
  StackAuditReport,
} from "@/lib/schemas/supplyChain";
import { SAMPLE_MANIFESTS } from "@/lib/constants/presets";
import { DEFAULT_POLICIES } from "@/lib/engine/licensePolicy";
import { AlertTriangleIcon, HistoryIcon, ShieldIcon } from "@/components/ui/Icons";
import { ManifestInputPanel } from "@/components/scanner/ManifestInputPanel";
import { AuditSummaryHeader } from "@/components/report/AuditSummaryHeader";
import { DependencyTable } from "@/components/report/DependencyTable";
import { RemediationBriefPanel } from "@/components/ai/RemediationBriefPanel";
import { GroundedAssistantPanel } from "@/components/ai/GroundedAssistantPanel";
import { PolicyBuilderModal } from "@/components/workspace/PolicyBuilderModal";
import { SavedAuditsModal } from "@/components/workspace/SavedAuditsModal";

export default function VeriStackHomePage() {
  const [packageJsonText, setPackageJsonText] = useState<string>(
    SAMPLE_MANIFESTS[0]?.packageJsonText ?? ""
  );
  const [customPolicies, setCustomPolicies] = useState<CompliancePolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(DEFAULT_POLICIES[0]!.id);
  const [saveAudit, setSaveAudit] = useState<boolean>(true);
  const [persona, setPersona] = useState<AudiencePersona>("CTO_LEAD");

  const [report, setReport] = useState<StackAuditReport | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [savedAudits, setSavedAudits] = useState<SavedAuditSummary[]>([]);
  const [showPolicyModal, setShowPolicyModal] = useState<boolean>(false);
  const [showAuditsModal, setShowAuditsModal] = useState<boolean>(false);

  const allPolicies = [...DEFAULT_POLICIES, ...customPolicies];

  // Hydrate workspace policies & saved audit summaries once cleanly on mount
  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      try {
        const [polRes, audRes] = await Promise.all([fetch("/api/policies"), fetch("/api/audits")]);
        if (!active) return;
        const polJson = (await polRes.json()) as {
          success?: boolean;
          data?: { custom?: CompliancePolicy[] };
        };
        const audJson = (await audRes.json()) as {
          success?: boolean;
          data?: SavedAuditSummary[];
        };
        if (active && polJson.success && polJson.data?.custom) {
          setCustomPolicies(polJson.data.custom);
        }
        if (active && audJson.success && Array.isArray(audJson.data)) {
          setSavedAudits(audJson.data);
        }
      } catch {
        // Non-blocking workspace prefetch
      }
    }
    loadWorkspace();
    return () => {
      active = false;
    };
  }, []);

  const handleRunScan = async () => {
    setScanError(null);
    try {
      JSON.parse(packageJsonText);
    } catch {
      setScanError("Invalid JSON syntax in package.json input.");
      return;
    }

    setIsScanning(true);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageJsonText,
          policyId: selectedPolicyId,
          saveAudit,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { report: StackAuditReport; savedAudit: SavedAuditSummary | null };
        error?: string;
      };

      if (!res.ok || !json.success || !json.data) {
        setScanError(json.error || "Unable to audit package.json manifest.");
        return;
      }

      setReport(json.data.report);
      if (json.data.savedAudit) {
        setSavedAudits((prev) => [json.data!.savedAudit!, ...prev]);
      }
    } catch {
      setScanError("Network error while contacting VeriStack scan API.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleLoadSavedAudit = async (auditId: string) => {
    setScanError(null);
    try {
      const res = await fetch(`/api/audits/${encodeURIComponent(auditId)}`);
      const json = (await res.json()) as {
        success?: boolean;
        data?: StackAuditReport;
        error?: string;
      };
      if (res.ok && json.success && json.data) {
        setReport(json.data);
      } else {
        setScanError(json.error || "Failed to load saved audit report.");
      }
    } catch {
      setScanError("Network error loading saved audit.");
    }
  };

  const handleDeleteAudit = async (auditId: string) => {
    const res = await fetch(`/api/audits/${encodeURIComponent(auditId)}`, { method: "DELETE" });
    if (res.ok) {
      setSavedAudits((prev) => prev.filter((a) => a.id !== auditId));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-slate-900 focus:text-white focus:rounded-lg focus:text-xs focus:font-bold"
      >
        Skip to main content
      </a>

      {/* Top Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <ShieldIcon size={18} />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-slate-900">VeriStack</h1>
              <p className="text-xs text-slate-600">
                Verified Supply-Chain &amp; Upgrade Decision Engine
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAuditsModal(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
          >
            <HistoryIcon size={14} />
            <span>Audit History ({savedAudits.length})</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main
        id="main-content"
        className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-7 space-y-6"
      >
        <ManifestInputPanel
          packageJsonText={packageJsonText}
          onChangeText={setPackageJsonText}
          policies={allPolicies}
          selectedPolicyId={selectedPolicyId}
          onSelectPolicy={setSelectedPolicyId}
          saveAudit={saveAudit}
          onToggleSaveAudit={setSaveAudit}
          isScanning={isScanning}
          onScan={handleRunScan}
          onOpenPolicyBuilder={() => setShowPolicyModal(true)}
        />

        {/* Error banner */}
        {scanError && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 flex items-start gap-2.5 text-xs"
          >
            <AlertTriangleIcon size={17} className="shrink-0 mt-0.5 text-rose-700" />
            <div>
              <p className="font-bold">Audit Input or Telemetry Error</p>
              <p className="mt-0.5">{scanError}</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isScanning && (
          <div
            role="status"
            aria-live="polite"
            className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2"
          >
            <p className="text-sm font-bold text-slate-900">
              Querying Live Supply-Chain Registries
            </p>
            <p className="text-xs text-slate-600">
              Cross-referencing OSV.dev advisories, npm latest manifests, and OpenSSF Scorecards...
            </p>
          </div>
        )}

        {/* Active Report */}
        {!isScanning && report && (
          <div className="space-y-6">
            <AuditSummaryHeader report={report} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RemediationBriefPanel
                report={report}
                persona={persona}
                onChangePersona={setPersona}
              />
              <GroundedAssistantPanel report={report} persona={persona} />
            </div>

            <DependencyTable packages={report.packages} />
          </div>
        )}

        {/* Initial Empty State */}
        {!isScanning && !report && !scanError && (
          <section
            aria-label="Getting started"
            className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2"
          >
            <h2 className="text-sm font-bold text-slate-900">Ready to Audit Live Dependencies</h2>
            <p className="text-xs text-slate-600 max-w-xl mx-auto">
              Click <strong>Run Supply-Chain Audit</strong> above to query real OSV.dev CVEs, SPDX
              license rules, deprecation status, and OpenSSF security metrics for every declared
              package.
            </p>
          </section>
        )}
      </main>

      <PolicyBuilderModal
        isOpen={showPolicyModal}
        onClose={() => setShowPolicyModal(false)}
        customPolicies={customPolicies}
        onPolicyCreated={(created) => {
          setCustomPolicies((prev) => [created, ...prev]);
          setSelectedPolicyId(created.id);
        }}
        onPolicyDeleted={(id) => {
          setCustomPolicies((prev) => prev.filter((p) => p.id !== id));
          if (selectedPolicyId === id) setSelectedPolicyId(DEFAULT_POLICIES[0]!.id);
        }}
      />

      <SavedAuditsModal
        isOpen={showAuditsModal}
        onClose={() => setShowAuditsModal(false)}
        audits={savedAudits}
        onLoadAudit={handleLoadSavedAudit}
        onDeleteAudit={handleDeleteAudit}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-5 mt-10 text-xs text-slate-600">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>
            <strong>VeriStack</strong> · Live Telemetry via{" "}
            <a
              href="https://osv.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-900"
            >
              OSV.dev
            </a>
            ,{" "}
            <a
              href="https://registry.npmjs.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-900"
            >
              npm Registry
            </a>
            , and{" "}
            <a
              href="https://scorecard.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-900"
            >
              OpenSSF Scorecard
            </a>
            .
          </p>
          <p className="font-mono text-[11px]">Zero Fabricated Advisories · Deterministic Policy</p>
        </div>
      </footer>
    </div>
  );
}
