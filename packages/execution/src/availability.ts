import type { AvailabilityAggregateJob } from "@devrelay/contracts";
import type { DatabaseClient } from "@devrelay/database";
import type { JobQueue } from "@devrelay/queue";

export class AvailabilityAggregator {
  constructor(private readonly database: DatabaseClient) {}
  async execute(job: AvailabilityAggregateJob) {
    await this.database.pool.query(
      `INSERT INTO daily_availability_aggregates
      (organization_id,service_id,day,expected_checks,completed_checks,successful_checks,failed_checks,missing_checks,availability_basis_points,latency_p50_milliseconds,latency_p95_milliseconds)
      SELECT s.organization_id,s.id,$3::date,count(w.id)::int,count(r.id)::int,
        count(r.id) FILTER (WHERE r.outcome='success')::int,count(r.id) FILTER (WHERE r.outcome<>'success')::int,
        count(w.id) FILTER (WHERE r.id IS NULL)::int,
        CASE WHEN count(r.id)=0 THEN NULL ELSE round(10000.0*count(r.id) FILTER (WHERE r.outcome='success')/count(r.id))::int END,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY r.latency_milliseconds) FILTER (WHERE r.latency_milliseconds IS NOT NULL)::int,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY r.latency_milliseconds) FILTER (WHERE r.latency_milliseconds IS NOT NULL)::int
      FROM services s LEFT JOIN monitors m ON m.organization_id=s.organization_id AND m.service_id=s.id AND m.deleted_at IS NULL
      LEFT JOIN expected_check_windows w ON w.organization_id=m.organization_id AND w.monitor_id=m.id AND w.scheduled_at>=$3::date AND w.scheduled_at<$3::date+interval '1 day'
        AND NOT EXISTS (SELECT 1 FROM maintenance_window_services x JOIN maintenance_windows mw ON mw.id=x.maintenance_window_id AND mw.organization_id=x.organization_id
          WHERE x.organization_id=s.organization_id AND x.service_id=s.id AND mw.status='scheduled' AND w.scheduled_at>=mw.starts_at AND w.scheduled_at<mw.ends_at)
      LEFT JOIN check_results r ON r.organization_id=w.organization_id AND r.monitor_id=w.monitor_id AND r.scheduled_at=w.scheduled_at
      WHERE s.organization_id=$1 AND s.id=$2 AND s.deleted_at IS NULL GROUP BY s.organization_id,s.id
      ON CONFLICT (organization_id,service_id,day) DO UPDATE SET expected_checks=excluded.expected_checks,completed_checks=excluded.completed_checks,
        successful_checks=excluded.successful_checks,failed_checks=excluded.failed_checks,missing_checks=excluded.missing_checks,
        availability_basis_points=excluded.availability_basis_points,latency_p50_milliseconds=excluded.latency_p50_milliseconds,
        latency_p95_milliseconds=excluded.latency_p95_milliseconds,updated_at=now()`,
      [job.organizationId, job.payload.serviceId, job.payload.day],
    );
    return { day: job.payload.day, serviceId: job.payload.serviceId };
  }
}

export class AvailabilityAggregationScheduler {
  constructor(
    private readonly database: DatabaseClient,
    private readonly queue: JobQueue,
  ) {}
  async dispatch(day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)) {
    const services = await this.database.pool.query<{ id: string; organization_id: string }>(
      "SELECT id,organization_id FROM services WHERE deleted_at IS NULL",
    );
    for (const service of services.rows)
      await this.queue.enqueue(
        {
          correlationId: `availability:${day}`,
          createdAt: new Date().toISOString(),
          id: `availability:${service.id}:${day}`,
          name: "availability.aggregate",
          organizationId: service.organization_id,
          payload: { day, serviceId: service.id },
          version: 1,
        },
        { idempotencyKey: `availability:${service.id}:${day}` },
      );
    return services.rowCount ?? 0;
  }
}
