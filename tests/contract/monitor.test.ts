import { describe, it, expect } from "vitest";

interface MonitorInput {
  section?: "windows" | "tabs" | "all";
}

interface MonitorOutput {
  available: boolean;
  reason?: string;
  timestamp?: string;
  windows?: Array<{
    index: number;
    title: string;
    x: number;
    y: number;
    w: number;
    h: number;
    display: string;
    fullscreen: boolean;
  }>;
  window_count?: number;
  tabs?: Array<{ id: string; title: string; url: string; type: string }>;
  tab_count?: number;
}

async function callMonitorTool(input: MonitorInput): Promise<MonitorOutput> {
  throw new Error("not implemented");
}

describe("comet_monitor contract", () => {
  it("available boolean is required", async () => {
    const output = await callMonitorTool({});
    expect(typeof output.available).toBe("boolean");
  });

  it("windows array present when available", async () => {
    const output = await callMonitorTool({ section: "windows" });
    if (output.available) {
      expect(output.windows).toBeDefined();
      expect(Array.isArray(output.windows)).toBe(true);
    }
  });

  it("tabs array present when available", async () => {
    const output = await callMonitorTool({ section: "tabs" });
    if (output.available) {
      expect(output.tabs).toBeDefined();
      expect(Array.isArray(output.tabs)).toBe(true);
    }
  });

  it("graceful unavailable response includes reason string", async () => {
    const output = await callMonitorTool({});
    if (!output.available) {
      expect(output.reason).toBeDefined();
      expect(typeof output.reason).toBe("string");
    }
  });
});
