# Free-tier deployment budget

DevRelay's public MVP deployment is designed to remain at **₹0 per month**. It uses only provider free plans, has no automatic paid upgrades, and keeps the hosted scheduler paused until the production smoke test succeeds.

## Provider ceilings

| Provider                                                                   | Selected plan and current ceiling                                                                                                                     | DevRelay budget                                                                  | Exhaustion behavior                                                                                                             |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [Vercel](https://vercel.com/docs/limits)                                   | Hobby: 4 active CPU hours, 360 GB-hours provisioned memory, 1 million function invocations, 100 GB fast data transfer, and 10 GB fast origin transfer | Two projects (web and API), one API function, no Vercel Cron job                 | Hobby projects pause at their included limit; no usage-based billing is enabled.                                                |
| [Neon](https://neon.com/pricing)                                           | Free: 100 CU-hours and 0.5 GB storage per project, compute up to 2 CU, with scale-to-zero                                                             | One project with production and preview branches; pooled application connections | Requests fail closed when the database is unavailable. Health reports degraded and no monitor or notification state is guessed. |
| [Upstash QStash](https://upstash.com/pricing/qstash)                       | Free: 1,000 messages/day, 50 GB monthly bandwidth, 1 MB messages, 10 active schedules                                                                 | Hard application cap of 250 messages/day, batches of at most 5, and one schedule | Dispatch stops at the application cap. Failed deliveries retain their durable database state for a later retry.                 |
| [Resend](https://resend.com/docs/knowledge-base/account-quotas-and-limits) | Free: 100 transactional emails/day and 3,000/month                                                                                                    | Controlled demo delivery only, from the Resend test domain                       | Provider rejection is recorded as a failed delivery attempt; it does not mark a notification delivered or trigger paid overage. |

Provider limits were verified on July 20, 2026. They can change, so check the linked provider pages before increasing hosted usage.

## Application safeguards

- At most five active hosted HTTP monitors exist across the demo deployment.
- Hosted monitor intervals cannot be shorter than 300 seconds.
- One QStash schedule batches due work; individual monitor schedules are not created.
- The scheduler publishes no more than 250 messages per UTC day and no more than five due checks per dispatch batch.
- Check results and delivery attempts are retained for 30 days. Expired authentication and subscription tokens are retained for 7 days.
- Queue publication is idempotent, delivery attempts are durable, and quota/provider failures remain retryable.
- API health exposes queue configuration, daily budget, scheduler pause state, database state, worker freshness, backlog, and missed-check signals.
- The demo administrator UI shows the five-monitor allowance. Provider dashboards remain the source of truth for Vercel compute/traffic, Neon storage/compute, QStash messages, and Resend deliveries.

## Operating procedure

1. Review provider dashboards before enabling the scheduler and after any public demonstration.
2. Keep `QSTASH_HOSTED_SCHEDULER_PAUSED=true` during migrations or deployment verification.
3. Do not raise the five-monitor, 300-second interval, 250-message, or retention limits without recalculating worst-case usage.
4. Pause the scheduler when QStash approaches 80% of the application budget, Neon approaches 80% of 0.5 GB, or Resend approaches 80 emails/day.
5. If any provider pauses or rejects work, leave durable records pending/failed, investigate usage, and resume only after the free quota resets or workload is reduced.
6. Never add a payment method, paid plan, overage toggle, or automatic upgrade without explicit approval.

Expected monthly bill: **₹0**.
