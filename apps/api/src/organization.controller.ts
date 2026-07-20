import {
  createOrganizationInputSchema,
  createOrganizationInvitationInputSchema,
  organizationInvitationTokenSchema,
  slugSchema,
  transferOrganizationOwnershipInputSchema,
  updateOrganizationInputSchema,
  updateOrganizationMemberRoleInputSchema,
  uuidSchema,
} from "@devrelay/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AuthService } from "./auth.service.js";
import { OrganizationService } from "./organization.service.js";
import { parseRequestBody } from "./request-validation.js";
import { type AuthenticatedRequest, SessionGuard } from "./session.guard.js";

@Controller()
@UseGuards(SessionGuard)
export class OrganizationController {
  constructor(
    private readonly organizations: OrganizationService,
    private readonly authService: AuthService,
  ) {}

  @Get("organizations")
  list(@Req() request: AuthenticatedRequest) {
    return this.organizations.listForUser(request.auth.user.id);
  }

  @Post("organizations")
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.organizations.create(
      request.auth.user.id,
      parseRequestBody(createOrganizationInputSchema, body),
    );
  }

  @Patch("organizations/:organizationSlug")
  update(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") organizationSlug: string,
    @Body() body: unknown,
  ) {
    return this.organizations.update(
      request.auth.user.id,
      parseRequestBody(slugSchema, organizationSlug),
      parseRequestBody(updateOrganizationInputSchema, body),
    );
  }

  @Post("organizations/:organizationSlug/invitations")
  async invite(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") organizationSlug: string,
    @Body() body: unknown,
  ) {
    const input = parseRequestBody(createOrganizationInvitationInputSchema, body);
    if (input.email === undefined) {
      throw new BadRequestException("Invitation email is required");
    }
    const invitation = await this.organizations.invite(
      request.auth.user.id,
      parseRequestBody(slugSchema, organizationSlug),
      { email: input.email, role: input.role },
    );
    if (this.authService.environment.NODE_ENV !== "production") return invitation;
    return {
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      id: invitation.id,
      organizationId: invitation.organizationId,
      role: invitation.role,
    };
  }

  @Post("invitations/:token/accept")
  accept(@Req() request: AuthenticatedRequest, @Param("token") token: string) {
    return this.organizations.acceptInvitation(
      request.auth.user.id,
      request.auth.user.email,
      parseRequestBody(organizationInvitationTokenSchema, token),
    );
  }

  @Delete("organizations/:organizationSlug/invitations/:invitationId")
  revokeInvitation(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") organizationSlug: string,
    @Param("invitationId") invitationId: string,
  ) {
    return this.organizations.revokeInvitation(
      request.auth.user.id,
      parseRequestBody(slugSchema, organizationSlug),
      parseRequestBody(uuidSchema, invitationId),
    );
  }

  @Patch("organizations/:organizationSlug/members/:memberId")
  updateMemberRole(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") organizationSlug: string,
    @Param("memberId") memberId: string,
    @Body() body: unknown,
  ) {
    const input = parseRequestBody(updateOrganizationMemberRoleInputSchema, body);
    return this.organizations.updateMemberRole(
      request.auth.user.id,
      parseRequestBody(slugSchema, organizationSlug),
      parseRequestBody(uuidSchema, memberId),
      input.role,
    );
  }

  @Delete("organizations/:organizationSlug/members/:memberId")
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") organizationSlug: string,
    @Param("memberId") memberId: string,
  ) {
    return this.organizations.removeMember(
      request.auth.user.id,
      parseRequestBody(slugSchema, organizationSlug),
      parseRequestBody(uuidSchema, memberId),
    );
  }

  @Post("organizations/:organizationSlug/leave")
  leave(@Req() request: AuthenticatedRequest, @Param("organizationSlug") organizationSlug: string) {
    return this.organizations.leave(
      request.auth.user.id,
      parseRequestBody(slugSchema, organizationSlug),
    );
  }

  @Post("organizations/:organizationSlug/transfer-ownership")
  transferOwnership(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") organizationSlug: string,
    @Body() body: unknown,
  ) {
    const input = parseRequestBody(transferOrganizationOwnershipInputSchema, body);
    return this.organizations.transferOwnership(
      request.auth.user.id,
      parseRequestBody(slugSchema, organizationSlug),
      input.memberId,
    );
  }
}
