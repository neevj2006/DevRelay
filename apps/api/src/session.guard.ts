import type { IncomingHttpHeaders } from "node:http";

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";

import { AuthService } from "./auth.service.js";

export type AuthenticatedSession = NonNullable<
  Awaited<ReturnType<AuthService["auth"]["api"]["getSession"]>>
>;

export type AuthenticatedRequest = {
  auth: AuthenticatedSession;
  headers: IncomingHttpHeaders;
  method: string;
};

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

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
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    assertTrustedBrowserOrigin(request, this.authService.environment.APP_ORIGIN);
    const session = await this.authService.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new UnauthorizedException("Authentication required");
    request.auth = session;
    return true;
  }
}
