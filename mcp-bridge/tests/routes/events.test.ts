import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { createEventBus } from "../../src/application/events.js";
import { registerSseRoute } from "../../src/routes/events.js";

// NOTE: Real SSE stream behavior (headers, event format, cleanup) is tested in
// sse-integration.test.ts using real TCP connections. This file covers route
// registration and EventBus integration only.

// NOTE: Fastify inject() buffers the full response before resolving. Since
// SSE uses reply.raw.write() without ever calling reply.raw.end(), inject()
// will hang indefinitely waiting for the stream to close. The tests below
// verify route registration and event-bus wiring without awaiting the full
// SSE response.

let app: FastifyInstance;
let eventBus: ReturnType<typeof createEventBus>;

beforeEach(async () => {
  app = Fastify({ logger: false });
  eventBus = createEventBus();
  registerSseRoute(app, eventBus);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("GET /events", () => {
  it("route is registered and does not return 404", async () => {
    // We cannot await the full response (SSE never ends), so we verify the
    // route exists by issuing a HEAD-equivalent check via the router. Fastify
    // exposes app.hasRoute() for this purpose.
    expect(app.hasRoute({ method: "GET", url: "/events" })).toBe(true);
  });

  it("eventBus subscribers receive emitted events", () => {
    // Unit-level verification that the SSE plumbing works: subscribe directly
    // to the same bus that registerSseRoute wired up.
    const received: string[] = [];
    eventBus.subscribe((event) => received.push(event.type));

    eventBus.emit({ type: "message:created", data: { id: "1", conversation: "c1" } });
    eventBus.emit({ type: "task:updated", data: { id: "t1", conversation: "c1", status: "completed" } });

    expect(received).toEqual(["message:created", "task:updated"]);
  });
});
