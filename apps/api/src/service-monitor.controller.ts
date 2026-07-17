import {
  cancelServiceStateOverrideInputSchema,
  createMonitorInputSchema,
  createServiceInputSchema,
  createServiceStateOverrideInputSchema,
  slugSchema,
  updateMonitorInputSchema,
  updateServiceInputSchema,
  uuidSchema,
} from "@devrelay/contracts";
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";

import { parseRequestBody } from "./request-validation.js";
import { ServiceMonitorService } from "./service-monitor.service.js";
import { type AuthenticatedRequest, SessionGuard } from "./session.guard.js";

@Controller("organizations/:organizationSlug")
@UseGuards(SessionGuard)
export class ServiceMonitorController {
  constructor(private readonly resources: ServiceMonitorService) {}

  @Get("services")
  listServices(@Req() request: AuthenticatedRequest, @Param("organizationSlug") slug: string) {
    return this.resources.listServices(request.auth.user.id, parseRequestBody(slugSchema, slug));
  }

  @Post("services")
  createService(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Body() body: unknown,
  ) {
    return this.resources.createService(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(createServiceInputSchema, body),
    );
  }

  @Get("services/:serviceId")
  getService(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("serviceId") serviceId: string,
  ) {
    return this.resources.getService(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, serviceId),
    );
  }

  @Patch("services/:serviceId")
  updateService(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("serviceId") serviceId: string,
    @Body() body: unknown,
  ) {
    return this.resources.updateService(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, serviceId),
      parseRequestBody(updateServiceInputSchema, body),
    );
  }

  @Delete("services/:serviceId")
  archiveService(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("serviceId") serviceId: string,
  ) {
    return this.resources.archiveService(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, serviceId),
    );
  }

  @Post("services/:serviceId/state-override")
  createStateOverride(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("serviceId") serviceId: string,
    @Body() body: unknown,
  ) {
    return this.resources.createStateOverride(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, serviceId),
      parseRequestBody(createServiceStateOverrideInputSchema, body),
    );
  }

  @Delete("services/:serviceId/state-override")
  cancelStateOverride(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("serviceId") serviceId: string,
    @Body() body: unknown,
  ) {
    return this.resources.cancelStateOverride(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, serviceId),
      parseRequestBody(cancelServiceStateOverrideInputSchema, body),
    );
  }

  @Get("services/:serviceId/monitors")
  listMonitors(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("serviceId") serviceId: string,
  ) {
    return this.resources.listMonitors(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, serviceId),
    );
  }

  @Post("monitors")
  createMonitor(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Body() body: unknown,
  ) {
    return this.resources.createMonitor(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(createMonitorInputSchema, body),
    );
  }

  @Patch("monitors/:monitorId")
  updateMonitor(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("monitorId") monitorId: string,
    @Body() body: unknown,
  ) {
    return this.resources.updateMonitor(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, monitorId),
      parseRequestBody(updateMonitorInputSchema, body),
    );
  }

  @Post("monitors/:monitorId/test")
  testMonitor(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("monitorId") monitorId: string,
  ) {
    return this.resources.testMonitor(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, monitorId),
    );
  }

  @Post("monitors/:monitorId/activate")
  activateMonitor(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("monitorId") monitorId: string,
  ) {
    return this.resources.activateMonitor(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, monitorId),
    );
  }

  @Post("monitors/:monitorId/pause")
  pauseMonitor(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("monitorId") monitorId: string,
  ) {
    return this.resources.pauseMonitor(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, monitorId),
    );
  }

  @Post("monitors/:monitorId/resume")
  resumeMonitor(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("monitorId") monitorId: string,
  ) {
    return this.resources.resumeMonitor(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, monitorId),
    );
  }

  @Delete("monitors/:monitorId")
  archiveMonitor(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("monitorId") monitorId: string,
  ) {
    return this.resources.archiveMonitor(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, monitorId),
    );
  }
}
