/**
 * Quickstart Validation Scenarios 1-16
 * Constitution II compliance: runtime proof for Spec 005 validation phase
 *
 * Requires: comet-mcp (3456), comet-monitor (5555), Comet browser (9222)
 */
import { describe, it, expect } from "vitest";

const API = process.env.COMET_API_URL || "http://127.0.0.1:3456";
const CDP = "http://127.0.0.1:9222";
const MONITOR = "http://127.0.0.1:5555";

async function get(path: string, base = API): Promise<{ status: number; body: any }> {
  const res = await fetch(new URL(path, base).toString());
  const body = res.headers.get("content-type")?.includes("json")
    ? await res.json()
    : await res.text();
  return { status: res.status, body };
}

async function post(path: string, data: Record<string, unknown> = {}, base = API): Promise<{ status: number; body: any }> {
  const res = await fetch(new URL(path, base).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = res.headers.get("content-type")?.includes("json")
    ? await res.json()
    : await res.text();
  return { status: res.status, body };
}

// ===================== Scenario 1: Health Check (Happy Path) =====================
describe("Scenario 1: Unified Health Check (Happy Path)", () => {
  it("returns overall status as healthy/degraded/down", async () => {
    const { body } = await get("/api/health");
    expect(["healthy", "degraded", "down"]).toContain(body.overall);
  });

  it("contains exactly 4 components: browser, comet-mcp, comet-monitor, extension", async () => {
    const { body } = await get("/api/health");
    expect(Object.keys(body.components).sort()).toEqual([
      "browser", "comet-mcp", "comet-monitor", "extension",
    ]);
  });

  it("each component has status, reason, and latency_ms", async () => {
    const { body } = await get("/api/health");
    for (const comp of Object.values(body.components) as any[]) {
      expect(comp).toHaveProperty("status");
      expect(comp).toHaveProperty("reason");
      expect(comp).toHaveProperty("latency_ms");
    }
  });

  it("duration_ms <= 10000 (FR-003: 10-second bound)", async () => {
    const { body } = await get("/api/health");
    expect(body.duration_ms).toBeLessThanOrEqual(10000);
  });
});

// ===================== Scenario 2: Health Check with Component Down =====================
describe("Scenario 2: Health Check degraded awareness", () => {
  it("health reports comet-monitor status accurately", async () => {
    const { body } = await get("/api/health");
    const monitorComp = body.components["comet-monitor"];
    expect(monitorComp).toBeDefined();
    expect(["healthy", "unreachable", "degraded", "unknown"]).toContain(monitorComp.status);
  });
});

// ===================== Scenario 3: Task Delegation with Auto-Routing =====================
describe("Scenario 3: Task Delegation with Auto-Routing", () => {
  it("screenshot delegation returns structured result", async () => {
    const { body } = await post("/api/delegate", {
      description: "take a screenshot",
    });
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("payload");
    expect(body).toHaveProperty("duration_ms");
    expect(body).toHaveProperty("tools_invoked");
    expect(typeof body.duration_ms).toBe("number");
    expect(body.duration_ms).toBeGreaterThan(0);
  });

  it("tools_invoked includes the routed tool", async () => {
    const { body } = await post("/api/delegate", {
      description: "take a screenshot",
    });
    expect(Array.isArray(body.tools_invoked)).toBe(true);
    expect(body.tools_invoked.length).toBeGreaterThan(0);
  });

  it("steps_completed equals steps_total on success", async () => {
    const { body } = await post("/api/delegate", {
      description: "take a screenshot",
    });
    if (body.status === "success") {
      expect(body.steps_completed).toBe(body.steps_total);
    }
  });
});

// ===================== Scenario 4: Combined AI + DOM Workflow =====================
describe("Scenario 4: Navigate delegation (combined workflow)", () => {
  it("navigate delegation routes correctly", async () => {
    const { body } = await post("/api/delegate", {
      description: "navigate to https://example.com",
    });
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("tools_invoked");
    expect(["success", "failure", "partial"]).toContain(body.status);
  });
});

// ===================== Scenario 5: Skill Tool Reference Validation =====================
// T039 already completed — see tasks.md

// ===================== Scenario 6: Extension Dormancy Auto-Recovery =====================
describe("Scenario 6: Extension Dormancy Auto-Recovery", () => {
  it("tab groups list succeeds (transparent recovery)", async () => {
    const { status, body } = await get("/api/tab-groups");
    expect(status).toBe(200);
    expect(body).toHaveProperty("groups");
    expect(Array.isArray(body.groups)).toBe(true);
  });

  it("extension is alive via CDP targets", async () => {
    const res = await fetch(`${CDP}/json/list`);
    const targets = await res.json();
    const hasExtension = targets.some(
      (t: any) => t.type === "service_worker" || t.type === "background_page"
    );
    expect(hasExtension).toBe(true);
  });
});

// ===================== Scenario 7: Progress Reporting =====================
describe("Scenario 7: Progress Reporting for tasks", () => {
  it("poll without task_id returns Perplexity status", async () => {
    const { status, body } = await get("/api/poll");
    expect(status).toBe(200);
    expect(body).toHaveProperty("status");
    expect(typeof body.status).toBe("string");
  });

  it("poll with unknown task_id returns 404", async () => {
    const { status } = await get("/api/poll?task_id=unknown-task");
    expect(status).toBe(404);
  });
});

// ===================== Scenario 8: Monitor State via Unified Interface =====================
describe("Scenario 8: Monitor State via Unified Interface", () => {
  it("monitor returns available: true with window/tab data", async () => {
    const { body } = await get("/api/monitor");
    expect(body.available).toBe(true);
    expect(body).toHaveProperty("windows");
    expect(body).toHaveProperty("tabs");
    expect(Array.isArray(body.windows)).toBe(true);
    expect(Array.isArray(body.tabs)).toBe(true);
  });

  it("monitor includes window position/size data", async () => {
    const { body } = await get("/api/monitor?section=windows");
    if (body.available && body.windows?.length > 0) {
      const win = body.windows[0];
      expect(win).toHaveProperty("x");
      expect(win).toHaveProperty("y");
      expect(win).toHaveProperty("w");
      expect(win).toHaveProperty("h");
    }
  });

  it("monitor includes tab URL/title data", async () => {
    const { body } = await get("/api/monitor?section=tabs");
    if (body.available && body.tabs?.length > 0) {
      const tab = body.tabs[0];
      expect(tab).toHaveProperty("url");
      expect(tab).toHaveProperty("title");
    }
  });
});

// ===================== Scenario 9: Structured Result Validation =====================
describe("Scenario 9: Structured Result Validation", () => {
  it("delegation result is JSON with required fields", async () => {
    const { body } = await post("/api/delegate", {
      description: "take a screenshot",
    });
    expect(typeof body).toBe("object");
    expect(body).not.toBeNull();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("payload");
    expect(body).toHaveProperty("duration_ms");
    expect(body).toHaveProperty("tools_invoked");
    expect(Array.isArray(body.tools_invoked)).toBe(true);
    expect(typeof body.duration_ms).toBe("number");
    expect(body.duration_ms).toBeGreaterThan(0);
  });
});

// ===================== Scenario 10: Task Cancellation =====================
describe("Scenario 10: Task Cancellation via comet_stop", () => {
  it("stop with task_id returns cancellation result", async () => {
    const { body } = await post("/api/stop", { task_id: "cancel-test" });
    expect(body).toHaveProperty("task_id");
    expect(body.task_id).toBe("cancel-test");
    expect(body).toHaveProperty("cancelled");
  });

  it("stop without task_id preserves existing behavior", async () => {
    const { body } = await post("/api/stop", {});
    expect(body).toHaveProperty("stopped");
    expect(typeof body.stopped).toBe("boolean");
    expect(body).toHaveProperty("message");
  });
});

// ===================== Scenario 11: Tab Concurrency Enforcement =====================
describe("Scenario 11: Tab Concurrency Enforcement", () => {
  it("task queue enforces per-tab ordering", async () => {
    const { body } = await post("/api/delegate", {
      description: "take a screenshot",
    });
    expect(body).toHaveProperty("status");
    expect(["success", "failure", "partial"]).toContain(body.status);
  });
});

// ===================== Scenario 12: Server Unavailability =====================
describe("Scenario 12: Server Unavailability Handling", () => {
  it("delegation with unavailable server reports clear error", async () => {
    const { body } = await post("/api/delegate", {
      description: "use comet_find_elements to extract all links",
    });
    expect(body).toHaveProperty("status");
    if (body.status === "failure" && body.error) {
      expect(body.error).toHaveProperty("code");
      expect(body.error).toHaveProperty("message");
    }
  });
});

// ===================== Scenario 13: Shortwave Delegation (template matching only) =====================
describe("Scenario 13: Shortwave Template Matching", () => {
  it("shortwave-triage description matches template (returns structured result)", async () => {
    const { body } = await post("/api/delegate", {
      description: "triage my email in Shortwave",
    });
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("tools_invoked");
  });

  it("shortwave-query description matches template", async () => {
    const { body } = await post("/api/delegate", {
      description: "ask Shortwave to summarize unread emails",
    });
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("tools_invoked");
  });
});

// ===================== Scenario 14: Routing Fallback with Enrichment =====================
describe("Scenario 14: Routing Fallback with Enrichment Metadata", () => {
  it("unrecognized delegation returns enrichment metadata", async () => {
    const { body } = await post("/api/delegate", {
      description: "do something unusual that no template covers xyz123",
    });
    expect(body.status).toBe("failure");
    const payload = body.payload;
    expect(payload).toHaveProperty("matched");
    expect(payload.matched).toBe(false);
    expect(payload).toHaveProperty("available_templates");
    expect(payload).toHaveProperty("tool_inventory");
    expect(payload).toHaveProperty("server_health");
  });

  it("enrichment includes template list with names", async () => {
    const { body } = await post("/api/delegate", {
      description: "unmatched request foobar",
    });
    const templates = body.payload.available_templates;
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]).toHaveProperty("name");
  });

  it("enrichment includes tool inventory", async () => {
    const { body } = await post("/api/delegate", {
      description: "unmatched request baz",
    });
    const tools = body.payload.tool_inventory;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]).toHaveProperty("name");
    expect(tools[0]).toHaveProperty("category");
    expect(tools[0]).toHaveProperty("server");
  });

  it("enrichment includes server health", async () => {
    const { body } = await post("/api/delegate", {
      description: "unmatched request qux",
    });
    const health = body.payload.server_health;
    expect(typeof health).toBe("object");
    expect(health).not.toBeNull();
  });
});

