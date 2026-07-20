import { createServer } from "node:http";

const now = "2026-07-18T01:00:00.000Z";
const incident = {
  id: "11111111-1111-4111-8111-111111111111",
  lifecycle: "investigating",
  privateNotes: [{ body: "Inspecting the upstream dependency.", createdAt: now, id: "note-1" }],
  publicUpdates: [
    {
      body: "We are investigating elevated API errors.",
      deliveries: { succeeded: 1 },
      id: "update-1",
      publishedAt: now,
    },
  ],
  services: [
    {
      currentState: "major_outage",
      id: "22222222-2222-4222-8222-222222222222",
      name: "API Gateway",
    },
  ],
  severity: "major_outage",
  source: "automatic_monitor",
  startedAt: now,
  title: "API errors elevated",
  transitions: [
    {
      createdAt: now,
      id: "transition-1",
      reason: "Failure threshold confirmed",
      toLifecycle: "investigating",
    },
  ],
  updatedAt: now,
};

const service = {
  ...incident.services[0],
  activeIncidentCount: 1,
  availability: 99.91,
  lastCheckAt: now,
  monitorCount: 1,
  publicDescription: "Customer-facing API",
};

const statusPage = {
  activeIncidents: [
    {
      lifecycle: "investigating",
      services: ["API Gateway"],
      severity: "major_outage",
      slug: "api-errors-elevated",
      summary: "We are investigating elevated API errors.",
      title: "API errors elevated",
      updatedAt: now,
    },
  ],
  description: "Live reliability for Acme Cloud.",
  lastUpdated: now,
  maintenance: [],
  overallState: "major_outage",
  recentIncidents: [],
  services: [
    { description: "Customer API", name: "API Gateway", state: "major_outage", updatedAt: now },
    { description: "Dashboard", name: "Web Console", state: "operational", updatedAt: now },
  ],
  slug: "acme",
  stale: false,
  title: "Acme Cloud Status",
};

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-origin": "http://127.0.0.1:3000",
    "content-type": "application/json",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4000");
  if (request.method === "OPTIONS") return json(response, 204, {});
  if (url.pathname === "/health") return json(response, 200, { service: "mock-api", status: "ok" });
  if (url.pathname === "/api/auth/get-session" && !request.headers.cookie)
    return json(response, 200, null);
  if (url.pathname === "/api/auth/get-session")
    return json(response, 200, {
      session: { expiresAt: "2027-01-01T00:00:00.000Z", id: "session-1", userId: "user-1" },
      user: { email: "developer@devrelay.local", id: "user-1", name: "Local Developer" },
    });
  if (url.pathname.includes("/api/auth/sign-in/email"))
    return json(
      response,
      200,
      { redirect: false, token: "mock", user: { id: "user-1", name: "Local Developer" } },
      { "set-cookie": "devrelay.session_token=mock; Path=/; HttpOnly; SameSite=Lax" },
    );
  if (
    url.pathname === "/organizations" &&
    request.method === "GET" &&
    request.headers.cookie?.includes("mock-empty")
  )
    return json(response, 200, []);
  if (url.pathname === "/organizations" && request.method === "GET")
    return json(response, 200, [
      { id: "org-1", name: "Northstar Cloud", role: "owner", slug: "northstar-cloud" },
      { id: "org-2", name: "Member Cloud", role: "member", slug: "member-cloud" },
      { id: "org-3", name: "Team Cloud", role: "owner", slug: "team-cloud" },
      { id: "org-4", name: "Empty Cloud", role: "owner", slug: "empty-cloud" },
    ]);
  if (url.pathname === "/status/acme") return json(response, 200, statusPage);
  if (url.pathname === "/status/acme/incidents/api-errors-elevated")
    return json(response, 200, incident);
  if (url.pathname.endsWith(`/incidents/${incident.id}`) && request.method === "GET")
    return json(response, 200, incident);
  if (/\/organizations\/[^/]+\/incidents$/.test(url.pathname) && request.method === "GET")
    return json(response, 200, url.pathname.includes("/empty-cloud/") ? [] : [incident]);
  if (
    /\/organizations\/[^/]+\/operations\/maintenance$/.test(url.pathname) &&
    request.method === "GET"
  )
    return json(response, 200, []);
  if (/\/organizations\/[^/]+\/services$/.test(url.pathname) && request.method === "GET")
    return json(response, 200, url.pathname.includes("/empty-cloud/") ? [] : [service]);
  if (request.method === "POST" && url.pathname.endsWith("/monitors"))
    return json(response, 201, { id: "33333333-3333-4333-8333-333333333333" });
  if (request.method === "POST" && url.pathname.endsWith("/test"))
    return json(response, 200, {
      durationMilliseconds: 42,
      httpStatusCode: 204,
      ok: true,
      summary: "Endpoint returned HTTP 204",
    });
  if (request.method === "POST" && url.pathname.endsWith("/activate"))
    return json(response, 200, { status: "active" });
  if (request.method === "POST" && url.pathname === "/organizations")
    return json(response, 201, { id: "org-1", slug: "acme" });
  if (request.method === "POST") return json(response, 200, { accepted: true, id: incident.id });
  if (request.method === "PATCH") return json(response, 200, { id: incident.id });
  return json(response, 404, {
    message: `Mock route not found: ${request.method} ${url.pathname}`,
  });
});

server.listen(4000, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
