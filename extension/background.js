// Comet Tab Groups Bridge — service worker
// Marker for CDP discovery: comet-mcp scans service workers for this flag
self.__COMET_TAB_GROUPS_BRIDGE__ = true;
self.__COMET_TAB_GROUPS_VERSION__ = "1.0.1";

// Keep service worker alive — Chromium kills idle MV3 workers after ~30s.
// setInterval does NOT prevent termination. The Chrome Alarms API is the
// officially supported mechanism to wake service workers periodically.
const KEEPALIVE_ALARM = "keepalive";

chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // ~24s

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // Heartbeat — keeps the service worker in CDP target list
  }
});
