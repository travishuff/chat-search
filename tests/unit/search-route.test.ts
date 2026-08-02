import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));

vi.mock("@/lib/search", () => ({ search: searchMock }));

import { GET } from "@/app/api/search/route";

beforeEach(() => searchMock.mockReset());

describe("GET /api/search", () => {
  it("returns no results without a meaningful query", async () => {
    const response = await GET(request("?q=%20%20"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("trims the query and forwards non-empty source filters", async () => {
    searchMock.mockResolvedValue([{ messageId: "m1" }]);

    const response = await GET(request("?q=%20stars%20&sources=claude,,chatgpt"));

    expect(searchMock).toHaveBeenCalledWith("stars", { sources: ["claude", "chatgpt"] });
    await expect(response.json()).resolves.toEqual({ results: [{ messageId: "m1" }] });
  });

  it("rejects overlong queries before searching", async () => {
    const response = await GET(request(`?q=${"a".repeat(501)}`));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "query too long" });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("returns a stable error contract when search fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    searchMock.mockRejectedValueOnce(new Error("embedding unavailable"));

    const response = await GET(request("?q=stars"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "search failed" });
  });
});

function request(search: string) {
  return new NextRequest(`http://localhost/api/search${search}`);
}
