import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "../src/server.js";
import { defineRoute, type ControllerDefinition } from "../src/transport/types.js";
import { z } from "zod";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

afterEach(async () => {
  await app.close();
});

describe("server registerRoute error handling", () => {
  it("returns 400 with VALIDATION_ERROR on ZodError", async () => {
    const schema = {
      body: z.object({ name: z.string() }),
      response: z.object({ ok: z.boolean() }),
    };
    const badController: ControllerDefinition = {
      basePath: "/test",
      routes: [
        defineRoute({
          method: "POST",
          path: "/validate",
          summary: "test",
          schema,
          handler: async (req) => {
            // Force a ZodError by parsing bad data
            z.object({ required: z.string() }).parse({});
            return { ok: true as const, data: { ok: true } };
          },
        }),
      ],
    };
    app = createServer([badController]);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/test/validate",
      payload: { name: "valid" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().ok).toBe(false);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("defaults to 500 status when statusHint is not provided in error", async () => {
    const schema = { response: z.object({ ok: z.boolean() }) };
    const noHintController: ControllerDefinition = {
      basePath: "/test",
      routes: [
        defineRoute({
          method: "GET",
          path: "/no-hint",
          summary: "test",
          schema,
          handler: async () => ({
            ok: false as const,
            error: { code: "NO_HINT", message: "no status hint" },
          }),
        }),
      ],
    };
    app = createServer([noHintController]);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/test/no-hint",
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe("NO_HINT");
  });

  it("returns error with details field when handler returns error with details", async () => {
    const schema = { response: z.object({ ok: z.boolean() }) };
    const detailController: ControllerDefinition = {
      basePath: "/test",
      routes: [
        defineRoute({
          method: "GET",
          path: "/with-details",
          summary: "test",
          schema,
          handler: async () => ({
            ok: false as const,
            error: { code: "TEST", message: "msg", details: "extra info", statusHint: 422 as const },
          }),
        }),
      ],
    };
    app = createServer([detailController]);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/test/with-details",
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().ok).toBe(false);
    expect(res.json().error.details).toBe("extra info");
  });

  it("returns 500 with INTERNAL_ERROR on generic throw", async () => {
    const schema = { response: z.object({ ok: z.boolean() }) };
    const throwController: ControllerDefinition = {
      basePath: "/test",
      routes: [
        defineRoute({
          method: "GET",
          path: "/explode",
          summary: "test",
          schema,
          handler: async () => {
            throw new Error("unexpected failure");
          },
        }),
      ],
    };
    app = createServer([throwController]);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/test/explode",
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().ok).toBe(false);
  });
});
