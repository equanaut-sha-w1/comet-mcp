import { describe, it, expect } from "vitest";

const API_BASE = process.env.COMET_API_URL || "http://127.0.0.1:3456";

interface StopInput {
  task_id?: string;
}

interface StopOutput {
  stopped?: boolean;
  success?: boolean;
  cancelled?: boolean;
  task_id?: string;
  task_state?: "cancelled" | "completed" | "failed";
  message?: string;
}

const VALID_TASK_STATES = ["cancelled", "completed", "failed"] as const;

async function callStopTool(input: StopInput): Promise<StopOutput> {
  const url = new URL("/api/stop", API_BASE);
  const body: Record<string, unknown> = {};
  if (input.task_id) body.task_id = input.task_id;
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<StopOutput>;
}

describe("comet_stop extended contract", () => {
  it("stop response has stopped/success boolean", async () => {
    const output = await callStopTool({});
    const hasBoolean = typeof output.stopped === "boolean" || typeof output.success === "boolean";
    expect(hasBoolean).toBe(true);
  });

  it("task_id cancellation returns task_id and cancelled boolean", async () => {
    const output = await callStopTool({ task_id: "nonexistent-task" });
    expect(output).toHaveProperty("task_id");
    expect(output).toHaveProperty("cancelled");
    expect(typeof output.cancelled).toBe("boolean");
  });

  it("existing behavior preserved when task_id omitted", async () => {
    const output = await callStopTool({});
    expect(output).toHaveProperty("stopped");
    expect(typeof output.stopped).toBe("boolean");
    expect(output).toHaveProperty("message");
  });
});
