import {
  cancelMaintenanceWindowInputSchema,
  createApiKeyInputSchema,
  createMaintenanceWindowInputSchema,
  publishPostmortemInputSchema,
  slugSchema,
  uuidSchema,
} from "@devrelay/contracts";
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { OperationsService } from "./operations.service.js";
import { parseRequestBody } from "./request-validation.js";
import { type AuthenticatedRequest, SessionGuard } from "./session.guard.js";

const analyticsQuery = z
  .strictObject({ from: z.iso.date(), to: z.iso.date() })
  .refine((x) => x.from <= x.to, { message: "from must not be after to" });
const auditQuery = z.object({
  action: z.string().max(160).optional(),
  actor: z.string().max(160).optional(),
  before: z.iso.datetime().optional(),
  cursor: uuidSchema.optional(),
  from: z.iso.datetime().optional(),
  target: z.string().max(160).optional(),
  to: z.iso.datetime().optional(),
});

@Controller("organizations/:organizationSlug/operations")
@UseGuards(SessionGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}
  private slug(value: string) {
    return parseRequestBody(slugSchema, value);
  }

  @Get("maintenance")
  @Header("Cache-Control", "private, no-store")
  maintenance(@Req() request: AuthenticatedRequest, @Param("organizationSlug") slug: string) {
    return this.operations.listMaintenance(request.auth.user.id, this.slug(slug));
  }
  @Post("maintenance") createMaintenance(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Body() body: unknown,
  ) {
    return this.operations.createMaintenance(
      request.auth.user.id,
      this.slug(slug),
      parseRequestBody(createMaintenanceWindowInputSchema, body),
    );
  }
  @Patch("maintenance/:windowId") updateMaintenance(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("windowId") id: string,
    @Body() body: unknown,
  ) {
    return this.operations.updateMaintenance(
      request.auth.user.id,
      this.slug(slug),
      parseRequestBody(uuidSchema, id),
      parseRequestBody(createMaintenanceWindowInputSchema, body),
    );
  }
  @Post("maintenance/:windowId/cancel") cancelMaintenance(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("windowId") id: string,
    @Body() body: unknown,
  ) {
    const input = parseRequestBody(cancelMaintenanceWindowInputSchema, body);
    return this.operations.cancelMaintenance(
      request.auth.user.id,
      this.slug(slug),
      parseRequestBody(uuidSchema, id),
      input.reason,
    );
  }
  @Get("analytics") analytics(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Query() query: unknown,
  ) {
    const input = parseRequestBody(analyticsQuery, query);
    return this.operations.analytics(request.auth.user.id, this.slug(slug), input.from, input.to);
  }
  @Get("audit") audit(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Query() query: unknown,
  ) {
    return this.operations.listAudit(
      request.auth.user.id,
      this.slug(slug),
      parseRequestBody(auditQuery, query),
    );
  }
  @Get("api-keys") apiKeys(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
  ) {
    return this.operations.listApiKeys(request.auth.user.id, this.slug(slug));
  }
  @Post("api-keys") createApiKey(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Body() body: unknown,
  ) {
    return this.operations.createApiKey(
      request.auth.user.id,
      this.slug(slug),
      parseRequestBody(createApiKeyInputSchema, body),
    );
  }
  @Post("api-keys/:keyId/revoke") revokeApiKey(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("keyId") id: string,
  ) {
    return this.operations.revokeApiKey(
      request.auth.user.id,
      this.slug(slug),
      parseRequestBody(uuidSchema, id),
    );
  }
  @Get("incidents/:incidentId/postmortem") postmortem(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("incidentId") id: string,
  ) {
    return this.operations.getPostmortem(
      request.auth.user.id,
      this.slug(slug),
      parseRequestBody(uuidSchema, id),
    );
  }
  @Patch("incidents/:incidentId/postmortem") savePostmortem(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("incidentId") id: string,
    @Body() body: unknown,
  ) {
    return this.operations.savePostmortem(
      request.auth.user.id,
      this.slug(slug),
      parseRequestBody(uuidSchema, id),
      parseRequestBody(publishPostmortemInputSchema, body),
    );
  }
  @Post("incidents/:incidentId/postmortem/publish") publishPostmortem(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("incidentId") id: string,
  ) {
    return this.operations.publishPostmortem(
      request.auth.user.id,
      this.slug(slug),
      parseRequestBody(uuidSchema, id),
    );
  }
}

@Controller("public/status-pages")
export class PublicPostmortemController {
  constructor(private readonly operations: OperationsService) {}
  @Get(":statusPageSlug/postmortems/:postmortemSlug")
  @Header("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
  get(@Param("statusPageSlug") page: string, @Param("postmortemSlug") postmortem: string) {
    return this.operations.publicPostmortem(
      parseRequestBody(slugSchema, page),
      parseRequestBody(slugSchema, postmortem),
    );
  }
}
