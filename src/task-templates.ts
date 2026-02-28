import type { TaskTemplate, TaskTemplateStep, ServerName } from "./types.js";

export interface ITaskTemplateRegistry {
  register(template: TaskTemplate): void;
  match(description: string): TaskTemplate | null;
  getAll(): TaskTemplate[];
  get(name: string): TaskTemplate | null;
}

function step(
  toolName: string,
  server: ServerName,
  description: string,
  paramTemplate: Record<string, unknown> = {},
  optional = false,
): TaskTemplateStep {
  return { toolName, server, paramTemplate, description, optional };
}

const URL_RE = /https?:\/\//i;

function buildBuiltins(): TaskTemplate[] {
  return [
    {
      name: "research-extract",
      description: "Deep research then extract content from result page",
      triggerPatterns: [
        "research.*then extract",
        "research.*then get",
        "research.*citations",
        "research.*pull from result",
        "deep dive.*then extract",
        "deep dive.*then get",
        "analyze.*then extract",
        "analyze.*then get",
      ],
      defaultParams: {},
      steps: [
        step("comet_connect", "comet-mcp", "Ensure Comet connection"),
        step("comet_mode", "comet-mcp", "Set Comet to research mode", { mode: "research" }),
        step("comet_ask", "comet-mcp", "Submit research query"),
        step("comet_poll", "comet-mcp", "Wait for research completion"),
        step("comet_get_content", "comet-browser", "Extract content from result page"),
      ],
    },
    {
      name: "research",
      description: "Deep research using Comet AI",
      triggerPatterns: ["research", "deep dive", "analyze"],
      defaultParams: {},
      steps: [
        step("comet_connect", "comet-mcp", "Ensure Comet connection"),
        step("comet_mode", "comet-mcp", "Set Comet to research mode", { mode: "research" }),
        step("comet_ask", "comet-mcp", "Submit research query"),
        step("comet_poll", "comet-mcp", "Wait for research completion"),
      ],
    },
    {
      name: "search",
      description: "Quick search using Comet AI",
      triggerPatterns: ["search", "look up", "quick search", "what is", "find out"],
      defaultParams: {},
      steps: [
        step("comet_connect", "comet-mcp", "Ensure Comet connection"),
        step("comet_mode", "comet-mcp", "Set Comet to search mode", { mode: "search" }),
        step("comet_ask", "comet-mcp", "Submit search query"),
        step("comet_poll", "comet-mcp", "Wait for search completion"),
      ],
    },
    {
      name: "navigate-extract",
      description: "Navigate to URL and extract page content",
      triggerPatterns: [
        "extract.*https?://",
        "scrape.*https?://",
        "get content.*https?://",
        "pull data.*https?://",
        "https?://.*extract",
        "https?://.*scrape",
        "https?://.*get content",
        "https?://.*pull data",
      ],
      defaultParams: {},
      steps: [
        step("comet_navigate", "comet-browser", "Navigate to URL"),
        step("comet_get_content", "comet-browser", "Extract page content"),
      ],
    },
    {
      name: "navigate",
      description: "Navigate browser to a URL",
      triggerPatterns: ["go to", "open", "navigate to"],
      defaultParams: {},
      steps: [
        step("comet_navigate", "comet-browser", "Navigate to URL"),
      ],
    },
    {
      name: "shortwave-saved-prompt",
      description: "Run a Shortwave saved prompt command",
      triggerPatterns: [
        "shortwave /analyze",
        "shortwave /tasks",
        "shortwave /plan",
        "shortwave /checklist",
        "shortwave /clarity",
        "shortwave /specify",
      ],
      defaultParams: { mode: "Advanced" },
      steps: [
        step("comet_connect", "comet-mcp", "Ensure Comet connection"),
        step("comet_navigate", "comet-browser", "Open Shortwave", { url: "https://app.shortwave.com/" }),
        step("comet_find_elements", "comet-browser", "Find mode selector", {}, true),
        step("comet_click", "comet-browser", "Set Advanced mode", {}, true),
        step("comet_type", "comet-browser", "Enter saved prompt command"),
        step("comet_wait", "comet-browser", "Wait for response"),
        step("comet_get_content", "comet-browser", "Extract response"),
      ],
    },
    {
      name: "shortwave-triage",
      description: "Triage emails via Shortwave AI assistant",
      triggerPatterns: [
        "shortwave triage",
        "email triage shortwave",
        "batch listen email",
        "shortwave email triage",
      ],
      defaultParams: { mode: "Advanced" },
      steps: [
        step("comet_connect", "comet-mcp", "Ensure Comet connection"),
        step("comet_navigate", "comet-browser", "Open Shortwave", { url: "https://app.shortwave.com/" }),
        step("comet_find_elements", "comet-browser", "Find mode selector", {}, true),
        step("comet_click", "comet-browser", "Set Advanced mode", {}, true),
        step("comet_click", "comet-browser", "Focus query input"),
        step("comet_type", "comet-browser", "Enter /analyze triage prompt"),
        step("comet_wait", "comet-browser", "Wait for triage response"),
        step("comet_get_content", "comet-browser", "Extract triage results"),
      ],
    },
    {
      name: "shortwave-query",
      description: "Ask Shortwave AI email assistant a question",
      triggerPatterns: ["shortwave", "ask shortwave", "email assistant", "shortwave query"],
      defaultParams: { mode: "Advanced" },
      steps: [
        step("comet_connect", "comet-mcp", "Ensure Comet connection"),
        step("comet_navigate", "comet-browser", "Open Shortwave", { url: "https://app.shortwave.com/" }),
        step("comet_find_elements", "comet-browser", "Find mode selector", {}, true),
        step("comet_click", "comet-browser", "Set Advanced mode", {}, true),
        step("comet_click", "comet-browser", "Focus query input"),
        step("comet_type", "comet-browser", "Enter query"),
        step("comet_wait", "comet-browser", "Wait for response"),
        step("comet_get_content", "comet-browser", "Extract response"),
      ],
    },
    {
      name: "dom-interact",
      description: "Interact with page DOM elements (click, type, scroll, etc.)",
      triggerPatterns: ["click", "type", "fill", "scroll", "submit", "form"],
      defaultParams: {},
      steps: [
        step("comet_find_elements", "comet-browser", "Find target element"),
        step("comet_click", "comet-browser", "Perform DOM interaction"),
      ],
    },
    {
      name: "screenshot",
      description: "Capture a screenshot of the current page",
      triggerPatterns: ["screenshot", "capture", "take picture"],
      defaultParams: {},
      steps: [
        step("comet_screenshot", "comet-mcp", "Take screenshot"),
      ],
    },
  ];
}

