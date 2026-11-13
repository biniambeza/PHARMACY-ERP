import { test, expect } from '@playwright/test';
import { fixtures, loginAs, apiLogin, apiPost, stockOf, medicineByName } from './support/helpers.js';

const MED = fixtures.medicines.returns;

test('return one item from Sales History: refund shown and the item is restocked', async ({ page, request }) => {
  // A fresh sale of 3 units (made through the API so this test does not depend on the POS test)
  const token = await apiLogin(request, fixtures.owner.email);
  const med = await medicineByName(request, token, MED.name);
  const { sale } = await apiPost(request, token, '/sales', {
    paymentMethod: 'cash',
    items: [{ medicineId: med._id, quantity: 3 }],
  });
  const stockAfterSale = await stockOf(request, token, MED.name);

  await loginAs(page, fixtures.owner.email);
  await page.goto('/pharmacy/sales');
  await page.getByPlaceholder(/Search by invoice #/).fill(sale.invoiceNumber);

  const row = page.getByRole('row').filter({ hasText: sale.invoiceNumber });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Return', exact: true }).click();

  const modal = page.locator('form').filter({ hasText: 'Return items' });
  await expect(modal.getByText(MED.name)).toBeVisible();
  const line = modal.getByRole('row').filter({ hasText: MED.name });
  await line.getByRole('spinbutton').fill('1');
  await expect(modal.getByText(/Estimated refund:/)).toContainText(String(MED.price));

  const returnResponse = page.waitForResponse((r) => r.url().endsWith('/api/returns') && r.request().method() === 'POST');
  await modal.getByRole('button', { name: 'Process return' }).click();
  const res = await returnResponse;
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.return.refundTotal).toBe(MED.price);

  // Notice with the return number and refund amount
  await expect(page.getByText(new RegExp(`Return ${body.return.returnNumber} recorded\\. Refund .*${MED.price}`))).toBeVisible();
  // The sale is now marked as partly returned
  await expect(row).toContainText(/return/i);

  await expect.poll(() => stockOf(request, token, MED.name)).toBe(stockAfterSale + 1);
});
