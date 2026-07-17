import { parseApiEnvironment } from "@devrelay/config";
import { Module } from "@nestjs/common";

import { AppController } from "./app.controller.js";
import { AuthService } from "./auth.service.js";
import { DatabaseService } from "./database.service.js";
import { IncidentController } from "./incident.controller.js";
import { IncidentService } from "./incident.service.js";
import { OrganizationController } from "./organization.controller.js";
import { OrganizationService } from "./organization.service.js";
import { QStashController } from "./qstash.controller.js";
import { QStashService } from "./qstash.service.js";
import { ServiceMonitorController } from "./service-monitor.controller.js";
import { ServiceMonitorService } from "./service-monitor.service.js";
import { SessionGuard } from "./session.guard.js";

@Module({
  controllers: [
    AppController,
    IncidentController,
    OrganizationController,
    QStashController,
    ServiceMonitorController,
  ],
  providers: [
    AuthService,
    IncidentService,
    OrganizationService,
    QStashService,
    SessionGuard,
    ServiceMonitorService,
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
