import { parseApiEnvironment } from "@devrelay/config";
import { Module } from "@nestjs/common";

import { AppController } from "./app.controller.js";
import { AuthService } from "./auth.service.js";
import { DatabaseService } from "./database.service.js";
import { IncidentController } from "./incident.controller.js";
import { IncidentService } from "./incident.service.js";
import { NotificationController } from "./notification.controller.js";
import { NotificationService } from "./notification.service.js";
import { OperationsController, PublicPostmortemController } from "./operations.controller.js";
import { OperationsService } from "./operations.service.js";
import { OrganizationController } from "./organization.controller.js";
import { OrganizationService } from "./organization.service.js";
import { QStashController } from "./qstash.controller.js";
import { QStashService } from "./qstash.service.js";
import { ServiceMonitorController } from "./service-monitor.controller.js";
import { ServiceMonitorService } from "./service-monitor.service.js";
import { SessionGuard } from "./session.guard.js";
import { StatusPageController } from "./status-page.controller.js";
import { StatusPageService } from "./status-page.service.js";
import { SystemHealthService } from "./system-health.service.js";

@Module({
  controllers: [
    AppController,
    IncidentController,
    NotificationController,
    OrganizationController,
    OperationsController,
    PublicPostmortemController,
    QStashController,
    ServiceMonitorController,
    StatusPageController,
  ],
  providers: [
    AuthService,
    IncidentService,
    NotificationService,
    OrganizationService,
    OperationsService,
    QStashService,
    SessionGuard,
    ServiceMonitorService,
    StatusPageService,
    SystemHealthService,
    {
      provide: DatabaseService,
      useFactory: () => {
        const environment = parseApiEnvironment(process.env);
        return new DatabaseService(environment.DATABASE_URL);
      },
    },
  ],
})
export class AppModule {}
