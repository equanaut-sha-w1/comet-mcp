import { spawn, ChildProcess } from "child_process";
import { homedir } from "os";
import { existsSync } from "fs";
import { join } from "path";
import { createInterface, Interface as ReadlineInterface } from "readline";
import type { ToolDescriptor, ToolResult, ServerName } from "./types.js";

// ─── Configuration ───────────────────────────────────────────────
//
// COMET_BROWSER_SERVER_PATH — absolute path to the Python MCP server entry point.
//   Default: ~/Documents/repos/skills/comet-browser/mcp-server/server.py
//
// COMET_PYTHON_PATH — python executable to use.
//   Default: python3

const DEFAULT_SERVER_PATH = join(
  homedir(),
  "Documents",
  "repos",
  "skills",
  "comet-browser",
  "mcp-server",
  "server.py",
);

const DEFAULT_PYTHON = "python3";

function resolveServerPath(): string {
  return process.env.COMET_BROWSER_SERVER_PATH || DEFAULT_SERVER_PATH;
}

function resolvePythonPath(): string {
  return process.env.COMET_PYTHON_PATH || DEFAULT_PYTHON;
}

// ─── MCP JSON-RPC helpers ────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── PythonBridge ────────────────────────────────────────────────

const CALL_TIMEOUT_MS = 30_000;
const RESTART_DELAY_MS = 1_000;
const MAX_RESTART_ATTEMPTS = 3;

