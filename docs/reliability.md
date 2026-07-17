# Reliability evidence

DevRelay treats each external delivery as repeatable and every public state as evidence-backed. The proof suite runs against isolated PostgreSQL databases and a real local Redis instance; browser journeys use a deterministic HTTP API so UI failures are reproducible without production credentials.

## Reproduce the proof

Start the local infrastructure, install Chromium once, and run the complete gate:

```powershell
pnpm infra:up
pnpm exec playwright install chromium
pnpm check
```

The focused database and queue proof is:

```powershell
pnpm exec vitest run tests/reliability-proof.integration.test.ts tests/queue-execution.integration.test.ts --config vitest.integration.config.ts
```

## Fault matrix

| Fault or risk                            | Evidence                                                                              | Required invariant                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Duplicate scheduled check                | `queue-execution.integration.test.ts`                                                 | One expected window and one result                                            |
| Duplicate/out-of-order policy delivery   | `policy-engine.integration.test.ts`                                                   | No state regression or extra incident                                         |
| Concurrent automatic incident creators   | `policy-engine.integration.test.ts`                                                   | One active automatic incident per fingerprint                                 |
| Worker connection killed mid-transaction | `reliability-proof.integration.test.ts`                                               | Uncommitted state is absent after disconnect                                  |
| Redis queue client restart               | `queue-execution.integration.test.ts`                                                 | Delayed job remains present and deduplicated                                  |
| Duplicate outbox and subscriber fan-out  | `queue-execution.integration.test.ts`, `subscriber-notifications.integration.test.ts` | One logical notification delivery                                             |
| Email/webhook retry and terminal failure | Notification unit and integration suites                                              | Attempts are bounded and terminal failures remain inspectable                 |
| Scheduler stopped or evidence stale      | `policy-engine.integration.test.ts`                                                   | Service becomes `unknown`, never implicitly healthy                           |
| Hosted dispatcher paused or capped       | `queue-execution.integration.test.ts`                                                 | No dispatch while paused; batches stay bounded                                |
| Retention under representative volume    | `reliability-proof.integration.test.ts`                                               | Expired rows are removed idempotently within five seconds                     |
| Roles and authorization                  | Authentication/authorization integration tests and browser role journey               | Owner-only controls remain hidden and rejected by the API                     |
| UI outage and responder journeys         | Playwright desktop/mobile projects                                                    | Visible outcome, keyboard path, no horizontal overflow, and no axe violations |

## Representative volume

The load fixture inserts 6,000 completed check windows/results and 2,000 audit events in an isolated tenant. It analyzes the tables, runs the same recent-monitor and audit-timeline queries used by the product with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, and asserts that the purpose-built indexes are selected. The July 18, 2026 local run selected:

- `check_results_recent_monitor_idx` for the latest 50 monitor results.
- `audit_events_organization_timeline_idx` for the latest 50 audit events.

The same run removed the expired portion of the 125-day check history within the five-second gate. Cleanup is tenant-scoped and idempotent, and the recent slice remains queryable afterward.

## Completion standard

The proof passes only when duplicate work converges to one durable result, restarts preserve retryable work, stale monitoring produces `unknown`, public/private communication stays separated, and the full format, lint, boundary, type, unit, integration, browser, accessibility, and production-build gates pass.
