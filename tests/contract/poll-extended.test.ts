import { describe, it, expect } from "vitest";

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
  elapsed_ms?: number;
  steps_completed?: number;
  steps_total?: number;
  current_step_description?: string;
}

const VALID_TASK_STATES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

async function callPollTool(input: PollInput): Promise<PollOutputExtended> {
  throw new Error("not implemented");
}

describe("comet_poll extended contract", () => {
  it("existing fields preserved when task_id omitted", async () => {
    const output = await callPollTool({});
    expect(output.status).toBeDefined();
    expect(typeof output.status).toBe("string");
  });

  it("task_state is valid enum when task_id present", async () => {
    const output = await callPollTool({ task_id: "test-task" });
    if (output.task_state !== undefined) {
      expect(VALID_TASK_STATES).toContain(output.task_state);
    }
  });

  it("elapsed_ms is non-negative when present", async () => {
    const output = await callPollTool({ task_id: "test-task" });
    if (output.elapsed_ms !== undefined) {
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    }
  });

  it("steps_completed <= steps_total when both present", async () => {
    const output = await callPollTool({ task_id: "test-task" });
    if (
      output.steps_completed !== undefined &&
      output.steps_total !== undefined
    ) {
      expect(output.steps_completed).toBeLessThanOrEqual(output.steps_total);
    }
  });
});
