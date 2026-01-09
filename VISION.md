# comet-mcp: Vision Document

## Context

A General Partner at Aperture Capital reached out via LinkedIn expressing interest in comet-mcp. This is the first VC interest in the project.

**Status:** Call scheduled. Preparing to articulate the broader vision.

---

## Honest Assessment: Claude in Chrome

Before diving into the vision, an honest competitive assessment:

**Claude in Chrome (`claude --chrome`) works well.** Anthropic's native browser integration provides comparable browsing quality to Comet, with the advantage of seamless integration (same company, no setup).

| Aspect | Claude in Chrome | comet-mcp |
|--------|------------------|-----------|
| Setup | Native, zero config | Requires Comet browser + MCP setup |
| Browsing quality | Good | Good |
| Integration | Seamless (same company) | External bridge |
| Architecture | Claude does everything | Delegates to specialist |

**So why does comet-mcp matter?**

The value isn't in solving browsing specifically—it's in proving that **delegation to specialists works**. Claude in Chrome still has Claude doing perception, reasoning, AND action. That's fine for browsing (where Anthropic has invested heavily), but it's the wrong pattern for scaling to all human capabilities.

**The thesis isn't "Claude can't browse." The thesis is: "The pattern of delegation matters for capabilities beyond browsing."**

---

## The Problem

### Why MCP Falls Short for Human Labor Replication

The current approach to making AI agents useful requires building specialized MCP tools for every task:

- Want to query a database? Build an MCP server.
- Want to check a website? Build a scraper.
- Want to fill a form? Build a custom integration.
- Want to use a SaaS tool? Hope they have an API.

**This doesn't scale.** For every new task, you need:
1. Engineering to build the tool
2. Maintenance to keep it working
3. Updates when the target system changes

### How Humans Work

Humans don't need custom integrations. A human worker:
- Opens a browser
- Navigates to any website
- Reads, clicks, types, fills forms
- Uses existing infrastructure (the internet, GUIs, standard interfaces)

**No new engineering required.** The infrastructure already exists.

### The Gap

AI agents today are powerful reasoners but can't use computers like humans. They're stuck:
- Waiting for someone to build an MCP tool for each task
- Or using slow, unreliable "computer use" that screenshots and guesses

---

## The Insight

> Don't build tools for every task. Give AI access to specialists that already know how to use computers.

**Comet is proof of this approach:**
- Perplexity spent years training Comet specifically for web interaction
- Instead of building scrapers and APIs, Claude just asks Comet to browse
- Comet uses the existing web infrastructure - no custom engineering per site

This is delegation to specialists, not tool-building.

---

## The Vision

### What comet-mcp Proves

comet-mcp isn't just a browsing solution—it's proof of concept for the delegation pattern:

| Approach | How it works | Limitation |
|----------|--------------|------------|
| MCP Tools | Build custom tool per task | Doesn't scale |
| Computer Use | One model does everything | Compounding failure (80% × 80% × ... = 10%) |
| **Delegation** | Route to specialist AI | Each specialist can be best-in-class |

comet-mcp demonstrates that Claude can effectively delegate to Comet (a specialist trained specifically for web interaction) rather than trying to do everything itself.

### What's Still Missing

Browsing is increasingly commoditized (Claude in Chrome, browser-use, etc.). The real opportunity is in capabilities that DON'T have good native solutions yet:

| Capability | Status | Notes |
|------------|--------|-------|
| Web browsing/research | ✅ Commoditized | Claude in Chrome, browser-use, Comet all work |
| GUI interaction (clicking, typing in apps) | ❌ Unsolved | No good specialist exists yet |
| Persistent memory | ❌ Unsolved | Need memory specialist (Mem0, etc.) |
| Desktop automation | ❌ Unsolved | Need desktop specialist |
| Domain-specific tasks (CAD, video editing, etc.) | ❌ Unsolved | Need domain specialists |

### The Orchestration Architecture (Working Today)

