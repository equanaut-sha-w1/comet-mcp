#!/usr/bin/env node

// Comet Browser MCP Server
// Claude Code ↔ Perplexity Comet bidirectional interaction
// 10 tools: 6 browsing + 1 tab groups + 3 orchestration

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { cometClient } from "./cdp-client.js";
import { cometAI } from "./comet-ai.js";
import { CometOrchestrator } from "./orchestrator.js";
import { ToolRouter } from "./tool-router.js";
import { TaskQueue } from "./task-queue.js";
import { TaskTemplateRegistry } from "./task-templates.js";
import { HealthChecker } from "./health.js";
import { MonitorProxy } from "./monitor-proxy.js";
import { DormancyManager } from "./dormancy.js";
import { pythonBridge } from "./python-bridge.js";
import type { ToolDescriptor, ServerName, ToolCategory } from "./types.js";

const TOOLS: Tool[] = [
  {
    name: "comet_connect",
    description: "Connect to Comet browser (auto-starts if needed). Preserves all existing tabs and tab groups.",
    inputSchema: {
      type: "object",
      properties: {
        clean: { type: "boolean", description: "Close ungrouped non-Perplexity tabs (default: false). Tabs in groups are always preserved." },
      },
    },
  },
  {
    name: "comet_ask",
    description: "Send a prompt to Comet/Perplexity and wait for the complete response (blocking). Ideal for tasks requiring real browser interaction (login walls, dynamic content, filling forms) or deep research with agentic browsing.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Question or task for Comet - focus on goals and context" },
        newChat: { type: "boolean", description: "Start a fresh conversation (default: false)" },
        timeout: { type: "number", description: "Max wait time in ms (default: 15000 = 15s)" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "comet_poll",
    description: "Check agent status and progress. Call repeatedly to monitor agentic tasks.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Orchestrator task ID to check (optional — omit for Comet AI agent status)" },
      },
    },
  },
  {
    name: "comet_stop",
    description: "Stop the current agent task if it's going off track",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Orchestrator task ID to cancel (optional — omit to stop Comet AI agent)" },
      },
    },
  },
  {
    name: "comet_screenshot",
    description: "Capture a screenshot of current page",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "comet_mode",
    description: "Switch Perplexity search mode. Modes: 'search' (basic), 'research' (deep research), 'labs' (analytics/visualization), 'learn' (educational). Call without mode to see current mode.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["search", "research", "labs", "learn"],
          description: "Mode to switch to (optional - omit to see current mode)",
        },
      },
    },
  },
  {
    name: "comet_tab_groups",
    description:
      "Manage Chrome tab groups in Comet browser. Requires the Comet Tab Groups Bridge extension (load unpacked from extension/ dir). " +
      "Actions: list (all groups), list_tabs (all tabs with group info), create (new group from tab IDs), " +
      "update (rename/recolor/collapse), move (reorder), ungroup (remove tabs from group), delete (ungroup all tabs in a group).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "list_tabs", "create", "update", "move", "ungroup", "delete"],
          description: "The tab group operation to perform",
        },
        tabIds: {
          type: "array",
          items: { type: "number" },
          description: "Tab IDs (for create, ungroup)",
        },
        groupId: {
          type: "number",
          description: "Group ID (for update, move, delete)",
        },
        title: {
          type: "string",
          description: "Group title (for create, update)",
        },
        color: {
          type: "string",
          enum: ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"],
          description: "Group color (for create, update)",
        },
        collapsed: {
          type: "boolean",
          description: "Collapse/expand group (for update)",
        },
        index: {
          type: "number",
          description: "Position index (for move)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "comet_health",
    description: "Check health of all Comet infrastructure components",
    inputSchema: {
      type: "object",
      properties: {
        force: { type: "boolean", description: "Bypass cache and run fresh probes (default: false)" },
      },
    },
  },
  {
    name: "comet_delegate",
    description: "Delegate a task to the Comet orchestration layer",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Natural-language task description" },
        target_tab: { type: "string", description: "Tab ID to target (optional)" },
        timeout_ms: { type: "number", description: "Max execution time in ms (default: 60000)" },
        async: { type: "boolean", description: "Return immediately with task ID (default: false)" },
        template: { type: "string", description: "Force a specific template name (optional)" },
      },
      required: ["description"],
    },
  },
  {
    name: "comet_monitor",
    description: "Get comet-monitor state data",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: ["windows", "tabs", "all"],
          description: "Which section to return (default: all)",
        },
      },
    },
  },
];

