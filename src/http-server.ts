#!/usr/bin/env node

// Comet Bridge HTTP API Server
// Exposes Comet-Bridge functionality as REST endpoints
// Designed for Claude Cowork to call via Chrome's fetch() (localhost bypass)
//
// Architecture:
//   Cowork VM -> Claude-in-Chrome MCP -> Chrome fetch('localhost:3456') -> this server -> CDP -> Comet

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cometClient } from "./cdp-client.js";
import { cometAI } from "./comet-ai.js";
import { tabGroupsClient } from "./tab-groups.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load dashboard HTML at startup (from ../dashboard/index.html relative to dist/)
let dashboardHtml = "";
try {
  dashboardHtml = readFileSync(join(__dirname, "..", "dashboard", "index.html"), "utf-8");
} catch {
  dashboardHtml = "<html><body><h1>Dashboard not found</h1><p>Place dashboard/index.html in the project root.</p></body></html>";
}

const PORT = parseInt(process.env.COMET_HTTP_PORT || "3456", 10);

// ---- Window geometry via AppleScript ----

interface WindowGeometry {
  index: number;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  display: string;
  fullscreen: boolean;
}

let geometryCache: { data: WindowGeometry[]; ts: number } = { data: [], ts: 0 };
const GEOMETRY_CACHE_MS = 5000;

function getWindowGeometry(): WindowGeometry[] {
  if (platform() !== "darwin") return [];

  const now = Date.now();
  if (now - geometryCache.ts < GEOMETRY_CACHE_MS) return geometryCache.data;

  const script = `
set output to "["
tell application "System Events"
  if exists process "Comet" then
    tell process "Comet"
      set winCount to count of windows
      repeat with i from 1 to winCount
        set w to window i
        set winPos to position of w
        set winSize to size of w
        set winTitle to name of w
        if i > 1 then set output to output & ","
        set output to output & "{\\"index\\":" & i
        set output to output & ",\\"title\\":\\"" & winTitle & "\\""
        set output to output & ",\\"x\\":" & (item 1 of winPos)
        set output to output & ",\\"y\\":" & (item 2 of winPos)
        set output to output & ",\\"w\\":" & (item 1 of winSize)
        set output to output & ",\\"h\\":" & (item 2 of winSize)
        set output to output & "}"
      end repeat
    end tell
  end if
end tell
return output & "]"`;

  try {
    const raw = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      timeout: 5000,
      encoding: "utf-8",
    }).trim();
    const windows: Array<{ index: number; title: string; x: number; y: number; w: number; h: number }> = JSON.parse(raw);
    const result: WindowGeometry[] = windows
      .filter((w) => w.h >= 100 && w.w >= 100) // skip chrome UI frames
      .map((w) => ({
        ...w,
        display: w.y < 0 ? "U28E590 (top)" : "SAMSUNG (main)",
        fullscreen: w.w >= 1900 && w.h >= 1050,
      }));
    geometryCache = { data: result, ts: now };
    return result;
  } catch {
    return geometryCache.data; // return stale on error
  }
}

// Simple mutex to prevent concurrent CDP operations
let busy = false;

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function errorJson(res: ServerResponse, message: string, status = 500) {
  json(res, { error: message }, status);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
  });
}

