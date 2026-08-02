import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock, notFoundMock, prepareMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  notFoundMock: vi.fn(),
  prepareMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getDb: getDbMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

import ConversationPage from "@/app/c/[id]/page";

beforeEach(() => {
  prepareMock.mockReset();
  getDbMock.mockReset().mockReturnValue({ prepare: prepareMock });
  notFoundMock.mockReset().mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("ConversationPage", () => {
  it("returns not found for a malformed encoded route parameter before querying the database", async () => {
    await expect(renderPage("100%")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("returns not found when the decoded conversation does not exist", async () => {
    const getMock = vi.fn().mockReturnValue(undefined);
    prepareMock.mockReturnValue({ get: getMock });

    await expect(renderPage("chatgpt%3Amissing")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(getMock).toHaveBeenCalledWith("chatgpt:missing");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});

function renderPage(id: string) {
  return ConversationPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
}
