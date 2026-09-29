import { afterEach, describe, expect, it } from "vitest";

import { childEnv, lastJsonObject, laxSchema, spawnFailure, strictSchema, toDecided } from "../../src/providers/cli-common.js";
import type { QuestionRef } from "../../src/types.js";

const base: QuestionRef<"a" | "b"> = { name: "q", outputs: ["a", "b"], prompt: "p", contentClass: "code" };

describe("childEnv", () => {
  afterEach(() => {
    delete process.env.AW_JUDGE_CHILD_TEST;
  });

  it("inherits process.env, adds extras, and always forces AW_JUDGE_CHILD=1", () => {
    process.env.AW_JUDGE_CHILD_TEST = "inherited";
    const env = childEnv({ MAX_THINKING_TOKENS: "0", AW_JUDGE_CHILD: "0" });
    expect(env.AW_JUDGE_CHILD_TEST).toBe("inherited");
    expect(env.MAX_THINKING_TOKENS).toBe("0");
    expect(env.AW_JUDGE_CHILD).toBe("1");
  });

  it("works with no extras", () => {
    expect(childEnv().AW_JUDGE_CHILD).toBe("1");
  });
});

describe("laxSchema / strictSchema", () => {
  it("lax: decision required, declared extras optional", () => {
    expect(laxSchema({ ...base, extraProperties: { n: { type: "integer" } } })).toEqual({
      type: "object", properties: { decision: { type: "string", enum: ["a", "b"] }, n: { type: "integer" } }, required: ["decision"],
    });
  });

  it("strict: everything required, extras nullable, additionalProperties false", () => {
    expect(strictSchema({ ...base, extraProperties: { n: { type: "integer" }, u: { enum: ["x"] } } })).toEqual({
      type: "object",
      properties: { decision: { type: "string", enum: ["a", "b"] }, n: { type: ["integer", "null"] }, u: { anyOf: [{ enum: ["x"] }, { type: "null" }] } },
      required: ["decision", "n", "u"],
      additionalProperties: false,
    });
  });

  it("strict with no extras is just the decision", () => {
    expect(strictSchema(base)).toEqual({
      type: "object", properties: { decision: { type: "string", enum: ["a", "b"] } }, required: ["decision"], additionalProperties: false,
    });
  });
});

describe("toDecided", () => {
  it("rejects non-objects and missing decisions", () => {
    expect(toDecided(null, "x")).toEqual({ status: "error", reason_code: "unparseable-result" });
    expect(toDecided("a", "x")).toEqual({ status: "error", reason_code: "unparseable-result" });
    expect(toDecided({ decision: 1 }, "x")).toEqual({ status: "error", reason_code: "unparseable-result" });
  });

  it("keeps non-null extras and drops null ones", () => {
    expect(toDecided({ decision: "a", n: 0, gone: null }, "x")).toEqual({ status: "decided", decision: "a", confidence: 1, reason_code: "x", extra: { n: 0 } });
  });
});

describe("lastJsonObject", () => {
  it("parses a whole-JSON string directly", () => {
    expect(lastJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("finds the last object after prose, preferring the enclosing object over a nested one", () => {
    expect(lastJsonObject('first {"a":1} then {"decision":"x","meta":{"k":2}}')).toEqual({ decision: "x", meta: { k: 2 } });
  });

  it("returns undefined when there is no object at all", () => {
    expect(lastJsonObject("no braces here")).toBeUndefined();
    expect(lastJsonObject("{ unterminated")).toBeUndefined();
    expect(lastJsonObject("} {")).toBeUndefined();
  });
});

describe("spawnFailure", () => {
  it("maps notFound, timeout, and non-zero exits; passes a clean exit", () => {
    expect(spawnFailure({ stdout: "", code: null, timedOut: false, notFound: true })).toEqual({ status: "unavailable", reason_code: "binary-not-found" });
    expect(spawnFailure({ stdout: "", code: null, timedOut: true })).toEqual({ status: "unavailable", reason_code: "timeout" });
    expect(spawnFailure({ stdout: "", code: 3, timedOut: false })).toEqual({ status: "error", reason_code: "exit-3" });
    expect(spawnFailure({ stdout: "", code: null, timedOut: false })).toEqual({ status: "error", reason_code: "exit-null" });
    expect(spawnFailure({ stdout: "", code: 0, timedOut: false, notFound: false })).toBeNull();
  });
});
