// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SearchApp from "@/app/search-app";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SearchApp", () => {
  it("summarizes the archive and disables sources with no conversations", () => {
    render(
      <SearchApp
        counts={[
          { source: "chatgpt", n: 12 },
          { source: "claude", n: 3 },
        ]}
        range={{ lo: Date.UTC(2022, 6, 1), hi: Date.UTC(2025, 6, 1) }}
      />
    );

    expect(screen.getByText(/ChatGPT 12 · Claude 3/)).toHaveTextContent("15 conversations");
    expect(screen.getByText(/Everything you have asked/)).toHaveTextContent("2022–2025");
    expect(screen.getByRole("button", { name: "Gemini — none yet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Claude" })).toBeEnabled();
  });

  it("debounces searches, applies source filters, highlights matches, and builds a conversation link", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            conversationId: "chatgpt:conversation/1",
            source: "chatgpt",
            title: "Stellar formation",
            conversationDate: Date.UTC(2024, 3, 4, 12),
            messageId: "chatgpt:conversation/1:2",
            role: "assistant",
            snippet: "Stars emerge from collapsing clouds.",
          },
        ],
      }),
    });
    render(
      <SearchApp
        counts={[
          { source: "chatgpt", n: 2 },
          { source: "claude", n: 1 },
        ]}
        range={{ lo: null, hi: null }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "ChatGPT" }));
    fireEvent.change(screen.getByPlaceholderText(/that conversation/), { target: { value: "  stars  " } });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/search?q=stars&sources=chatgpt");
    const result = screen.getByRole("link", { name: /Stellar formation/ });
    expect(result).toHaveAttribute(
      "href",
      "/c/chatgpt%3Aconversation%2F1?m=chatgpt%3Aconversation%2F1%3A2&q=stars&sources=chatgpt"
    );
    expect(within(result).getByText("Stars", { selector: "mark" })).toBeVisible();
    expect(result).toHaveTextContent("reply");
    expect(result).toHaveTextContent("Apr 4, 2024");
  });

  it("clears stale results when the query is erased", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    render(<SearchApp counts={[{ source: "claude", n: 1 }]} range={{ lo: null, hi: null }} />);
    const input = screen.getByPlaceholderText(/that conversation/);

    fireEvent.change(input, { target: { value: "missing" } });
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(screen.getByText(/Nothing surfaced/)).toBeVisible();

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText(/Type to search 1 conversation/)).toBeVisible();
    expect(screen.queryByText(/Nothing surfaced/)).not.toBeInTheDocument();
  });

  it("handles an unsuccessful API response without crashing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "search failed" }) });
    render(<SearchApp counts={[{ source: "claude", n: 1 }]} range={{ lo: null, hi: null }} />);

    fireEvent.change(screen.getByPlaceholderText(/that conversation/), { target: { value: "stars" } });
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(screen.getByText(/Nothing surfaced/)).toBeVisible();
  });

  it("restores URL-backed search state and clears the query and filters", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    window.history.replaceState({}, "", "/?q=stars&sources=chatgpt");
    render(
      <SearchApp
        counts={[{ source: "chatgpt", n: 2 }]}
        range={{ lo: null, hi: null }}
        initialQuery="stars"
        initialSources={["chatgpt"]}
      />
    );

    const input = screen.getByPlaceholderText(/that conversation/);
    expect(input).toHaveValue("stars");
    expect(screen.getByRole("button", { name: "ChatGPT" })).toHaveClass("active");

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/search?q=stars&sources=chatgpt");

    fireEvent.click(screen.getByRole("button", { name: "clear" }));

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: "ChatGPT" })).not.toHaveClass("active");
    expect(screen.queryByRole("button", { name: "clear" })).not.toBeInTheDocument();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/");
  });
});