The orchestration layer has three components that work together:

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                       │
├─────────────────────────────────────────────────────────────┤
│  1. REASONER         │  Claude (Opus) - decides what to do  │
│  2. PERSISTENCE      │  Ralph Loop - keeps it running       │
│  3. SPECIALISTS      │  Chrome/Comet - execute browser tasks│
│                      │  (future: GUI, memory, desktop, etc.)│
└─────────────────────────────────────────────────────────────┘
```

**Ralph Loop** (github.com/mikeyobrien/ralph-orchestrator) solves the "Claude stops too early" problem:
- Same prompt fed repeatedly via stop hook
- Claude sees its previous work in files
- Continues until task truly complete (signals with `<promise>` tag)
- Enables multi-step autonomous workflows

**Example: Autonomous Research Task**
```
/ralph-loop "Research top 5 competitors, extract pricing, create spreadsheet.
Output <promise>DONE</promise> when complete." --max-iterations 15
```

Claude + Chrome/Comet would:
1. Open competitor sites (using your logins)
2. Extract pricing data
3. Create spreadsheet
4. If incomplete → Ralph feeds prompt again
5. Claude sees previous work, continues
6. Outputs `<promise>` when truly done

This is the orchestration pattern in action: **reasoner + persistence + specialist = autonomous agent**.

### The Bigger Play

The same pattern that works for web research could work for everything:

**Instead of:**
```
Build MCP tool → for each task → maintain forever
```

**Do this:**
```
Connect to specialist → that uses existing infrastructure → scales to any task
```

The opportunity is the orchestration layer that:
1. Routes tasks to the right specialist
2. Maintains context across specialists
3. Lets Claude focus on reasoning while specialists handle interaction

---

## Market Context

- **AI Agents Market:** $5B (2024) → $236B (2034), 45% CAGR
- **Browser-use** (open source): Just raised $17M
- **Browserbase** (browser infra): $67M total funding
- **Anchor Browser**: $6M seed, backed by Google + OpenAI

VCs are actively funding this space. The "computer use" problem is widely recognized as the key bottleneck.

---

## Why Now

1. **MCP is becoming standard** - but its limitations are showing
2. **Computer use is the bottleneck** - everyone's hitting this wall
3. **Specialists exist** - Comet, Browserbase, etc. - they just need orchestration
4. **The big players are struggling** - Anthropic's Computer Use is slow, OpenAI's Operator is limited

---

## Open Questions

1. Who's building the best GUI interaction specialist?
2. Can we extend this pattern to desktop apps, not just browser?
3. What's the right abstraction for "task routing" across specialists?
4. How do we maintain context/state when tasks span multiple specialists?

---

## For the GP Call

**The honest truth:** Browsing is becoming commoditized. Claude in Chrome, browser-use, and others all work well. comet-mcp isn't the moat.

**What we've proven:** The delegation pattern works. Claude can effectively route tasks to specialist AIs instead of doing everything itself.

**The opportunity:** Browsing is solved, but GUI interaction, persistent memory, desktop automation, and domain-specific tasks are NOT. The company that builds the orchestration layer for specialist AIs—connecting reasoners to doers—captures the real value.

**The pitch:** We're not a browsing company. We're building toward the orchestration layer for AI specialists. comet-mcp is proof the pattern works. The next step is identifying which unsolved capability has the best specialist opportunity.

---

## Technical Appendix: Browser Automation Approaches

### Three Approaches Compared

There are fundamentally three different approaches to browser automation:

| Approach | Claude in Chrome | MCP Puppeteer | Comet Browser |
|----------|------------------|---------------|---------------|
| **Element Finding** | Visual (screenshots → pixel coordinates) | DOM (CSS selectors) | Hybrid (DOM + accessibility + likely screenshots) |
| **Who Locates Elements** | Claude's vision model | Browser's querySelector | Comet's AI (method unclear) |
| **Action Format** | `{coordinate: [450, 100]}` | `{selector: '.btn'}` | Natural language → internal mapping |
| **Underlying Protocol** | CDP (via Native Messaging) | CDP (via Puppeteer) | Chromium internals (not documented) |
| **Who Does Reasoning** | Claude | Claude | Comet's own AI |
| **Documentation** | Official Anthropic docs | Public code (archived) | **None** - internals not published |

### Claude in Chrome: Visual/Coordinate-Based

```
1. Take screenshot
2. Claude's vision model analyzes image
3. Claude counts pixels to locate element
4. Send: {action: 'mouse_move', coordinate: [450, 100]}
5. Send: {action: 'left_click'}
6. Take another screenshot, repeat
```

From Anthropic's blog:
> "Claude looks at screenshots of what's visible to the user, then counts how many pixels vertically or horizontally it needs to move a cursor. Training Claude to count pixels accurately was critical."

**Architecture:** Claude in Chrome extension acts as an MCP server when used with Claude Code. Uses Chrome's Native Messaging API (stdin/stdout JSON) to communicate.

**Pros:**
- Robust to DOM changes (visual appearance stays same even if class names change)
- Works on any website without knowing its structure
- Handles anti-bot measures (randomized class names)

**Cons:**
- Slower (screenshot → analyze → act loop)
- Token-heavy (images consume context)
- Can be imprecise (pixel counting is hard)
- Claude does ALL the work (perception + reasoning + action)

### MCP Puppeteer: Selector-Based

```
1. Claude decides what to interact with
2. Claude specifies CSS selector
3. Send: puppeteer_click({selector: 'button.submit'})
4. Puppeteer's querySelector finds element
5. Puppeteer clicks element's center
```

**Architecture:** Standalone MCP server using Puppeteer library, which uses Chrome DevTools Protocol (CDP) to control browser.

**Pros:**
- Fast (direct DOM access)
- Precise (exact element, not pixel estimation)
- Can interact with invisible/off-screen elements

**Cons:**
- Breaks when DOM structure changes
- Requires knowing selector patterns
- Official version archived (March 2025)
- Claude still does all reasoning

### Comet: Hybrid Approach (Likely)

**Important caveat:** Perplexity has NOT published technical documentation about Comet's internals. What follows is pieced together from user observations, security research, and indirect sources. Confidence is **moderate**.

**Evidence suggests a hybrid approach:**

From user testing (Medium):
> "it took nearly five minutes... because it meticulously analyzed the page, **captured screenshots**, and navigated through **HTML tags** step-by-step"

From Everyday AI podcast:
> "it does have this **hybrid AI architecture**. So some more simple AI tasks run local... makes Perplexity Comet much better than some of the other computer using agents that use more of a computer vision approach"

From Harness.io (asking Comet itself - unreliable):
> "Comet: Yes, I utilize the website's **accessibility tree** — specifically roles, ARIA attributes, labels, and states"

**Best guess at Comet's approach:**
```
1. User gives natural language task
2. Comet's AI interprets intent
3. Comet uses MULTIPLE signals:
   - Accessibility tree (ARIA roles, labels, states)
   - DOM/HTML structure
   - Screenshots for visual verification (likely)
