// VeriStack — Workspace-Scoped Persistence Repository
// Uses parameterized Node built-in SQLite (node:sqlite) with automatic safe JSON fallback
// when running on runtimes without node:sqlite, plus Zod runtime schema verification.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  CompliancePolicy,
  CompliancePolicySchema,
  CreatePolicyInput,
  SavedAuditSummary,
  StackAuditReport,
  StackAuditReportSchema,
} from "../schemas/supplyChain";

interface SqliteStatement {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
}

interface SqliteDatabase {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
}

interface FallbackStoreData {
  policies: Array<{ workspaceId: string; policy: CompliancePolicy }>;
  audits: Array<{ workspaceId: string; id: string; report: StackAuditReport; createdAt: string }>;
}

function resolveStorageDir(): string {
  if (process.env.VERISTACK_DB_PATH) {
    return path.dirname(process.env.VERISTACK_DB_PATH);
  }
  return process.env.VERCEL ? "/tmp/veristack-data" : path.join(process.cwd(), ".data");
}

function resolveDbFile(): string {
  if (process.env.VERISTACK_DB_PATH) {
    return process.env.VERISTACK_DB_PATH;
  }
  return path.join(resolveStorageDir(), "veristack.db");
}

class VeriStackRepository {
  private sqliteDb: SqliteDatabase | null = null;
  private initialized = false;
  private useFallbackFile = false;

  private async ensureReady(): Promise<void> {
    if (this.initialized) return;

    try {
      const storageDir = resolveStorageDir();
      fs.mkdirSync(storageDir, { recursive: true });
      const sqliteModule = (await import(/* webpackIgnore: true */ "node:sqlite")) as {
        DatabaseSync?: new (path: string) => SqliteDatabase;
      };

      if (sqliteModule.DatabaseSync) {
        const db = new sqliteModule.DatabaseSync(resolveDbFile());
        db.exec(`
          CREATE TABLE IF NOT EXISTS workspace_policies (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            max_allowed_cvss REAL NOT NULL,
            block_deprecated INTEGER NOT NULL,
            blocked_licenses_json TEXT NOT NULL,
            review_licenses_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_policies_ws ON workspace_policies(workspace_id);

          CREATE TABLE IF NOT EXISTS workspace_audits (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            policy_name TEXT NOT NULL,
            health_score INTEGER NOT NULL,
            overall_risk_tier TEXT NOT NULL,
            total_packages INTEGER NOT NULL,
            vulnerable_packages INTEGER NOT NULL,
            report_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_audits_ws ON workspace_audits(workspace_id, created_at DESC);
        `);
        this.sqliteDb = db;
        this.initialized = true;
        return;
      }
    } catch {
      // Fall back to atomic JSON persistence if node:sqlite is unavailable in host runtime
    }

    this.useFallbackFile = true;
    this.initialized = true;
  }

  private getFallbackPath(): string {
    return path.join(resolveStorageDir(), "veristack-store.json");
  }

  private readFallbackStore(): FallbackStoreData {
    try {
      const raw = fs.readFileSync(this.getFallbackPath(), "utf8");
      const parsed = JSON.parse(raw) as Partial<FallbackStoreData>;
      return {
        policies: Array.isArray(parsed.policies) ? parsed.policies : [],
        audits: Array.isArray(parsed.audits) ? parsed.audits : [],
      };
    } catch {
      return { policies: [], audits: [] };
    }
  }

