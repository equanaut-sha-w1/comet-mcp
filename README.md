# comet-mcp

[![npm version](https://img.shields.io/npm/v/comet-mcp.svg)](https://www.npmjs.com/package/comet-mcp)

<a href="https://glama.ai/mcp/servers/@hanzili/comet-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@hanzili/comet-mcp/badge" />
</a>

**Give Claude Code a browser that thinks.**

An MCP server that connects Claude Code to [Perplexity Comet](https://www.perplexity.ai/comet) - enabling agentic web browsing, deep research, and real-time task monitoring.

![Demo](demo.gif)

## Why?

Existing web tools for Claude Code fall into two categories, both with limitations:

### 1. Search APIs (Tavily, Perplexity API, WebFetch)
Return static text. No interaction, no login, no dynamic content. Great for quick lookups, but can't navigate complex sites or fill forms.

### 2. Browser Automation (browser-use, Puppeteer MCP, Playwright MCP)
Can interact with pages, but use a **one-agent-do-all** approach: the same reasoning model that's writing your code is also deciding where to click, what to type, and how to navigate. This overwhelms the context window and fragments focus.

### 3. Comet MCP: Multi-Agent Delegation
**Comet MCP takes a different approach.** Instead of Claude controlling a browser directly, it delegates to [Perplexity Comet](https://www.perplexity.ai/comet) - an AI purpose-built for web research and browsing.

- **Claude** stays focused on your coding task
- **Comet** handles the browsing: navigation, login walls, dynamic content, deep research
- **Result**: Claude's coding intelligence + Perplexity's web intelligence, working together

## Quick Start

### 1. Configure Claude Code

Add to `~/.claude.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "comet-bridge": {
      "command": "npx",
      "args": ["-y", "comet-mcp"]
    }
  }
}
```

### 2. Install Comet Browser

Download and install [Perplexity Comet](https://www.perplexity.ai/comet).

That's it! The MCP server automatically launches Comet with remote debugging when needed.

### 3. Use in Claude Code

```
You: "Use Comet to research the top AI frameworks in 2025"
Claude: [delegates to Comet, monitors progress, returns results]

You: "Log into my GitHub and check my notifications"
Claude: [Comet handles the login flow and navigation]
```

## Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `comet_connect` | Connect to Comet (auto-starts if needed) |
| `comet_ask` | Send a task and wait for response |
| `comet_poll` | Check progress on long-running tasks. Pass `task_id` for task-specific polling |
| `comet_stop` | Stop current task. Pass `task_id` to cancel a specific delegated task |
| `comet_screenshot` | Capture current page |
| `comet_mode` | Switch modes: search, research, labs, learn |
| `comet_tab_groups` | Manage Chrome tab groups (list, create, update, delete) |

### Orchestration Tools (New)

| Tool | Description |
|------|-------------|
| `comet_health` | Unified health check across all 4 infrastructure components (browser, comet-mcp, comet-monitor, extension). Returns structured report with per-component status, latency, and overall health |
| `comet_delegate` | High-level task delegation with automatic tool routing. Describe a task in natural language and the orchestrator selects the right tools via 11 built-in templates (research, navigate, screenshot, Shortwave, DOM interaction). Returns structured results with `status`, `payload`, `tools_invoked`, and timing |
| `comet_monitor` | Proxy to comet-monitor Flask API. Returns browser window geometry, tab inventory, and display information. Gracefully reports unavailability when monitor is down |

### Extended Tool Capabilities

**`comet_poll` with `task_id`**: When called with a `task_id` from a `comet_delegate` response, returns task-specific progress including `task_state` (pending/running/completed/failed/cancelled), `elapsed_ms`, and step completion counts. Without `task_id`, existing Perplexity polling behavior is preserved.

**`comet_stop` with `task_id`**: When called with a `task_id`, cancels the specific delegated task. Without `task_id`, existing Perplexity stop behavior is preserved.

## Orchestration Architecture

The orchestration layer routes high-level task descriptions to the correct tools automatically:

```
User: "Research D&O insurance requirements"
  → Orchestrator matches 'research' template
  → Executes: comet_mode("research") → comet_ask(prompt) → comet_poll(loop)
  → Returns structured TaskResult

User: "Navigate to example.com and extract the title"
  → Orchestrator matches 'navigate-extract' template
  → Executes: comet_navigate(url) → comet_get_content()
  → Returns structured TaskResult

User: "Something unrecognized"
  → No template match
  → Returns DelegateEnrichmentResponse with available templates,
    tool inventory, and server health for the caller to decompose
```

### Built-in Task Templates (11)

| Template | Trigger Keywords | Tools Used |
|----------|-----------------|------------|
| `research` | research, deep dive, analyze | comet_mode → comet_ask → comet_poll |
| `search` | search, look up, quick, what is | comet_mode → comet_ask → comet_poll |
| `navigate` | URL + go to, open, navigate | comet_navigate |
| `navigate-extract` | URL + extract, scrape | comet_navigate → comet_get_content |
| `research-extract` | research + then extract | comet_mode → comet_ask → comet_poll → comet_get_content |
| `shortwave-query` | shortwave, ask shortwave | connect → navigate → set_mode → query |
| `shortwave-triage` | shortwave triage, email triage | connect → navigate → mode → /analyze prompt |
| `shortwave-saved-prompt` | shortwave /analyze, /tasks | navigate → mode → saved prompts |
| `dom-interact` | click, type, fill, scroll | DOM action tools |
| `screenshot` | screenshot, capture | comet_screenshot |

### Key Features

- **Per-tab task queue**: Tasks targeting the same browser tab are queued; tasks on different tabs run independently
- **Extension dormancy auto-recovery**: MV3 service workers that go dormant are automatically woken via CDP before tab group operations
- **Structured results**: All delegated tasks return typed `TaskResult` objects with status, payload, duration, and tools invoked
- **Routing fallback**: Unrecognized tasks return enrichment metadata (available templates, tool inventory, server health) so the calling LLM can decompose them

## Tab Groups

Control Comet's native Chrome tab groups programmatically — create, rename, recolor, collapse, and delete groups.

**Requires a one-time extension install** (included in the `extension/` directory):

1. Open `comet://extensions` in Comet
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder from this repo
4. The "Comet Tab Groups Bridge" extension appears

**How it works**: CDP cannot access Chrome's tab group API. The included MV3 extension provides `tabGroups` permission, and comet-mcp connects to the extension's service worker via CDP to evaluate `chrome.tabGroups.*` calls directly. No native messaging host needed.

```
Claude Code → MCP Server → CDP → Extension Service Worker → chrome.tabGroups API → Comet UI
```

**Available actions**:

| Action | Parameters | Description |
|--------|-----------|-------------|
| `list` | — | List all tab groups (id, title, color, collapsed state) |
| `list_tabs` | — | List all tabs with their group assignments |
| `create` | `tabIds`, `title?`, `color?` | Group tabs and optionally name/color them |
| `update` | `groupId`, `title?`, `color?`, `collapsed?` | Change group properties |
| `move` | `groupId`, `index` | Reorder a group |
| `ungroup` | `tabIds` | Remove tabs from their groups |
| `delete` | `groupId` | Dissolve a group (tabs remain open) |

**Colors**: `grey`, `blue`, `red`, `yellow`, `green`, `pink`, `purple`, `cyan`, `orange`

## HTTP REST Bridge

For environments that can't use MCP directly (e.g., sandboxed VMs), an HTTP server exposes all tools as REST endpoints:

```bash
npm run build && npm run http
# Starts on http://localhost:3456
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Unified health check (`?force=true` to bypass cache) |
| `POST` | `/api/connect` | Start Comet & connect to Perplexity tab |
| `POST` | `/api/ask` | Send prompt `{prompt, newChat?, timeout?}` |
| `GET` | `/api/poll` | Check Perplexity status (`?task_id=` for delegated task) |
| `POST` | `/api/stop` | Stop agent (`{task_id}` to cancel specific task) |
| `GET` | `/api/screenshot` | Capture page screenshot |
| `POST` | `/api/mode` | Get/set Perplexity mode `{mode?}` |
| `POST` | `/api/delegate` | Delegate task `{description, template?, timeout_ms?}` |
| `GET` | `/api/monitor` | Monitor state (`?section=windows\|tabs\|all`) |
| `GET` | `/api/tab-groups` | List all tab groups |
| `GET` | `/api/tab-groups/tabs` | List all tabs with group info |
| `POST` | `/api/tab-groups` | Create group `{tabIds, title?, color?}` |
| `POST` | `/api/tab-groups/update` | Update group `{groupId, title?, color?, collapsed?}` |
| `POST` | `/api/tab-groups/delete` | Delete group `{groupId}` |
| `GET` | `/dashboard` | Live monitoring dashboard |

See [COWORK-BRIDGE.md](COWORK-BRIDGE.md) for full endpoint documentation.

## How It Works

```
Claude Code  →  MCP Server  →  Orchestrator  →  CDP  →  Comet Browser  →  Perplexity AI
   (reasoning)    (bridge)     (routing +       (wire)                    (web browsing)
                               templates +
                               task queue)
```

Claude sends high-level goals ("research X", "log into Y"). The orchestrator routes them through task templates, manages per-tab concurrency, and handles extension dormancy. Comet figures out the clicks, scrolls, and searches. Structured results flow back to Claude.

## Requirements

- Node.js 18+
- [Perplexity Comet Browser](https://www.perplexity.ai/comet)
- Claude Code (or any MCP client)
- **Supported platforms**: macOS, Windows, WSL2

## Windows & WSL Support

### Native Windows
Works out of the box. Comet MCP auto-detects Windows and launches Comet from its default install location.

### WSL2 (Windows Subsystem for Linux)
WSL2 requires **mirrored networking** to connect to Comet running on Windows:

1. **Enable mirrored networking** (one-time setup):
   ```
   # Create/edit %USERPROFILE%\.wslconfig (Windows side)
   [wsl2]
   networkingMode=mirrored
   ```

2. **Restart WSL**:
   ```bash
   wsl --shutdown
   # Then reopen your WSL terminal
   ```

3. **That's it!** Comet MCP auto-detects WSL and uses PowerShell to communicate with Windows.

If mirrored networking isn't available, you'll see a helpful error message with setup instructions.

### Custom Comet Path
If Comet is installed in a non-standard location:
```json
{
  "mcpServers": {
    "comet-bridge": {
      "command": "npx",
      "args": ["-y", "comet-mcp"],
      "env": {
        "COMET_PATH": "/path/to/your/Comet"
      }
    }
  }
}
```

## Troubleshooting

**"Cannot connect to Comet"**
- **macOS**: Ensure Comet is installed at `/Applications/Comet.app`
- **Windows**: Comet should be in `%LOCALAPPDATA%\Perplexity\Comet\Application\`
- Check if port 9222 is available

**"WSL cannot connect to Windows localhost"**
- Enable mirrored networking (see WSL section above)
- Or run Claude Code from Windows PowerShell instead of WSL

**"Tools not showing in Claude"**
- Restart Claude Code after config changes

## License

MIT

---

[Report Issues](https://github.com/hanzili/comet-mcp/issues) · [Contribute](https://github.com/hanzili/comet-mcp)
