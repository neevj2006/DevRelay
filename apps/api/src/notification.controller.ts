import {
  createSubscriptionInputSchema,
  createWebhookDestinationInputSchema,
  slugSchema,
  subscriberTokenInputSchema,
  updateSubscriberPreferencesWithTokenInputSchema,
  uuidSchema,
} from "@devrelay/contracts";
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { NotificationService } from "./notification.service.js";
import { parseRequestBody } from "./request-validation.js";
import { type AuthenticatedRequest, SessionGuard } from "./session.guard.js";

@Controller()
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Post("status/:slug/subscriptions")
  subscribe(@Param("slug") slug: string, @Body() body: unknown, @Req() request: Request) {
    const address =
      request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ??
      request.ip ??
      "unknown";
    return this.notifications.subscribe(
      parseRequestBody(slugSchema, slug),
      parseRequestBody(createSubscriptionInputSchema, body),
      address,
    );
  }

  @Post("subscriptions/verify")
  verify(@Body() body: unknown) {
    return this.notifications.verify(parseRequestBody(subscriberTokenInputSchema, body).token);
  }

  @Post("subscriptions/unsubscribe")
  unsubscribe(@Body() body: unknown) {
    return this.notifications.unsubscribe(parseRequestBody(subscriberTokenInputSchema, body).token);
  }

  @Post("subscriptions/preferences")
  updatePreferences(@Body() body: unknown) {
    return this.notifications.updatePreferences(
      parseRequestBody(updateSubscriberPreferencesWithTokenInputSchema, body),
    );
  }

  @Get("subscriptions/preferences")
  getPreferences(@Query("token") token: string) {
    return this.notifications.getPreferences(
      parseRequestBody(subscriberTokenInputSchema, { token }).token,
    );
  }

  @Post("provider-webhooks/resend")
  providerEvent(
    @Headers("svix-id") id: string | undefined,
    @Headers("svix-timestamp") timestamp: string | undefined,
    @Headers("svix-signature") signature: string | undefined,
    @Body() body: Buffer,
  ) {
    return this.notifications.providerEvent(body.toString("utf8"), { id, signature, timestamp });
  }

  @Get("organizations/:organizationSlug/communications")
  @UseGuards(SessionGuard)
  @Header("Cache-Control", "private, no-store")
  dashboard(@Req() request: AuthenticatedRequest, @Param("organizationSlug") slug: string) {
    return this.notifications.dashboard(request.auth.user.id, parseRequestBody(slugSchema, slug));
  }

  @Post("organizations/:organizationSlug/webhooks")
  @UseGuards(SessionGuard)
  createWebhook(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Body() body: unknown,
  ) {
    return this.notifications.createWebhook(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(createWebhookDestinationInputSchema, body),
    );
  }

  @Post("organizations/:organizationSlug/deliveries/:deliveryId/redeliver")
  @UseGuards(SessionGuard)
  redeliver(
    @Req() request: AuthenticatedRequest,
    @Param("organizationSlug") slug: string,
    @Param("deliveryId") id: string,
  ) {
    return this.notifications.redeliver(
      request.auth.user.id,
      parseRequestBody(slugSchema, slug),
      parseRequestBody(uuidSchema, id),
    );
  }
}
