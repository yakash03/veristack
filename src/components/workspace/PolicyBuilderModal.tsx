"use client";

import React, { useState } from "react";
import { CompliancePolicy } from "@/lib/schemas/supplyChain";
import { ModalShell } from "../ui/ModalShell";
import { TrashIcon } from "../ui/Icons";

interface PolicyBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customPolicies: CompliancePolicy[];
  onPolicyCreated: (policy: CompliancePolicy) => void;
  onPolicyDeleted: (id: string) => void;
}

export function PolicyBuilderModal({
  isOpen,
  onClose,
  customPolicies,
  onPolicyCreated,
  onPolicyDeleted,
}: PolicyBuilderModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState(
    "Custom organization supply-chain compliance rule."
  );
  const [maxAllowedCvss, setMaxAllowedCvss] = useState("6.9");
  const [blockDeprecated, setBlockDeprecated] = useState(true);
  const [blockedText, setBlockedText] = useState("GPL-3.0, AGPL-3.0, UNLICENSED");
  const [reviewText, setReviewText] = useState("LGPL-3.0, MPL-2.0");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const splitTokens = (raw: string) =>
        raw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          maxAllowedCvss: Number(maxAllowedCvss),
          blockDeprecated,
          blockedLicenses: splitTokens(blockedText),
          reviewLicenses: splitTokens(reviewText),
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: CompliancePolicy;
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error || "Unable to save custom policy.");
      } else {
        onPolicyCreated(json.data);
        setName("");
      }
    } catch {
      setError("Network error creating policy.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/policies/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      onPolicyDeleted(id);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      titleId="policy-builder-title"
      title="Workspace Compliance Policies"
      subtitle="Stored privately for your workspace session in SQLite with Zod schema validation."
    >
      <div className="space-y-6 text-xs">
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="pol-name" className="block font-semibold text-slate-800 mb-1">
              Policy Name
            </label>
            <input
              id="pol-name"
              type="text"
              required
              minLength={2}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. FinTech Zero-High-CVE"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pol-cvss" className="block font-semibold text-slate-800 mb-1">
                Max Allowed CVSS (0–10)
              </label>
              <input
                id="pol-cvss"
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={maxAllowedCvss}
                onChange={(e) => setMaxAllowedCvss(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockDeprecated}
                  onChange={(e) => setBlockDeprecated(e.target.checked)}
                />
                <span>Flag deprecated npm releases</span>
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="pol-blocked" className="block font-semibold text-slate-800 mb-1">
              Blocked SPDX Licenses (comma-separated)
            </label>
            <input
              id="pol-blocked"
              type="text"
              value={blockedText}
              onChange={(e) => setBlockedText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="pol-review" className="block font-semibold text-slate-800 mb-1">
              Review-Required SPDX Licenses
            </label>
            <input
              id="pol-review"
              type="text"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="pol-desc" className="block font-semibold text-slate-800 mb-1">
              Policy Notes
            </label>
            <input
              id="pol-desc"
              type="text"
              maxLength={240}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
            />
          </div>

          {error && (
            <p role="alert" className="text-rose-700 font-semibold">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Custom Policy"}
            </button>
          </div>
        </form>

        {customPolicies.length > 0 && (
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <h3 className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
              Saved Workspace Policies ({customPolicies.length})
            </h3>
            <ul className="space-y-2">
              {customPolicies.map((pol) => (
                <li
                  key={pol.id}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-bold text-slate-900">{pol.name}</p>
                    <p className="text-slate-600">
                      Max CVSS {pol.maxAllowedCvss} · Blocked:{" "}
                      {pol.blockedLicenses.join(", ") || "None"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(pol.id)}
                    aria-label={`Delete policy ${pol.name}`}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
