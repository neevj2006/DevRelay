import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { ApiEnvironment } from "@devrelay/config";
import {
  accounts,
  authRateLimits,
  type Database,
  sessions,
  users,
  verifications,
} from "@devrelay/database";
import { betterAuth } from "better-auth";

const localDevelopmentSecret = "devrelay-local-only-auth-secret-change-before-production";

export function createDevRelayAuth(database: Database, environment: ApiEnvironment) {
  const githubConfigured =
    environment.GITHUB_CLIENT_ID !== undefined && environment.GITHUB_CLIENT_SECRET !== undefined;

  return betterAuth({
    account: {
      encryptOAuthTokens: true,
    },
    advanced: {
      cookiePrefix: "devrelay",
      database: { generateId: "uuid" },
      useSecureCookies: environment.NODE_ENV === "production",
    },
    basePath: "/api/auth",
    baseURL: environment.AUTH_BASE_URL,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        account: accounts,
        rateLimit: authRateLimits,
        session: sessions,
        user: users,
        verification: verifications,
      },
    }),
    emailAndPassword: {
      enabled: environment.NODE_ENV !== "production",
      minPasswordLength: 12,
    },
    rateLimit: {
      customRules: {
        "/sign-in/email": { max: 5, window: 60 },
        "/sign-in/social": { max: 10, window: 60 },
      },
      enabled: true,
      max: 100,
      modelName: "rateLimit",
      storage: "database",
      window: 60,
    },
    secret: environment.AUTH_SECRET ?? localDevelopmentSecret,
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    socialProviders: githubConfigured
      ? {
          github: {
            clientId: environment.GITHUB_CLIENT_ID!,
            clientSecret: environment.GITHUB_CLIENT_SECRET!,
          },
        }
      : {},
    trustedOrigins: [environment.APP_ORIGIN],
  });
}

export type DevRelayAuth = ReturnType<typeof createDevRelayAuth>;
