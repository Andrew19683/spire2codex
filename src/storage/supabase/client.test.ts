import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, SUPABASE_REQUEST_TIMEOUT_MS } from "./client";

describe("Supabase fetch timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts a request that does not settle", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input, init: RequestInit | undefined) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));

    const request = fetchWithTimeout("https://example.test");
    const rejection = expect(request).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS);
    await rejection;
  });
});
