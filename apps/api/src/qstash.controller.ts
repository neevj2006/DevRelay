import { Body, Controller, Get, Headers, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { QStashService } from "./qstash.service.js";

@Controller("internal/qstash")
export class QStashController {
  constructor(private readonly qstash: QStashService) {}

  @Post("dispatch")
  async dispatch(
    @Req() request: Request,
    @Headers("upstash-signature") signature: string | undefined,
  ) {
    const body = rawBody(request);
    await this.qstash.verify(body, signature, request.originalUrl);
    return this.qstash.dispatchDue();
  }

  @Post("jobs")
  async execute(
    @Req() request: Request,
    @Headers("upstash-signature") signature: string | undefined,
    @Body() bodyValue: unknown,
  ) {
    const body = rawBody(request);
    await this.qstash.verify(body, signature, request.originalUrl);
    return this.qstash.executeJob(bodyValue instanceof Buffer ? JSON.parse(body) : bodyValue);
  }

  @Post("failure")
  async failure(
    @Req() request: Request,
    @Headers("upstash-signature") signature: string | undefined,
  ) {
    const body = rawBody(request);
    await this.qstash.verify(body, signature, request.originalUrl);
    return { acknowledged: true };
  }

  @Get("health")
  health() {
    return this.qstash.health();
  }
}

function rawBody(request: Request): string {
  if (!Buffer.isBuffer(request.body)) throw new Error("Expected a raw QStash request body");
  return request.body.toString("utf8");
}