  private writeFallbackStore(data: FallbackStoreData): void {
    const dir = resolveStorageDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.getFallbackPath(), JSON.stringify(data), "utf8");
  }

  async listCustomPolicies(workspaceId: string): Promise<CompliancePolicy[]> {
    await this.ensureReady();

    if (this.sqliteDb && !this.useFallbackFile) {
      const rows = this.sqliteDb
        .prepare(
          `SELECT id, name, description, max_allowed_cvss, block_deprecated,
                  blocked_licenses_json, review_licenses_json, created_at
           FROM workspace_policies
           WHERE workspace_id = ?
           ORDER BY created_at DESC`
        )
        .all(workspaceId) as Array<{
        id: string;
        name: string;
        description: string;
        max_allowed_cvss: number;
        block_deprecated: number;
        blocked_licenses_json: string;
        review_licenses_json: string;
        created_at: string;
      }>;

      return rows
        .map((row) =>
          CompliancePolicySchema.safeParse({
            id: row.id,
            name: row.name,
            description: row.description,
            maxAllowedCvss: row.max_allowed_cvss,
            blockDeprecated: row.block_deprecated === 1,
            blockedLicenses: JSON.parse(row.blocked_licenses_json) as unknown,
            reviewLicenses: JSON.parse(row.review_licenses_json) as unknown,
            createdAt: row.created_at,
          })
        )
        .filter((res): res is { success: true; data: CompliancePolicy } => res.success)
        .map((res) => res.data);
    }

    const store = this.readFallbackStore();
    return store.policies
      .filter((entry) => entry.workspaceId === workspaceId)
      .map((entry) => entry.policy);
  }

  async createCustomPolicy(
    workspaceId: string,
    input: CreatePolicyInput
  ): Promise<CompliancePolicy> {
    await this.ensureReady();
    const policy: CompliancePolicy = {
      ...input,
      id: `pol-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    };

    if (this.sqliteDb && !this.useFallbackFile) {
      this.sqliteDb
        .prepare(
          `INSERT INTO workspace_policies (
             id, workspace_id, name, description, max_allowed_cvss,
             block_deprecated, blocked_licenses_json, review_licenses_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          policy.id,
          workspaceId,
          policy.name,
          policy.description,
          policy.maxAllowedCvss,
          policy.blockDeprecated ? 1 : 0,
          JSON.stringify(policy.blockedLicenses),
          JSON.stringify(policy.reviewLicenses),
          policy.createdAt
        );
      return policy;
    }

    const store = this.readFallbackStore();
    store.policies.unshift({ workspaceId, policy });
    this.writeFallbackStore(store);
    return policy;
  }

  async deleteCustomPolicy(workspaceId: string, policyId: string): Promise<boolean> {
    await this.ensureReady();

    if (this.sqliteDb && !this.useFallbackFile) {
      const existing = this.sqliteDb
        .prepare(`SELECT id FROM workspace_policies WHERE id = ? AND workspace_id = ?`)
        .get(policyId, workspaceId);
      if (!existing) return false;
      this.sqliteDb
        .prepare(`DELETE FROM workspace_policies WHERE id = ? AND workspace_id = ?`)
        .run(policyId, workspaceId);
      return true;
    }

    const store = this.readFallbackStore();
    const prevLen = store.policies.length;
    store.policies = store.policies.filter(
      (entry) => !(entry.workspaceId === workspaceId && entry.policy.id === policyId)
    );
    if (store.policies.length === prevLen) return false;
    this.writeFallbackStore(store);
    return true;
  }

  async getCustomPolicy(workspaceId: string, policyId: string): Promise<CompliancePolicy | null> {
    const all = await this.listCustomPolicies(workspaceId);
    return all.find((p) => p.id === policyId) ?? null;
  }

  async saveAudit(workspaceId: string, report: StackAuditReport): Promise<SavedAuditSummary> {
    await this.ensureReady();
    const id = `aud-${crypto.randomUUID()}`;
    const createdAt = report.scannedAt;

    if (this.sqliteDb && !this.useFallbackFile) {
      this.sqliteDb
        .prepare(
          `INSERT INTO workspace_audits (
             id, workspace_id, project_name, policy_name, health_score,
             overall_risk_tier, total_packages, vulnerable_packages, report_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          workspaceId,
          report.projectName,
          report.policy.name,
          report.overallHealthScore,
          report.overallRiskTier,
          report.summary.totalPackages,
          report.summary.vulnerablePackages,
          JSON.stringify(report),
          createdAt
        );
    } else {
      const store = this.readFallbackStore();
      store.audits.unshift({ workspaceId, id, report, createdAt });
      store.audits = store.audits.slice(0, 100);
      this.writeFallbackStore(store);
    }

    return {
      id,
      projectName: report.projectName,
      policyName: report.policy.name,
      healthScore: report.overallHealthScore,
      overallRiskTier: report.overallRiskTier,
      totalPackages: report.summary.totalPackages,
      vulnerablePackages: report.summary.vulnerablePackages,
      createdAt,
    };
  }

  async listAudits(workspaceId: string): Promise<SavedAuditSummary[]> {
    await this.ensureReady();

    if (this.sqliteDb && !this.useFallbackFile) {
      const rows = this.sqliteDb
        .prepare(
          `SELECT id, project_name, policy_name, health_score, overall_risk_tier,
                  total_packages, vulnerable_packages, created_at
           FROM workspace_audits
           WHERE workspace_id = ?
           ORDER BY created_at DESC
           LIMIT 25`
        )
        .all(workspaceId) as Array<{
        id: string;
        project_name: string;
        policy_name: string;
        health_score: number;
        overall_risk_tier: StackAuditReport["overallRiskTier"];
        total_packages: number;
        vulnerable_packages: number;
        created_at: string;
      }>;

      return rows.map((r) => ({
        id: r.id,
        projectName: r.project_name,
        policyName: r.policy_name,
        healthScore: r.health_score,
        overallRiskTier: r.overall_risk_tier,
        totalPackages: r.total_packages,
        vulnerablePackages: r.vulnerable_packages,
        createdAt: r.created_at,
      }));
    }

    const store = this.readFallbackStore();
    return store.audits
      .filter((a) => a.workspaceId === workspaceId)
      .slice(0, 25)
      .map((a) => ({
        id: a.id,
        projectName: a.report.projectName,
        policyName: a.report.policy.name,
        healthScore: a.report.overallHealthScore,
        overallRiskTier: a.report.overallRiskTier,
        totalPackages: a.report.summary.totalPackages,
        vulnerablePackages: a.report.summary.vulnerablePackages,
        createdAt: a.createdAt,
      }));
  }

  async getAuditById(workspaceId: string, auditId: string): Promise<StackAuditReport | null> {
    await this.ensureReady();

    if (this.sqliteDb && !this.useFallbackFile) {
      const row = this.sqliteDb
        .prepare(`SELECT report_json FROM workspace_audits WHERE id = ? AND workspace_id = ?`)
        .get(auditId, workspaceId) as { report_json: string } | undefined;
      if (!row) return null;
      const parsed = StackAuditReportSchema.safeParse(JSON.parse(row.report_json));
      return parsed.success ? parsed.data : null;
    }

    const store = this.readFallbackStore();
    const match = store.audits.find((a) => a.id === auditId && a.workspaceId === workspaceId);
    return match ? match.report : null;
  }

  async deleteAuditById(workspaceId: string, auditId: string): Promise<boolean> {
    await this.ensureReady();

    if (this.sqliteDb && !this.useFallbackFile) {
      const existing = this.sqliteDb
        .prepare(`SELECT id FROM workspace_audits WHERE id = ? AND workspace_id = ?`)
        .get(auditId, workspaceId);
      if (!existing) return false;
      this.sqliteDb
        .prepare(`DELETE FROM workspace_audits WHERE id = ? AND workspace_id = ?`)
        .run(auditId, workspaceId);
      return true;
    }

    const store = this.readFallbackStore();
    const prev = store.audits.length;
    store.audits = store.audits.filter((a) => !(a.id === auditId && a.workspaceId === workspaceId));
    if (store.audits.length === prev) return false;
    this.writeFallbackStore(store);
    return true;
  }
}

const globalRepo = globalThis as unknown as { __veristack_repo__?: VeriStackRepository };
export const repository = globalRepo.__veristack_repo__ ?? new VeriStackRepository();
if (process.env.NODE_ENV !== "production") {
  globalRepo.__veristack_repo__ = repository;
}
