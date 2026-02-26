// Tab Groups client — manages a separate CDP connection to the
// Comet Tab Groups Bridge extension's service worker and wraps
// all chrome.tabGroups.* / chrome.tabs.group/ungroup API calls.
//
// Architecture:
//   TabGroupsClient --CDP--> extension service worker --chrome.tabGroups.*--> Comet UI
//
// Discovery: scans /json/list for service_worker targets, probes each
// for the __COMET_TAB_GROUPS_BRIDGE__ marker set by background.js.

import CDP from "chrome-remote-interface";

// ---- Types ----

export type TabGroupColor =
  | "grey"
  | "blue"
  | "red"
  | "yellow"
  | "green"
  | "pink"
  | "purple"
  | "cyan"
  | "orange";

export interface TabGroup {
  id: number;
  collapsed: boolean;
  color: TabGroupColor;
  title: string;
  windowId: number;
}

export interface TabInfo {
  id: number;
  groupId: number; // -1 if ungrouped
  windowId: number;
  index: number;
  title: string;
  url: string;
  active: boolean;
}

export interface CreateGroupOptions {
  tabIds: number[];
  title?: string;
  color?: TabGroupColor;
}

export interface UpdateGroupOptions {
  groupId: number;
  title?: string;
  color?: TabGroupColor;
  collapsed?: boolean;
}

// ---- Client ----

export class TabGroupsClient {
  private client: CDP.Client | null = null;
  private port: number;

  constructor(port: number = 9222) {
    this.port = port;
  }

  get isConnected(): boolean {
    return this.client !== null;
  }

  // ---------- Connection management ----------