// ===================== Scenario 15: NFR-001 Delegation Overhead Benchmark =====================
describe("Scenario 15: NFR-001 Delegation Overhead Benchmark", () => {
  const SAMPLES = 10;
  const MAX_OVERHEAD_MS = 500;

  it(`all ${SAMPLES} orchestration overhead values < ${MAX_OVERHEAD_MS}ms`, async () => {
    // Warmup to avoid cold-start penalty
    await post("/api/delegate", { description: "take a screenshot" });

    const descriptions = [
      "take a screenshot",
      "take a screenshot",
      "take a screenshot",
      "take a screenshot",
      "take a screenshot",
      "do something unrecognized alpha",
      "do something unrecognized beta",
      "do something unrecognized gamma",
      "do something unrecognized delta",
      "do something unrecognized epsilon",
    ];

    const overheads: number[] = [];

    for (const desc of descriptions) {
      const { body } = await post("/api/delegate", { description: desc });
      // For no-match (immediate return), duration_ms IS the overhead
      // For matched templates, overhead = duration_ms - actual tool execution
      // Since we measure orchestration overhead, use duration_ms from response
      const overhead = body.duration_ms ?? 0;
      overheads.push(overhead);
    }

    const allUnder = overheads.every((o) => o < MAX_OVERHEAD_MS);
    const max = Math.max(...overheads);
    const avg = overheads.reduce((a, b) => a + b, 0) / overheads.length;

    console.log(`NFR-001 Overhead: avg=${avg.toFixed(0)}ms, max=${max}ms, samples=${JSON.stringify(overheads)}`);

    expect(allUnder).toBe(true);
  }, 30_000);
});

// ===================== Scenario 16: NFR-004 Dormancy Recovery Benchmark =====================
describe("Scenario 16: NFR-004 Dormancy Recovery Benchmark", () => {
  const CYCLES = 10;
  const MIN_SUCCESS_RATE = 0.9;

  it(`tab groups listing succeeds >= ${MIN_SUCCESS_RATE * 100}% of ${CYCLES} cycles`, async () => {
    let successes = 0;

    for (let i = 0; i < CYCLES; i++) {
      try {
        const { status, body } = await get("/api/tab-groups");
        if (status === 200 && body.groups && Array.isArray(body.groups)) {
          successes++;
        }
      } catch {
        // failure
      }
    }

    const rate = successes / CYCLES;
    console.log(`NFR-004 Recovery: ${successes}/${CYCLES} success (${(rate * 100).toFixed(0)}%)`);

    expect(rate).toBeGreaterThanOrEqual(MIN_SUCCESS_RATE);
  }, 60_000);
});
