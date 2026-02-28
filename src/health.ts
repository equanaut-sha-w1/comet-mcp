import type {
  ComponentHealthResult,
  ComponentName,
  HealthCheckResult,
  HealthLevel,
} from "./types.js";

const CACHE_TTL_MS = 5000;
const PROBE_TIMEOUT_MS = 3000;

export interface IHealthChecker {
  check(force?: boolean): Promise<HealthCheckResult>;
  getCached(): HealthCheckResult | null;
}

export interface HealthCheckerDeps {
  cdpPort?: number;
  dormancyManager: { isExtensionAlive(): Promise<boolean> };
  monitorProxy: { isAvailable(): Promise<boolean> };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

export class HealthChecker implements IHealthChecker {
  private readonly cdpPort: number;
  private readonly dormancyManager: HealthCheckerDeps["dormancyManager"];
  private readonly monitorProxy: HealthCheckerDeps["monitorProxy"];
  private cache: HealthCheckResult | null = null;

  constructor(deps: HealthCheckerDeps) {
    this.cdpPort = deps.cdpPort ?? 9222;
    this.dormancyManager = deps.dormancyManager;
    this.monitorProxy = deps.monitorProxy;
  }

  check(force?: boolean): Promise<HealthCheckResult> {
    if (!force && this.cache) {
      const age = Date.now() - this.cache.checkedAt;
      if (age < CACHE_TTL_MS) return Promise.resolve(this.cache);
    }

    const start = Date.now();
    return this.runProbes().then((components) => {
      const duration_ms = Date.now() - start;
      const overall = this.deriveOverall(components);
      const result: HealthCheckResult = {
        overall,
        components,
        checkedAt: Date.now(),
        duration_ms,
      };
      this.cache = result;
      return result;
    });
  }

  getCached(): HealthCheckResult | null {
    return this.cache;
  }

  private deriveOverall(
    components: Record<string, ComponentHealthResult>
  ): "healthy" | "degraded" | "down" {
    const browser = components.browser?.status === "healthy";
    const mcp = components["comet-mcp"]?.status === "healthy";
    const monitor = components["comet-monitor"]?.status === "healthy";
    const extension = components.extension?.status === "healthy";

    if (browser && mcp) {
      return monitor && extension ? "healthy" : "degraded";
    }
    return "down";
  }

  private async runProbes(): Promise<
    Record<string, ComponentHealthResult>
  > {
    const [browser, cometMcp, cometMonitor, extension] = await Promise.allSettled([
      this.probeBrowser(),
      this.probeCometMcp(),
      this.probeCometMonitor(),
      this.probeExtension(),
    ]);

    return {
      browser: this.unwrap("browser", browser),
      "comet-mcp": this.unwrap("comet-mcp", cometMcp),
      "comet-monitor": this.unwrap("comet-monitor", cometMonitor),
      extension: this.unwrap("extension", extension),
    };
  }

  private unwrap(
    name: ComponentName,
    settled: PromiseSettledResult<ComponentHealthResult>
  ): ComponentHealthResult {
    if (settled.status === "fulfilled") return settled.value;
    return {
      name,
      status: "unreachable",
      reason: settled.reason?.message ?? String(settled.reason),
      latency_ms: null,
    };
  }

  private async probeBrowser(): Promise<ComponentHealthResult> {
    const start = Date.now();
    const url = `http://127.0.0.1:${this.cdpPort}/json/version`;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      const latency_ms = Date.now() - start;
      const status: HealthLevel = res.ok ? "healthy" : "unreachable";
      return {
        name: "browser",
        status,
        reason: res.ok ? null : `${res.status} ${res.statusText}`,
        latency_ms,
      };
    } catch (err) {
      const latency_ms = Date.now() - start;
      return {
        name: "browser",
        status: "unreachable",
        reason: err instanceof Error ? err.message : String(err),
        latency_ms,
      };
    }
  }

  private async probeCometMcp(): Promise<ComponentHealthResult> {
    const start = Date.now();
    return {
      name: "comet-mcp",
      status: "healthy",
      reason: null,
      latency_ms: Date.now() - start,
    };
  }

  private async probeCometMonitor(): Promise<ComponentHealthResult> {
    const start = Date.now();
    try {
      const ok = await withTimeout(
        this.monitorProxy.isAvailable(),
        PROBE_TIMEOUT_MS
      );
      const latency_ms = Date.now() - start;
      return {
        name: "comet-monitor",
        status: ok ? "healthy" : "unreachable",
        reason: ok ? null : "isAvailable returned false",
        latency_ms,
      };
    } catch (err) {
      const latency_ms = Date.now() - start;
      return {
        name: "comet-monitor",
        status: "unreachable",
        reason: err instanceof Error ? err.message : String(err),
        latency_ms,
      };
    }
  }

  private async probeExtension(): Promise<ComponentHealthResult> {
    const start = Date.now();
    try {
      const ok = await withTimeout(
        this.dormancyManager.isExtensionAlive(),
        PROBE_TIMEOUT_MS
      );
      const latency_ms = Date.now() - start;
      return {
        name: "extension",
        status: ok ? "healthy" : "unreachable",
        reason: ok ? null : "isExtensionAlive returned false",
        latency_ms,
      };
    } catch (err) {
      const latency_ms = Date.now() - start;
      return {
        name: "extension",
        status: "unreachable",
        reason: err instanceof Error ? err.message : String(err),
        latency_ms,
      };
    }
  }
}
