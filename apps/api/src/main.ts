import "reflect-metadata";

import { parseApiEnvironment } from "@devrelay/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";

import { AppModule } from "./app.module.js";
import { AuthService } from "./auth.service.js";

async function bootstrap(): Promise<void> {
  const environment = parseApiEnvironment(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const authService = app.get(AuthService);

  app.enableCors({
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    origin: environment.APP_ORIGIN,
  });
  app.getHttpAdapter().all("/api/auth/{*any}", toNodeHandler(authService.auth));
  app.useBodyParser("json", { limit: "1mb" });
  app.useBodyParser("urlencoded", { extended: true, limit: "1mb" });

  app.enableShutdownHooks();
  await app.listen(environment.API_PORT, environment.API_HOST);
}

void bootstrap();
