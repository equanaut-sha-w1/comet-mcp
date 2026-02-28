import type { TaskDelegation } from "./types.js";

const GLOBAL_KEY = "__global__";

export class TaskQueue {
  private queues = new Map<string, TaskDelegation[]>();
  private activeTasks = new Map<string, TaskDelegation>();
  private taskRegistry = new Map<string, TaskDelegation>();

  private tabKey(tabId: string | null): string {
    return tabId ?? GLOBAL_KEY;
  }

  enqueue(task: TaskDelegation): void {
    const key = this.tabKey(task.targetTabId);
    if (!this.queues.has(key)) this.queues.set(key, []);
    this.queues.get(key)!.push(task);
    this.taskRegistry.set(task.id, task);
  }

  dequeue(tabId: string): TaskDelegation | null {
    const active = this.activeTasks.get(tabId);
    if (active && active.state === "running") return null;
    if (active) this.activeTasks.delete(tabId);

    const pending = this.queues.get(tabId);
    if (!pending || pending.length === 0) return null;

    const task = pending.shift()!;
    task.state = "running";
    task.startedAt = Date.now();
    this.activeTasks.set(tabId, task);
    return task;
  }

  completeActive(tabId: string): void {
    const active = this.activeTasks.get(tabId);
    if (active) {
      active.state = "completed";
      active.completedAt = Date.now();
      this.activeTasks.delete(tabId);
    }
  }

  getActiveTask(tabId: string): TaskDelegation | null {
    return this.activeTasks.get(tabId) ?? null;
  }

  getQueueDepth(tabId: string): number {
    return this.queues.get(tabId)?.length ?? 0;
  }

  cancel(taskId: string): boolean {
    const task = this.taskRegistry.get(taskId);
    if (!task) return false;

    task.state = "cancelled";
    task.completedAt = Date.now();

    const key = this.tabKey(task.targetTabId);

    const pending = this.queues.get(key);
    if (pending) {
      const idx = pending.indexOf(task);
      if (idx !== -1) pending.splice(idx, 1);
    }

    if (this.activeTasks.get(key) === task) {
      this.activeTasks.delete(key);
    }

    return true;
  }

  getTask(taskId: string): TaskDelegation | null {
    return this.taskRegistry.get(taskId) ?? null;
  }
}
