# comet-mcp Vitest Baseline Report

**Date**: 2026-03-02
**Branch**: main
**Node**: v20.10.0
**Vitest**: v4.0.18
**TypeScript**: Clean (0 errors with `tsc --noEmit`)

---

## Summary

| Metric          | Count |
| --------------- | ----- |
| Test files       | 13    |
| Total tests      | 97    |
| **Passed**       | **95** |
| **Skipped**      | **2**  |
| **Failed**       | **0**  |
| Duration         | 14.12s |

---

## Unit Tests — ALL PASS (4 files, 36 tests)

| File                               | Tests | Status |
| ---------------------------------- | ----- | ------ |
| `tests/unit/tool-router.test.ts`   | 9     | PASS   |
| `tests/unit/task-templates.test.ts` | 11    | PASS   |
| `tests/unit/task-queue.test.ts`    | 11    | PASS   |
| `tests/unit/python-bridge.test.ts` | 5     | PASS   |

All unit tests pass cleanly. `python-bridge.test.ts` takes ~6s due to 3-second async timeouts.

---

## Contract Tests — ALL PASS (5 files, 18 tests)

| File                                     | Tests | Status | Notes |
| ---------------------------------------- | ----- | ------ | ----- |
| `tests/contract/delegate.test.ts`        | 7     | PASS   | Real API calls to /api/delegate |
| `tests/contract/health.test.ts`          | 5     | PASS   | Real API calls to /api/health |
| `tests/contract/monitor.test.ts`         | 4     | PASS   | Real API calls to /api/monitor |
| `tests/contract/poll-extended.test.ts`   | 3     | PASS   | Real API calls to /api/poll |
| `tests/contract/stop-extended.test.ts`   | 3     | PASS   | Real API calls to /api/stop |

All contract test stubs now implemented with real HTTP calls to localhost:3456.

---

## Integration Tests — 6 PASS, 2 SKIPPED (3 files, 8 tests)

| File                                      | Tests | Pass | Skip | Notes |
| ----------------------------------------- | ----- | ---- | ---- | ----- |
| `tests/integration/orchestrator.test.ts`  | 5     | 5    | 0    | Live orchestrator + health + monitor |
| `tests/integration/dormancy.test.ts`      | 3     | 3    | 0    | Extension wake/probe via CDP |
| `tests/integration/shortwave.test.ts`     | 2     | 0    | 2    | Requires active Shortwave session |

---

## Benchmark Tests — ALL PASS (1 file, 29 tests)

| File                                              | Tests | Status | Duration |
| ------------------------------------------------- | ----- | ------ | -------- |
| `tests/benchmark/quickstart-scenarios.test.ts`    | 29    | PASS   | ~14s     |

Covers 16 quickstart validation scenarios including:
- Health check happy/degraded paths
- Delegate tool routing for research, screenshot, navigate, Shortwave
- Monitor window/tab/display data
- Poll extended fields (task_id, task_state, elapsed_ms)
- Stop extended fields (task_id cancellation)
- NFR-001 orchestration overhead benchmark (avg=55ms, max=114ms, all <500ms)
- NFR-004 dormancy recovery benchmark (100% success rate)

---

## Skipped Tests (2)

| Test | Reason |
| ---- | ------ |
| `shortwave.test.ts > shortwave-triage` | Requires active Shortwave session logged in |
| `shortwave.test.ts > shortwave-query` | Requires active Shortwave session logged in |

---

## Previous Baseline (2026-02-28)

| Metric | Feb 28 | Mar 02 | Change |
| ------ | ------ | ------ | ------ |
| Passed | 43 | 95 | +52 |
| Failed | 16 | 0 | -16 |
| Skipped | 13 | 2 | -11 |
| Total | 72 | 97 | +25 |

All 16 contract test failures resolved (stubs implemented with real API calls).
11 integration tests enabled (were describe.skip, now running against live browser).
29 benchmark tests added (new file).
