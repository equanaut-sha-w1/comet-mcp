# CLAUDE.md

## What This Is
MCP server connecting Claude Code to Perplexity's Comet browser via Chrome DevTools Protocol (CDP).

## Architecture
```
Claude Code → MCP Server (index.ts) → CometAI (comet-ai.ts) → CDP Client (cdp-client.ts) → Comet Browser
                                     ↘ TabGroupsClient (tab-groups.ts) → Extension Service Worker → chrome.tabGroups API
```

## 7 Tools

### Browsing Tools (6)
- `comet_connect` - Start/connect to Comet browser
- `comet_ask` - Send prompt, wait for response (15s default, use poll for longer)
- `comet_poll` - Check status of long-running tasks
- `comet_stop` - Stop current task
- `comet_screenshot` - Capture current page
- `comet_mode` - Switch Perplexity modes (search/research/labs/learn)

### Tab Groups Tool (1)
- `comet_tab_groups` - Manage Chrome tab groups (requires extension)
  - Actions: `list`, `list_tabs`, `create`, `update`, `move`, `ungroup`, `delete`
  - Colors: grey, blue, red, yellow, green, pink, purple, cyan, orange

## Source Files
- `src/index.ts` - MCP server entry point, tool definitions & handlers
- `src/cdp-client.ts` - CDP connection management, tab control, navigation
- `src/comet-ai.ts` - Perplexity AI interaction (prompt sending, response extraction)
- `src/tab-groups.ts` - Tab groups via extension service worker CDP bridge
- `src/types.ts` - TypeScript interfaces
- `src/http-server.ts` - HTTP REST bridge (port 3456) for sandboxed environments
- `extension/` - MV3 Chrome extension for tab group API access

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
- All calls via `Runtime.evaluate` with `awaitPromise: true` in the extension service worker context
- Extension keepalive interval prevents Chromium from killing idle service workers

## Build & Run
```bash
npm run build            # Compile TypeScript
npm run start            # Run MCP server (stdio)
npm run http             # Run HTTP REST bridge on :3456
```

```bash
pgrep -f "node.*comet-mcp" | xargs kill  # Restart MCP after changes
```

Manual testing only (integration code, external DOM dependency).

## Test Cases
1. **Quick queries** - Simple questions (math, facts) should return within 15s
2. **Non-blocking** - Short timeout returns "in progress", use poll to get result
3. **Follow-up** - Second question in same chat detects NEW response correctly
4. **Agentic task** - "Take control of browser and go to X" triggers browsing
5. **newChat after agentic** - `newChat: true` resets CDP state after browser control
6. **Mode switching** - `comet_mode` changes search/research/labs/learn
7. **Tab groups** - `comet_tab_groups` with action=list returns groups (requires extension)

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
- **Service worker stale**: Auto-reconnect handles this, but if persistent, reload extension from `comet://extensions`.
