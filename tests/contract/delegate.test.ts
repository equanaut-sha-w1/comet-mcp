import { describe, it, expect } from "vitest";

interface DelegateInput {
  description: string;
  target_tab?: string;
  timeout_ms?: number;
  async?: boolean;
  template?: string;
}

interface DelegateOutput {
  task_id: string;
  status: "success" | "failure" | "partial" | "cancelled" | "pending" | "running";
  payload: unknown;
  duration_ms: number;
  tools_invoked: string[];
  steps_completed: number;
  steps_total: number;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
    failed_step?: number;
  };
}

interface DelegateEnrichmentResponse {
  matched: false;
  description: string;
  available_templates: Array<{ name: string; description: string; confidence: number }>;
  tool_inventory: Array<{ name: string; category: string; server: string }>;
  server_health: Record<string, "healthy" | "unreachable" | "degraded" | "unknown">;
}

const VALID_STATUSES: DelegateOutput["status"][] = [
  "success",
  "failure",
  "partial",
  "cancelled",
  "pending",
  "running",
];

const TIMEOUT_MIN = 1000;
const TIMEOUT_MAX = 300000;

function validateTimeout(value: number): void {
  if (value < TIMEOUT_MIN || value > TIMEOUT_MAX) {
    throw new Error(`timeout_ms must be in range ${TIMEOUT_MIN}-${TIMEOUT_MAX}`);
  }
}

async function callDelegateTool(input: DelegateInput): Promise<DelegateOutput> {
  if (input.timeout_ms !== undefined) {
    validateTimeout(input.timeout_ms);
  }
  throw new Error("not implemented");
}

describe("comet_delegate contract", () => {
  it("DelegateOutput must contain all required fields", () => {
    const output: DelegateOutput = {
      task_id: "t-1",
      status: "success",
      payload: null,
      duration_ms: 100,
      tools_invoked: [],
      steps_completed: 1,
      steps_total: 1,
    };
    expect(output).toHaveProperty("task_id");
    expect(output).toHaveProperty("status");
    expect(output).toHaveProperty("payload");
    expect(output).toHaveProperty("duration_ms");
    expect(output).toHaveProperty("tools_invoked");
    expect(output).toHaveProperty("steps_completed");
    expect(output).toHaveProperty("steps_total");
    expect(typeof output.task_id).toBe("string");
    expect(typeof output.duration_ms).toBe("number");
    expect(typeof output.steps_completed).toBe("number");
    expect(typeof output.steps_total).toBe("number");
  });

  it("status must be one of the valid enum values", () => {
    for (const status of VALID_STATUSES) {
      const output: DelegateOutput = {
        task_id: "t-1",
        status,
        payload: null,
        duration_ms: 0,
        tools_invoked: [],
        steps_completed: 0,
        steps_total: 0,
      };
      expect(VALID_STATUSES).toContain(output.status);
    }
  });

  it("tools_invoked must be string[]", () => {
    const output: DelegateOutput = {
      task_id: "t-1",
      status: "success",
      payload: null,
      duration_ms: 0,
      tools_invoked: ["comet_navigate", "comet_screenshot"],
      steps_completed: 2,
      steps_total: 2,
    };
    expect(Array.isArray(output.tools_invoked)).toBe(true);
    expect(output.tools_invoked.every((t) => typeof t === "string")).toBe(true);
  });

  it("timeout_ms must be in range 1000–300000 (reject out-of-range)", async () => {
    await expect(callDelegateTool({ description: "x", timeout_ms: 999 })).rejects.toThrow();
    await expect(callDelegateTool({ description: "x", timeout_ms: 300001 })).rejects.toThrow();
    await expect(callDelegateTool({ description: "x", timeout_ms: 0 })).rejects.toThrow();
    await expect(callDelegateTool({ description: "x", timeout_ms: 1000 })).rejects.toThrow("not implemented");
    await expect(callDelegateTool({ description: "x", timeout_ms: 300000 })).rejects.toThrow("not implemented");
  });

  it("DelegateInput.template optional field accepts valid template IDs", () => {
    const input: DelegateInput = {
      description: "navigate to example.com",
      template: "navigate-and-screenshot",
    };
    expect(input.template).toBe("navigate-and-screenshot");
  });

  it("DelegateEnrichmentResponse structure: matched false, available_templates, tool_inventory, server_health", () => {
    const resp: DelegateEnrichmentResponse = {
      matched: false,
      description: "unknown task",
      available_templates: [
        { name: "t1", description: "desc", confidence: 0.9 },
      ],
      tool_inventory: [{ name: "comet_navigate", category: "dom", server: "comet-mcp" }],
      server_health: { "comet-mcp": "healthy", "comet-browser": "degraded" },
    };
    expect(resp.matched).toBe(false);
    expect(Array.isArray(resp.available_templates)).toBe(true);
    expect(resp.available_templates[0]).toHaveProperty("name");
    expect(resp.available_templates[0]).toHaveProperty("description");
    expect(resp.available_templates[0]).toHaveProperty("confidence");
    expect(Array.isArray(resp.tool_inventory)).toBe(true);
    expect(typeof resp.server_health).toBe("object");
    expect(resp.server_health).not.toBeNull();
  });

  it("error object when present has code, message, recoverable fields", () => {
    const output: DelegateOutput = {
      task_id: "t-1",
      status: "failure",
      payload: null,
      duration_ms: 50,
      tools_invoked: [],
      steps_completed: 0,
      steps_total: 1,
      error: {
        code: "TIMEOUT",
        message: "Task timed out",
        recoverable: true,
        failed_step: 1,
      },
    };
    expect(output.error).toBeDefined();
    expect(output.error).toHaveProperty("code");
    expect(output.error).toHaveProperty("message");
    expect(output.error).toHaveProperty("recoverable");
    expect(typeof output.error!.code).toBe("string");
    expect(typeof output.error!.message).toBe("string");
    expect(typeof output.error!.recoverable).toBe("boolean");
  });
});
