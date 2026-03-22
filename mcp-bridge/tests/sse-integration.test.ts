import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { createServer } from "../src/server.js";
import { registerSseRoute } from "../src/routes/events.js";
import { createEventBus } from "../src/application/events.js";

describe("SSE /events endpoint", () => {
  let app: ReturnType<typeof createServer>;
  const eventBus = createEventBus();

  afterEach(async () => {
    if (app) await app.close();
  });

  it("streams SSE events with correct headers and data", async () => {
    app = createServer([]);
    registerSseRoute(app, eventBus);
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as { port: number }).port;

    const chunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/events`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toBe("text/event-stream");
        expect(res.headers["cache-control"]).toBe("no-cache");

        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          chunks.push(chunk);
          // After getting connected event, emit a bridge event then close
          if (chunks.length === 1) {
            eventBus.emit({
              type: "message:created",
              data: { id: "m1", conversation: "c1" },
            });
            // Give it a moment to arrive, then disconnect
            setTimeout(() => {
              req.destroy();
              resolve();
            }, 50);
          }
        });
        res.on("error", () => resolve()); // ignore ECONNRESET
      });
      req.on("error", () => resolve()); // ignore ECONNRESET
      setTimeout(() => { req.destroy(); resolve(); }, 2000);
    });

    const all = chunks.join("");
    expect(all).toContain("event: connected");
    expect(all).toContain("event: message:created");
    expect(all).toContain('"id":"m1"');
  });

  it("cleans up subscription on client disconnect", async () => {
    app = createServer([]);
    registerSseRoute(app, eventBus);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const port = (app.server.address() as { port: number }).port;

    await new Promise<void>((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/events`, (res) => {
        res.on("data", () => {
          // Got connected event, now disconnect
          req.destroy();
          setTimeout(resolve, 50);
        });
        res.on("error", () => {}); // ignore ECONNRESET
      });
      req.on("error", () => {}); // ignore ECONNRESET
      setTimeout(() => { req.destroy(); resolve(); }, 2000);
    });

    // After disconnect, emitting should not throw
    expect(() => {
      eventBus.emit({ type: "task:created", data: { id: "t1", conversation: "c1" } });
    }).not.toThrow();
  });
});
