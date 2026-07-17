# Availability calculations

DevRelay calculates daily availability in UTC from durable expected-check windows and their matching check results.

- Availability is `successful completed checks / completed checks`.
- Missing or stale checks are not silently treated as success or failure. They are reported as a separate evidence-completeness count, and availability is unavailable when no checks completed.
- Expected checks that fall inside a declared maintenance window are excluded. Unexpected failures still remain visible in raw check evidence and may drive incident policy; maintenance is never used to rewrite evidence.
- DevRelay does not invent a weighted partial/degraded percentage. A check is successful or failed according to its monitor policy, while service state and incident severity remain separate dimensions.
- Range availability is calculated from summed successful and completed samples, not by averaging daily percentages.
- The default error budget is the remaining failed-check allowance at a 99.90% objective.
- Daily latency stores the 50th and 95th percentiles of completed samples. Range views label their sample count, missing evidence, UTC timezone, and selected dates.

The `availability.aggregate` scheduled job recomputes a UTC day idempotently. Late-arriving results can therefore be incorporated by rerunning the day.
