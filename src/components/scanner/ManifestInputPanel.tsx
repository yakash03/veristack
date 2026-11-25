"use client";

import React, { useRef } from "react";
import { CompliancePolicy } from "@/lib/schemas/supplyChain";
import { SAMPLE_MANIFESTS } from "@/lib/constants/presets";
import { ShieldIcon, SlidersIcon, UploadIcon } from "../ui/Icons";

interface ManifestInputPanelProps {
  packageJsonText: string;
  onChangeText: (text: string) => void;
  policies: CompliancePolicy[];
  selectedPolicyId: string;
  onSelectPolicy: (policyId: string) => void;
  saveAudit: boolean;
  onToggleSaveAudit: (val: boolean) => void;
  isScanning: boolean;
  onScan: () => void;
  onOpenPolicyBuilder: () => void;
}

export function ManifestInputPanel({
  packageJsonText,
  onChangeText,
  policies,
  selectedPolicyId,
  onSelectPolicy,
  saveAudit,
  onToggleSaveAudit,
  isScanning,
  onScan,
  onOpenPolicyBuilder,
}: ManifestInputPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 120_000) return;
    const content = await file.text();
    onChangeText(content);
    event.target.value = "";
  };

  return (
    <section
      aria-labelledby="manifest-panel-heading"
      className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 id="manifest-panel-heading" className="text-base font-bold text-slate-900">
            Package Manifest &amp; Policy Scope
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Upload or paste a real <code className="font-mono text-slate-800">package.json</code>.
            VeriStack queries live OSV.dev, npm Registry, and OpenSSF Scorecards.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileUpload}
            aria-label="Upload package.json file"
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer"
          >
            <UploadIcon size={14} />
            <span>Upload package.json</span>
          </button>
        </div>
      </div>

      {/* Quick sample manifests */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">Load real stack:</span>
        {SAMPLE_MANIFESTS.map((sample) => (
          <button
            type="button"
            key={sample.id}
            onClick={() => onChangeText(sample.packageJsonText)}
            title={sample.description}
            className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-medium cursor-pointer transition-colors"
          >
            {sample.label}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div>
        <label htmlFor="package-json-editor" className="sr-only">
          package.json manifest JSON content
        </label>
        <textarea
          id="package-json-editor"
          rows={9}
          spellCheck={false}
          value={packageJsonText}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder='{"name": "my-service", "dependencies": { "express": "^4.18.2" }}'
          className="w-full rounded-xl border border-slate-300 bg-slate-50/70 p-3.5 font-mono text-xs text-slate-900 placeholder-slate-500 focus:bg-white focus:border-sky-700"
        />
      </div>

      {/* Policy controls & action bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="policy-select" className="text-xs font-semibold text-slate-700">
              Compliance Policy:
            </label>
            <select
              id="policy-select"
              value={selectedPolicyId}
              onChange={(e) => onSelectPolicy(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900"
            >
              {policies.map((pol) => (
                <option key={pol.id} value={pol.id}>
                  {pol.name} (Max CVSS {pol.maxAllowedCvss})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenPolicyBuilder}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            <SlidersIcon size={14} />
            <span>Custom Policy</span>
          </button>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAudit}
              onChange={(e) => onToggleSaveAudit(e.target.checked)}
              className="rounded border-slate-300 text-sky-700"
            />
            <span>Save audit to workspace</span>
          </label>
        </div>

        <button
          type="button"
          onClick={onScan}
          disabled={isScanning || packageJsonText.trim().length === 0}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
        >
          <ShieldIcon size={15} />
          <span>{isScanning ? "Auditing Live Feeds..." : "Run Supply-Chain Audit"}</span>
        </button>
      </div>
    </section>
  );
}
