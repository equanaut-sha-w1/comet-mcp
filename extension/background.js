// Comet Tab Groups Bridge — service worker
// Marker for CDP discovery: comet-mcp scans service workers for this flag
self.__COMET_TAB_GROUPS_BRIDGE__ = true;
self.__COMET_TAB_GROUPS_VERSION__ = "1.0.0";

// Keep service worker alive — Chromium kills idle workers after ~30s.
// CDP evaluations reset the timer, but a keepalive ensures we survive gaps.
let keepAliveInterval = null;

function startKeepAlive() {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(() => {
    // no-op heartbeat to reset idle timer
  }, 25000);
}

chrome.runtime.onInstalled.addListener(() => startKeepAlive());
startKeepAlive();
