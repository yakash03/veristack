"use client";

import React from "react";
import { SavedAuditSummary } from "@/lib/schemas/supplyChain";
import { ModalShell } from "../ui/ModalShell";
import { getRiskTone, StatusBadge } from "../ui/Badge";
import { TrashIcon } from "../ui/Icons";

interface SavedAuditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audits: SavedAuditSummary[];
  onLoadAudit: (auditId: string) => void;
  onDeleteAudit: (auditId: string) => void;
}

export function SavedAuditsModal({
  isOpen,
  onClose,
  audits,
  onLoadAudit,
  onDeleteAudit,
}: SavedAuditsModalProps) {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      titleId="saved-audits-title"
      title="Saved Workspace Audits"
      subtitle="Scoped exclusively to your signed HttpOnly workspace session."
    >
      <div className="space-y-3 text-xs">
        {audits.length === 0 ? (
          <p className="text-slate-600 py-8 text-center">
            No saved audits in this workspace yet. Run a scan with &ldquo;Save audit to
            workspace&rdquo; checked.
          </p>
        ) : (
          <ul className="space-y-2">
            {audits.map((aud) => (
              <li
                key={aud.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{aud.projectName}</span>
                    <StatusBadge
                      label={`${aud.healthScore}/100 · ${aud.overallRiskTier}`}
                      tone={getRiskTone(aud.overallRiskTier)}
                    />
                  </div>
                  <p className="text-slate-600">
                    {aud.policyName} · {aud.totalPackages} pkgs ({aud.vulnerablePackages}{" "}
                    vulnerable) · {new Date(aud.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onLoadAudit(aud.id);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                  >
                    Open Report
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteAudit(aud.id)}
                    aria-label={`Delete audit ${aud.projectName}`}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
}