const URL_EXTRACT_RE = /https?:\/\/\S+/i;

const RESEARCH_TRIGGER_WORDS = ["research", "deep dive", "analyze", "look into"];
const SEARCH_TRIGGER_WORDS = ["search for", "search", "look up", "quick search", "what is", "find out about", "find out"];
const SHORTWAVE_TRIGGER_WORDS = ["shortwave", "ask shortwave", "email assistant", "shortwave query", "shortwave triage", "email triage"];
const SHORTWAVE_PROMPT_RE = /\/(analyze|tasks|plan|checklist|clarity|specify)\b/i;

function stripTriggerWords(description: string, triggers: string[]): string {
  let text = description;
  for (const t of triggers.sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    text = text.replace(re, "");
  }
  return text.replace(/^\s*[,.:;!?\-]+\s*/, "").replace(/\s+/g, " ").trim();
}

function extractCompoundParts(description: string): { left: string; right: string } | null {
  const separators = [" then ", " and then ", ", then ", " afterwards "];
  const lower = description.toLowerCase();
  for (const sep of separators) {
    const idx = lower.indexOf(sep);
    if (idx > 0) {
      return {
        left: description.slice(0, idx).trim(),
        right: description.slice(idx + sep.length).trim(),
      };
    }
  }
  return null;
}

