import type { DatabaseClient } from "@devrelay/database";

export class MaintenanceReconciler {
  constructor(private readonly database: DatabaseClient) {}
  async reconcile() {
    const active = await this.database.pool
      .query(`UPDATE services s SET current_state='under_maintenance',updated_at=now()
      WHERE EXISTS (SELECT 1 FROM maintenance_window_services x JOIN maintenance_windows w ON w.id=x.maintenance_window_id AND w.organization_id=x.organization_id
        WHERE x.organization_id=s.organization_id AND x.service_id=s.id AND w.status='scheduled' AND now()>=w.starts_at AND now()<w.ends_at)
      AND s.current_state<>'under_maintenance'`);
    const ended = await this.database.pool
      .query(`UPDATE services s SET current_state='unknown',updated_at=now()
      WHERE s.current_state='under_maintenance' AND NOT EXISTS (SELECT 1 FROM maintenance_window_services x JOIN maintenance_windows w ON w.id=x.maintenance_window_id AND w.organization_id=x.organization_id
        WHERE x.organization_id=s.organization_id AND x.service_id=s.id AND w.status='scheduled' AND now()>=w.starts_at AND now()<w.ends_at)`);
    return { activated: active.rowCount ?? 0, ended: ended.rowCount ?? 0 };
  }
}
