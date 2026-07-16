import type { IncomingHttpHeaders } from "node:http";

import {
  type CanActivate,
  type ExecutionContext,
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
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.authService.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new UnauthorizedException("Authentication required");
    request.auth = session;
    return true;
  }
}
