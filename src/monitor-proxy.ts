import type { MonitorState } from "./types.js";

const MONITOR_URL = "http://127.0.0.1:5555/api/state";
const TIMEOUT_MS = 3000;

export interface IMonitorProxy {
  getState(section?: "windows" | "tabs" | "all"): Promise<MonitorState>;
  isAvailable(): Promise<boolean>;
}

interface FlaskStateResponse {
  timestamp?: string;
  windows?: Array<{
    index: number;
    title: string;
    x: number;
    y: number;
    w: number;
    h: number;
    display: string;
    fullscreen: boolean;
  }>;
  window_count?: number;
  tabs?: Array<{ id: string; title: string; url: string; type: string }>;
  tab_count?: number;
}

function toUnavailable(reason: string): MonitorState {
  return { available: false, reason: `comet-monitor unreachable: ${reason}` };
}

export class MonitorProxy implements IMonitorProxy {
  async getState(section: "windows" | "tabs" | "all" = "all"): Promise<MonitorState> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(MONITOR_URL, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        return toUnavailable(`${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as FlaskStateResponse;
      const windows = data.windows ?? [];
      const tabs = (data.tabs ?? []).filter(
        (t): t is { id: string; title: string; url: string; type: string } =>
          typeof t === "object" && t !== null && "id" in t && "url" in t
      );
      const windowCount = data.window_count ?? windows.length;
      const tabCount = data.tab_count ?? tabs.length;

      const base: MonitorState = {
        available: true,
        timestamp: data.timestamp,
      };

      if (section === "windows") {
        return { ...base, windows, window_count: windowCount };
      }
      if (section === "tabs") {
        return { ...base, tabs, tab_count: tabCount };
      }
      return {
        ...base,
        windows,
        window_count: windowCount,
        tabs,
        tab_count: tabCount,
      };
    } catch (err) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : String(err);
      return toUnavailable(msg);
    }
  }

  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(MONITOR_URL, { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      clearTimeout(timeout);
      return false;
    }
  }
}
