# comet-mcp Marketing Strategy

## Core Positioning

### The Problem: Three Gaps in Claude Code

```
┌─────────────────────────────────────────────────────────────┐
│ Gap 1: WebSearch / Tavily                                   │
│ → Static results, no interaction                            │
│ → Can't navigate dashboards, fill forms, click buttons      │
│ → "How to set up Stripe webhooks" gives articles,           │
│   but can't show you WHERE to click in the dashboard        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Gap 2: Puppeteer MCP                                        │
│ → Can interact, but Claude writes the browser commands      │
│ → "click #btn, wait 2s, scroll, find .element..."           │
│ → Wastes tokens on low-level mechanics                      │
│ → Claude isn't good at this - it's not a browser expert     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Gap 3: No API / No CLI / No MCP                             │
│ → Stripe dashboard configs, Vercel env vars, OAuth setup    │
│ → AWS Console, Firebase, GitHub repo settings               │
│ → These things REQUIRE a browser - no programmatic option   │
└─────────────────────────────────────────────────────────────┘
```

### The Solution: Agent-to-Agent Delegation

> **comet-mcp** connects Claude Code to Perplexity Comet - enabling **agent-to-agent communication**.
>
> Claude just says what it needs. Comet figures out how to get it. Each AI does what it's best at.

```
Claude Code (Manager)          Comet (Browser Specialist)
    │                                    │
    │  "Research Stripe webhook setup"   │
    ├───────────────────────────────────→│
    │                                    │ [Navigates docs]
    │                                    │ [Finds settings page]
    │                                    │ [Reads instructions]
    │   Structured results + context     │
    │←───────────────────────────────────┤
    │                                    │
    ▼
[Uses results in your codebase context]
```

### Why It's Different

| Approach | What Claude Does | Tokens Wasted | Good At |
|----------|------------------|---------------|---------|
| WebSearch/Tavily | Gets static results | Low | Simple lookups |
| Puppeteer MCP | Writes click/scroll commands | High | Nothing (wrong tool) |
| **comet-mcp** | Delegates goals to Comet | Low | Complex web tasks |

**The key insight:** Don't make Claude learn browser automation. Let it delegate to an agent that already knows how.

---

## Launch Channels (Priority Order)

### 1. MCP Ecosystem (Do First!)

**awesome-mcp-servers GitHub**
- Submit PR to: https://github.com/punkpeye/awesome-mcp-servers
- Category: "Browser Automation" or "Research"
- This is where developers discover MCP servers

**mcpservers.org**
- Submit to directory
- Include clear description + Claude Code setup

**MCP Discord**
- Join the community Discord by Frank Fiegel
- Share genuinely, help others, then mention your tool

### 2. Hacker News (Show HN)

**Title Options (Clear > Clever):**
```
Show HN: comet-mcp – Agent-to-agent delegation for Claude Code via Perplexity
Show HN: I connected Claude Code to Perplexity Comet for things with no API
Show HN: Let Claude Code delegate browser tasks instead of writing Puppeteer commands
```

**Post Body:**
```
I built an MCP server that connects Claude Code to Perplexity Comet browser.

The insight: There are three gaps in Claude Code's web capabilities:

1. WebSearch/Tavily give static results - can't interact with dashboards or forms
2. Puppeteer MCP makes Claude write click/scroll commands - wastes tokens, Claude isn't good at this
3. Many things have NO API/CLI - Stripe configs, Vercel env vars, OAuth setup, AWS Console...

The solution: Agent-to-agent delegation.

Claude just says "research how to set up Stripe webhooks" and Comet (Perplexity's agentic browser)
figures out how to navigate, where to click, what to read. Each AI does what it's best at.

It's like the difference between:
- Micromanaging: "click here, scroll there, wait for element..." (Puppeteer)
- Delegating: "figure out how to do X and report back" (comet-mcp)

6 tools: connect, ask, poll, stop, screenshot, mode
Setup: one JSON block in ~/.claude.json + start Comet with --remote-debugging-port=9222

GitHub: https://github.com/hanzili/comet-mcp
npm: npx comet-mcp
```

**HN Success Tips:**
- Post 6-9am PST (HN peak hours)
- Engage with EVERY comment (be human, not defensive)
- Don't ask friends to upvote (HN detects this)
- Link goes to GitHub, not landing page

### 3. Reddit

**r/ClaudeAI** (Primary - 100k+ members, perfect audience)

Title: `Agent-to-agent: I made Claude Code delegate browser tasks to Perplexity Comet`

