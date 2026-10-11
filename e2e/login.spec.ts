import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('signing in shows the projects, signing out returns to the login page', async ({ page }) => {
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await loginAs(page, 'Alice Admin');

  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Website Redesign/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mobile App/ })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
});
