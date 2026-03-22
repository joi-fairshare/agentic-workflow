import type { FastifyInstance } from "fastify";
import type { EventBus } from "../application/events.js";

/**
 * Registers GET /events as an SSE endpoint.
 * This does NOT use defineRoute() because SSE is a long-lived connection,
 * not a request/response cycle.
 */
export function registerSseRoute(app: FastifyInstance, eventBus: EventBus) {
  app.get("/events", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial connection event
    reply.raw.write(`event: connected\ndata: {}\n\n`);

    // Subscribe to all bridge events
    const unsubscribe = eventBus.subscribe((event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    });

    // Keep-alive heartbeat every 30s to prevent timeout
    const heartbeat = setInterval(() => {
      /* v8 ignore next */
      reply.raw.write(`: heartbeat\n\n`);
    }, 30_000);

    // Cleanup on disconnect
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