async function withMutex<T>(res: ServerResponse, fn: () => Promise<T>): Promise<T | null> {
  if (busy) {
    errorJson(res, "Server busy — another operation is in progress. Try again shortly.", 429);
    return null;
  }
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

// ---- Route handlers (mirrored from index.ts MCP tool handlers) ----

async function handleConnect(res: ServerResponse, body: Record<string, unknown> = {}) {
  const result = await withMutex(res, async () => {
    const clean = (body.clean as boolean) || false;
    const startResult = await cometClient.startComet(9222);

    // List all targets — observe, don't destroy
    const targets = await cometClient.listTargets();
    const pageTabs = targets.filter((t) => t.type === "page");

    // Find an existing Perplexity tab to connect to
    const perplexityTab = pageTabs.find((t) => t.url?.includes("perplexity.ai"));
    let connectedTo: string;
    let connectedTabId: string;

    if (perplexityTab) {
      await cometClient.connect(perplexityTab.id);
      connectedTo = "existing Perplexity tab";
      connectedTabId = perplexityTab.id;
    } else if (pageTabs.length > 0) {
      const newTab = await cometClient.newTab("https://www.perplexity.ai/");
      await new Promise((r) => setTimeout(r, 2000));
      await cometClient.connect(newTab.id);
      connectedTo = "new Perplexity tab";
      connectedTabId = newTab.id;
    } else {
      const newTab = await cometClient.newTab("https://www.perplexity.ai/");
      await new Promise((r) => setTimeout(r, 2000));
      await cometClient.connect(newTab.id);
      connectedTo = "new Perplexity tab (browser was empty)";
      connectedTabId = newTab.id;
    }

    // Optional cleanup: only close ungrouped non-Perplexity tabs
    let cleanedCount = 0;
    if (clean && pageTabs.length > 1) {
      let groupedUrls = new Set<string>();
      try {
        const allTabs = await tabGroupsClient.listTabs();
        for (const t of allTabs) {
          if (t.groupId !== -1 && t.url) groupedUrls.add(t.url);
        }
      } catch {
        return { message: `${startResult}\nConnected to ${connectedTo} (${pageTabs.length} tabs preserved — clean skipped, tab groups extension not available)` };
      }

      for (const tab of pageTabs) {
        if (tab.id === connectedTabId) continue;
        if (tab.url?.includes("perplexity.ai")) continue;
        if (groupedUrls.has(tab.url)) continue;
        try {
          await cometClient.closeTab(tab.id);
          cleanedCount++;
        } catch { /* ignore */ }
      }
    }

    // Get group count for status
    let groupInfo = "";
    try {
      const groups = await tabGroupsClient.listGroups();
      groupInfo = `, ${groups.length} groups`;
    } catch { /* extension not available */ }

    const tabCount = pageTabs.length - cleanedCount;
    const cleanMsg = cleanedCount > 0 ? `, cleaned ${cleanedCount} ungrouped tabs` : "";
    return { message: `${startResult}\nConnected to ${connectedTo} (${tabCount} tabs${groupInfo} preserved${cleanMsg})` };
  });

  if (result) json(res, result);
}

async function handleAsk(res: ServerResponse, body: Record<string, unknown>) {
  const result = await withMutex(res, async () => {
    let prompt = body.prompt as string;
    const timeout = (body.timeout as number) || 15000;
    const newChat = (body.newChat as boolean) || false;

    if (!prompt || prompt.trim().length === 0) {
      return { error: "prompt cannot be empty" };
    }

    // Normalize prompt
    prompt = prompt
      .replace(/^[-*\u2022]\s*/gm, "")
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // newChat: open a fresh Perplexity tab (preserves existing tabs)
    if (newChat) {
      const newTab = await cometClient.newTab("https://www.perplexity.ai/");
      await new Promise((r) => setTimeout(r, 2000));
      await cometClient.connect(newTab.id);
    } else {
      const tabs = await cometClient.listTabsCategorized();
      if (tabs.main) await cometClient.connect(tabs.main.id);
      const urlResult = await cometClient.evaluate("window.location.href");
      const currentUrl = urlResult.result.value as string;
      if (!currentUrl?.includes("perplexity.ai")) {
        await cometClient.navigate("https://www.perplexity.ai/", true);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // Capture old response state
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

    // Send the prompt
    await cometAI.sendPrompt(prompt);

    // Wait for completion
    const startTime = Date.now();
    const stepsCollected: string[] = [];
    let sawNewResponse = false;

    while (Date.now() - startTime < timeout) {
      await new Promise((r) => setTimeout(r, 2000));

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
        if (!stepsCollected.includes(step)) stepsCollected.push(step);
      }

      if (status.status === "completed" && sawNewResponse) {
        return { status: "completed", response: status.response || "Task completed (no response text extracted)" };
      }
    }

    // Timeout — return in-progress status
    const finalStatus = await cometAI.getAgentStatus();
    return {
      status: "in_progress",
      steps: stepsCollected,
      currentStep: finalStatus.currentStep || null,
      agentBrowsingUrl: finalStatus.agentBrowsingUrl || null,
      message: `Task in progress (${stepsCollected.length} steps so far). Use /api/poll to check progress.`,
    };
  });

  if (result) {
    if ("error" in result) {
      errorJson(res, result.error as string, 400);
    } else {
      json(res, result);
    }
  }
}

async function handlePoll(res: ServerResponse) {
  const result = await withMutex(res, async () => {
    const status = await cometAI.getAgentStatus();

    if (status.status === "completed" && status.response) {
      return { status: "completed", response: status.response };
    }

    return {
      status: status.status,
      steps: status.steps,
      currentStep: status.currentStep || null,
      agentBrowsingUrl: status.agentBrowsingUrl || null,
    };
  });

  if (result) json(res, result);
}

async function handleStop(res: ServerResponse) {
  const result = await withMutex(res, async () => {
    const stopped = await cometAI.stopAgent();
    return { stopped, message: stopped ? "Agent stopped" : "No active agent to stop" };
  });

  if (result) json(res, result);
}

async function handleScreenshot(res: ServerResponse) {
  const result = await withMutex(res, async () => {
    const screenshot = await cometClient.screenshot("png");
    return { data: screenshot.data, mimeType: "image/png" };
  });

  if (result) json(res, result);
}

async function handleMode(res: ServerResponse, body: Record<string, unknown>) {
  const result = await withMutex(res, async () => {
    const mode = body.mode as string | undefined;

    if (!mode) {
      // Return current mode
      const modeResult = await cometClient.evaluate(`
        (() => {
          const modes = ['Search', 'Research', 'Labs', 'Learn'];
          for (const mode of modes) {
            const btn = document.querySelector('button[aria-label="' + mode + '"]');
            if (btn && btn.getAttribute('data-state') === 'checked') return mode.toLowerCase();
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
      return { currentMode: modeResult.result.value as string };
    }

    const modeMap: Record<string, string> = { search: "Search", research: "Research", labs: "Labs", learn: "Learn" };
    const ariaLabel = modeMap[mode];
    if (!ariaLabel) {
      return { error: `Invalid mode: ${mode}. Use: search, research, labs, learn` };
    }

    const state = cometClient.currentState;
    if (!state.currentUrl?.includes("perplexity.ai")) {
      await cometClient.navigate("https://www.perplexity.ai/", true);
    }

    const clickResult = await cometClient.evaluate(`
      (() => {
        const btn = document.querySelector('button[aria-label="${ariaLabel}"]');
        if (btn) { btn.click(); return { success: true, method: 'button' }; }
        const allButtons = document.querySelectorAll('button');
        for (const b of allButtons) {
          const text = b.innerText.toLowerCase();
          if ((text.includes('search') || text.includes('research') ||
               text.includes('labs') || text.includes('learn')) && b.querySelector('svg')) {
            b.click();
            return { success: true, method: 'dropdown-open', needsSelect: true };
          }
        }
        return { success: false, error: "Mode selector not found" };
      })()
    `);

    const result = clickResult.result.value as { success: boolean; method?: string; needsSelect?: boolean; error?: string };

    if (result.success && result.needsSelect) {
      await new Promise((r) => setTimeout(r, 300));
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
      if (selectRes.success) return { mode, message: `Switched to ${mode} mode` };
      return { error: selectRes.error || "Failed to select mode from dropdown" };
    }

    if (result.success) return { mode, message: `Switched to ${mode} mode` };
    return { error: result.error || "Failed to switch mode" };
  });

  if (result) {
    if ("error" in result) {
      errorJson(res, result.error as string, 400);
    } else {
      json(res, result);
    }
  }
}

// ---- Tab Group route handlers ----

async function handleTabGroupsList(res: ServerResponse) {
  const result = await withMutex(res, async () => {
    return { groups: await tabGroupsClient.listGroups() };
  });
  if (result) json(res, result);
}

async function handleTabGroupsListTabs(res: ServerResponse) {
  const result = await withMutex(res, async () => {
    return { tabs: await tabGroupsClient.listTabs() };
  });
  if (result) json(res, result);
}

async function handleTabGroupsCreate(res: ServerResponse, body: Record<string, unknown>) {
  const result = await withMutex(res, async () => {
    const tabIds = body.tabIds as number[];
    if (!tabIds || tabIds.length === 0) return { error: "tabIds is required" };
    return await tabGroupsClient.createGroup({
      tabIds,
      title: body.title as string | undefined,
      color: body.color as any,
    });
  });
  if (result) {
    if (result && "error" in result) errorJson(res, result.error as string, 400);
    else json(res, result);
  }
}

async function handleTabGroupsUpdate(res: ServerResponse, body: Record<string, unknown>) {
  const result = await withMutex(res, async () => {
    const groupId = body.groupId as number;
    if (groupId === undefined) return { error: "groupId is required" };
    return await tabGroupsClient.updateGroup({
      groupId,
      title: body.title as string | undefined,
      color: body.color as any,
      collapsed: body.collapsed as boolean | undefined,
    });
  });
  if (result) {
    if ("error" in result) errorJson(res, result.error as string, 400);
    else json(res, result);
  }
}

async function handleTabGroupsDelete(res: ServerResponse, body: Record<string, unknown>) {
  const result = await withMutex(res, async () => {
    const groupId = body.groupId as number;
    if (groupId === undefined) return { error: "groupId is required" };
    const tabs = await tabGroupsClient.listTabs();
    const groupTabs = tabs.filter((t) => t.groupId === groupId);
    if (groupTabs.length === 0) return { message: `No tabs found in group ${groupId}` };
    await tabGroupsClient.ungroupTabs(groupTabs.map((t) => t.id));
    return { deleted: true, ungroupedTabs: groupTabs.length };
  });
  if (result) {
    if ("error" in result) errorJson(res, result.error as string, 400);
    else json(res, result);
  }
}

// ---- Targets & Dashboard handlers ----

async function handleTargets(res: ServerResponse) {
  try {
    const response = await fetch(`http://127.0.0.1:9222/json/list`);
    if (!response.ok) throw new Error(`CDP returned ${response.status}`);
    const targets = await response.json();
    json(res, { targets });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorJson(res, `Cannot reach CDP: ${message}`);
  }
}

async function handleDashboardData(res: ServerResponse) {
  // Window geometry runs outside mutex (no CDP needed)
  const windowGeometry = getWindowGeometry();

  const result = await withMutex(res, async () => {
    // Fetch tab groups + tabs via extension (sequential to avoid CDP conflicts)
    let groups: any[] = [];
    let tabs: any[] = [];
    let targets: any[] = [];

    try {
      groups = await tabGroupsClient.listGroups();
    } catch { /* extension unavailable */ }

    try {
      tabs = await tabGroupsClient.listTabs();
    } catch { /* extension unavailable */ }

    try {
      const response = await fetch(`http://127.0.0.1:9222/json/list`);
      if (response.ok) targets = await response.json();
    } catch { /* CDP unreachable */ }

    return { groups, tabs, targets, windowGeometry };
  });
  if (result) json(res, result);
}

function serveDashboard(res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(dashboardHtml);
}

// ---- HTTP Server ----

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (path === "/dashboard" && req.method === "GET") {
      serveDashboard(res);
    } else if (path === "/api/targets" && req.method === "GET") {
      await handleTargets(res);
    } else if (path === "/api/dashboard-data" && req.method === "GET") {
      await handleDashboardData(res);
    } else if (path === "/api/health" && req.method === "GET") {
      json(res, { status: "ok", port: PORT, timestamp: new Date().toISOString() });
    } else if (path === "/api/connect" && req.method === "POST") {
      const body = await readBody(req);
      await handleConnect(res, body);
    } else if (path === "/api/ask" && req.method === "POST") {
      const body = await readBody(req);
      await handleAsk(res, body);
    } else if (path === "/api/poll" && req.method === "GET") {
      await handlePoll(res);
    } else if (path === "/api/stop" && req.method === "POST") {
      await handleStop(res);
    } else if (path === "/api/screenshot" && req.method === "GET") {
      await handleScreenshot(res);
    } else if (path === "/api/mode" && req.method === "POST") {
      const body = await readBody(req);
      await handleMode(res, body);
    } else if (path === "/api/tab-groups" && req.method === "GET") {
      await handleTabGroupsList(res);
    } else if (path === "/api/tab-groups/tabs" && req.method === "GET") {
      await handleTabGroupsListTabs(res);
    } else if (path === "/api/tab-groups" && req.method === "POST") {
      const body = await readBody(req);
      await handleTabGroupsCreate(res, body);
    } else if (path === "/api/tab-groups/update" && req.method === "POST") {
      const body = await readBody(req);
      await handleTabGroupsUpdate(res, body);
    } else if (path === "/api/tab-groups/delete" && req.method === "POST") {
      const body = await readBody(req);
      await handleTabGroupsDelete(res, body);
    } else {
      errorJson(res, `Not found: ${req.method} ${path}`, 404);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] Error on ${req.method} ${path}:`, message);
    errorJson(res, message, 500);
  }
});

server.listen(PORT, () => {
  console.log(`Comet Bridge HTTP API listening on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /dashboard        - Live monitoring dashboard`);
  console.log(`  GET  /api/targets      - Raw CDP targets`);
  console.log(`  POST /api/connect      - Start Comet & connect`);
  console.log(`  POST /api/ask          - Send prompt {prompt, newChat?, timeout?}`);
  console.log(`  GET  /api/poll         - Check agent status`);
  console.log(`  POST /api/stop         - Stop current agent`);
  console.log(`  GET  /api/screenshot   - Capture page screenshot`);
  console.log(`  POST /api/mode         - Get/set Perplexity mode {mode?}`);
  console.log(`  GET  /api/tab-groups       - List all tab groups`);
  console.log(`  GET  /api/tab-groups/tabs  - List all tabs with group info`);
  console.log(`  POST /api/tab-groups       - Create group {tabIds, title?, color?}`);
  console.log(`  POST /api/tab-groups/update - Update group {groupId, title?, color?, collapsed?}`);
  console.log(`  POST /api/tab-groups/delete - Delete group {groupId}`);
});
