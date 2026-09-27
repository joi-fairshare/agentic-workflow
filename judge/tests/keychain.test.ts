import { describe, expect, it, vi } from "vitest";

import { readApiKey, TYPESAFE_KEYCHAIN_SERVICE } from "../src/keychain.js";

describe("readApiKey", () => {
  it("prefers the environment variable", async () => {
    const readKeychain = vi.fn();
    const key = await readApiKey({ env: { TYPESAFE_API_KEY: "env-key" }, readKeychain });
    expect(key).toBe("env-key");
    expect(readKeychain).not.toHaveBeenCalled();
  });

  it("falls back to the keychain with the defined service name", async () => {
    const readKeychain = vi.fn().mockResolvedValue("keychain-key");
    const key = await readApiKey({ env: {}, readKeychain });
    expect(key).toBe("keychain-key");
    expect(readKeychain).toHaveBeenCalledWith(TYPESAFE_KEYCHAIN_SERVICE, "TYPESAFE_API_KEY");
  });

  it("returns null when neither has it", async () => {
    const readKeychain = vi.fn().mockResolvedValue(null);
    expect(await readApiKey({ env: {}, readKeychain })).toBeNull();
  });

  it("returns null, not a throw, when the keychain read itself throws", async () => {
    const readKeychain = vi.fn().mockRejectedValue(new Error("no keychain on this OS"));
    expect(await readApiKey({ env: {}, readKeychain })).toBeNull();
  });

  it("treats an empty-string env var as absent", async () => {
    const readKeychain = vi.fn().mockResolvedValue("keychain-key");
    expect(await readApiKey({ env: { TYPESAFE_API_KEY: "" }, readKeychain })).toBe("keychain-key");
  });
});
