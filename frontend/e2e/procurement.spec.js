import { test, expect } from '@playwright/test';
import { fixtures, loginAs, apiLogin, apiGet, apiPost, stockOf, medicineByName, uniq } from './support/helpers.js';

const MED = fixtures.medicines.purchase;

test('receive an ordered purchase order: stock increases and the PO is received', async ({ page, request }) => {
  // An ordered PO of 20 units (own PO per run, so retries never find it already received)
  const token = await apiLogin(request, fixtures.owner.email);
  const med = await medicineByName(request, token, MED.name);
  const { suppliers } = await apiGet(request, token, '/suppliers');
  const supplier = suppliers.find((s) => s.name === fixtures.supplier.name);
  const { order } = await apiPost(request, token, '/procurement/orders', {
    supplierId: supplier._id,
    items: [{ medicineId: med._id, quantityOrdered: 20, unitCost: 5 }],
  });
  expect(order.status).toBe('ordered');
  const before = await stockOf(request, token, MED.name);

  await loginAs(page, fixtures.owner.email);
  await page.goto('/pharmacy/procurement');
  await page.getByPlaceholder('Search by PO number or supplier name...').fill(order.poNumber);

  const row = page.getByRole('row').filter({ hasText: order.poNumber });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Receive Stock' }).click();

  await expect(page.getByRole('heading', { name: 'Receive Delivery' })).toBeVisible();
  await page.getByPlaceholder('LOT-2026-XXXX').fill(uniq('LOT-E2E-').toUpperCase());
  await page.getByRole('button', { name: /Fill empty expiry dates/ }).click();

  const receiveResponse = page.waitForResponse((r) => r.url().includes(`/procurement/orders/${order._id}/receive`));
  await page.getByRole('button', { name: 'Receive & Add to Stock' }).click();
  expect((await receiveResponse).ok()).toBeTruthy();

  await expect(page.getByRole('heading', { name: 'Receive Delivery' })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: order.poNumber })).toContainText('Received');
  await expect.poll(() => stockOf(request, token, MED.name)).toBe(before + 20);
});
