import { describe, it, expect } from "vitest";

interface StopInput {
  task_id?: string;
}

interface StopOutput {
  success: boolean;
  task_state?: "cancelled" | "completed" | "failed";
  message?: string;
}

const VALID_TASK_STATES = ["cancelled", "completed", "failed"] as const;

async function callStopTool(input: StopInput): Promise<StopOutput> {
  throw new Error("not implemented");
}

describe("comet_stop extended contract", () => {
  it("success boolean is required", async () => {
    const output = await callStopTool({});
    expect(typeof output.success).toBe("boolean");
  });

  it("task_state is valid enum when present", async () => {
    const output = await callStopTool({ task_id: "test-task" });
    if (output.task_state !== undefined) {
      expect(VALID_TASK_STATES).toContain(output.task_state);
    }
  });

  it("existing behavior preserved when task_id omitted", async () => {
    const output = await callStopTool({});
    expect(output).toHaveProperty("success");
    expect(typeof output.success).toBe("boolean");
  });
});
