import {
  createManualIncidentInputSchema,
  createPrivateIncidentNoteInputSchema,
  createPublicIncidentUpdateInputSchema,
  slugSchema,
  transitionIncidentInputSchema,
  updateIncidentInputSchema,
  uuidSchema,
} from "@devrelay/contracts";
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";

import { IncidentService } from "./incident.service.js";
import { parseRequestBody } from "./request-validation.js";
import { type AuthenticatedRequest, SessionGuard } from "./session.guard.js";

@Controller("organizations/:organizationSlug/incidents")
@UseGuards(SessionGuard)
export class IncidentController {
  constructor(private readonly incidents: IncidentService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param("organizationSlug") slug: string) {
    return this.incidents.list(request.auth.user.id, parseRequestBody(slugSchema, slug));
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Body() body: unknown,
  ) {
    return this.incidents.createManual(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(createManualIncidentInputSchema, body),
    );
  }

  @Get(":incidentId")
  get(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("incidentId") incidentId: string,
  ) {
    return this.incidents.get(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, incidentId),
    );
  }

  @Patch(":incidentId")
  update(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.incidents.update(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, incidentId),
      parseRequestBody(updateIncidentInputSchema, body),
    );
  }

  @Post(":incidentId/transitions")
  transition(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.incidents.transition(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, incidentId),
      parseRequestBody(transitionIncidentInputSchema, body),
    );
  }

  @Post(":incidentId/private-notes")
  addPrivateNote(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.incidents.addPrivateNote(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, incidentId),
      parseRequestBody(createPrivateIncidentNoteInputSchema, body),
    );
  }

  @Post(":incidentId/public-updates")
  publishUpdate(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.incidents.publishUpdate(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, incidentId),
      parseRequestBody(createPublicIncidentUpdateInputSchema, body),
    );
  }
}
