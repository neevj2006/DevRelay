import { Controller, Get } from "@nestjs/common";

import { SystemHealthService } from "./system-health.service.js";

@Controller()
export class AppController {
  constructor(private readonly health: SystemHealthService) {}

  @Get("health")
  getHealth() {
    return this.health.inspect();
  }

  @Get("health/metrics")
  getMetrics() {
    return this.health.metrics();
  }
}
