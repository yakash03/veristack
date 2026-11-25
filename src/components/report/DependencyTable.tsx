"use client";

import React, { useMemo, useState } from "react";
import { PackageAuditResult } from "@/lib/schemas/supplyChain";
import { SearchIcon } from "../ui/Icons";
import { getLicenseTone, getRiskTone, getUpgradeTone, StatusBadge } from "../ui/Badge";
import { PackageDetailModal } from "./PackageDetailModal";

interface DependencyTableProps {
  packages: PackageAuditResult[];
}

type FilterMode = "ALL" | "VULNERABLE" | "LICENSE_ISSUE" | "DEPRECATED";

export function DependencyTable({ packages }: DependencyTableProps) {
  const [filter, setFilter] = useState<FilterMode>("ALL");
  const [search, setSearch] = useState("");
  const [selectedPkg, setSelectedPkg] = useState<PackageAuditResult | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (filter === "VULNERABLE") return p.vulnerabilities.length > 0;
      if (filter === "LICENSE_ISSUE")
        return p.licenseStatus === "BLOCKED" || p.licenseStatus === "REVIEW";
      if (filter === "DEPRECATED") return p.deprecatedNotice !== null;
      return true;
    });
  }, [packages, filter, search]);

  const filterButtons: Array<{ id: FilterMode; label: string }> = [
    { id: "ALL", label: "All" },
    { id: "VULNERABLE", label: "Vulnerable" },
    { id: "LICENSE_ISSUE", label: "License Flagged" },
    { id: "DEPRECATED", label: "Deprecated" },
  ];

  return (
    <section
      aria-labelledby="dependency-table-heading"
      className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 id="dependency-table-heading" className="text-base font-bold text-slate-900">
            Dependency Risk Ledger ({filtered.length})
          </h2>
          <p className="text-xs text-slate-600">
            Deterministic risk scoring combining OSV advisories, SPDX policy, and OpenSSF posture.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <label htmlFor="pkg-filter-search" className="sr-only">
              Filter dependencies by package name
            </label>
            <input
              id="pkg-filter-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter package..."
              className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs text-slate-900 placeholder-slate-500"
            />
          </div>

          <div
            role="group"
            aria-label="Filter dependency table"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
          >
            {filterButtons.map((btn) => (
              <button
                type="button"
                key={btn.id}
                aria-pressed={filter === btn.id}
                onClick={() => setFilter(btn.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  filter === btn.id
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        tabIndex={0}
        aria-label="Dependency risk table"
        className="overflow-x-auto border border-slate-200 rounded-xl"
      >
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
              <th scope="col" className="py-2.5 px-3">
                Package
              </th>
              <th scope="col" className="py-2.5 px-3">
                Analyzed → Target
              </th>
              <th scope="col" className="py-2.5 px-3">
                OSV Advisories
              </th>
              <th scope="col" className="py-2.5 px-3">
                SPDX License
              </th>
              <th scope="col" className="py-2.5 px-3">
                OpenSSF
              </th>
              <th scope="col" className="py-2.5 px-3">
                Risk
              </th>
              <th scope="col" className="py-2.5 px-3 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-600">
                  No dependencies match the selected filter.
                </td>
              </tr>
            ) : (
              filtered.map((pkg) => (
                <tr key={pkg.name} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-mono font-bold text-slate-900">{pkg.name}</div>
                    <div className="text-[11px] text-slate-600">
                      {pkg.section}
                      {pkg.deprecatedNotice ? " · Deprecated" : ""}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono">
                    <div className="text-slate-800">
                      {pkg.analyzedVersion} →{" "}
                      {pkg.recommendedSafeVersion ?? pkg.latestVersion ?? "--"}
                    </div>
                    <div className="mt-1">
                      <StatusBadge
                        label={pkg.upgradeDelta}
                        tone={getUpgradeTone(pkg.upgradeDelta)}
                      />
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {pkg.vulnerabilities.length === 0 ? (
                      <span className="text-emerald-800 font-medium">0 advisories</span>
                    ) : (
                      <div className="space-y-0.5">
                        <span className="font-bold text-rose-800">
                          {pkg.vulnerabilities.length} found
                        </span>
                        <div className="font-mono text-[11px] text-slate-600">
                          {pkg.vulnerabilities[0]?.id}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-mono text-slate-800">{pkg.spdxLicense ?? "Unknown"}</div>
                    <div className="mt-1">
                      <StatusBadge
                        label={pkg.licenseStatus}
                        tone={getLicenseTone(pkg.licenseStatus)}
                      />
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700">
                    {pkg.openssf ? `${pkg.openssf.score}/10` : pkg.telemetryStatus.openssf}
                  </td>
                  <td className="py-3 px-3">
                    <StatusBadge
                      label={`${pkg.riskScore} · ${pkg.riskTier}`}
                      tone={getRiskTone(pkg.riskTier)}
                    />
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedPkg(pkg)}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold cursor-pointer"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PackageDetailModal pkg={selectedPkg} onClose={() => setSelectedPkg(null)} />
    </section>
  );
}
