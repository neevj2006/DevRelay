# Reliability evidence

DevRelay treats external delivery as repeatable and every public state as evidence-backed. The proof suite runs against isolated PostgreSQL databases and a real local Redis instance; rendered browser journeys use a deterministic HTTP API so UI failures are reproducible without production credentials.

## Test environment

The MVP baseline was recorded on July 18–20, 2026 from commit `9e3b27d` and its Phase 14 parent evidence.

| Layer               | Recorded environment                                                                |
| ------------------- | ----------------------------------------------------------------------------------- |
| Host                | Windows 11 64-bit, AMD Ryzen 9 8940HX, 32 logical processors, 15.2 GiB visible RAM  |
| Runtime             | Node.js 26.4.0; pnpm 11.13.1                                                        |
| Containers          | Docker Engine 29.5.3; PostgreSQL 17 Alpine; Redis 7 Alpine; Mailpit 1.27            |
| Browser             | Playwright Chromium desktop plus 390×844 mobile project                             |
| Hosted smoke target | Vercel web/API, Neon PostgreSQL, QStash dispatcher, controlled Resend configuration |

Node 22.13+ remains the supported repository baseline even though this recorded Windows run used Node 26. Results below labeled **local** were measured against Docker services on this machine. Results labeled **hosted** are behavior/smoke observations, not load-test claims.

## Reproduce the proof

Start local infrastructure, install Chromium once, and run the complete gate:

```powershell
pnpm infra:up
pnpm exec playwright install chromium
pnpm check
```

The focused database and queue proof is:

```powershell
pnpm exec vitest run tests/reliability-proof.integration.test.ts tests/queue-execution.integration.test.ts --config vitest.integration.config.ts
```

## Test inventory

The release baseline contains 178 automated checks:

| Category                     | Count | Coverage                                                                                                            |
| ---------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------- |
| Unit                         |    96 | contracts, configuration, policies, HTTP safety, queue behavior, notifications, observability, and UI logic         |
| PostgreSQL/Redis integration |    74 | schema invariants, tenancy, auth, monitoring, incidents, status, delivery, operations, queues, and fault/load proof |
| Rendered Chromium            |     8 | authenticated and public journeys across desktop/mobile, keyboard paths, layout, console, and axe checks            |

Counts describe the recorded release baseline and should be updated when the suite changes.

## Fault experiments

| Experiment                   | Injection                                                                      | Observed invariant                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Duplicate scheduled message  | Execute the same versioned check job twice                                     | one expected window and one check result; the second execution reports duplicate              |
| Concurrent incident creation | Evaluate the same failing fingerprint in parallel                              | one active automatic incident, with other evaluators linking to it                            |
| Worker database interruption | Terminate the worker connection during an open transaction                     | the uncommitted write is absent after disconnect                                              |
| Queue-client restart         | Close and recreate the BullMQ client around a delayed job                      | the delayed job remains present, deduplicated, inspectable, and cancellable                   |
| Scheduler stoppage           | Advance beyond the expected evidence window and run freshness inspection twice | service becomes `unknown`; one operational alert is emitted without duplicate alerts          |
| Notification retry           | Force transient and permanent email/webhook outcomes                           | bounded attempts, exponential backoff, one logical delivery, and inspectable terminal failure |
| Outbox replay                | Repeat publication/fan-out for the same event                                  | one recipient/channel delivery per logical notification                                       |
| Retention under volume       | Seed expired and recent rows, then repeat cleanup                              | expired rows are removed, recent rows survive, and repeated cleanup converges                 |

The implementation does not rely on “exactly once” transport. It obtains exactly-once business effects through deterministic identities, database uniqueness, atomic claims, and idempotent consumers.

## Timing and performance results

### Detection and recovery

Detection and recovery are deterministic policy bounds, not a claimed universal network latency:

- **Local/hosted policy behavior:** outage confirmation occurs on the configured Nth consecutive failure; the default threshold is 3.
- **Local/hosted policy behavior:** recovery occurs on the configured Nth consecutive success; the default threshold is 2.
- **Hosted schedule bound:** the free deployment enforces a minimum 300-second interval. With default thresholds and continuously scheduled results, confirmation therefore requires three failure samples and recovery requires two success samples. Queue/provider delay is additional.
- **Stale evidence:** missed/expired evidence produces `Unknown` instead of preserving or inventing `Operational`.

