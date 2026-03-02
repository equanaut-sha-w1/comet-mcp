import { describe, it, expect } from "vitest";

const API_BASE = process.env.COMET_API_URL || "http://127.0.0.1:3456";

async function apiGet(path: string): Promise<any> {
  const res = await fetch(new URL(path, API_BASE).toString());
  return { status: res.status, body: await res.json() };
}

async function apiPost(path: string, body: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(new URL(path, API_BASE).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("orchestrator integration (requires running comet-mcp on port 3456)", () => {
  it("health check returns structured result with 4 components", async () => {
    const { body } = await apiGet("/api/health");
    expect(body).toHaveProperty("overall");
    expect(body).toHaveProperty("components");
    expect(body).toHaveProperty("checkedAt");
    expect(body).toHaveProperty("duration_ms");
    expect(typeof body.overall).toBe("string");
    expect(["healthy", "degraded", "down"]).toContain(body.overall);
    const componentNames = Object.keys(body.components).sort();
    expect(componentNames).toEqual(["browser", "comet-mcp", "comet-monitor", "extension"]);
  });

  it("simple delegation routes to correct tool and returns TaskResult", async () => {
    const { body } = await apiPost("/api/delegate", {
      description: "take a screenshot",
    });
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("payload");
    expect(body).toHaveProperty("duration_ms");
    expect(body).toHaveProperty("tools_invoked");
    expect(["success", "failure", "partial", "cancelled"]).toContain(body.status);
    expect(Array.isArray(body.tools_invoked)).toBe(true);
    expect(typeof body.duration_ms).toBe("number");
  });

  it("no-match delegation returns DelegateEnrichmentResponse", async () => {
    const { body } = await apiPost("/api/delegate", {
      description: "do something completely unrecognized xyz abc 12345",
    });
    expect(body).toHaveProperty("status");
    expect(body.status).toBe("failure");
    const payload = body.payload;
    expect(payload).toHaveProperty("matched");
    expect(payload.matched).toBe(false);
    expect(payload).toHaveProperty("available_templates");
    expect(payload).toHaveProperty("tool_inventory");
    expect(payload).toHaveProperty("server_health");
    expect(Array.isArray(payload.available_templates)).toBe(true);
    expect(Array.isArray(payload.tool_inventory)).toBe(true);
    expect(typeof payload.server_health).toBe("object");
  });

  it("task cancellation via POST /api/stop with task_id", async () => {
    const { body: stopResult } = await apiPost("/api/stop", { task_id: "nonexistent-id" });
    expect(stopResult).toHaveProperty("task_id");
    expect(stopResult).toHaveProperty("cancelled");
    expect(typeof stopResult.cancelled).toBe("boolean");
  });

  it("poll with unknown task_id returns 404", async () => {
    const { status } = await apiGet("/api/poll?task_id=unknown-task-xyz");
    expect(status).toBe(404);
  });
});
