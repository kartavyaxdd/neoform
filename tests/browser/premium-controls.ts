import { expect, type Page } from "@playwright/test";

export async function toggleTheme(page: Page) {
  const current = await page
    .locator(".app-shell")
    .evaluate((el) =>
      [...el.classList].find((c) => c.startsWith("page-"))?.slice(5),
    );
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  if (current === "settings") return;
  const destination = (
    {
      overview: "Dashboard",
      train: "Workout",
      insights: "Levels",
      session: "Workout",
    } as Record<string, string>
  )[current ?? ""];
  if (destination)
    await page.getByRole("button", { name: destination, exact: true }).click();
  else if (current === "history")
    await page
      .getByRole("button", { name: "Workout history", exact: true })
      .click();
  else if (current === "exercises")
    await page
      .getByRole("button", { name: "Exercise library", exact: true })
      .click();
  if (current === "session")
    await page
      .getByRole("button", { name: "Resume session", exact: true })
      .click();
}

export async function exerciseOptions(page: Page) {
  await page
    .getByRole("button", { name: "Exercise options", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Advanced techniques & notes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Exercise options");
}

export async function closeSheets(page: Page) {
  for (
    let depth = 0;
    depth < 12 && (await page.getByRole("dialog").count());
    depth++
  )
    await page.getByRole("button", { name: /^(?:Back|Close dialog)$/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
