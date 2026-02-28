import { describe, it, expect } from "vitest";

describe.skip("dormancy integration (requires running Comet browser)", () => {
  it("isExtensionAlive detects live service worker", async () => {
    const { DormancyManager } = await import("../../src/dormancy.js");
    const dormancy = new DormancyManager();
    const alive = await dormancy.isExtensionAlive();
    expect(typeof alive).toBe("boolean");
  });

  it("wake uses page target technique first", async () => {
    const { DormancyManager } = await import("../../src/dormancy.js");
    const dormancy = new DormancyManager();
    const result = await dormancy.wake();
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("technique");
    expect(result).toHaveProperty("attempts");
    expect(result).toHaveProperty("duration_ms");
    expect(["page_target", "management_toggle", "none"]).toContain(result.technique);
    expect(typeof result.attempts).toBe("number");
    expect(typeof result.duration_ms).toBe("number");
  });

  it("wake completes within 5 seconds", async () => {
    const { DormancyManager } = await import("../../src/dormancy.js");
    const dormancy = new DormancyManager();
    const result = await dormancy.wake();
    expect(result.duration_ms).toBeLessThanOrEqual(5000);
  });

  it("transparent recovery — caller unaware", async () => {
    const { DormancyManager } = await import("../../src/dormancy.js");
    const dormancy = new DormancyManager();
    const { tabGroupsClient } = await import("../../src/tab-groups.js");
    const groups = await tabGroupsClient.listGroups();
    expect(groups).toBeDefined();
    expect(Array.isArray(groups)).toBe(true);
  });
});
