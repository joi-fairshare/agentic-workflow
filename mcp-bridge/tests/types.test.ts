import { describe, it, expect } from "vitest";
import { defineRoute, appErr } from "../src/transport/types.js";
import { z } from "zod";

describe("defineRoute", () => {
  it("returns the same route entry (identity function for type inference)", () => {
    const schema = { response: z.object({ id: z.string() }) };
    const route = defineRoute({
      method: "GET",
      path: "/test",
      summary: "Test route",
      schema,
      handler: async () => ({ ok: true as const, data: { id: "1" } }),
    });
    expect(route.method).toBe("GET");
    expect(route.path).toBe("/test");
    expect(route.summary).toBe("Test route");
    expect(route.schema).toBe(schema);
  });

  it("supports POST method with body schema", () => {
    const schema = {
      body: z.object({ name: z.string() }),
      response: z.object({ created: z.boolean() }),
    };
    const route = defineRoute({
      method: "POST",
      path: "/items",
      summary: "Create item",
      schema,
      handler: async () => ({ ok: true as const, data: { created: true } }),
    });
    expect(route.method).toBe("POST");
    expect(route.path).toBe("/items");
  });
});

describe("appErr", () => {
  it("returns error ApiResponse with given code and message", () => {
    const result = appErr({ code: "NOT_FOUND", message: "gone", statusHint: 404 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.message).toBe("gone");
    expect(result.error.statusHint).toBe(404);
  });

  it("works without optional statusHint", () => {
    const result = appErr({ code: "VALIDATION_ERROR", message: "bad input" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.statusHint).toBeUndefined();
  });

  it("works with optional details field", () => {
    const result = appErr({ code: "INTERNAL_ERROR", message: "oops", details: { stack: "..." } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({ stack: "..." });
  });
});
