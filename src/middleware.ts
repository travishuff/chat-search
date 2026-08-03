import { NextRequest, NextResponse } from "next/server";

const REALM = 'Basic realm="Recall", charset="UTF-8"';

export function middleware(request: NextRequest) {
  const expectedUsername = process.env.RECALL_AUTH_USERNAME;
  const expectedPassword = process.env.RECALL_AUTH_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Recall authentication is not configured.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.next();
  }

  const credentials = parseBasicAuth(request.headers.get("authorization"));
  if (
    credentials &&
    constantTimeEqual(credentials.username, expectedUsername) &&
    constantTimeEqual(credentials.password, expectedPassword)
  ) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": REALM,
    },
  });
}

function parseBasicAuth(value: string | null) {
  if (!value?.startsWith("Basic ")) return null;
  try {
    const bytes = Uint8Array.from(atob(value.slice("Basic ".length)), (character) =>
      character.charCodeAt(0)
    );
    const decoded = new TextDecoder().decode(bytes);
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function constantTimeEqual(actual: string, expected: string) {
  const length = Math.max(actual.length, expected.length);
  let mismatch = actual.length ^ expected.length;
  for (let i = 0; i < length; i++) {
    mismatch |= (actual.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
