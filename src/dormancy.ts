import type { WakeResult, CDPTarget } from "./types.js";

const BRIDGE_MARKER = "__COMET_TAB_GROUPS_BRIDGE__";
const DEFAULT_EXTENSION_ID = "fjaeblhelfklejofdfbglhfinipofeaa";
const WAKE_TIMEOUT_MS = 5_000;
const POST_WAKE_SETTLE_MS = 500;

function extractExtensionId(url: string): string | null {
  const match = url.match(/^chrome-extension:\/\/([a-z]{32})\//);
  return match ? match[1] : null;
}

export class DormancyManager {
  private cdpPort: number;
  private cachedExtensionId: string | null = null;

  constructor(cdpPort: number = 9222) {
    this.cdpPort = cdpPort;
  }

  private get baseUrl(): string {
    return `http://127.0.0.1:${this.cdpPort}`;
  }

  private async fetchTargets(): Promise<CDPTarget[]> {
    const res = await fetch(`${this.baseUrl}/json/list`);
    if (!res.ok) throw new Error(`CDP /json/list returned ${res.status}`);
    return res.json() as Promise<CDPTarget[]>;
  }

  async isExtensionAlive(): Promise<boolean> {
    try {
      const targets = await this.fetchTargets();
      for (const t of targets) {
        const isBridge = t.url.includes(BRIDGE_MARKER);
        const isServiceWorker =
          t.type === "service_worker" && t.url.startsWith("chrome-extension://");

        if (isBridge || isServiceWorker) {
          const id = extractExtensionId(t.url);
          if (id) this.cachedExtensionId = id;
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  getExtensionId(): string | null {
    return this.cachedExtensionId;
  }

  async wake(): Promise<WakeResult> {
    const start = Date.now();
    const elapsed = () => Date.now() - start;

    const extId = await this.resolveExtensionId();
    if (!extId) {
      return {
        success: false,
        technique: "none",
        attempts: 0,
        duration_ms: elapsed(),
        error: "Extension ID could not be determined",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WAKE_TIMEOUT_MS);

    try {
      return await Promise.race([
        this.executeWakeSequence(extId, elapsed),
        new Promise<WakeResult>((_, reject) => {
          controller.signal.addEventListener("abort", () =>
            reject(new Error("Wake timeout"))
          );
        }),
      ]);
    } catch (err) {
      return {
        success: false,
        technique: "none",
        attempts: 2,
        duration_ms: elapsed(),
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveExtensionId(): Promise<string | null> {
    if (this.cachedExtensionId) return this.cachedExtensionId;

    try {
      const targets = await this.fetchTargets();
      for (const t of targets) {
        const id = extractExtensionId(t.url);
        if (id) {
          this.cachedExtensionId = id;
          return id;
        }
      }
    } catch {
      // targets unavailable, fall through
    }

    return process.env.COMET_EXTENSION_ID || DEFAULT_EXTENSION_ID;
  }

  private async executeWakeSequence(
    extId: string,
    elapsed: () => number
  ): Promise<WakeResult> {
    // Step 1: page_target — open the extension's background script as a new target
    try {
      const res = await fetch(
        `${this.baseUrl}/json/new?chrome-extension://${extId}/background.js`,
        { method: "POST" }
      );
      if (res.ok) {
        await sleep(POST_WAKE_SETTLE_MS);
        if (await this.isExtensionAlive()) {
          return {
            success: true,
            technique: "page_target",
            attempts: 1,
            duration_ms: elapsed(),
          };
        }
      }
    } catch {
      // step 1 failed, continue to step 2
    }

    // Step 2: management_toggle — disable/re-enable via chrome.management API
    try {
      const result = await this.managementToggle(extId);
      if (result) {
        await sleep(POST_WAKE_SETTLE_MS);
        if (await this.isExtensionAlive()) {
          return {
            success: true,
            technique: "management_toggle",
            attempts: 2,
            duration_ms: elapsed(),
          };
        }
      }
    } catch {
      // step 2 failed
    }

    return {
      success: false,
      technique: "none",
      attempts: 2,
      duration_ms: elapsed(),
      error: "All wake techniques exhausted",
    };
  }

  /**
   * Toggle extension via chrome.management on an existing page target's DevTools WS.
   * Uses raw JSON-RPC over WebSocket to send Runtime.evaluate commands.
   */
  private async managementToggle(extId: string): Promise<boolean> {
    const targets = await this.fetchTargets();
    const page = targets.find(
      (t) => t.type === "page" && t.webSocketDebuggerUrl
    );
    if (!page?.webSocketDebuggerUrl) return false;

    const ws = await this.openWs(page.webSocketDebuggerUrl);
    try {
      await this.cdpEval(
        ws,
        `chrome.management.setEnabled('${extId}', false)`,
        1
      );
      await sleep(300);
      await this.cdpEval(
        ws,
        `chrome.management.setEnabled('${extId}', true)`,
        2
      );
      return true;
    } finally {
      ws.close();
    }
  }

  private openWs(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => resolve(ws));
      ws.addEventListener("error", (e) =>
        reject(new Error(`WebSocket error: ${e}`))
      );
    });
  }

  private cdpEval(
    ws: WebSocket,
    expression: string,
    id: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.id === id) {
            ws.removeEventListener("message", handler);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        } catch {
          // ignore non-JSON frames
        }
      };
      ws.addEventListener("message", handler);
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        })
      );
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
