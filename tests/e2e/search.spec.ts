import { expect, test } from "@playwright/test";

test("searches from the home page and renders a navigable highlighted result", async ({ page }) => {
  await page.route("**/api/search?**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("q")).toBe("stellar nursery");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            conversationId: "chatgpt:space-chat",
            source: "chatgpt",
            title: "How stars are born",
            conversationDate: Date.UTC(2025, 6, 10, 12),
            messageId: "chatgpt:space-chat:3",
            role: "assistant",
            snippet: "A stellar nursery is a cloud where new stars form.",
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("that conversation where I asked about…").fill("stellar nursery");

  const result = page.getByRole("link", { name: /How stars are born/ });
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute(
    "href",
    "/c/chatgpt%3Aspace-chat?m=chatgpt%3Aspace-chat%3A3&q=stellar+nursery"
  );
  await expect(result.locator("mark")).toHaveText(["stellar", "nursery"]);
  await expect(result).toContainText("Jul 10, 2025");
});