No hosted end-to-end outage stopwatch result is published yet; traffic and provider latency are too limited for a representative percentile claim.

### Notification latency

The delivery processor records `notification.delivery.duration` for each attempt and preserves provider outcomes. Unit and integration tests prove success, retry, duplicate, and terminal-failure behavior. **No hosted p50/p95 notification latency is claimed** because controlled Resend testing does not provide a representative sample. This is an explicit missing benchmark, not a zero-latency result.

### Database and API/query performance

The representative **local** fixture inserts 6,000 completed check windows/results and 2,000 audit events in an isolated tenant, analyzes the tables, and runs product-shaped recent-result and tenant-audit queries with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. PostgreSQL selected:

- `check_results_recent_monitor_idx` for the latest 50 monitor results; and
- `audit_events_organization_timeline_idx` for the latest 50 tenant audit events.

The July 18, 2026 focused fault/load suite completed in 1.15 seconds. The same run removed the expired portion of a 125-day check history within the five-second non-blocking gate; cleanup remained tenant-scoped and idempotent, and the recent slice stayed queryable.

API middleware records request duration, status, method, and route without sensitive request bodies. The release does not publish hosted API percentiles because there is not enough real traffic for meaningful p50/p95 numbers. Health and cold-start smoke checks establish availability, not load capacity.

## Fault matrix by test

| Fault or risk                            | Primary evidence                          | Required invariant                                             |
| ---------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| Duplicate scheduled check                | `queue-execution.integration.test.ts`     | one expected window and one result                             |
| Duplicate/out-of-order policy delivery   | `policy-engine.integration.test.ts`       | no state regression or extra incident                          |
| Concurrent automatic incident creators   | `policy-engine.integration.test.ts`       | one active automatic incident per fingerprint                  |
| Worker connection killed mid-transaction | `reliability-proof.integration.test.ts`   | uncommitted state is absent after disconnect                   |
| Redis queue client restart               | `queue-execution.integration.test.ts`     | delayed job remains present and deduplicated                   |
| Duplicate outbox and subscriber fan-out  | queue and subscriber integration suites   | one logical notification delivery                              |
| Email/webhook retry and terminal failure | notification unit and integration suites  | attempts are bounded and failures remain inspectable           |
| Scheduler stopped or evidence stale      | `policy-engine.integration.test.ts`       | service becomes `unknown`, never implicitly healthy            |
| Hosted dispatcher paused or capped       | `queue-execution.integration.test.ts`     | no dispatch while paused; batches stay bounded                 |
| Retention under representative volume    | `reliability-proof.integration.test.ts`   | expired rows are removed idempotently within five seconds      |
| Roles and authorization                  | auth integration and browser role journey | owner-only controls remain hidden and rejected by the API      |
| UI outage and responder journeys         | Playwright desktop/mobile projects        | visible outcome, keyboard path, no overflow, no axe violations |

## Local versus hosted evidence

| Claim                                             | Local                                         | Hosted                                                  |
| ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Full unit/integration/fault suite                 | measured                                      | not run against production data                         |
| PostgreSQL index selection and retention volume   | measured                                      | not load-tested                                         |
| BullMQ restart recovery                           | measured                                      | not applicable to QStash mode                           |
| QStash pause, cap, signature, and replay behavior | automated contract/integration evidence       | production schedule and signed callbacks smoke-verified |
| Rendered responsive/accessibility journeys        | automated against deterministic local API     | public landing/status smoke-reviewed                    |
| Notification delivery correctness                 | local Mailpit and simulated provider outcomes | controlled configuration; no percentile claim           |

## Completion standard

The proof passes only when duplicate work converges to one durable result, restarts preserve retryable work, stale monitoring produces `unknown`, public/private communication stays separated, and the format, lint, boundary, type, unit, integration, browser, accessibility, and production-build gates pass. Performance statements remain scoped to the recorded fixture and environment.
