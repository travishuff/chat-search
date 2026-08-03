import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: getDbMock }));

import { GET } from "@/app/api/health/route";

beforeEach(() => getDbMock.mockReset());

describe("GET /api/health", () => {
  it("reports the indexed conversation count", async () => {
    getDbMock.mockReturnValueOnce({
      prepare: () => ({ get: () => ({ conversations: 42 }) }),
    });

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", conversations: 42 });
  });

  it("returns unavailable when the database cannot be opened", async () => {
    getDbMock.mockImplementationOnce(() => {
      throw new Error("database missing");
    });

    const response = GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });
});