4. Simple tasks run locally in browser
5. Complex reasoning delegated to Perplexity cloud
6. Comet executes actions, returns results
```

**Architecture:** Fully integrated AI-first browser with hybrid local/cloud execution. Comet has its own AI stack that does perception, reasoning, AND action. When used via comet-mcp, Claude delegates the entire task to Comet.

**Pros:**
- True delegation (Comet's AI handles everything)
- Hybrid local/cloud = faster for simple tasks
- Multiple signals (DOM + accessibility + possibly vision) = more robust
- Maintains context across multi-step workflows

**Cons:**
- Technical details not publicly documented
- May still struggle with poorly accessible sites
- Complex tasks can be slow (5+ minutes reported)

### The Key Architectural Difference

| Tool | Who does perception? | Who does reasoning? | Who does action? |
|------|---------------------|---------------------|------------------|
| Claude in Chrome | Claude | Claude | Claude (via extension) |
| MCP Puppeteer | Claude | Claude | Claude (via Puppeteer) |
| **Comet** | **Comet's AI** | **Comet's AI** | **Comet** |

This is why comet-mcp represents true delegation: Claude only provides the goal, Comet handles everything else. With Claude in Chrome and MCP Puppeteer, Claude is still doing all the cognitive work—they're just different interfaces to browser control.

### Why This Matters for the Vision

The Comet approach validates the "specialist" thesis:
1. **Perplexity trained Comet specifically for web interaction** - it's not a general-purpose model doing browser tasks
2. **Comet uses the accessibility tree** - a domain-specific approach optimized for web
3. **Comet maintains its own context** - can handle multi-step workflows without Claude managing state

The limitation is that Comet only works well where accessibility best practices are followed. A "bimodal" approach (accessibility tree + vision) would be more robust.

---

*Document created: January 2026*
*Status: Pre-seed exploration*
