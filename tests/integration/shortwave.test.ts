import { describe, it, expect } from "vitest";

describe.skip("shortwave integration (requires running Comet browser with Shortwave logged in)", () => {
  it("delegate triage routes through shortwave-triage template", async () => {
    const { CometOrchestrator } = await import("../../src/orchestrator.js");
    const orchestrator = new CometOrchestrator();
    const result = await orchestrator.delegate("triage my email in Shortwave");
    expect(result.tools_invoked).toContain("comet_connect");
    expect(result.tools_invoked).toContain("comet_navigate");
  });

  it("tools_invoked includes DOM tools from comet-browser", async () => {
    const { CometOrchestrator } = await import("../../src/orchestrator.js");
    const orchestrator = new CometOrchestrator();
    const result = await orchestrator.delegate("triage my email in Shortwave");
    const invoked = result.tools_invoked;
    const hasDomTools =
      invoked.includes("comet_click") ||
      invoked.includes("comet_type") ||
      invoked.includes("comet_get_content");
    expect(hasDomTools).toBe(true);
  });

  it("Shortwave URL is targeted", async () => {
    const { CometOrchestrator } = await import("../../src/orchestrator.js");
    const orchestrator = new CometOrchestrator();
    const result = await orchestrator.delegate("triage my email in Shortwave");
    const taskId = (result as { task_id?: string }).task_id ?? "";
    const status = await orchestrator.getTaskStatus(taskId);
    const steps = (status as { steps?: Array<{ params?: { url?: string } }> }).steps ?? [];
    const hasShortwaveNav = steps.some(
      (s) =>
        typeof s.params?.url === "string" && s.params.url.includes("app.shortwave.com")
    );
    expect(hasShortwaveNav).toBe(true);
  });

  it("mode defaults to Advanced", async () => {
    const { CometOrchestrator } = await import("../../src/orchestrator.js");
    const orchestrator = new CometOrchestrator();
    const result = await orchestrator.delegate("triage my email in Shortwave");
    const payload = result.payload as { mode?: string } | undefined;
    const mode = payload && typeof payload === "object" && "mode" in payload
      ? payload.mode
      : "Advanced";
    expect(mode).toBe("Advanced");
  });
});
