import { randomUUID } from "node:crypto";
import type {
  TaskDelegation,
  TaskResult,
  TaskError,
  TaskStep,
  HealthCheckResult,
  HealthLevel,
  MonitorState,
  DelegateEnrichmentResponse,
  TemplateSuggestion,
  TaskTemplate,
} from "./types.js";
import { ToolRouter } from "./tool-router.js";
import { TaskQueue } from "./task-queue.js";
import { TaskTemplateRegistry, extractParamsForTemplate } from "./task-templates.js";
import { HealthChecker } from "./health.js";
import { MonitorProxy } from "./monitor-proxy.js";
import { DormancyManager } from "./dormancy.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const TAB_GROUP_TOOLS = new Set(["comet_tab_groups", "comet_group_tabs", "comet_ungroup_tabs"]);

class AsyncMutex {
  private locked = false;
  private waiters: (() => void)[] = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.locked = false;
  }
}

interface ICometOrchestrator {
  initialize(): Promise<void>;
  health(force?: boolean): Promise<HealthCheckResult>;
  delegate(
    description: string,
    options?: {
      targetTab?: string;
      timeout_ms?: number;
      async?: boolean;
      template?: string;
    },
  ): Promise<TaskResult>;
  getMonitorState(section?: "windows" | "tabs" | "all"): Promise<MonitorState>;
  getTaskStatus(taskId: string): TaskDelegation | null;
  cancelTask(taskId: string): boolean;
}

export interface OrchestratorDeps {
  toolRouter: ToolRouter;
  taskQueue: TaskQueue;
  templateRegistry: TaskTemplateRegistry;
  healthChecker: HealthChecker;
  monitorProxy: MonitorProxy;
  dormancyManager: DormancyManager;
  localToolHandler: (name: string, params: Record<string, unknown>) => Promise<unknown>;
}

function keywordOverlap(description: string, template: TaskTemplate): number {
  const descWords = new Set(description.toLowerCase().split(/\s+/));
  let hits = 0;
  let total = 0;
  for (const pattern of template.triggerPatterns) {
    const words = pattern.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (/^https\?/.test(w)) continue; // skip regex URL fragments
      total++;
      if (descWords.has(w)) hits++;
    }
  }
  return total === 0 ? 0 : hits / total;
}

function buildTaskSteps(
  template: TaskTemplate,
  extracted: Record<string, unknown>,
): TaskStep[] {
  return template.steps.map((s) => {
    const params = { ...s.paramTemplate };

    switch (s.toolName) {
      case "comet_ask":
        if (extracted.prompt && !params.prompt) params.prompt = extracted.prompt;
        break;
      case "comet_navigate":
        if (extracted.url && !params.url) params.url = extracted.url;
        break;
      case "comet_type":
        if (extracted.query && !params.text) params.text = extracted.query;
        if (extracted.promptCommand && !params.text) params.text = extracted.promptCommand;
        break;
      case "comet_get_content":
        if (extracted.extractionTarget && !params.selector) {
          params.extractionHint = extracted.extractionTarget;
        }
        break;
      case "comet_find_elements":
        if (extracted.target && !params.selector) params.selector = extracted.target;
        break;
      case "comet_click":
        if (extracted.target && !params.selector) params.selector = extracted.target;
        break;
    }

    return {
      toolName: s.toolName,
      server: s.server,
      params,
      result: null,
      status: "pending" as const,
      duration_ms: null,
    };
  });
}

function failureResult(code: string, message: string, payload?: unknown): TaskResult {
  return {
    status: "failure",
    payload: payload ?? null,
    duration_ms: 0,
    tools_invoked: [],
    steps_completed: 0,
    steps_total: 0,
    error: { code, message, recoverable: false },
  };
}

export class CometOrchestrator implements ICometOrchestrator {
  private toolRouter: ToolRouter;
  private taskQueue: TaskQueue;
  private templateRegistry: TaskTemplateRegistry;
  private healthChecker: HealthChecker;
  private monitorProxy: MonitorProxy;
  private dormancyManager: DormancyManager;
  private localToolHandler: OrchestratorDeps["localToolHandler"];

  private ready = false;
  private cometMutex = new AsyncMutex();

  constructor(deps: OrchestratorDeps) {
    this.toolRouter = deps.toolRouter;
    this.taskQueue = deps.taskQueue;
    this.templateRegistry = deps.templateRegistry;
    this.healthChecker = deps.healthChecker;
    this.monitorProxy = deps.monitorProxy;
    this.dormancyManager = deps.dormancyManager;
    this.localToolHandler = deps.localToolHandler;
  }

  async initialize(): Promise<void> {
    await this.toolRouter.initialize();
    this.ready = true;
  }

  health(force?: boolean): Promise<HealthCheckResult> {
    return this.healthChecker.check(force);
  }

  async delegate(
    description: string,
    options?: {
      targetTab?: string;
      timeout_ms?: number;
      async?: boolean;
      template?: string;
    },
  ): Promise<TaskResult> {
    let template: TaskTemplate | null = null;

    if (options?.template) {
      template = this.templateRegistry.get(options.template);
      if (!template) {
        return failureResult(
          "INVALID_TEMPLATE",
          `Template "${options.template}" not found`,
        );
      }
    } else {
      template = this.templateRegistry.match(description);
      if (!template) {
        return this.buildEnrichmentFallback(description);
      }
    }

    const extracted = extractParamsForTemplate(description, template);

    const task: TaskDelegation = {
      id: randomUUID(),
      description,
      state: "pending",
      targetTabId: options?.targetTab ?? null,
      steps: buildTaskSteps(template, extracted),
      currentStepIndex: 0,
      timeout_ms: options?.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      startedAt: null,
      completedAt: null,
    };

    this.taskQueue.enqueue(task);

    if (options?.async) {
      return {
        status: "pending" as TaskResult["status"],
        payload: { taskId: task.id },
        duration_ms: 0,
        tools_invoked: [],
        steps_completed: 0,
        steps_total: task.steps.length,
      };
    }

    return this.executeTask(task);
  }

