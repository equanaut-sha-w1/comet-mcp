import { describe, it, expect, beforeEach } from "vitest";
import { ToolRouter } from "../../src/tool-router.js";
import { TOOL_COLLISIONS } from "../../src/types.js";
import type { ToolDescriptor, ToolResult, ServerName } from "../../src/types.js";

const QUALIFIED_NAME_PATTERN = /^(mcp|browser):[a-z_]+$/;

function mockTool(name: string, server: ServerName, category = "meta" as const): ToolDescriptor {
  return {
    name,
    qualifiedName: `${server === "comet-mcp" ? "mcp" : "browser"}:${name}`,
    server,
    category,
    schema: {},
    description: `${name} tool`,
    isCanonical: true,
  };
}

const localTools: ToolDescriptor[] = [
  mockTool("comet_connect", "comet-mcp", "meta"),
  mockTool("comet_ask", "comet-mcp", "ai"),
  mockTool("comet_poll", "comet-mcp", "ai"),
  mockTool("comet_stop", "comet-mcp", "ai"),
  mockTool("comet_screenshot", "comet-mcp", "monitor"),
  mockTool("comet_mode", "comet-mcp", "ai"),
  mockTool("comet_tab_groups", "comet-mcp", "tab"),
];

const browserTools: ToolDescriptor[] = [
  mockTool("comet_connect", "comet-browser", "meta"),
  mockTool("comet_navigate", "comet-browser", "dom"),
  mockTool("comet_click", "comet-browser", "dom"),
  mockTool("comet_type", "comet-browser", "dom"),
  mockTool("comet_screenshot", "comet-browser", "monitor"),
  mockTool("comet_get_content", "comet-browser", "dom"),
  mockTool("comet_evaluate", "comet-browser", "dom"),
  mockTool("comet_list_tabs", "comet-browser", "tab"),
  mockTool("comet_switch_tab", "comet-browser", "tab"),
  mockTool("comet_scroll", "comet-browser", "dom"),
  mockTool("comet_wait", "comet-browser", "dom"),
  mockTool("comet_find_elements", "comet-browser", "dom"),
];

const mockBridge = {
  callTool: async (name: string, params: Record<string, unknown>): Promise<ToolResult> => ({
    toolName: name, server: "comet-browser" as ServerName, success: true, data: {}, duration_ms: 1,
  }),
  listTools: async () => browserTools,
};

describe("ToolRouter", () => {
  let router: ToolRouter;

  beforeEach(async () => {
    router = new ToolRouter(localTools, mockBridge);
    await router.initialize();
  });

  it("getInventory returns merged tools from both servers", () => {
    const inventory = router.getInventory();
    const mcpTools = inventory.filter((t) => t.server === "comet-mcp");
    const browserToolsResult = inventory.filter((t) => t.server === "comet-browser");
    expect(mcpTools.length).toBeGreaterThan(0);
    expect(browserToolsResult.length).toBeGreaterThan(0);
    expect(inventory.length).toBe(mcpTools.length + browserToolsResult.length);
  });

  it("findTool with unqualified name returns canonical version", () => {
    const tool = router.findTool("comet_connect");
    expect(tool).not.toBeNull();
    expect(tool!.server).toBe("comet-mcp");
    expect(tool!.isCanonical).toBe(true);
  });

  it("findTool with qualified name returns specific server version", () => {
    const tool = router.findTool("browser:comet_connect");
    expect(tool).not.toBeNull();
    expect(tool!.server).toBe("comet-browser");
  });

  it("findTool returns null for unknown tool", () => {
    expect(router.findTool("nonexistent")).toBeNull();
  });

  it("findToolsByCategory returns correct tools", () => {
    const aiTools = router.findToolsByCategory("ai");
    const names = aiTools.map((t) => t.name);
    expect(names).toContain("comet_ask");
    expect(names).toContain("comet_poll");
  });

  it("collision map matches TOOL_COLLISIONS constant", () => {
    const inventory = router.getInventory();
    const collisionNames = Object.keys(TOOL_COLLISIONS);
    const canonicalCollisions = inventory.filter(
      (t) => collisionNames.includes(t.name) && t.isCanonical,
    );
    expect(canonicalCollisions.length).toBe(2);
    for (const t of canonicalCollisions) {
      expect(t.server).toBe(TOOL_COLLISIONS[t.name]);
    }
  });

  it("non-colliding tools have isCanonical true", () => {
    const collisionNames = Object.keys(TOOL_COLLISIONS);
    const inventory = router.getInventory();
    const nonColliding = inventory.filter((t) => !collisionNames.includes(t.name));
    for (const t of nonColliding) {
      expect(t.isCanonical).toBe(true);
    }
  });

  it("qualified names follow {alias}:{tool} pattern", () => {
    for (const t of router.getInventory()) {
      expect(t.qualifiedName).toMatch(QUALIFIED_NAME_PATTERN);
    }
  });

  it("isServerAvailable returns true for comet-mcp", async () => {
    expect(await router.isServerAvailable("comet-mcp")).toBe(true);
  });
});
