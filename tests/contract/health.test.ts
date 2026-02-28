import { describe, it, expect } from "vitest";

interface HealthInput {
  force?: boolean;
}

type HealthLevel = "healthy" | "unreachable" | "degraded" | "unknown";

interface ComponentHealth {
  name: "browser" | "comet-mcp" | "comet-monitor" | "extension";
  status: HealthLevel;
  reason: string | null;
  latency_ms: number | null;
}

interface HealthOutput {
  overall: "healthy" | "degraded" | "down";
  components: Record<string, ComponentHealth>;
  checked_at: string;
  duration_ms: number;
}

async function callHealthTool(input: HealthInput): Promise<HealthOutput> {
  throw new Error("not implemented");
}

describe("comet_health contract", () => {
  describe("HealthOutput", () => {
    it("overall must be one of healthy, degraded, down", async () => {
      const output = await callHealthTool({});
      expect(["healthy", "degraded", "down"]).toContain(output.overall);
    });

    it("components must contain exactly 4 entries: browser, comet-mcp, comet-monitor, extension", async () => {
      const output = await callHealthTool({});
      expect(Object.keys(output.components).sort()).toEqual([
        "browser",
        "comet-mcp",
        "comet-monitor",
        "extension",
      ]);
    });

    it("each component must have status (HealthLevel), reason (string|null), latency_ms (number|null)", async () => {
      const output = await callHealthTool({});
      const healthLevels: HealthLevel[] = [
        "healthy",
        "unreachable",
        "degraded",
        "unknown",
      ];
      for (const comp of Object.values(output.components)) {
        expect(healthLevels).toContain(comp.status);
        expect(
          typeof comp.reason === "string" || comp.reason === null
        ).toBe(true);
        expect(
          typeof comp.latency_ms === "number" || comp.latency_ms === null
        ).toBe(true);
      }
    });

    it("duration_ms must be <= 10000 (FR-003: 10-second bound)", async () => {
      const output = await callHealthTool({});
      expect(output.duration_ms).toBeLessThanOrEqual(10000);
    });
  });

  describe("HealthInput", () => {
    it("force is optional boolean", async () => {
      await callHealthTool({});
      await callHealthTool({ force: true });
      await callHealthTool({ force: false });
    });
  });
});