  getMonitorState(section?: "windows" | "tabs" | "all"): Promise<MonitorState> {
    return this.monitorProxy.getState(section);
  }

  getTaskStatus(taskId: string): TaskDelegation | null {
    return this.taskQueue.getTask(taskId);
  }

  cancelTask(taskId: string): boolean {
    return this.taskQueue.cancel(taskId);
  }

  // ── Private ──────────────────────────────────────────────────────

  private async buildEnrichmentFallback(description: string): Promise<TaskResult> {
    const templates = this.templateRegistry.getAll();
    const available_templates: TemplateSuggestion[] = templates.map((t) => ({
      name: t.name,
      description: t.description,
      confidence: keywordOverlap(description, t),
    }));

    const inventory = this.toolRouter.getInventory();
    const tool_inventory = inventory.map((t) => ({
      name: t.name,
      category: t.category as string,
      server: t.server as string,
    }));

    const cached = this.healthChecker.getCached();
    let server_health: Record<string, HealthLevel>;
    if (cached) {
      server_health = Object.fromEntries(
        Object.entries(cached.components).map(([k, v]) => [k, v.status]),
      );
    } else {
      const live = await this.healthChecker.check();
      server_health = Object.fromEntries(
        Object.entries(live.components).map(([k, v]) => [k, v.status]),
      );
    }

    const enrichment: DelegateEnrichmentResponse = {
      matched: false,
      description,
      available_templates,
      tool_inventory,
      server_health,
    };

    return {
      status: "failure",
      payload: enrichment,
      duration_ms: 0,
      tools_invoked: [],
      steps_completed: 0,
      steps_total: 0,
      error: {
        code: "NO_TEMPLATE_MATCH",
        message: "No template matched the description. See payload for enrichment data.",
        recoverable: true,
      },
    };
  }

  private async executeTask(task: TaskDelegation): Promise<TaskResult> {
    task.state = "running";
    task.startedAt = Date.now();

    const toolsInvoked: string[] = [];
    let lastResult: unknown = null;
    const deadline = task.startedAt + task.timeout_ms;

    for (let i = 0; i < task.steps.length; i++) {
      if (Date.now() >= deadline) {
        task.state = "completed";
        task.completedAt = Date.now();
        return {
          status: "partial",
          payload: lastResult,
          duration_ms: Date.now() - task.startedAt,
          tools_invoked: toolsInvoked,
          steps_completed: i,
          steps_total: task.steps.length,
          error: {
            code: "TIMEOUT",
            message: `Task timed out after ${task.timeout_ms}ms`,
            recoverable: false,
            failedStep: i,
          },
        };
      }

      const step = task.steps[i];
      task.currentStepIndex = i;
      step.status = "running";

      try {
        if (TAB_GROUP_TOOLS.has(step.toolName)) {
          const alive = await this.dormancyManager.isExtensionAlive();
          if (!alive) await this.dormancyManager.wake();
        }

        const stepStart = Date.now();
        let result: unknown;

        if (step.server === "comet-mcp") {
          await this.cometMutex.acquire();
          try {
            result = await this.localToolHandler(step.toolName, step.params);
          } finally {
            this.cometMutex.release();
          }
        } else {
          const toolResult = await this.toolRouter.invoke(step.toolName, step.params);
          if (!toolResult.success) {
            throw new Error(toolResult.error ?? `Tool ${step.toolName} failed`);
          }
          result = toolResult.data;
        }

        step.duration_ms = Date.now() - stepStart;
        step.result = result;
        step.status = "completed";
        lastResult = result;
        toolsInvoked.push(step.toolName);
      } catch (err) {
        step.status = "failed";
        step.duration_ms = step.duration_ms ?? Date.now() - (task.startedAt + (step.duration_ms ?? 0));
        step.result = err instanceof Error ? err.message : String(err);

        const isOptional = this.isOptionalStep(task, i);
        if (isOptional) {
          step.status = "skipped";
          toolsInvoked.push(step.toolName);
          continue;
        }

        task.state = "failed";
        task.completedAt = Date.now();
        return {
          status: "failure",
          payload: lastResult,
          duration_ms: Date.now() - task.startedAt,
          tools_invoked: toolsInvoked,
          steps_completed: i,
          steps_total: task.steps.length,
          error: {
            code: "STEP_FAILED",
            message: err instanceof Error ? err.message : String(err),
            recoverable: false,
            failedStep: i,
          },
        };
      }
    }

    task.state = "completed";
    task.completedAt = Date.now();

    const tabKey = task.targetTabId ?? "__global__";
    this.taskQueue.completeActive(tabKey);

    return {
      status: "success",
      payload: lastResult,
      duration_ms: Date.now() - task.startedAt,
      tools_invoked: toolsInvoked,
      steps_completed: task.steps.length,
      steps_total: task.steps.length,
    };
  }

  private isOptionalStep(task: TaskDelegation, stepIndex: number): boolean {
    const template = this.templateRegistry.match(task.description);
    if (!template) return false;
    return template.steps[stepIndex]?.optional === true;
  }
}
