import "reflect-metadata";

import { randomUUID } from "node:crypto";

import { parseApiEnvironment } from "@devrelay/config";
import {
  configureLocalTracing,
  runtimeMetrics,
  startTraceSpan,
  structuredLog,
} from "@devrelay/execution";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { raw } from "express";

import { AppModule } from "./app.module.js";
import { AuthService } from "./auth.service.js";
import { createBoundedAuthHandler } from "./auth-handler.js";

async function bootstrap(): Promise<void> {
  configureLocalTracing();
  const environment = parseApiEnvironment(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const authService = app.get(AuthService);

  if (environment.TRUSTED_PROXY_CIDRS) {
    app.set(
      "trust proxy",
      environment.TRUSTED_PROXY_CIDRS.split(",").map((value) => value.trim()),
    );
  }

  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const incomingCorrelationId = request.headers["x-correlation-id"];
    const correlationId =
      typeof incomingCorrelationId === "string" &&
      /^[A-Za-z0-9:._-]{1,160}$/.test(incomingCorrelationId)
        ? incomingCorrelationId
        : randomUUID();
    response.setHeader("X-Correlation-Id", correlationId);
    const route = request.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
    const span = startTraceSpan("http.request", {
      correlationId,
      method: request.method,
      route,
    });
    response.once("finish", () => {
      const durationMilliseconds = Date.now() - startedAt;
      runtimeMetrics.record("api.request.total", 1, {
        method: request.method,
        route,
        status: String(response.statusCode),
      });
      runtimeMetrics.record("api.request.duration", durationMilliseconds, {
        method: request.method,
        route,
        status: String(response.statusCode),
      });
      if (response.statusCode >= 500) runtimeMetrics.record("api.request.error");
      structuredLog(response.statusCode >= 500 ? "error" : "info", "api.request.completed", {
        correlationId,
        durationMilliseconds,
        method: request.method,
        route,
        status: response.statusCode,
      });
      span.setAttribute("http.response.status_code", response.statusCode);
      span.end();
    });
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    const hasBody =
      Number(request.headers["content-length"] ?? 0) > 0 ||
      request.headers["transfer-encoding"] !== undefined;
    const mutates = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const isAuth = request.path.startsWith("/api/auth/");
    if (
      mutates &&
      hasBody &&
      !isAuth &&
      !request.headers["content-type"]?.toLowerCase().startsWith("application/json")
    ) {
      response.status(415).json({ message: "Content-Type must be application/json" });
      return;
    }
    next();
  });

  app.enableCors({
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    origin: environment.APP_ORIGIN,
  });
  app.getHttpAdapter().all(
    "/api/auth/{*any}",
    createBoundedAuthHandler(authService.auth, {
      baseUrl: environment.AUTH_BASE_URL,
      bodySizeLimit: environment.AUTH_BODY_LIMIT_BYTES,
    }) as never,
  );
  app.use("/internal/qstash", raw({ limit: "256kb", type: "application/json" }));
  app.use("/provider-webhooks/resend", raw({ limit: "256kb", type: "application/json" }));
  app.useBodyParser("json", { limit: environment.API_BODY_LIMIT_BYTES });
  app.useBodyParser("urlencoded", { extended: false, limit: environment.API_BODY_LIMIT_BYTES });

  app.enableShutdownHooks();
  await app.listen(environment.API_PORT, environment.API_HOST);
}

void bootstrap();
