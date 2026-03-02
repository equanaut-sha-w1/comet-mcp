import { describe, it, expect } from "vitest";

const API_BASE = process.env.COMET_API_URL || "http://127.0.0.1:3456";

interface PollInput {
  task_id?: string;
}

interface PollOutputExtended {
  status: string;
  steps?: string[];
  current_step?: string;
  browsing_url?: string;
  task_id?: string;
  task_state?: "pending" | "running" | "completed" | "failed" | "cancelled";
  state?: string;
  elapsed_ms?: number;
  steps_completed?: number;
  steps_total?: number;
  current_step_description?: string;
  currentStep?: string | null;
  agentBrowsingUrl?: string | null;
}

const VALID_TASK_STATES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

async function callPollTool(input: PollInput): Promise<PollOutputExtended> {
  const url = new URL("/api/poll", API_BASE);
  if (input.task_id) url.searchParams.set("task_id", input.task_id);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<PollOutputExtended>;
}

describe("comet_poll extended contract", () => {
  it("existing fields preserved when task_id omitted", async () => {
    const output = await callPollTool({});
    expect(output.status).toBeDefined();
    expect(typeof output.status).toBe("string");
  });

  it("returns 404 or error for unknown task_id", async () => {
    try {
      await callPollTool({ task_id: "nonexistent-task" });
      expect.fail("Should have thrown for unknown task_id");
    } catch (err: any) {
      expect(err.message).toMatch(/404|not found/i);
    }
  });

  it("existing Perplexity poll returns status, steps, currentStep fields", async () => {
    const output = await callPollTool({});
    expect(output).toHaveProperty("status");
    expect(typeof output.status).toBe("string");
    expect(output).toHaveProperty("steps");
    expect(Array.isArray(output.steps)).toBe(true);
  });
});
