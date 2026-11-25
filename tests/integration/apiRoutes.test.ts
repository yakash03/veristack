import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as healthGet } from "@/app/api/health/route";
import { GET as policiesGet, POST as policiesPost } from "@/app/api/policies/route";
import { DELETE as policyDelete } from "@/app/api/policies/[id]/route";
import { POST as scanPost } from "@/app/api/scan/route";
import { GET as auditsGet } from "@/app/api/audits/route";
import { GET as auditGetById, DELETE as auditDeleteById } from "@/app/api/audits/[id]/route";

describe("API Route Integration & Workspace Isolation", () => {
  let tempDir = "";

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "veristack-test-"));
    process.env.VERISTACK_DB_PATH = path.join(tempDir, "test.db");
  });

  afterAll(() => {
    delete process.env.VERISTACK_DB_PATH;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore Windows SQLite handle release delay
    }
  });

  it("GET /api/health reports healthy service without leaking secrets", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: { service: string; status: string };
    };
    expect(json.success).toBe(true);
    expect(json.data.service).toBe("veristack");
    expect(json.data.status).toBe("ok");
  });

  it("enforces strict workspace isolation (anti-IDOR) on saved policies and audits", async () => {
    // 1. User A creates a custom policy
    const createReq = new NextRequest("http://localhost:3000/api/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Strict Team Policy",
        description: "Test policy",
        maxAllowedCvss: 5.0,
        blockDeprecated: true,
        blockedLicenses: ["GPL-3.0"],
        reviewLicenses: ["MPL-2.0"],
      }),
    });
    const createRes = await policiesPost(createReq);
    expect(createRes.status).toBe(201);
    const createdJson = (await createRes.json()) as { data: { id: string } };
    const policyId = createdJson.data.id;
    const cookieA = createRes.cookies.get("veristack_ws")?.value;
    expect(cookieA).toBeTruthy();

    // 2. User B attempts to list or delete User A's custom policy -> isolated!
    const listBRes = await policiesGet(new NextRequest("http://localhost:3000/api/policies"));
    const listBJson = (await listBRes.json()) as { data: { custom: Array<{ id: string }> } };
    expect(listBJson.data.custom.some((p) => p.id === policyId)).toBe(false);

    const delBRes = await policyDelete(
      new NextRequest(`http://localhost:3000/api/policies/${policyId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: policyId }) }
    );
    expect(delBRes.status).toBe(404);

    // 3. User A runs live scan with saveAudit=true
    const scanReq = new NextRequest("http://localhost:3000/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `veristack_ws=${cookieA}`,
      },
      body: JSON.stringify({
        packageJsonText: JSON.stringify({
          name: "integration-probe",
          dependencies: { zod: "3.24.2" },
        }),
        policyId,
        saveAudit: true,
      }),
    });
    const scanRes = await scanPost(scanReq);
    expect(scanRes.status).toBe(200);
    const scanJson = (await scanRes.json()) as {
      data: { report: { projectName: string }; savedAudit: { id: string } | null };
    };
    const auditId = scanJson.data.savedAudit?.id;
    expect(auditId).toBeTruthy();

    // 4. User A can view audit; User B receives 404 on User A's audit ID
    const getARes = await auditGetById(
      new NextRequest(`http://localhost:3000/api/audits/${auditId}`, {
        headers: { Cookie: `veristack_ws=${cookieA}` },
      }),
      { params: Promise.resolve({ id: auditId! }) }
    );
    expect(getARes.status).toBe(200);

    const getBRes = await auditGetById(
      new NextRequest(`http://localhost:3000/api/audits/${auditId}`),
      { params: Promise.resolve({ id: auditId! }) }
    );
    expect(getBRes.status).toBe(404);

    // 5. User A deletes audit cleanly
    const delARes = await auditDeleteById(
      new NextRequest(`http://localhost:3000/api/audits/${auditId}`, {
        method: "DELETE",
        headers: { Cookie: `veristack_ws=${cookieA}` },
      }),
      { params: Promise.resolve({ id: auditId! }) }
    );
    expect(delARes.status).toBe(200);

    const listARes = await auditsGet(
      new NextRequest("http://localhost:3000/api/audits", {
        headers: { Cookie: `veristack_ws=${cookieA}` },
      })
    );
    const listAJson = (await listARes.json()) as { data: Array<{ id: string }> };
    expect(listAJson.data).toHaveLength(0);
  });

  it("rejects invalid JSON and malformed package.json with HTTP 400", async () => {
    const badReq = new NextRequest("http://localhost:3000/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageJsonText: "{broken json" }),
    });
    const badRes = await scanPost(badReq);
    expect(badRes.status).toBe(400);
  });
});
