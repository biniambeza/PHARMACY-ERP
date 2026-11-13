import { test, expect } from '@playwright/test';
import { fixtures, fillLogin, loginAs, sidebar } from './support/helpers.js';

test.describe('Sign in', () => {
  test('owner signs in and sees the dashboard with the full sidebar', async ({ page }) => {
    await loginAs(page, fixtures.owner.email);

    await expect(page).toHaveURL(/\/pharmacy\/?$/);
    const nav = sidebar(page);
    for (const item of ['Overview', 'Point of Sale', 'Sales History', 'Stock', 'Purchase Orders', 'Reports', 'Staff', 'Settings']) {
      await expect(nav.getByRole('link', { name: item, exact: false }).first()).toBeVisible();
    }
    await expect(nav.getByText(fixtures.owner.name)).toBeVisible();
    await expect(nav.getByText(fixtures.pharmacy.name)).toBeVisible();
  });

  test('wrong password shows an error and stays on the login page', async ({ page }) => {
    await fillLogin(page, fixtures.owner.email, 'not-the-password');

    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('complementary')).toHaveCount(0);
  });

  test('cashier only sees cashier menus', async ({ page }) => {
    await loginAs(page, fixtures.cashier.email);

    const nav = sidebar(page);
    for (const item of ['Point of Sale', 'Sales History', 'Shifts', 'Customers', 'Medicines', 'Settings']) {
      await expect(nav.getByRole('link', { name: item, exact: false }).first()).toBeVisible();
    }
    for (const item of ['Overview', 'Stock', 'Purchase Orders', 'Suppliers', 'Reports', 'Staff', 'Audit Log', 'Returns', 'Insurance']) {
      // Some links carry a badge in their name ("Stock FEFO"), so match the start of the name.
      await expect(nav.getByRole('link', { name: new RegExp(`^${item}(\\s|$)`) })).toHaveCount(0);
    }
    await expect(nav.getByText('Cashier', { exact: true })).toBeVisible();
  });
});
