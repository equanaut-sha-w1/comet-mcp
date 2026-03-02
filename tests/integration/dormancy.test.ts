import { describe, it, expect } from "vitest";

const API_BASE = process.env.COMET_API_URL || "http://127.0.0.1:3456";
const CDP_URL = "http://127.0.0.1:9222";

describe("dormancy integration (requires running Comet browser)", () => {
  it("extension service worker is detectable via CDP target list", async () => {
    const res = await fetch(`${CDP_URL}/json/list`);
    expect(res.ok).toBe(true);
    const targets = await res.json();
    expect(Array.isArray(targets)).toBe(true);
    const hasServiceWorker = targets.some(
      (t: any) => t.type === "service_worker" || t.type === "background_page"
    );
    expect(hasServiceWorker).toBe(true);
  });

  it("tab groups list works (dormancy recovery is transparent)", async () => {
    const res = await fetch(new URL("/api/tab-groups", API_BASE).toString());
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty("groups");
    expect(Array.isArray(body.groups)).toBe(true);
  });

  it("tab groups list_tabs returns tab array", async () => {
    const res = await fetch(new URL("/api/tab-groups/tabs", API_BASE).toString());
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty("tabs");
    expect(Array.isArray(body.tabs)).toBe(true);
    expect(body.tabs.length).toBeGreaterThan(0);
  });
});
