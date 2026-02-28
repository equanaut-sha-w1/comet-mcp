import { describe, it, expect, beforeEach } from "vitest";
import { TaskTemplateRegistry } from "../../src/task-templates.js";
import type { TaskTemplate, TaskTemplateStep } from "../../src/types.js";

function makeStep(toolName: string, server = "comet-browser" as const): TaskTemplateStep {
  return {
    toolName,
    server,
    paramTemplate: {},
    description: "",
  };
}

describe("TaskTemplateRegistry", () => {
  let registry: TaskTemplateRegistry;

  beforeEach(() => {
    registry = new TaskTemplateRegistry({ skipBuiltins: true });
  });

  it("register and get lifecycle", () => {
    const template: TaskTemplate = {
      name: "test-template",
      description: "A test template",
      triggerPatterns: ["test", "verify"],
      defaultParams: {},
      steps: [makeStep("comet_ask")],
    };
    registry.register(template);
    const got = registry.get("test-template");
    expect(got).not.toBeNull();
    expect(got!.name).toBe("test-template");
    expect(got!.description).toBe("A test template");
  });

  it("getAll returns all registered templates", () => {
    registry.register({
      name: "a",
      description: "A",
      triggerPatterns: [],
      defaultParams: {},
      steps: [],
    });
    registry.register({
      name: "b",
      description: "B",
      triggerPatterns: [],
      defaultParams: {},
      steps: [],
    });
    const all = registry.getAll();
    expect(all.length).toBe(2);
    expect(all.map((t) => t.name).sort()).toEqual(["a", "b"]);
  });

  it("match returns template for research query", () => {
    registry.register({
      name: "research",
      description: "Deep research",
      triggerPatterns: ["research", "look up", "find information about"],
      defaultParams: {},
      steps: [makeStep("comet_ask")],
    });
    const matched = registry.match("research SEC filings");
    expect(matched).not.toBeNull();
    expect(matched!.name).toBe("research");
  });

  it("match returns template for search query", () => {
    registry.register({
      name: "search",
      description: "Web search",
      triggerPatterns: ["search for", "search", "find"],
      defaultParams: {},
      steps: [makeStep("comet_navigate")],
    });
    const matched = registry.match("search for TypeScript best practices");
    expect(matched).not.toBeNull();
    expect(matched!.name).toBe("search");
  });

  it("match returns template for Shortwave triage", () => {
    registry.register({
      name: "shortwave-triage",
      description: "Triage email in Shortwave",
      triggerPatterns: ["triage", "shortwave", "email triage"],
      defaultParams: { mode: "Advanced" },
      steps: [makeStep("comet_navigate")],
    });
    const matched = registry.match("triage my email in Shortwave");
    expect(matched).not.toBeNull();
    expect(matched!.name).toBe("shortwave-triage");
  });

  it("match returns template for navigate-extract", () => {
    registry.register({
      name: "navigate-extract",
      description: "Navigate and extract content",
      triggerPatterns: ["navigate to", "extract", "go to"],
      defaultParams: {},
      steps: [makeStep("comet_navigate"), makeStep("comet_get_content")],
    });
    const matched = registry.match("navigate to https://example.com and extract the title");
    expect(matched).not.toBeNull();
    expect(matched!.name).toBe("navigate-extract");
  });

  it("match returns null for unrecognized description", () => {
    registry.register({
      name: "research",
      description: "Research",
      triggerPatterns: ["research"],
      defaultParams: {},
      steps: [],
    });
    const matched = registry.match("something completely unrecognized XYZ123");
    expect(matched).toBeNull();
  });

  it("matching is case-insensitive", () => {
    registry.register({
      name: "research",
      description: "Research",
      triggerPatterns: ["research"],
      defaultParams: {},
      steps: [],
    });
    const matched = registry.match("RESEARCH quantum computing");
    expect(matched).not.toBeNull();
    expect(matched!.name).toBe("research");
  });

  it("template hint bypasses keyword matching", () => {
    registry.register({
      name: "research",
      description: "Research",
      triggerPatterns: ["look up", "find info"],
      defaultParams: {},
      steps: [],
    });
    const got = registry.get("research");
    expect(got).not.toBeNull();
    expect(got!.name).toBe("research");
  });

  it("Shortwave templates default mode to Advanced", () => {
    registry.register({
      name: "shortwave-triage",
      description: "Shortwave triage",
      triggerPatterns: ["shortwave"],
      defaultParams: { mode: "Advanced" },
      steps: [],
    });
    const t = registry.get("shortwave-triage");
    expect(t).not.toBeNull();
    expect(t!.defaultParams.mode).toBe("Advanced");
  });

  it("first-match precedence", () => {
    registry.register({
      name: "first",
      description: "First",
      triggerPatterns: ["research", "search"],
      defaultParams: {},
      steps: [],
    });
    registry.register({
      name: "second",
      description: "Second",
      triggerPatterns: ["research", "look up"],
      defaultParams: {},
      steps: [],
    });
    const matched = registry.match("research something");
    expect(matched).not.toBeNull();
    expect(matched!.name).toBe("first");
  });
});
