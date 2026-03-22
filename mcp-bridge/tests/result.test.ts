import { describe, it, expect } from "vitest";
import { ok, err, ERROR_CODE } from "../src/application/result.js";

describe("ok", () => {
  it("wraps data in success result", () => {
    const result = ok({ id: "123" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ id: "123" });
  });

  it("wraps primitive values", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBe(42);
  });
});

describe("err", () => {
  it("wraps error in failure result", () => {
    const result = err({ code: ERROR_CODE.validation, message: "bad input", statusHint: 400 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toBe("bad input");
    expect(result.error.statusHint).toBe(400);
  });

  it("works without optional statusHint", () => {
    const result = err({ code: "CUSTOM", message: "fail" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.statusHint).toBeUndefined();
  });

  it("works with optional details field", () => {
    const result = err({ code: "INTERNAL_ERROR", message: "oops", details: { field: "x" } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({ field: "x" });
  });
});

describe("ERROR_CODE", () => {
  it("exports expected constant values", () => {
    expect(ERROR_CODE.notFound).toBe("NOT_FOUND");
    expect(ERROR_CODE.validation).toBe("VALIDATION_ERROR");
    expect(ERROR_CODE.internal).toBe("INTERNAL_ERROR");
    expect(ERROR_CODE.conflict).toBe("CONFLICT");
  });
});
