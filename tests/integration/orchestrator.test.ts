import { describe, it, expect } from "vitest";

describe.skip("orchestrator integration (requires running Comet browser)", () => {
  it("health check returns structured result", async () => {
    const { CometOrchestrator } = await import("../../src/orchestrator.js");
    const orchestrator = new CometOrchestrator();
    const result = await orchestrator.health();
    expect(result).toHaveProperty("overall");
    expect(result).toHaveProperty("components");
    expect(result).toHaveProperty("checkedAt");
    expect(result).toHaveProperty("duration_ms");
    expect(typeof result.overall).toBe("string");
    expect(typeof result.components).toBe("object");
    expect(typeof result.checkedAt).toBe("number");
    expect(typeof result.duration_ms).toBe("number");
  });

  it("simple delegation routes to correct tool and returns TaskResult", async () => {
    const { CometOrchestrator } = await import("../../src/orchestrator.js");
    const orchestrator = new CometOrchestrator();
    const result = await orchestrator.delegate("take a screenshot");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("payload");
    expect(result).toHaveProperty("duration_ms");
    expect(result).toHaveProperty("tools_invoked");
    expect(["success", "failure", "partial", "cancelled"]).toContain(result.status);
    expect(Array.isArray(result.tools_invoked)).toBe(true);
  });

  it("progress polling with task_id returns structured status", async () => {
    const { CometOrchestrator } = await import("../../src/orchestrator.js");
    const orchestrator = new CometOrchestrator();
    const { task_id } = await orchestrator.delegate("take a screenshot", { async: true });
    const status = await orchestrator.getTaskStatus(task_id);
    expect(status).toHaveProperty("task_state");
    expect(status).toHaveProperty("elapsed_ms");
    expect(status).toHaveProperty("steps");
    expect(typeof status.elapsed_ms).toBe("number");
    expect(status.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  it("task cancellation via cancelTask works", async () => {
    const { CometOrchestrator } = await import("../../src/orchestrator.js");
    const orchestrator = new CometOrchestrator();
    const { task_id } = await orchestrator.delegate("navigate to example.com", { async: true });
    await orchestrator.cancelTask(task_id);
    const status = await orchestrator.getTaskStatus(task_id);
    expect(status.task_state).toBe("cancelled");
  });

  it("no-match delegation returns DelegateEnrichmentResponse", async () => {
    const { CometOrchestrator } = await import("../../src/orchestrator.js");
    const orchestrator = new CometOrchestrator();
    const result = await orchestrator.delegate("do something unrecognized xyz");
    const payload = result.payload as { matched?: boolean; available_templates?: unknown[]; tool_inventory?: unknown[]; server_health?: Record<string, string> };
    expect(payload.matched).toBe(false);
    expect(payload).toHaveProperty("available_templates");
    expect(payload).toHaveProperty("tool_inventory");
    expect(payload).toHaveProperty("server_health");
    expect(Array.isArray(payload.available_templates)).toBe(true);
    expect(Array.isArray(payload.tool_inventory)).toBe(true);
    expect(typeof payload.server_health).toBe("object");
  });
});
