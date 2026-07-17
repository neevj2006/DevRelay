import { slugSchema } from "@devrelay/contracts";
import { Controller, Get, Header, Param, Res } from "@nestjs/common";
import type { Response } from "express";

import { parseRequestBody } from "./request-validation.js";
import { StatusPageService } from "./status-page.service.js";

@Controller("status")
export class StatusPageController {
  constructor(private readonly statusPages: StatusPageService) {}

  @Get(":slug")
  @Header("Cache-Control", "public, max-age=15, stale-while-revalidate=45")
  get(@Param("slug") slug: string) {
    return this.statusPages.getPublic(parseRequestBody(slugSchema, slug));
  }

  @Get(":slug/incidents/:incidentSlug")
  @Header("Cache-Control", "public, max-age=15, stale-while-revalidate=45")
  getIncident(@Param("slug") slug: string, @Param("incidentSlug") incidentSlug: string) {
    return this.statusPages.getPublicIncident(
      parseRequestBody(slugSchema, slug),
      parseRequestBody(slugSchema, incidentSlug),
    );
  }

  @Get(":slug/events")
  async events(@Param("slug") slug: string, @Res() response: Response) {
    const safeSlug = parseRequestBody(slugSchema, slug);
    await this.statusPages.assertPublicPage(safeSlug);
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    response.write(": connected\n\n");
    let lastVersion = await this.statusPages.version(safeSlug);
    const interval = setInterval(async () => {
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
    }, 15_000);
    response.on("close", () => clearInterval(interval));
  }
}
