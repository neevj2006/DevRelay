import { parseApiEnvironment } from "@devrelay/config";
import { Module } from "@nestjs/common";

import { AppController } from "./app.controller.js";
import { AuthService } from "./auth.service.js";
import { DatabaseService } from "./database.service.js";

@Module({
  controllers: [AppController],
  providers: [
    AuthService,
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