export class PythonBridge {
  private proc: ChildProcess | null = null;
  private rl: ReadlineInterface | null = null;
  private nextId = 1;
  private pending = new Map<number, {
    resolve: (v: JsonRpcResponse) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private restartCount = 0;
  private _starting = false;
  private _initialized = false;
  private toolCache: ToolDescriptor[] | null = null;
  private stderrBuffer: string[] = [];

  async start(): Promise<void> {
    if (this.proc && !this.proc.killed) return;
    if (this._starting) return;
    this._starting = true;

    const serverPath = resolveServerPath();
    const pythonPath = resolvePythonPath();

    if (!existsSync(serverPath)) {
      this._starting = false;
      throw new Error(
        `Python MCP server not found at: ${serverPath}\n` +
        `Set COMET_BROWSER_SERVER_PATH to the correct path, or ensure the skills repo is cloned at ~/Documents/repos/skills/`,
      );
    }

    try {
      this.proc = spawn(pythonPath, [serverPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      this.proc.on("exit", (code, signal) => {
        this.cleanup();
        if (code !== 0 && code !== null && this.restartCount < MAX_RESTART_ATTEMPTS) {
          this.restartCount++;
          setTimeout(() => this.start(), RESTART_DELAY_MS);
        }
      });

      this.proc.on("error", (err) => {
        this.rejectAllPending(new Error(`Python bridge process error: ${err.message}`));
        this.cleanup();
      });

      if (this.proc.stderr) {
        const stderrRl = createInterface({ input: this.proc.stderr });
        stderrRl.on("line", (line) => {
          this.stderrBuffer.push(line);
          if (this.stderrBuffer.length > 50) this.stderrBuffer.shift();
        });
      }

      if (!this.proc.stdout) {
        throw new Error("Failed to get stdout from Python MCP server process");
      }

      this.rl = createInterface({ input: this.proc.stdout });
      this.rl.on("line", (line) => this.handleLine(line));

      await this.sendInitialize();
      this.restartCount = 0;
      this._initialized = true;
    } finally {
      this._starting = false;
    }
  }

  async stop(): Promise<void> {
    this.rejectAllPending(new Error("PythonBridge stopping"));
    this.toolCache = null;
    this._initialized = false;

    if (this.proc && !this.proc.killed) {
      this.proc.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (this.proc && !this.proc.killed) this.proc.kill("SIGKILL");
          resolve();
        }, 3000);
        this.proc!.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.cleanup();
  }

  isRunning(): boolean {
    return this.proc !== null && !this.proc.killed && this._initialized;
  }

  async listTools(): Promise<ToolDescriptor[]> {
    if (this.toolCache) return this.toolCache;
    if (!this.isRunning()) await this.start();

    const resp = await this.rpcCall("tools/list", {});
    const rawTools = (resp.result as { tools?: unknown[] })?.tools ?? [];

    this.toolCache = rawTools.map((t: unknown) => {
      const tool = t as { name: string; description?: string; inputSchema?: Record<string, unknown> };
      return {
        name: tool.name,
        qualifiedName: `browser:${tool.name}`,
        server: "comet-browser" as ServerName,
        category: categorizeTool(tool.name),
        schema: tool.inputSchema ?? {},
        description: tool.description ?? "",
        isCanonical: true,
      };
    });

    return this.toolCache!;
  }

  async callTool(
    name: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!this.isRunning()) await this.start();

    const startMs = Date.now();
    try {
      const resp = await this.rpcCall("tools/call", { name, arguments: params });

      if (resp.error) {
        return {
          toolName: name,
          server: "comet-browser" as ServerName,
          success: false,
          data: null,
          duration_ms: Date.now() - startMs,
          error: resp.error.message,
        };
      }

      return {
        toolName: name,
        server: "comet-browser" as ServerName,
        success: true,
        data: resp.result,
        duration_ms: Date.now() - startMs,
      };
    } catch (err) {
      return {
        toolName: name,
        server: "comet-browser" as ServerName,
        success: false,
        data: null,
        duration_ms: Date.now() - startMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  getRecentStderr(): string[] {
    return [...this.stderrBuffer];
  }

  // ─── Internal ────────────────────────────────────────────────

  private async sendInitialize(): Promise<void> {
    const resp = await this.rpcCall("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "comet-mcp-python-bridge", version: "1.0.0" },
    });

    if (resp.error) {
      throw new Error(`MCP initialize failed: ${resp.error.message}`);
    }

    await this.rpcNotify("notifications/initialized", {});
  }

  private rpcCall(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = CALL_TIMEOUT_MS,
  ): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin || this.proc.killed) {
        return reject(new Error("Python bridge process not available"));
      }

      const id = this.nextId++;
      const msg: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC call ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const data = JSON.stringify(msg) + "\n";
      this.proc.stdin.write(data, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new Error(`Failed to write to Python bridge stdin: ${err.message}`));
        }
      });
    });
  }

  private rpcNotify(
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin || this.proc.killed) {
        return reject(new Error("Python bridge process not available"));
      }

      const msg = { jsonrpc: "2.0", method, params };
      const data = JSON.stringify(msg) + "\n";
      this.proc.stdin.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: JsonRpcResponse;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (parsed.id === undefined || parsed.id === null) return;

    const entry = this.pending.get(parsed.id);
    if (!entry) return;

    clearTimeout(entry.timer);
    this.pending.delete(parsed.id);
    entry.resolve(parsed);
  }

  private rejectAllPending(err: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }

  private cleanup(): void {
    this.rl?.close();
    this.rl = null;
    this.proc = null;
    this._initialized = false;
  }
}

// ─── Tool categorization ─────────────────────────────────────────

type ToolCategory = "ai" | "dom" | "tab" | "monitor" | "meta";

const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  comet_connect: "meta",
  comet_navigate: "dom",
  comet_click: "dom",
  comet_type: "dom",
  comet_screenshot: "monitor",
  comet_get_content: "dom",
  comet_evaluate: "dom",
  comet_list_tabs: "tab",
  comet_switch_tab: "tab",
  comet_scroll: "dom",
  comet_wait: "dom",
  comet_find_elements: "dom",
};

function categorizeTool(name: string): ToolCategory {
  return TOOL_CATEGORY_MAP[name] ?? "dom";
}

export const pythonBridge = new PythonBridge();
