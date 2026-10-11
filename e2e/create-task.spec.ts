import { expect, test } from '@playwright/test';
import { WEB_PROJECT_ID, loginAs } from './helpers';

test('a member creates a task and sees it in the list and the dashboard', async ({ page }) => {
  await loginAs(page, 'Bob Member');
  await page.getByRole('link', { name: /Website Redesign/ }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${WEB_PROJECT_ID}$`));

  const dashboard = page.getByRole('region', { name: 'Dashboard' });
  const totalCard = dashboard.locator('div').filter({ hasText: /^Total/ });
  await expect(totalCard).toContainText('18');

  const form = page.getByRole('form', { name: 'New task' });

  // Inline validation: nothing is sent while the title is too short.
  await form.getByLabel('Title').fill('ab');
  await form.getByRole('button', { name: 'Create task' }).click();
  await expect(form.getByText('Title must be at least 3 characters')).toBeVisible();

  const title = `E2E smoke task ${Date.now()}`;
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Priority').selectOption('urgent');
  await form.getByLabel('Assignee').selectOption({ label: 'Bob Member' });
  await form.getByLabel('Estimate (hours)').fill('3');
  await form.getByRole('button', { name: 'Create task' }).click();

  await expect(form.getByRole('status')).toHaveText(`Created “${title}”.`);
  await expect(form.getByText('Title must be at least 3 characters')).toHaveCount(0);

  const firstRow = page.getByRole('table').getByRole('row').nth(1);
  await expect(firstRow).toContainText(title);
  await expect(firstRow).toContainText('Urgent');
  await expect(firstRow).toContainText('Bob Member');
  await expect(totalCard).toContainText('19');

  // The task page shows it and offers only the legal first transition.
  await firstRow.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const statusActions = page.getByRole('region', { name: 'Change status' });
  await expect(statusActions.getByRole('button')).toHaveText(['Start work']);
});
