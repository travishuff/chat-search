import { expect, test } from "@playwright/test";

// These tests run against the seeded database from global-setup.ts and do NOT
// mock /api/search — they exercise the full stack (UI → route → SQLite → RRF).
// The first search triggers the server's embedding-model load, hence the
// generous visibility timeout.

test("full-stack search returns seeded results from the real API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("ChatGPT 1 · Claude 1")).toBeVisible();
  await page.getByPlaceholder("that conversation where I asked about…").fill("quasar");

  const result = page.getByRole("link", { name: /Quasar observations/ }).first();
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(result).toContainText("Jul 10, 2025");
  await expect(result.locator("mark").first()).toHaveText(/quasar/i);

  // The claude-only filter must exclude the chatgpt conversation entirely.
  await page.getByRole("button", { name: "Claude" }).click();
  await page.getByPlaceholder("that conversation where I asked about…").fill("sourdough starter");
  const claudeResult = page.getByRole("link", { name: /Sourdough starter help/ }).first();
  await expect(claudeResult).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: /Quasar observations/ })).toHaveCount(0);
});

test("clicking a result opens the conversation, decodes the id, highlights and scrolls to the match", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByPlaceholder("that conversation where I asked about…").fill("quasar");

  // Prefer the assistant reply so the target sits at the bottom of the thread.
  const replyResult = page
    .getByRole("link", { name: /Quasar observations/ })
    .filter({ hasText: "reply" })
    .first();
  await expect(replyResult).toBeVisible({ timeout: 60_000 });
  await replyResult.click();

  // The conversation id contains a colon — this asserts the encode/decode
  // round-trip through the /c/[id] route (a real past regression).
  await expect(page).toHaveURL(/\/c\/chatgpt%3Ae2e-space\?m=/);
  await expect(page.getByRole("heading", { name: "Quasar observations" })).toBeVisible();
  await expect(page.getByText("12 messages")).toBeVisible();
  await expect(page.getByRole("link", { name: /open in ChatGPT/ })).toHaveAttribute(
    "href",
    "https://chatgpt.com/c/e2e-space"
  );

  // The matched message is marked and scrolled into view despite the filler
  // messages above it.
  const target = page.locator("article.target");
  await expect(target).toHaveCount(1);
  await expect(target).toContainText("luminous active galactic nucleus");
  await expect(target).toBeInViewport();

  await page.getByRole("link", { name: "← back to search" }).click();
  await expect(page).toHaveURL(/\/$/);
});
