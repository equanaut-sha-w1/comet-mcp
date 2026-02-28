import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PythonBridge } from "../../src/python-bridge.js";

const mockState = vi.hoisted(() => ({
  lineHandler: null as ((line: string) => void) | null,
}));

vi.mock("readline", () => ({
  createInterface: vi.fn(() => ({
    on: vi.fn((ev: string, fn: (line: string) => void) => {
      if (ev === "line") mockState.lineHandler = fn;
    }),
    close: vi.fn(),
  })),
}));

vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    const respond = (msg: { id?: number; method?: string }, result: unknown) => {
      setImmediate(() => {
        if (mockState.lineHandler) {
          mockState.lineHandler(
            JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }),
          );
        }
      });
    };
    return {
      stdin: {
        write: vi.fn((data: string, cb: (err?: Error) => void) => {
          try {
            const msg = JSON.parse(data);
            if (msg.method === "initialize") {
              respond(msg, { capabilities: {} });
            } else if (msg.method === "tools/list") {
              respond(msg, {
                tools: [
                  {
                    name: "comet_navigate",
                    description: "Navigate",
                    inputSchema: {},
                  },
                ],
              });
            } else if (msg.method === "tools/call") {
              respond(msg, { ok: true });
            }
          } finally {
            cb();
          }
        }),
      },
      stdout: {},
      stderr: null,
      killed: false,
      on: vi.fn(),
      kill: vi.fn(),
    };
  }),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(() => true),
}));

describe("PythonBridge", () => {
  let bridge: PythonBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new PythonBridge();
  });

  afterEach(async () => {
    if (bridge.isRunning()) {
      await bridge.stop();
    }
  });

  it("implements IPythonBridge interface", () => {
    expect(typeof bridge.start).toBe("function");
    expect(typeof bridge.stop).toBe("function");
    expect(typeof bridge.isRunning).toBe("function");
    expect(typeof bridge.callTool).toBe("function");
    expect(typeof bridge.listTools).toBe("function");
  });

  it("isRunning returns false before start", () => {
    expect(bridge.isRunning()).toBe(false);
  });

  it("listTools returns ToolDescriptor array", async () => {
    const tools = await bridge.listTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    const t = tools[0];
    expect(t).toHaveProperty("name");
    expect(t).toHaveProperty("qualifiedName");
    expect(t).toHaveProperty("server");
    expect(t).toHaveProperty("category");
    expect(t).toHaveProperty("schema");
    expect(t).toHaveProperty("description");
    expect(t).toHaveProperty("isCanonical");
    expect(typeof t.name).toBe("string");
    expect(typeof t.qualifiedName).toBe("string");
  });

  it("callTool returns ToolResult shape", async () => {
    const result = await bridge.callTool("comet_navigate", {
      url: "https://example.com",
    });
    expect(result).toHaveProperty("toolName");
    expect(result).toHaveProperty("server");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("duration_ms");
    expect(result.toolName).toBe("comet_navigate");
    expect(typeof result.duration_ms).toBe("number");
  });

  it("handles process not running gracefully", async () => {
    const { existsSync } = await import("fs");
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const freshBridge = new PythonBridge();
    await expect(
      freshBridge.callTool("comet_navigate", {}),
    ).rejects.toThrow(/Python MCP server not found|COMET_BROWSER_SERVER_PATH/);

    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });
});
