import {
  type ServerName,
  type ServerAlias,
  type ToolCategory,
  type ToolDescriptor,
  type ToolResult,
  SERVER_ALIAS_MAP,
  SERVER_NAME_TO_ALIAS,
  TOOL_COLLISIONS,
} from "./types.js";

export interface PythonBridge {
  callTool: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<ToolResult>;
  listTools: () => Promise<ToolDescriptor[]>;
}

export class ToolRouter {
  private inventory: ToolDescriptor[] = [];
  private localTools: ToolDescriptor[];
  private pythonBridge: PythonBridge;

  constructor(localTools: ToolDescriptor[], pythonBridge: PythonBridge) {
    this.localTools = localTools;
    this.pythonBridge = pythonBridge;
  }

  async initialize(): Promise<void> {
    const remoteTool = await this.pythonBridge.listTools();

    const allTools = [...this.localTools, ...remoteTool];

    this.inventory = allTools.map((tool) => {
      const alias = SERVER_NAME_TO_ALIAS[tool.server];
      const qualifiedName = `${alias}:${tool.name}`;

      let isCanonical: boolean;
      if (tool.name in TOOL_COLLISIONS) {
        isCanonical = TOOL_COLLISIONS[tool.name] === tool.server;
      } else {
        isCanonical = true;
      }

      return { ...tool, qualifiedName, isCanonical };
    });
  }

  getInventory(): ToolDescriptor[] {
    return this.inventory;
  }

  findTool(name: string): ToolDescriptor | null {
    if (name.includes(":")) {
      const [alias, toolName] = name.split(":", 2) as [string, string];
      const server = SERVER_ALIAS_MAP[alias as ServerAlias];
      if (!server) return null;
      return (
        this.inventory.find(
          (t) => t.server === server && t.name === toolName,
        ) ?? null
      );
    }

    const matches = this.inventory.filter((t) => t.name === name);
    if (matches.length === 0) return null;
    return matches.find((t) => t.isCanonical) ?? matches[0];
  }

  findToolsByCategory(category: ToolCategory): ToolDescriptor[] {
    return this.inventory.filter((t) => t.category === category);
  }

  async invoke(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.findTool(toolName);
    if (!tool) {
      return {
        toolName,
        server: "comet-mcp",
        success: false,
        data: null,
        duration_ms: 0,
        error: `Tool not found: ${toolName}`,
      };
    }

    if (tool.server === "comet-browser") {
      return this.pythonBridge.callTool(tool.name, params);
    }

    throw new Error("local invocation not wired");
  }

  async isServerAvailable(server: ServerName): Promise<boolean> {
    if (server === "comet-mcp") return true;

    if (server === "comet-browser") {
      try {
        await this.pythonBridge.listTools();
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }
}
