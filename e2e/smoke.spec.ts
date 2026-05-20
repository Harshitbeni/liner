import { expect, test } from '@playwright/test';

const apiBase =
  process.env.VITE_LINER_API ??
  `http://127.0.0.1:${process.env.LINER_API_PORT ?? '9240'}/api`;

test('mock RPC smoke: health, task flow, thread', async ({ page }) => {
  const health = await fetch(`${apiBase}/health`).then((r) => r.json());
  expect(health.ok).toBe(true);
  expect(health.rpc).toBe('mock');

  const areas = await fetch(`${apiBase}/areas`).then((r) => r.json());
  const area = areas[0];
  expect(area?.id).toBeTruthy();

  const taskTitle = `E2E smoke ${Date.now()}`;
  const point = await fetch(`${apiBase}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: taskTitle,
      areaId: area.id,
      state: 'backlog',
    }),
  }).then((r) => r.json());

  await fetch(`${apiBase}/points/${point.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'todo' }),
  });

  await fetch(`${apiBase}/points/${point.id}/session`, { method: 'POST' });
  await fetch(`${apiBase}/points/${point.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Hello from Playwright' }),
  });

  await expect
    .poll(
      async () => {
        const msgs = await fetch(`${apiBase}/points/${point.id}/messages`).then(
          (r) => r.json(),
        );
        return (
          Array.isArray(msgs) &&
          msgs.some((m: { role: string }) => m.role === 'assistant')
        );
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  await page.goto('/');

  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: area.name }).click();

  const row = page.locator('.outline-row').filter({ hasText: taskTitle });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();

  await expect(
    page.locator('.comment-card').filter({ hasText: /mock agent/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
});