export function extractParamsForTemplate(
  description: string,
  template: TaskTemplate,
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...template.defaultParams };

  switch (template.name) {
    case "research":
    case "search": {
      const triggers = template.name === "research" ? RESEARCH_TRIGGER_WORDS : SEARCH_TRIGGER_WORDS;
      params.prompt = stripTriggerWords(description, triggers) || description;
      break;
    }

    case "research-extract": {
      const parts = extractCompoundParts(description);
      if (parts) {
        params.prompt = stripTriggerWords(parts.left, RESEARCH_TRIGGER_WORDS) || parts.left;
        params.extractionTarget = parts.right;
      } else {
        params.prompt = stripTriggerWords(description, RESEARCH_TRIGGER_WORDS) || description;
      }
      break;
    }

    case "navigate": {
      const urlMatch = description.match(URL_EXTRACT_RE);
      if (urlMatch) params.url = urlMatch[0];
      break;
    }

    case "navigate-extract": {
      const urlMatch = description.match(URL_EXTRACT_RE);
      if (urlMatch) params.url = urlMatch[0];
      const parts = extractCompoundParts(description);
      if (parts) params.extractionTarget = parts.right;
      break;
    }

    case "shortwave-query": {
      params.query = stripTriggerWords(description, SHORTWAVE_TRIGGER_WORDS) || description;
      break;
    }

    case "shortwave-triage": {
      params.query = "/analyze";
      break;
    }

    case "shortwave-saved-prompt": {
      const promptMatch = description.match(SHORTWAVE_PROMPT_RE);
      params.promptCommand = promptMatch ? `/${promptMatch[1]}` : "/analyze";
      break;
    }

    case "dom-interact": {
      const lower = description.toLowerCase();
      if (lower.includes("click")) params.action = "click";
      else if (lower.includes("type") || lower.includes("fill")) params.action = "type";
      else if (lower.includes("scroll")) params.action = "scroll";
      else if (lower.includes("submit")) params.action = "click";
      params.target = description;
      break;
    }

    case "screenshot": {
      break;
    }
  }

  return params;
}

export class TaskTemplateRegistry implements ITaskTemplateRegistry {
  private templates: Map<string, TaskTemplate> = new Map();
  private ordered: TaskTemplate[] = [];

  constructor(options?: { skipBuiltins?: boolean }) {
    if (options?.skipBuiltins) return;
    for (const t of buildBuiltins()) {
      this.templates.set(t.name, t);
      this.ordered.push(t);
    }
  }

  register(template: TaskTemplate): void {
    if (this.templates.has(template.name)) {
      throw new Error(`Template "${template.name}" is already registered`);
    }
    this.templates.set(template.name, template);
    this.ordered.push(template);
  }

  get(name: string): TaskTemplate | null {
    return this.templates.get(name) ?? null;
  }

  getAll(): TaskTemplate[] {
    return [...this.ordered];
  }

  match(description: string): TaskTemplate | null {
    const lower = description.toLowerCase();
    const hasUrl = URL_RE.test(description);

    for (const template of this.ordered) {
      if (this.matchesTemplate(template, lower, hasUrl)) {
        return template;
      }
    }
    return null;
  }

  private matchesTemplate(template: TaskTemplate, lower: string, hasUrl: boolean): boolean {
    // navigate and navigate-extract need a URL present
    if (template.name === "navigate" || template.name === "navigate-extract") {
      if (!hasUrl) {
        // Also match "go to"/"open"/"navigate to" without URL for plain navigate
        if (template.name === "navigate") {
          return template.triggerPatterns.some((p) => lower.includes(p));
        }
        return false;
      }
      // For navigate-extract, need URL + extraction keyword
      if (template.name === "navigate-extract") {
        const extractionWords = ["extract", "scrape", "get content", "pull data"];
        return extractionWords.some((w) => lower.includes(w));
      }
      // navigate with URL: match
      return true;
    }

    for (const pattern of template.triggerPatterns) {
      if (pattern.includes("https?://")) {
        // Regex-style patterns for navigate-extract
        const re = new RegExp(pattern, "i");
        if (re.test(lower)) return true;
      } else if (lower.includes(pattern)) {
        return true;
      }
    }
    return false;
  }
}
