import { parseApiEnvironment } from "@devrelay/config";
import { slugSchema } from "@devrelay/contracts";
import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { parseRequestBody } from "./request-validation.js";
import { StatusPageService } from "./status-page.service.js";

@Controller("status")
export class StatusPageController {
  private readonly environment = parseApiEnvironment(process.env);
  private readonly sourceConnections = new Map<string, number>();
  private readonly publicReadWindows = new Map<string, { count: number; resetAt: number }>();
  private openConnections = 0;

  constructor(private readonly statusPages: StatusPageService) {}

  @Get(":slug")
  @Header("Cache-Control", "public, max-age=15, stale-while-revalidate=45")
  get(@Param("slug") slug: string, @Req() request: Request) {
    this.assertPublicReadBudget(request);
    return this.statusPages.getPublic(parseRequestBody(slugSchema, slug));
  }

  @Get(":slug/incidents/:incidentSlug")
  @Header("Cache-Control", "public, max-age=15, stale-while-revalidate=45")
  getIncident(
    @Param("slug") slug: string,
    @Param("incidentSlug") incidentSlug: string,
    @Req() request: Request,
  ) {
    this.assertPublicReadBudget(request);
    return this.statusPages.getPublicIncident(
      parseRequestBody(slugSchema, slug),
      parseRequestBody(slugSchema, incidentSlug),
    );
  }

  @Get(":slug/events")
  async events(@Param("slug") slug: string, @Req() request: Request, @Res() response: Response) {
    const safeSlug = parseRequestBody(slugSchema, slug);
    this.assertPublicReadBudget(request, 30);
    await this.statusPages.assertPublicPage(safeSlug);
    const source = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const sourceLimit = Math.max(2, Math.ceil(this.environment.PUBLIC_SSE_MAX_CONNECTIONS / 10));
    const sourceCount = this.sourceConnections.get(source) ?? 0;
    if (
      this.openConnections >= this.environment.PUBLIC_SSE_MAX_CONNECTIONS ||
      sourceCount >= sourceLimit
    ) {
      throw new HttpException("Too many live status connections", HttpStatus.TOO_MANY_REQUESTS);
    }
    this.openConnections += 1;
    this.sourceConnections.set(source, sourceCount + 1);
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    response.write(": connected\n\n");
    let lastVersion = await this.statusPages.version(safeSlug);
    let timer: NodeJS.Timeout | undefined;
    let closed = false;
    const poll = async () => {
      if (closed) return;
      try {
        const version = await this.statusPages.version(safeSlug);
        response.write(": heartbeat\n\n");
        if (version !== lastVersion) {
          lastVersion = version;
          response.write(`id: ${version}\nevent: status.changed\ndata: {"reload":true}\n\n`);
        }
      } catch {
        response.write('event: status.error\ndata: {"reload":true}\n\n');
      }
      if (!closed) timer = setTimeout(() => void poll(), 15_000);
    };
    timer = setTimeout(() => void poll(), 15_000);
    response.on("close", () => {
      if (closed) return;
      closed = true;
      if (timer) clearTimeout(timer);
      this.openConnections -= 1;
      const remaining = (this.sourceConnections.get(source) ?? 1) - 1;
      if (remaining > 0) this.sourceConnections.set(source, remaining);
      else this.sourceConnections.delete(source);
    });
  }

  private assertPublicReadBudget(request: Request, maximum = 120): void {
    const source = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const current = this.publicReadWindows.get(source);
    const next =
      !current || current.resetAt <= now
        ? { count: 1, resetAt: now + 60_000 }
        : { count: current.count + 1, resetAt: current.resetAt };
    this.publicReadWindows.set(source, next);
    if (next.count > maximum)
      throw new HttpException("Public status rate limit exceeded", HttpStatus.TOO_MANY_REQUESTS);
    if (this.publicReadWindows.size > 10_000) {
      for (const [key, value] of this.publicReadWindows) {
        if (value.resetAt <= now) this.publicReadWindows.delete(key);
      }
    }
  }
}
