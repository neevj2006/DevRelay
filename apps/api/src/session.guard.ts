import type { IncomingHttpHeaders } from "node:http";

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import { sql } from "drizzle-orm";

import { AuthService } from "./auth.service.js";
import { DatabaseService } from "./database.service.js";

export type AuthenticatedSession = NonNullable<
  Awaited<ReturnType<AuthService["auth"]["api"]["getSession"]>>
>;

export type AuthenticatedRequest = {
  auth: AuthenticatedSession;
  headers: IncomingHttpHeaders;
  method: string;
  url?: string;
};

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const publicDemoPath = /^\/organizations\/acme(?:\/|$)/i;

export function isPublicDemoRead(request: Pick<AuthenticatedRequest, "method" | "url">): boolean {
  return (
    ["GET", "HEAD"].includes(request.method.toUpperCase()) &&
    publicDemoPath.test(request.url?.split("?", 1)[0] ?? "")
  );
}

export function assertTrustedBrowserOrigin(
  request: Pick<AuthenticatedRequest, "headers" | "method">,
  allowedOrigin: string,
): void {
  if (safeMethods.has(request.method.toUpperCase())) return;
  const value = request.headers.origin ?? request.headers.referer;
  const candidate = Array.isArray(value) ? value[0] : value;
  let origin: string | undefined;
  try {
    origin = candidate ? new URL(candidate).origin : undefined;
  } catch {
    origin = undefined;
  }
  if (origin !== new URL(allowedOrigin).origin) {
    throw new ForbiddenException("Request origin is not allowed");
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly databaseService: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    assertTrustedBrowserOrigin(request, this.authService.environment.APP_ORIGIN);

    if (isPublicDemoRead(request)) {
      const demoUser = await this.databaseService.database.execute<{
        email: string;
        id: string;
        name: string;
      }>(sql`
        SELECT app_user.id, app_user.email, app_user.name
        FROM users AS app_user
        JOIN organizations AS organization ON organization.owner_user_id = app_user.id
        WHERE lower(organization.slug) = 'acme'
          AND organization.deleted_at IS NULL
        LIMIT 1
      `);
      const user = demoUser.rows[0];
      if (!user) throw new UnauthorizedException("Public demo unavailable");
      request.auth = {
        session: {
          createdAt: new Date(0),
          expiresAt: new Date(8_640_000_000_000_000),
          id: "public-read-only-demo",
          ipAddress: null,
          token: "public-read-only-demo",
          updatedAt: new Date(0),
          userAgent: null,
          userId: user.id,
        },
        user: {
          createdAt: new Date(0),
          email: user.email,
          emailVerified: false,
          id: user.id,
          image: null,
          name: user.name,
          updatedAt: new Date(0),
        },
      } as AuthenticatedSession;
      return true;
    }

    const session = await this.authService.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (session) {
      request.auth = session;
      return true;
    }
    throw new UnauthorizedException("Authentication required");
  }
}
