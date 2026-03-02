import { describe, it, expect } from "vitest";

const API_BASE = process.env.COMET_API_URL || "http://127.0.0.1:3456";

describe.skip("shortwave integration (requires Shortwave login — run manually)", () => {
  it("delegate triage routes through shortwave-triage template", async () => {
    const res = await fetch(new URL("/api/delegate", API_BASE).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "triage my email in Shortwave" }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("tools_invoked");
    expect(body.tools_invoked).toContain("comet_connect");
  });

  it("shortwave-query template targets Shortwave URL", async () => {
    const res = await fetch(new URL("/api/delegate", API_BASE).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "ask Shortwave to summarize my unread emails" }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty("tools_invoked");
    expect(Array.isArray(body.tools_invoked)).toBe(true);
  });
});