```
Been thinking about the gaps in Claude Code's web capabilities:

1. WebSearch/Tavily → static results, can't interact
2. Puppeteer MCP → Claude has to write click/scroll commands (wastes tokens, it's bad at this)
3. Many things have NO API → Stripe dashboard, Vercel env vars, OAuth setup...

So I built comet-mcp - connects Claude Code to Perplexity Comet via CDP.

The key idea: agent-to-agent delegation.

Instead of Claude micromanaging browser commands ("click #btn, wait 2s, scroll..."),
it just tells Comet what it needs ("figure out how to set up Stripe webhooks").
Comet handles the browsing. Each AI does what it's best at.

Example:
Me: "I need to add auth to my app. Research the current best approach for Next.js"

Claude: [decides it needs current info, delegates to Comet]
Comet: [navigates docs, GitHub, Reddit - figures out how on its own]
Claude: [gets results, applies them to my codebase context]

It's like having a smart colleague who handles the browser research
while you focus on the actual coding.

GitHub: [link]
npm: `npx comet-mcp`

Curious what browser tasks you'd use this for?
```

**r/LocalLLaMA** (Technical audience)
- Focus on the agent-to-agent architecture
- MCP + CDP bridge, token efficiency

**r/programming** (Broader reach)
- "When there's no API for what you need"
- The three gaps framing

### 4. Twitter/X

**Thread Hook Options:**
```
1. "Claude Code has 3 gaps for web tasks. I fixed the third one."

2. "WebSearch gives results. Puppeteer needs micromanaging.
   What about things with no API at all?

   I built comet-mcp for agent-to-agent delegation. Thread 🧵"

3. "Stop making Claude write Puppeteer commands.
   Let it delegate to an agent that actually knows how to browse."
```

**Thread Structure (7 tweets):**

Tweet 1 (Hook):
```
Claude Code has 3 gaps for web tasks:

1. WebSearch → static results, can't interact
2. Puppeteer → Claude writes click commands (wastes tokens)
3. No API exists → Stripe config, Vercel env vars, OAuth...

I built comet-mcp to fix #2 and #3.

Here's the idea 🧵
```

Tweet 2 (Problem with Puppeteer):
```
You could give Claude a Puppeteer MCP.

But then Claude has to write:
"click #btn, wait 2s, scroll down, find .element..."

This wastes tokens on browser mechanics.
Claude isn't good at this. It's not a browser expert.
```

Tweet 3 (The insight):
```
The insight: don't make Claude learn browser automation.

Let it delegate to an agent that already knows how.

Enter Perplexity Comet - an agentic browser that
figures out how to navigate, where to click, what to read.
```

Tweet 4 (Agent-to-agent):
```
comet-mcp enables agent-to-agent delegation:

Claude (Manager): "Research how to set up Stripe webhooks"
         ↓
Comet (Specialist): [navigates docs, finds settings, reads instructions]
         ↓
Claude: [uses results in your codebase context]

Each AI does what it's best at.
```

Tweet 5 (Use cases):
```
Perfect for things with NO API/CLI:

- Stripe dashboard configs
- Vercel/Netlify env vars
- OAuth app setup (Google, GitHub)
- AWS Console navigation
- Any SaaS admin panel

When there's no programmatic option, Comet handles it.
```

Tweet 6 (Setup):
```
Setup takes 2 minutes:

1. Add to ~/.claude.json:
{
  "mcpServers": {
    "comet-bridge": {
      "command": "npx",
      "args": ["-y", "comet-mcp"]
    }
  }
}

2. Start Comet with:
--remote-debugging-port=9222
```

Tweet 7 (CTA):
```
Try it:

GitHub: github.com/hanzili/comet-mcp
npm: npx comet-mcp

6 tools. Agent-to-agent. Open source.

What browser tasks would you delegate?
```

### 5. Product Hunt (Later)

- Wait until you have: demo GIF, some GitHub stars, user testimonials
- Launch on Tuesday-Thursday
- Prepare hunter, tagline, screenshots in advance

---

## Content Assets Needed

### Must Have:
- [ ] **Demo GIF** (30 sec): Show Claude delegating "research Stripe webhook setup" → Comet navigating → results
- [ ] **GitHub README** with clear setup steps ✅
- [ ] **Architecture diagram** (agent-to-agent flow) ✅

### Nice to Have:
- [ ] **Video demo** (2-3 min YouTube)
- [ ] **Blog post**: "Why I built comet-mcp: Agent-to-Agent for the browser gap"
- [ ] **Comparison chart**: WebSearch vs Puppeteer MCP vs comet-mcp