// ── Orchestrator wiring ──────────────────────────────────────────

const dormancyManager = new DormancyManager(9222);
const monitorProxy = new MonitorProxy();
const taskQueue = new TaskQueue();
const templateRegistry = new TaskTemplateRegistry();
const healthChecker = new HealthChecker({
  cdpPort: 9222,
  dormancyManager,
  monitorProxy,
});

const localToolDescriptors: ToolDescriptor[] = TOOLS.map((t) => ({
  name: t.name,
  qualifiedName: `mcp:${t.name}`,
  server: "comet-mcp" as ServerName,
  category: "meta" as ToolCategory,
  schema: t.inputSchema as Record<string, unknown>,
  description: t.description ?? "",
  isCanonical: true,
}));

const toolRouter = new ToolRouter(localToolDescriptors, pythonBridge);

const orchestrator = new CometOrchestrator({
  toolRouter,
  taskQueue,
  templateRegistry,
  healthChecker,
  monitorProxy,
  dormancyManager,
  localToolHandler: (name, params) => handleToolCall(name, params),
});

// Non-blocking init — log warning on failure, don't block MCP startup
orchestrator.initialize().catch((err) => {
  console.error(
    `[comet-mcp] Orchestrator init failed (non-fatal): ${err instanceof Error ? err.message : err}`,
  );
});

// ── Tool dispatch (shared by MCP handler + orchestrator) ─────────

