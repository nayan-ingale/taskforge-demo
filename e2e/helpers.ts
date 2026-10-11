import { expect, type Page } from '@playwright/test';

export const WEB_PROJECT_ID = '20000000-0000-4000-8000-000000000001';

/** Signs in through the demo login page and waits for the projects page. */
export async function loginAs(page: Page, name: 'Alice Admin' | 'Bob Member' | 'Vera Viewer') {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(`Continue as ${name}`) }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('banner')).toContainText(name);
}