  /**
   * Find and connect to the extension's service worker via CDP.
   * Scans all targets for the __COMET_TAB_GROUPS_BRIDGE__ marker.
   */
  async connect(): Promise<string> {
    // 1. List all CDP targets
    const response = await fetch(
      `http://127.0.0.1:${this.port}/json/list`
    );
    if (!response.ok) {
      throw new Error(
        `Cannot reach Comet on port ${this.port}. Is Comet running with --remote-debugging-port=${this.port}?`
      );
    }
    const targets = (await response.json()) as Array<{
      id: string;
      type: string;
      url: string;
      webSocketDebuggerUrl?: string;
    }>;

    // 2. Filter for service workers with a WebSocket URL
    const serviceWorkers = targets.filter(
      (t) => t.type === "service_worker" && t.webSocketDebuggerUrl
    );

    if (serviceWorkers.length === 0) {
      throw new Error(
        "No extension service workers found. " +
          "Load the Comet Tab Groups Bridge extension in comet://extensions (Developer mode → Load unpacked)."
      );
    }

    // 3. Probe each service worker for our marker
    for (const sw of serviceWorkers) {
      let testClient: CDP.Client | null = null;
      try {
        testClient = await CDP({ target: sw.webSocketDebuggerUrl });
        await testClient.Runtime.enable();

        const result = await testClient.Runtime.evaluate({
          expression: "self.__COMET_TAB_GROUPS_BRIDGE__ === true",
          returnByValue: true,
        });

        if (result.result.value === true) {
          this.client = testClient;
          return `Connected to Tab Groups Bridge extension (target: ${sw.id})`;
        }

        await testClient.close();
      } catch {
        if (testClient) {
          try {
            await testClient.close();
          } catch {
            /* ignore */
          }
        }
      }
    }

    throw new Error(
      "Comet Tab Groups Bridge extension not found among service workers. " +
        "Ensure the extension is loaded in comet://extensions."
    );
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        /* ignore */
      }
      this.client = null;
    }
  }

  /**
   * Ensure a healthy connection; reconnect transparently if stale.
   */
  private async ensureConnected(): Promise<void> {
    if (!this.client) {
      await this.connect();
      return;
    }

    // Health check — verify the marker is still reachable
    try {
      const result = await Promise.race([
        this.client.Runtime.evaluate({
          expression: "self.__COMET_TAB_GROUPS_BRIDGE__",
          returnByValue: true,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("health check timeout")), 3000)
        ),
      ]);
      if ((result as any)?.result?.value !== true) {
        throw new Error("marker missing");
      }
    } catch {
      await this.disconnect();
      await this.connect();
    }
  }

  // ---------- Evaluate helper ----------

  /**
   * Evaluate an expression in the extension service worker context.
   * Handles async/Promise results via awaitPromise.
   */
  private async evaluate(expression: string): Promise<any> {
    await this.ensureConnected();

    const result = await this.client!.Runtime.evaluate({
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      const msg =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text;
      throw new Error(`Extension eval error: ${msg}`);
    }

    return result.result.value;
  }

  // ---------- Public API ----------

  /** List all tab groups across all windows. */
  async listGroups(): Promise<TabGroup[]> {
    return await this.evaluate(`
      (async () => {
        const groups = await chrome.tabGroups.query({});
        return groups.map(g => ({
          id: g.id, collapsed: g.collapsed, color: g.color,
          title: g.title, windowId: g.windowId,
        }));
      })()
    `);
  }

  /** Get a single tab group by ID. */
  async getGroup(groupId: number): Promise<TabGroup> {
    return await this.evaluate(`
      (async () => {
        const g = await chrome.tabGroups.get(${groupId});
        return {
          id: g.id, collapsed: g.collapsed, color: g.color,
          title: g.title, windowId: g.windowId,
        };
      })()
    `);
  }

  /** Create a new tab group from tab IDs, optionally naming and coloring it. */
  async createGroup(
    options: CreateGroupOptions
  ): Promise<{ groupId: number; group: TabGroup }> {
    const tabIdsJson = JSON.stringify(options.tabIds);
    const title = options.title != null ? JSON.stringify(options.title) : "undefined";
    const color = options.color != null ? JSON.stringify(options.color) : "undefined";

    return await this.evaluate(`
      (async () => {
        const groupId = await chrome.tabs.group({ tabIds: ${tabIdsJson} });
        const updateProps = {};
        const t = ${title};
        const c = ${color};
        if (t !== undefined) updateProps.title = t;
        if (c !== undefined) updateProps.color = c;
        if (Object.keys(updateProps).length > 0) {
          await chrome.tabGroups.update(groupId, updateProps);
        }
        const g = await chrome.tabGroups.get(groupId);
        return {
          groupId: g.id,
          group: {
            id: g.id, collapsed: g.collapsed, color: g.color,
            title: g.title, windowId: g.windowId,
          },
        };
      })()
    `);
  }

  /** Update an existing tab group's title, color, or collapsed state. */
  async updateGroup(options: UpdateGroupOptions): Promise<TabGroup> {
    const props: string[] = [];
    if (options.title !== undefined)
      props.push(`title: ${JSON.stringify(options.title)}`);
    if (options.color !== undefined)
      props.push(`color: ${JSON.stringify(options.color)}`);
    if (options.collapsed !== undefined)
      props.push(`collapsed: ${options.collapsed}`);

    return await this.evaluate(`
      (async () => {
        const g = await chrome.tabGroups.update(${options.groupId}, { ${props.join(", ")} });
        return {
          id: g.id, collapsed: g.collapsed, color: g.color,
          title: g.title, windowId: g.windowId,
        };
      })()
    `);
  }

  /** Move a tab group to a new position. */
  async moveGroup(groupId: number, index: number): Promise<TabGroup> {
    return await this.evaluate(`
      (async () => {
        const g = await chrome.tabGroups.move(${groupId}, { index: ${index} });
        return {
          id: g.id, collapsed: g.collapsed, color: g.color,
          title: g.title, windowId: g.windowId,
        };
      })()
    `);
  }

  /** Remove tabs from their groups (tabs remain open). */
  async ungroupTabs(tabIds: number[]): Promise<void> {
    await this.evaluate(`
      (async () => {
        await chrome.tabs.ungroup(${JSON.stringify(tabIds)});
      })()
    `);
  }

  /** List all tabs with their groupId (−1 = ungrouped). */
  async listTabs(): Promise<TabInfo[]> {
    return await this.evaluate(`
      (async () => {
        const tabs = await chrome.tabs.query({});
        return tabs.map(t => ({
          id: t.id, groupId: t.groupId, windowId: t.windowId,
          index: t.index, title: t.title, url: t.url, active: t.active,
        }));
      })()
    `);
  }
}

/** Singleton instance — lazy-connects on first use. */
export const tabGroupsClient = new TabGroupsClient();