type ToolResponse = {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
};

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  switch (name) {
    case "comet_connect": {
      const clean = (args?.clean as boolean) || false;

      const startResult = await cometClient.startComet(9222);

      const targets = await cometClient.listTargets();
      const pageTabs = targets.filter(t => t.type === 'page');

      const perplexityTab = pageTabs.find(t => t.url?.includes('perplexity.ai'));
      let connectedTo: string;
      let connectedTabId: string;

      if (perplexityTab) {
        await cometClient.connect(perplexityTab.id);
        connectedTo = "existing Perplexity tab";
        connectedTabId = perplexityTab.id;
      } else if (pageTabs.length > 0) {
        const newTab = await cometClient.newTab("https://www.perplexity.ai/");
        await new Promise(resolve => setTimeout(resolve, 2000));
        await cometClient.connect(newTab.id);
        connectedTo = "new Perplexity tab";
        connectedTabId = newTab.id;
      } else {
        const newTab = await cometClient.newTab("https://www.perplexity.ai/");
        await new Promise(resolve => setTimeout(resolve, 2000));
        await cometClient.connect(newTab.id);
        connectedTo = "new Perplexity tab (browser was empty)";
        connectedTabId = newTab.id;
      }

      let cleanedCount = 0;
      if (clean && pageTabs.length > 1) {
        let groupedUrls = new Set<string>();
        try {
          const { tabGroupsClient } = await import("./tab-groups.js");
          const allTabs = await tabGroupsClient.listTabs();
          for (const t of allTabs) {
            if (t.groupId !== -1 && t.url) groupedUrls.add(t.url);
          }
        } catch {
          return { content: [{ type: "text", text: `${startResult}\nConnected to ${connectedTo} (${pageTabs.length} tabs preserved — clean skipped, tab groups extension not available)` }] };
        }

        for (const tab of pageTabs) {
          if (tab.id === connectedTabId) continue;
          if (tab.url?.includes('perplexity.ai')) continue;
          if (groupedUrls.has(tab.url)) continue;
          try {
            await cometClient.closeTab(tab.id);
            cleanedCount++;
          } catch { /* ignore */ }
        }
      }

      let groupInfo = '';
      try {
        const { tabGroupsClient } = await import("./tab-groups.js");
        const groups = await tabGroupsClient.listGroups();
        groupInfo = `, ${groups.length} groups`;
      } catch { /* extension not available */ }

      const tabCount = pageTabs.length - cleanedCount;
      const cleanMsg = cleanedCount > 0 ? `, cleaned ${cleanedCount} ungrouped tabs` : '';
      return { content: [{ type: "text", text: `${startResult}\nConnected to ${connectedTo} (${tabCount} tabs${groupInfo} preserved${cleanMsg})` }] };
    }

    case "comet_ask": {
      let prompt = args?.prompt as string;
      const timeout = (args?.timeout as number) || 15000;
      const newChat = (args?.newChat as boolean) || false;

      if (!prompt || prompt.trim().length === 0) {
        return { content: [{ type: "text", text: "Error: prompt cannot be empty" }] };
      }

      prompt = prompt
        .replace(/^[-*•]\s*/gm, '')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (newChat) {
        const newTab = await cometClient.newTab("https://www.perplexity.ai/");
        await new Promise(resolve => setTimeout(resolve, 2000));
        await cometClient.connect(newTab.id);
      } else {
        const tabs = await cometClient.listTabsCategorized();
        if (tabs.main) {
          await cometClient.connect(tabs.main.id);
        }

        const urlResult = await cometClient.evaluate('window.location.href');
        const currentUrl = urlResult.result.value as string;
        const isOnPerplexity = currentUrl?.includes('perplexity.ai');

        if (!isOnPerplexity) {
          await cometClient.navigate("https://www.perplexity.ai/", true);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      const oldStateResult = await cometClient.evaluate(`
        (() => {
          const proseEls = document.querySelectorAll('[class*="prose"]');
          const lastProse = proseEls[proseEls.length - 1];
          return {
            count: proseEls.length,
            lastText: lastProse ? lastProse.innerText.substring(0, 100) : ''
          };
        })()
      `);
      const oldState = oldStateResult.result.value as { count: number; lastText: string };

      await cometAI.sendPrompt(prompt);

      const startTime = Date.now();
      const stepsCollected: string[] = [];
      let sawNewResponse = false;

      while (Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const currentStateResult = await cometClient.evaluate(`
          (() => {
            const proseEls = document.querySelectorAll('[class*="prose"]');
            const lastProse = proseEls[proseEls.length - 1];
            return {
              count: proseEls.length,
              lastText: lastProse ? lastProse.innerText.substring(0, 100) : ''
            };
          })()
        `);
        const currentState = currentStateResult.result.value as { count: number; lastText: string };

        if (!sawNewResponse) {
          if (currentState.count > oldState.count ||
              (currentState.lastText && currentState.lastText !== oldState.lastText)) {
            sawNewResponse = true;
          }
        }

        const status = await cometAI.getAgentStatus();

        for (const step of status.steps) {
          if (!stepsCollected.includes(step)) {
            stepsCollected.push(step);
          }
        }

        if (status.status === 'completed' && sawNewResponse) {
          return { content: [{ type: "text", text: status.response || 'Task completed (no response text extracted)' }] };
        }
      }

      const finalStatus = await cometAI.getAgentStatus();
      let inProgressMsg = `Task in progress (${stepsCollected.length} steps so far).\n`;
      inProgressMsg += `Status: ${finalStatus.status.toUpperCase()}\n`;
      if (finalStatus.currentStep) {
        inProgressMsg += `Current: ${finalStatus.currentStep}\n`;
      }
      if (finalStatus.agentBrowsingUrl) {
        inProgressMsg += `Browsing: ${finalStatus.agentBrowsingUrl}\n`;
      }
      if (stepsCollected.length > 0) {
        inProgressMsg += `\nSteps:\n${stepsCollected.map(s => `  • ${s}`).join('\n')}\n`;
      }
      inProgressMsg += `\nUse comet_poll to check progress or comet_stop to cancel.`;

      return { content: [{ type: "text", text: inProgressMsg }] };
    }

    case "comet_poll": {
      const taskId = args?.task_id as string | undefined;

      if (taskId) {
        const task = orchestrator.getTaskStatus(taskId);
        if (!task) {
          return { content: [{ type: "text", text: `No task found with ID: ${taskId}` }] };
        }
        let output = `Task ${task.id}\n`;
        output += `State: ${task.state.toUpperCase()}\n`;
        output += `Steps: ${task.currentStepIndex}/${task.steps.length}\n`;
        if (task.startedAt) {
          const elapsed = (task.completedAt ?? Date.now()) - task.startedAt;
          output += `Duration: ${elapsed}ms\n`;
        }
        for (const step of task.steps) {
          const icon = step.status === "completed" ? "✓" : step.status === "running" ? "…" : step.status === "failed" ? "✗" : "·";
          output += `  ${icon} ${step.toolName} [${step.status}]${step.duration_ms != null ? ` ${step.duration_ms}ms` : ""}\n`;
        }
        return { content: [{ type: "text", text: output }] };
      }

      const status = await cometAI.getAgentStatus();

      if (status.status === 'completed' && status.response) {
        return { content: [{ type: "text", text: status.response }] };
      }

      let output = `Status: ${status.status.toUpperCase()}\n`;

      if (status.agentBrowsingUrl) {
        output += `Browsing: ${status.agentBrowsingUrl}\n`;
      }

      if (status.currentStep) {
        output += `Current: ${status.currentStep}\n`;
      }

      if (status.steps.length > 0) {
        output += `\nSteps:\n${status.steps.map(s => `  • ${s}`).join('\n')}\n`;
      }

      if (status.status === 'working') {
        output += `\n[Use comet_stop to interrupt, or comet_screenshot to see current page]`;
      }

      return { content: [{ type: "text", text: output }] };
    }

    case "comet_stop": {
      const taskId = args?.task_id as string | undefined;

      if (taskId) {
        const cancelled = orchestrator.cancelTask(taskId);
        return {
          content: [{
            type: "text",
            text: cancelled ? `Task ${taskId} cancelled` : `No active task found with ID: ${taskId}`,
          }],
        };
      }

      const stopped = await cometAI.stopAgent();
      return {
        content: [{
          type: "text",
          text: stopped ? "Agent stopped" : "No active agent to stop",
        }],
      };
    }

    case "comet_screenshot": {
      const result = await cometClient.screenshot("png");
      return {
        content: [{ type: "image", data: result.data, mimeType: "image/png" }],
      };
    }

    case "comet_mode": {
      const mode = args?.mode as string | undefined;

      if (!mode) {
        const result = await cometClient.evaluate(`
          (() => {
            const modes = ['Search', 'Research', 'Labs', 'Learn'];
            for (const mode of modes) {
              const btn = document.querySelector('button[aria-label="' + mode + '"]');
              if (btn && btn.getAttribute('data-state') === 'checked') {
                return mode.toLowerCase();
              }
            }
            const dropdownBtn = document.querySelector('button[class*="gap"]');
            if (dropdownBtn) {
              const text = dropdownBtn.innerText.toLowerCase();
              if (text.includes('search')) return 'search';
              if (text.includes('research')) return 'research';
              if (text.includes('labs')) return 'labs';
              if (text.includes('learn')) return 'learn';
            }
            return 'search';
          })()
        `);

        const currentMode = result.result.value as string;
        const descriptions: Record<string, string> = {
          search: 'Basic web search',
          research: 'Deep research with comprehensive analysis',
          labs: 'Analytics, visualizations, and coding',
          learn: 'Educational content and explanations'
        };

        let output = `Current mode: ${currentMode}\n\nAvailable modes:\n`;
        for (const [m, desc] of Object.entries(descriptions)) {
          const marker = m === currentMode ? "→" : " ";
          output += `${marker} ${m}: ${desc}\n`;
        }

        return { content: [{ type: "text", text: output }] };
      }

      const modeMap: Record<string, string> = {
        search: "Search",
        research: "Research",
        labs: "Labs",
        learn: "Learn",
      };
      const ariaLabel = modeMap[mode];
      if (!ariaLabel) {
        return {
          content: [{ type: "text", text: `Invalid mode: ${mode}. Use: search, research, labs, learn` }],
          isError: true,
        };
      }

      const state = cometClient.currentState;
      if (!state.currentUrl?.includes("perplexity.ai")) {
        await cometClient.navigate("https://www.perplexity.ai/", true);
      }

      const result = await cometClient.evaluate(`
        (() => {
          const btn = document.querySelector('button[aria-label="${ariaLabel}"]');
          if (btn) {
            btn.click();
            return { success: true, method: 'button' };
          }

          const allButtons = document.querySelectorAll('button');
          for (const b of allButtons) {
            const text = b.innerText.toLowerCase();
            if ((text.includes('search') || text.includes('research') ||
                 text.includes('labs') || text.includes('learn')) &&
                b.querySelector('svg')) {
              b.click();
              return { success: true, method: 'dropdown-open', needsSelect: true };
            }
          }

          return { success: false, error: "Mode selector not found" };
        })()
      `);

      const clickResult = result.result.value as { success: boolean; method?: string; needsSelect?: boolean; error?: string };

      if (clickResult.success && clickResult.needsSelect) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const selectResult = await cometClient.evaluate(`
          (() => {
            const items = document.querySelectorAll('[role="menuitem"], [role="option"], button');
            for (const item of items) {
              if (item.innerText.toLowerCase().includes('${mode}')) {
                item.click();
                return { success: true };
              }
            }
            return { success: false, error: "Mode option not found in dropdown" };
          })()
        `);
        const selectRes = selectResult.result.value as { success: boolean; error?: string };
        if (selectRes.success) {
          return { content: [{ type: "text", text: `Switched to ${mode} mode` }] };
        } else {
          return { content: [{ type: "text", text: `Failed: ${selectRes.error}` }], isError: true };
        }
      }

      if (clickResult.success) {
        return { content: [{ type: "text", text: `Switched to ${mode} mode` }] };
      } else {
        return {
          content: [{ type: "text", text: `Failed to switch mode: ${clickResult.error}` }],
          isError: true,
        };
      }
    }

    case "comet_tab_groups": {
      const { tabGroupsClient } = await import("./tab-groups.js");
      const action = args?.action as string;
      type TGColor = import("./tab-groups.js").TabGroupColor;

      try {
        switch (action) {
          case "list": {
            const groups = await tabGroupsClient.listGroups();
            if (groups.length === 0) {
              return { content: [{ type: "text", text: "No tab groups found." }] };
            }
            const lines = groups.map(
              (g) => `[${g.id}] "${g.title || "(untitled)"}" (${g.color}${g.collapsed ? ", collapsed" : ""})`
            );
            return { content: [{ type: "text", text: `Tab groups:\n${lines.join("\n")}` }] };
          }

          case "list_tabs": {
            const tabs = await tabGroupsClient.listTabs();
            const lines = tabs.map(
              (t) => `[tab:${t.id}] group:${t.groupId === -1 ? "none" : t.groupId} "${t.title}" ${t.url}`
            );
            return { content: [{ type: "text", text: `Tabs (${tabs.length}):\n${lines.join("\n")}` }] };
          }

          case "create": {
            const tabIds = args?.tabIds as number[];
            if (!tabIds || tabIds.length === 0) {
              return { content: [{ type: "text", text: "Error: tabIds required for create" }], isError: true };
            }
            const result = await tabGroupsClient.createGroup({
              tabIds,
              title: args?.title as string | undefined,
              color: args?.color as TGColor | undefined,
            });
            return {
              content: [{
                type: "text",
                text: `Created group ${result.groupId}: "${result.group.title || "(untitled)"}" (${result.group.color})`,
              }],
            };
          }

          case "update": {
            const groupId = args?.groupId as number;
            if (groupId === undefined) {
              return { content: [{ type: "text", text: "Error: groupId required for update" }], isError: true };
            }
            const group = await tabGroupsClient.updateGroup({
              groupId,
              title: args?.title as string | undefined,
              color: args?.color as TGColor | undefined,
              collapsed: args?.collapsed as boolean | undefined,
            });
            return {
              content: [{
                type: "text",
                text: `Updated group ${group.id}: "${group.title || "(untitled)"}" (${group.color}${group.collapsed ? ", collapsed" : ""})`,
              }],
            };
          }

          case "move": {
            const groupId = args?.groupId as number;
            const index = args?.index as number;
            if (groupId === undefined || index === undefined) {
              return { content: [{ type: "text", text: "Error: groupId and index required for move" }], isError: true };
            }
            const group = await tabGroupsClient.moveGroup(groupId, index);
            return { content: [{ type: "text", text: `Moved group ${group.id} to index ${index}` }] };
          }

          case "ungroup": {
            const tabIds = args?.tabIds as number[];
            if (!tabIds || tabIds.length === 0) {
              return { content: [{ type: "text", text: "Error: tabIds required for ungroup" }], isError: true };
            }
            await tabGroupsClient.ungroupTabs(tabIds);
            return { content: [{ type: "text", text: `Ungrouped ${tabIds.length} tab(s)` }] };
          }

          case "delete": {
            const groupId = args?.groupId as number;
            if (groupId === undefined) {
              return { content: [{ type: "text", text: "Error: groupId required for delete" }], isError: true };
            }
            const tabs = await tabGroupsClient.listTabs();
            const groupTabs = tabs.filter((t) => t.groupId === groupId);
            if (groupTabs.length === 0) {
              return { content: [{ type: "text", text: `No tabs found in group ${groupId}` }] };
            }
            await tabGroupsClient.ungroupTabs(groupTabs.map((t) => t.id));
            return {
              content: [{
                type: "text",
                text: `Deleted group ${groupId} (ungrouped ${groupTabs.length} tab(s))`,
              }],
            };
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown action: ${action}. Use: list, list_tabs, create, update, move, ungroup, delete` }],
              isError: true,
            };
        }
      } catch (tgError) {
        const msg = tgError instanceof Error ? tgError.message : String(tgError);
        if (msg.includes("extension") || msg.includes("service worker") || msg.includes("Bridge")) {
          return {
            content: [{
              type: "text",
              text: `Tab Groups Bridge extension not connected.\n\n` +
                `To use tab groups:\n` +
                `1. Open comet://extensions in Comet\n` +
                `2. Enable "Developer mode"\n` +
                `3. Click "Load unpacked" and select the extension/ folder from comet-mcp\n` +
                `4. Try again\n\n` +
                `Error: ${msg}`,
            }],
            isError: true,
          };
        }
        throw tgError;
      }
    }

    case "comet_health": {
      const result = await orchestrator.health((args?.force as boolean) || false);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "comet_delegate": {
      const description = args?.description as string;
      if (!description) {
        return { content: [{ type: "text", text: "Error: description is required" }], isError: true };
      }
      const result = await orchestrator.delegate(description, {
        targetTab: args?.target_tab as string | undefined,
        timeout_ms: args?.timeout_ms as number | undefined,
        async: args?.async as boolean | undefined,
        template: args?.template as string | undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "comet_monitor": {
      const section = args?.section as "windows" | "tabs" | "all" | undefined;
      const result = await orchestrator.getMonitorState(section);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP Server ───────────────────────────────────────────────────

const server = new Server(
  { name: "comet-bridge", version: "2.3.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await handleToolCall(name, args ?? {});
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : error}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
