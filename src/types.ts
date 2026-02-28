// Type definitions for CDP client and Comet MCP Server

export interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
  devtoolsFrontendUrl?: string;
}

export interface CDPVersion {
  Browser: string;
  "Protocol-Version": string;
  "User-Agent": string;
  "V8-Version": string;
  "WebKit-Version": string;
  webSocketDebuggerUrl: string;
}

export interface NavigateResult {
  frameId: string;
  loaderId?: string;
  errorText?: string;
}

export interface ScreenshotResult {
  data: string; // Base64 encoded
}

export interface EvaluateResult {
  result: {
    type: string;
    value?: unknown;
    description?: string;
    objectId?: string;
  };
  exceptionDetails?: {
    text: string;
    exception?: {
      description?: string;
    };
  };
}

export interface CometState {
  connected: boolean;
  port: number;
  currentUrl?: string;
  activeTabId?: string;
}

// ─── Unified Orchestration Types ─────────────────────────────────
// Canonical definitions for the orchestration layer.
// MCP-boundary types (tool-schemas.ts) re-export from here.

export type ServerName = "comet-mcp" | "comet-browser";
export type ServerAlias = "mcp" | "browser";
export type ToolCategory = "ai" | "dom" | "tab" | "monitor" | "meta";
export type TaskState = "pending" | "running" | "completed" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type HealthLevel = "healthy" | "unreachable" | "degraded" | "unknown";
export type ComponentName = "browser" | "comet-mcp" | "comet-monitor" | "extension";

export const SERVER_ALIAS_MAP: Record<ServerAlias, ServerName> = {
  mcp: "comet-mcp",
  browser: "comet-browser",
};

export const SERVER_NAME_TO_ALIAS: Record<ServerName, ServerAlias> = {
  "comet-mcp": "mcp",
  "comet-browser": "browser",
};

export const TOOL_COLLISIONS: Record<string, ServerName> = {
  comet_connect: "comet-mcp",
  comet_screenshot: "comet-mcp",
};

export interface ToolDescriptor {
  name: string;
  qualifiedName: string;
  server: ServerName;
  category: ToolCategory;
  schema: Record<string, unknown>;
  description: string;
  isCanonical: boolean;
}

export interface ToolInvocation {
  toolName: string;
  params: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  server: ServerName;
  success: boolean;
  data: unknown;
  duration_ms: number;
  error?: string;
}

// ─── Task Queue & Delegation ────────────────────────────────────

export interface TaskStep {
  toolName: string;
  server: ServerName;
  params: Record<string, unknown>;
  result: unknown | null;
  status: StepStatus;
  duration_ms: number | null;
}

export interface TaskDelegation {
  id: string;
  description: string;
  state: TaskState;
  targetTabId: string | null;
  steps: TaskStep[];
  currentStepIndex: number;
  timeout_ms: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface TaskResult {
  status: "success" | "failure" | "partial" | "cancelled";
  payload: unknown;
  duration_ms: number;
  tools_invoked: string[];
  steps_completed: number;
  steps_total: number;
  error?: TaskError;
}

export interface TaskError {
  code: string;
  message: string;
  recoverable: boolean;
  failedStep?: number;
}

// ─── Health ─────────────────────────────────────────────────────

export interface ComponentHealthResult {
  name: ComponentName;
  status: HealthLevel;
  reason: string | null;
  latency_ms: number | null;
}

export interface HealthCheckResult {
  overall: "healthy" | "degraded" | "down";
  components: Record<string, ComponentHealthResult>;
  checkedAt: number;
  duration_ms: number;
}

// ─── Dormancy ───────────────────────────────────────────────────

export interface WakeResult {
  success: boolean;
  technique: "page_target" | "management_toggle" | "none";
  attempts: number;
  duration_ms: number;
  error?: string;
}

// ─── Monitor ────────────────────────────────────────────────────

export interface MonitorState {
  available: boolean;
  reason?: string;
  timestamp?: string;
  windows?: Array<{
    index: number;
    title: string;
    x: number;
    y: number;
    w: number;
    h: number;
    display: string;
    fullscreen: boolean;
  }>;
  window_count?: number;
  tabs?: Array<{
    id: string;
    title: string;
    url: string;
    type: string;
  }>;
  tab_count?: number;
}

// ─── Task Templates ─────────────────────────────────────────────

export interface TaskTemplateStep {
  toolName: string;
  server: ServerName;
  paramTemplate: Record<string, unknown>;
  description: string;
  optional?: boolean;
}

export interface TaskTemplate {
  name: string;
  description: string;
  triggerPatterns: string[];
  defaultParams: Record<string, unknown>;
  steps: TaskTemplateStep[];
}

// ─── Delegate Enrichment (no-match fallback per NC-7) ───────────

export interface TemplateSuggestion {
  name: string;
  description: string;
  confidence: number;
}

export interface DelegateEnrichmentResponse {
  matched: false;
  description: string;
  available_templates: TemplateSuggestion[];
  tool_inventory: Array<{ name: string; category: string; server: string }>;
  server_health: Record<string, HealthLevel>;
}

// ---- Tab Groups (via extension service worker) ----

export type TabGroupColor =
  | "grey"
  | "blue"
  | "red"
  | "yellow"
  | "green"
  | "pink"
  | "purple"
  | "cyan"
  | "orange";

export interface TabGroup {
  id: number;
  collapsed: boolean;
  color: TabGroupColor;
  title: string;
  windowId: number;
}

export interface TabInfo {
  id: number;
  groupId: number; // -1 if ungrouped
  windowId: number;
  index: number;
  title: string;
  url: string;
  active: boolean;
}
