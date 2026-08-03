import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

afterEach(() => vi.unstubAllEnvs());

describe("production authentication middleware", () => {
  it("allows local development without configured credentials", () => {
    vi.stubEnv("NODE_ENV", "development");

    const response = middleware(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed in production when credentials are missing", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = middleware(request());

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("Recall authentication is not configured.");
  });

  it("challenges invalid credentials and accepts the configured credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RECALL_AUTH_USERNAME", "archive-owner");
    vi.stubEnv("RECALL_AUTH_PASSWORD", "a-long-private-password");

    const rejected = middleware(request("Basic definitely-not-base64"));
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("www-authenticate")).toContain('realm="Recall"');

    const authorization = `Basic ${btoa("archive-owner:a-long-private-password")}`;
    const accepted = middleware(request(authorization));
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("x-middleware-next")).toBe("1");
  });
});

function request(authorization?: string) {
  return new NextRequest("https://recall.example.com/", {
    headers: authorization ? { authorization } : undefined,
  });
}
