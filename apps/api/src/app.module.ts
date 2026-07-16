import { parseApiEnvironment } from "@devrelay/config";
import { Module } from "@nestjs/common";

import { AppController } from "./app.controller.js";
import { AuthService } from "./auth.service.js";
import { DatabaseService } from "./database.service.js";
import { OrganizationController } from "./organization.controller.js";
import { OrganizationService } from "./organization.service.js";
import { SessionGuard } from "./session.guard.js";

@Module({
  controllers: [AppController, OrganizationController],
  providers: [
    AuthService,
    OrganizationService,
    SessionGuard,
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
