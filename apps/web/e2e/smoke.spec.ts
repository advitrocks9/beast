import { expect, test, type Page } from "@playwright/test";

const RUN_BUDGET_MS = 90_000;

function trpcQueryUrl(path: string, input: unknown): string {
  return `/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
}

async function trpcQuery<T>(page: Page, path: string, input: unknown): Promise<T> {
  const res = await page.request.get(trpcQueryUrl(path, input));
  expect(res.ok(), `${path} responded ${res.status()}`).toBe(true);
  return (await res.json()).result.data.json as T;
}

test("dashboard renders the office", async ({ page }) => {
  const res = await page.goto("/dashboard");
  expect(res?.ok()).toBe(true);
  await expect(page.getByText("Northwind Coffee").first()).toBeVisible();
});

test("commissioning a canned job reaches review with a real deliverable", async ({ page }) => {
  test.setTimeout(RUN_BUDGET_MS + 90_000);

  const session = await page.request.post("/api/demo/session");
  expect(session.ok(), `demo session mint responded ${session.status()}`).toBe(true);

  const commission = await page.request.post("/api/trpc/tasks.commission", {
    data: { json: { cannedJobId: "support-grinder" } },
  });
  expect(commission.ok(), `commission responded ${commission.status()}`).toBe(true);
  const result = (await commission.json()).result.data.json as { mode: string; taskId: string };
  expect(result.mode).toBe("live");

  await expect
    .poll(
      async () => {
        const task = await trpcQuery<{ status: string } | null>(page, "tasks.getProgress", {
          taskId: result.taskId,
        });
        return task?.status;
      },
      { timeout: RUN_BUDGET_MS, intervals: [2_000] },
    )
    .toBe("in_review");

  const deliverables = await trpcQuery<
    Array<{ taskId: string; renderedPreview: string | null; content: unknown }>
  >(page, "deliverables.list", {});
  const deliverable = deliverables.find((d) => d.taskId === result.taskId);
  expect(deliverable, "no deliverable row for the commissioned task").toBeDefined();
  const text = deliverable!.renderedPreview ?? JSON.stringify(deliverable!.content);
  expect(text.length).toBeGreaterThan(200);
});
