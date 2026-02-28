# CLAUDE.md

## What This Is
MCP server connecting Claude Code to Perplexity's Comet browser via Chrome DevTools Protocol (CDP). Includes an orchestration layer for task delegation, health monitoring, and a unified live dashboard.

## Architecture
```
Claude Code → MCP Server (index.ts) → CometAI (comet-ai.ts) → CDP Client (cdp-client.ts) → Comet Browser
                                     ↘ TabGroupsClient (tab-groups.ts) → Extension Service Worker → chrome.tabGroups API
                                     ↘ Orchestrator (orchestrator.ts) → ToolRouter → TaskQueue → TaskTemplates
                                     ↘ HealthChecker (health.ts) → Browser / MCP / Extension probes
                                     ↘ DormancyManager (dormancy.ts) → Extension wake techniques
```

## 10 Tools

### Browsing Tools (6)
- `comet_connect` - Start/connect to Comet browser
- `comet_ask` - Send prompt, wait for response (15s default, use poll for longer)
- `comet_poll` - Check status of long-running tasks (extended: supports task_id, task_state, elapsed_ms)
- `comet_stop` - Stop current task (extended: supports task_id, returns task_state)
- `comet_screenshot` - Capture current page
- `comet_mode` - Switch Perplexity modes (search/research/labs/learn)

### Tab Groups Tool (1)
- `comet_tab_groups` - Manage Chrome tab groups (requires extension)
  - Actions: `list`, `list_tabs`, `create`, `update`, `move`, `ungroup`, `delete`
  - Colors: grey, blue, red, yellow, green, pink, purple, cyan, orange

### Infrastructure Tools (3)
- `comet_health` - Component health check (browser, comet-mcp, extension, comet-monitor)
  - Returns: overall status (healthy/degraded/down), per-component status with latency
  - Optional `force` param bypasses cache
- `comet_delegate` - Task delegation to orchestrator
  - Accepts task description, matches against templates, executes steps
- `comet_monitor` - Window/tab geometry and monitor state
  - Returns: window positions, display assignments, tab inventory

## Source Files

### Core (6)
- `src/index.ts` - MCP server entry point, 10 tool definitions & dispatch handler
- `src/cdp-client.ts` - CDP connection management, tab control, navigation, platform-specific Comet launch
- `src/comet-ai.ts` - Perplexity AI interaction (prompt sending, response extraction)
- `src/tab-groups.ts` - Tab groups via extension service worker CDP bridge, dormancy-aware reconnection
- `src/types.ts` - TypeScript interfaces (orchestration, tasks, health, monitor types)
- `src/http-server.ts` - HTTP REST bridge (port 3456), dashboard serving, window geometry via AppleScript

### Orchestration Layer (6)
- `src/orchestrator.ts` - Task delegation engine, template matching, step execution, tool invocation
- `src/dormancy.ts` - Extension service worker dormancy detection & wake techniques (page_target, management_toggle)
- `src/health.ts` - Component health checking with caching and configurable probes
- `src/task-queue.ts` - In-memory task queue with per-tab state tracking
- `src/task-templates.ts` - Task template registry (research, search, navigate-extract, etc.) with keyword matching
- `src/tool-router.ts` - Tool dispatch router, multi-server support, canonical tool resolution

### Bridge (1)
- `src/python-bridge.ts` - Python MCP server bridge via JSON-RPC over stdio, auto-restart on crash
- `src/monitor-proxy.ts` - Proxy to comet-monitor Flask service (legacy, being retired)

### Dashboard & Extension
- `dashboard/index.html` - Unified three-view live dashboard (Operations / Infrastructure / Inventory)
- `extension/` - MV3 Chrome extension for tab group API access (Alarms API keepalive)

## Design Principles

**NEVER close tabs or navigate away from existing pages without explicit user request.** The user's tab groups represent organized work — potentially hundreds of tabs across dozens of groups. `comet_connect` observes and attaches; it does not destroy. Only `clean: true` removes tabs, and even then it preserves all grouped tabs and Perplexity tabs. `newChat: true` opens a fresh tab instead of wiping existing ones.

## Key Implementation Details

**Response extraction** (`comet-ai.ts:getAgentStatus`):
- Takes LAST prose element (not longest) - conversation threads show newest last
- Filters out UI text (Library, Discover, etc.) and questions (ends with ?)