---

## Demo Suggestion

**Task:** Research how to configure something in a SaaS dashboard

```
User: "I need to set up Stripe webhooks for my app. Walk me through
       the process and tell me exactly where to click in the dashboard"

Claude → Comet: "Research the exact steps to set up Stripe webhooks -
                what settings page, what options to configure, any gotchas"

Comet: [navigates Stripe docs, finds dashboard instructions, reads setup guide]

Result: "In Stripe Dashboard: Developers → Webhooks → Add endpoint.
        Enter your URL, select events (payment_intent.succeeded, etc.)
        Copy the signing secret for verification..."
```

**Why this demo works:**
1. WebSearch would give generic articles, not dashboard navigation
2. Puppeteer would require Claude to write click-by-click commands
3. Shows Comet figuring out HOW on its own
4. Result is immediately actionable

---

## Messaging Framework

### For Different Audiences:

**Claude Code Users:**
> "WebSearch gives static results. Puppeteer wastes tokens on click commands. comet-mcp lets Claude delegate browser tasks to Perplexity Comet - agent-to-agent, each AI doing what it's best at."

**MCP Developers:**
> "Agent-to-agent delegation via MCP + CDP. Claude sends goals, Comet handles browser mechanics. 6 tools: connect, ask, poll, stop, screenshot, mode."

**General Developers:**
> "For things with no API, no CLI, no MCP - Stripe configs, Vercel env vars, OAuth setup - now Claude can handle them by delegating to an agentic browser."

### Objection Handling:

**"Why not just use WebSearch/Tavily?"**
> They return static results. Can't navigate dashboards, fill forms, or interact with web apps. When you need to know WHERE to click in Stripe's dashboard, search results don't help.

**"Why not Puppeteer MCP?"**
> Then Claude has to write "click #btn, wait, scroll, find element..." - wasting tokens on browser mechanics it's not good at. comet-mcp lets Claude delegate the HOW to Comet, which already knows how to browse.

**"Why Perplexity Comet specifically?"**
> Comet has built-in agentic browsing - it's an AI that knows how to research, not just a remote-controlled browser. Agent-to-agent > agent-to-puppet.

**"Is this secure?"**
> Comet runs locally on your machine. You control what it accesses. No credentials flow through the MCP server.

---

## Launch Timeline

### Day -7 (Prep)
- [ ] Record demo GIF
- [ ] Verify npm package works via npx
- [ ] Test setup on fresh machine
- [ ] Submit to awesome-mcp-servers

### Day -1
- [ ] Draft all posts (HN, Reddit, Twitter)
- [ ] Prepare to respond quickly to comments

### Day 0 (Launch)
- Morning: Post on Hacker News (Show HN)
- Afternoon: Post on r/ClaudeAI
- Evening: Twitter thread

### Day +1 to +7
- [ ] Engage with all comments
- [ ] Post on r/LocalLLaMA, r/programming
- [ ] Share on LinkedIn
- [ ] Submit to mcpservers.org

---

## Success Metrics

- GitHub stars: 100+ in first week
- npm downloads: 500+ in first month
- HN: Front page (even briefly)
- Reddit: 50+ upvotes on r/ClaudeAI
- Twitter: 10k+ impressions on thread

---

## Key Learnings from Research

1. **Developers distrust marketing fluff** - Show, don't tell
2. **HN values clear titles** - Make it obvious what you built
3. **Link to GitHub** - Signals working code, open source, dev tool
4. **Engage authentically** - Respond to every comment like a human
5. **Solve real pain** - Not "nice to have" but "fundamentally different"
6. **MCP ecosystem is hot** - Get listed in directories early
7. **Demo > Description** - A 30-sec GIF is worth 1000 words

---

## One-Liner Options

```
"Agent-to-agent delegation for Claude Code's browser gap"

"WebSearch gives results. Puppeteer needs micromanaging. comet-mcp delegates."

"For things with no API - let Claude delegate to Comet"

"Stop making Claude write Puppeteer commands"
```

## The Pitch (30 seconds)

> Claude Code is great, but it has three gaps for web tasks:
>
> WebSearch gives static results - can't interact with anything.
> Puppeteer makes Claude write click commands - wastes tokens, Claude's bad at it.
> And many things just have no API - Stripe configs, Vercel env vars, OAuth setup.
>
> comet-mcp solves this with agent-to-agent delegation.
> Claude just says what it needs. Comet figures out how to get it.
> Each AI does what it's best at.
>
> Six tools. Two minute setup. Open source.
