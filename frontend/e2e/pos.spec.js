import { test, expect } from '@playwright/test';
import {
  fixtures, loginAs, apiLogin, stockOf, stubPrint, openPos, addToCart, paymentAmount,
} from './support/helpers.js';

const MED = fixtures.medicines.posCash;

test('POS cash sale: add to cart, pay cash with change, receipt shows the invoice and stock goes down', async ({ page, request }) => {
  await stubPrint(page);
  const token = await apiLogin(request, fixtures.owner.email);
  const before = await stockOf(request, token, MED.name);

  await loginAs(page, fixtures.owner.email);
  await openPos(page);
  await addToCart(page, MED.name, 2);

  // Cart line with quantity 2 and the total
  await expect(page.getByText(MED.name).last()).toBeVisible();
  const total = MED.price * 2;

  // Cash tendered 100 -> change
  await paymentAmount(page).fill('100');
  await expect(page.getByText(/Change:/)).toContainText(String(100 - total));

  const saleResponse = page.waitForResponse((r) => r.url().endsWith('/api/sales') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Complete sale/ }).click();
  const res = await saleResponse;
  expect(res.status()).toBe(201);
  const { sale } = await res.json();
  expect(sale.invoiceNumber).toBeTruthy();
  expect(sale.grandTotal).toBe(total);

  // Receipt modal with the invoice number
  await expect(page.getByText(sale.invoiceNumber).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Done/ })).toBeVisible();

  // Stock decreased by 2
  await expect.poll(() => stockOf(request, token, MED.name)).toBe(before - 2);
});