**Follow-up detection** (`index.ts`):
- Captures old prose count/text before sending
- Waits for NEW response (different text or more elements)

**Prompt normalization**:
- Strips bullet points, collapses newlines to spaces

**Tab Groups extension bridge** (`tab-groups.ts`):
- CDP has NO tab group API; `chrome.tabGroups` is extension-only
- Discovery: scans `/json/list` for service_worker targets, probes for `__COMET_TAB_GROUPS_BRIDGE__` marker
- Lazy connection with auto-reconnect health checks
- Dormancy-aware: detects idle service workers and wakes them via `dormancy.ts`
- All calls via `Runtime.evaluate` with `awaitPromise: true` in the extension service worker context
- Extension keepalive interval prevents Chromium from killing idle service workers

**Dashboard** (`dashboard/index.html`):
- Three views: Operations (window cards + groups + sidecars), Infrastructure (display map + geometry + services + CDP breakdown), Inventory (searchable flat tab list)
- Single `/api/dashboard-data` call includes groups, tabs, targets, and windowGeometry
- Window geometry via AppleScript with 5-second cache (macOS only)
- Service detection for 20+ URL patterns (Google, Slack, GitHub, Railway, etc.)

**Orchestrator** (`orchestrator.ts`):
- Template-based task matching with keyword scoring
- Step-by-step execution with tool invocation via ToolRouter
- Task queue with per-tab state tracking

## Build & Run
```bash
npm run build            # Compile TypeScript
npm run start            # Run MCP server (stdio)
npm run http             # Run HTTP REST bridge on :3456
```

```bash
npm test                 # Run all tests (vitest)
npm run test:unit        # Unit tests only
npm run test:contract    # Contract tests only
npm run test:integration # Integration tests (requires live browser)
```

```bash
pgrep -f "node.*comet-mcp" | xargs kill  # Restart MCP after changes
```

## Test Suite

**Unit tests** (36 passing):
- `tool-router.test.ts` - Tool dispatch and resolution
- `task-queue.test.ts` - Queue enqueue/dequeue/state
- `task-templates.test.ts` - Template matching and registry
- `python-bridge.test.ts` - Bridge spawn and JSON-RPC

**Contract tests** (7 passing, 16 pending):
- `delegate.test.ts` - Delegation input/output shapes (passing)
- `health.test.ts` - Health output contract (pending implementation)
- `monitor.test.ts` - Monitor output contract (pending implementation)
- `poll-extended.test.ts` - Extended poll fields (pending implementation)
- `stop-extended.test.ts` - Extended stop fields (pending implementation)

**Integration tests** (13, require live Comet browser):
- `shortwave.test.ts` - Shortwave email assistant
- `dormancy.test.ts` - Extension wake techniques
- `orchestrator.test.ts` - End-to-end task delegation

## Manual Test Cases
1. **Quick queries** - Simple questions (math, facts) should return within 15s
2. **Non-blocking** - Short timeout returns "in progress", use poll to get result
3. **Follow-up** - Second question in same chat detects NEW response correctly
4. **Agentic task** - "Take control of browser and go to X" triggers browsing
5. **newChat after agentic** - `newChat: true` resets CDP state after browser control
6. **Mode switching** - `comet_mode` changes search/research/labs/learn
7. **Tab groups** - `comet_tab_groups` with action=list returns groups (requires extension)
8. **Health check** - `comet_health` returns component statuses
9. **Dashboard** - `http://localhost:3456/dashboard` shows all three views with live data

## Extension Setup
1. Open `comet://extensions` in Comet browser
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` directory
4. "Comet Tab Groups Bridge" extension appears with service worker active

## Known Edge Cases
- **Prompt not submitted**: If response shows 0 steps + COMPLETED, prompt may not have been submitted. Retry or use newChat.
- **Stale poll response**: If poll returns unrelated response, the previous prompt failed. Send again.
- **Research mode**: Takes longer than search mode, may need multiple polls.
- **Extension not found**: If tab group calls fail, ensure extension is loaded in the *current* Comet instance (each launch is separate).
- **Service worker stale**: Auto-reconnect handles this, but if persistent, reload extension from `comet://extensions`. Dormancy manager can also wake idle workers.
- **Window geometry**: AppleScript-based, macOS only. Returns empty array on other platforms. Cached for 5 seconds.
