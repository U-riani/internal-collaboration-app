// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadFiles } from "../src/lib/api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("multi-attachment upload transport", () => {
  it("keeps file order even when uploads finish in a different order", async () => {
    const fetchMock = vi.fn(async (_url, options) => {
      const file = options.body.get("file");
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: { id: "id-" + file.name } }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const files = [new File(["a"], "a.txt"), new File(["b"], "b.txt")];

    await expect(uploadFiles(files)).resolves.toEqual(["id-a.txt", "id-b.txt"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => url === "/api/v1/files")).toBe(true);
  });

  it("tries other files on failure and reuses successful uploads for retry", async () => {
    let fail = true;
    const calls = [];
    const fetchMock = vi.fn(async (_url, options) => {
      const name = options.body.get("file").name;
      calls.push(name);
      if (name === "b.txt" && fail) {
        return {
          ok: false,
          status: 413,
          json: async () => ({ error: { message: "File too large" } }),
        };
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({ data: { id: "id-" + name } }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const files = [new File(["a"], "a.txt"), new File(["b"], "b.txt")];
    const cache = new Map();

    await expect(uploadFiles(files, cache)).rejects.toThrow("Nothing was submitted");
    expect(calls).toEqual(["a.txt", "b.txt"]);
    expect(cache.get(files[0])).toBe("id-a.txt");

    fail = false;
    await expect(uploadFiles(files, cache)).resolves.toEqual(["id-a.txt", "id-b.txt"]);
    expect(calls).toEqual(["a.txt", "b.txt", "b.txt"]);
  });
});
