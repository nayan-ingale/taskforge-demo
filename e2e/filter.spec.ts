import { expect, test } from '@playwright/test';
import { WEB_PROJECT_ID, loginAs } from './helpers';

test('a viewer filters and searches the task list', async ({ page }) => {
  await loginAs(page, 'Vera Viewer');
  await page.goto(`/projects/${WEB_PROJECT_ID}`);

  // Viewers are read-only: no create form.
  await expect(page.getByRole('form', { name: 'New task' })).toHaveCount(0);

  const table = page.getByRole('table');
  const rows = table.getByRole('row');
  await expect(rows.nth(1)).toBeVisible();

  await page.getByLabel('Status').selectOption('in_review');
  await expect(rows).toHaveCount(3); // header + 2 tasks
  await expect(table).toContainText('Login page redesign');
  await expect(table).toContainText('Accessibility pass on forms');
  await expect(page.getByText(/Page 1 of 1 · 2 tasks/)).toBeVisible();

  await page.getByLabel('Status').selectOption('');
  await page.getByRole('searchbox', { name: 'Search' }).fill('LOGIN');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(rows).toHaveCount(4); // header + 3 tasks (archived matches are hidden)
  await expect(page.getByText(/3 tasks/)).toBeVisible();

  await page.getByLabel('Status').selectOption('todo');
  await expect(rows).toHaveCount(2);
  await expect(table).toContainText('Customer portal: Login with magic link');

  await page.getByLabel('Priority').selectOption('low');
  await expect(page.getByText('No tasks match these filters.')).toBeVisible();
  await expect(table).toHaveCount(0);
});
