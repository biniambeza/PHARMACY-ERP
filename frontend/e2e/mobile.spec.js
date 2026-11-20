import { test, expect } from '@playwright/test';
import { fixtures, fillLogin, stubPrint, addToCart } from './support/helpers.js';

// Phone layout: the menu button is reachable, the slide-out menu navigates and holds the
// language picker, nothing scrolls sideways, and the POS shows a floating cart bar.
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const pageScrollsSideways = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test('phone: open the menu, switch page, and sell from the POS cart bar', async ({ page }) => {
  await stubPrint(page);
  await fillLogin(page, fixtures.owner.email, fixtures.password);
  await expect(page).toHaveURL(/\/pharmacy(\/|$)/);
  expect(await pageScrollsSideways(page)).toBe(false);

  // Top bar: menu button visible and tappable (it used to sit under the language picker)
  const menu = page.getByRole('button', { name: 'Open menu' });
  await expect(menu).toBeVisible();
  await menu.click();
  const drawer = page.getByRole('complementary');
  await expect(drawer.getByRole('combobox', { name: 'Language' })).toBeVisible();
  await drawer.getByRole('link', { name: 'Medicines' }).click();
  await expect(page).toHaveURL(/\/pharmacy\/medicines$/);
  expect(await pageScrollsSideways(page)).toBe(false);

  // POS: the cart is below the product list on phones, the floating bar jumps to it
  await page.goto('/pharmacy/pos');
  const skip = page.getByRole('button', { name: 'Sell without a shift' });
  await skip.waitFor({ state: 'visible', timeout: 5_000 }).then(() => skip.click()).catch(() => {});
  await addToCart(page, fixtures.medicines.posCash.name, 2);
  const bar = page.getByRole('button', { name: /1 line.*Checkout/ });
  await expect(bar).toBeVisible();
  await bar.click();
  await expect(page.getByRole('button', { name: /Complete sale/ })).toBeInViewport();
  expect(await pageScrollsSideways(page)).toBe(false);
});
