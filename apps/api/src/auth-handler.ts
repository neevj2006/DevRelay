import type { IncomingMessage, ServerResponse } from "node:http";

import { getRequest, setResponse } from "better-call/node";

import type { DevRelayAuth } from "./auth.js";

const allowedAuthContentTypes = ["application/json", "application/x-www-form-urlencoded"];

export function isAllowedAuthContentType(value: string | undefined): boolean {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0]!.trim().toLowerCase();
  return allowedAuthContentTypes.includes(mediaType);
}

export function createBoundedAuthHandler(
  auth: DevRelayAuth,
  options: { baseUrl: string; bodySizeLimit: number },
) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      !isAllowedAuthContentType(request.headers["content-type"])
    ) {
      response.statusCode = 415;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ message: "Unsupported content type" }));
      return;
    }
    try {
      const webRequest = getRequest({
        base: options.baseUrl,
        bodySizeLimit: options.bodySizeLimit,
        request,
      });
      await setResponse(response, await auth.handler(webRequest));
    } catch (error) {
      const tooLarge = error instanceof Error && /body size|content-length/i.test(error.message);
      response.statusCode = tooLarge ? 413 : 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({ message: tooLarge ? "Request body too large" : "Bad request" }),
      );
    }
  };
}
