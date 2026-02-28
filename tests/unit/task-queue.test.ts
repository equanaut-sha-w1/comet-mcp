import { describe, it, expect, beforeEach } from "vitest";
import { TaskQueue } from "../../src/task-queue.js";
import type { TaskDelegation } from "../../src/types.js";

function makeTask(id: string, tabId: string | null = "tab-1"): TaskDelegation {
  return {
    id,
    description: `test ${id}`,
    state: "pending",
    targetTabId: tabId,
    steps: [],
    currentStepIndex: -1,
    timeout_ms: 60000,
    startedAt: null,
    completedAt: null,
  };
}

describe("TaskQueue", () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  it("enqueues and dequeues in FIFO order", () => {
    const a = makeTask("a");
    const b = makeTask("b");
    const c = makeTask("c");
    queue.enqueue(a);
    queue.enqueue(b);
    queue.enqueue(c);
    expect(queue.dequeue("tab-1")).toBe(a);
    queue.completeActive("tab-1");
    expect(queue.dequeue("tab-1")).toBe(b);
    queue.completeActive("tab-1");
    expect(queue.dequeue("tab-1")).toBe(c);
  });

  it("returns null when dequeuing from empty tab", () => {
    expect(queue.dequeue("unknown-tab")).toBeNull();
  });

  it("tracks active task per tab", () => {
    const t = makeTask("t");
    queue.enqueue(t);
    const active = queue.dequeue("tab-1");
    expect(active).toBe(t);
    expect(queue.getActiveTask("tab-1")).toBe(t);
  });

  it("blocks dequeue when tab has active task", () => {
    const a = makeTask("a");
    const b = makeTask("b");
    queue.enqueue(a);
    queue.enqueue(b);
    expect(queue.dequeue("tab-1")).toBe(a);
    expect(queue.dequeue("tab-1")).toBeNull();
  });

  it("concurrent tab independence", () => {
    const t1 = makeTask("t1", "tab-1");
    const t2 = makeTask("t2", "tab-2");
    queue.enqueue(t1);
    queue.enqueue(t2);
    expect(queue.dequeue("tab-1")).toBe(t1);
    expect(queue.dequeue("tab-2")).toBe(t2);
  });

  it("reports queue depth", () => {
    queue.enqueue(makeTask("a"));
    queue.enqueue(makeTask("b"));
    expect(queue.getQueueDepth("tab-1")).toBe(2);
    queue.dequeue("tab-1");
    expect(queue.getQueueDepth("tab-1")).toBe(1);
  });

  it("cancels a pending task", () => {
    const t = makeTask("t");
    queue.enqueue(t);
    expect(queue.cancel("t")).toBe(true);
    expect(queue.dequeue("tab-1")).toBeNull();
  });

  it("cancels a running task", () => {
    const t = makeTask("t");
    queue.enqueue(t);
    queue.dequeue("tab-1");
    expect(queue.cancel("t")).toBe(true);
    expect(queue.getTask("t")?.state).toBe("cancelled");
  });

  it("returns false for unknown task", () => {
    expect(queue.cancel("nonexistent")).toBe(false);
  });

  it("getTask returns task by ID", () => {
    const t = makeTask("t", "tab-2");
    queue.enqueue(t);
    expect(queue.getTask("t")).toBe(t);
  });

  it("uses __global__ key for non-tab tasks", () => {
    const t = makeTask("global", null);
    queue.enqueue(t);
    expect(queue.dequeue("__global__")).toBe(t);
  });
});
