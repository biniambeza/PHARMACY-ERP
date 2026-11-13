import { test, expect } from '@playwright/test';
import {
  fixtures, loginAs, apiLogin, stockOf, stubPrint, openPos, addToCart, paymentAmount, paymentMethod,
} from './support/helpers.js';

const MED = fixtures.medicines.insurance;
const { scheme, member } = fixtures.insurance;

test('insurance sale at the POS: scheme + member, insurer covers, patient pays the copay in cash', async ({ page, request }) => {
  await stubPrint(page);
  const token = await apiLogin(request, fixtures.owner.email);
  const before = await stockOf(request, token, MED.name);

  await loginAs(page, fixtures.owner.email);
  await openPos(page);
  await addToCart(page, MED.name, 1);

  // Pay with insurance: scheme, then member lookup
  await paymentMethod(page, 0).selectOption({ label: 'Insurance' });
  const schemeSelect = page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Select insurance scheme…' }) });
  await schemeSelect.selectOption({ label: `${scheme.name} · ${scheme.coveragePercent}%` });
  await page.getByPlaceholder('Member number, name or phone').fill(member.memberNo);
  await page.getByRole('button', { name: new RegExp(`${member.memberNo}.*${member.name}`) }).click();

  // Coverage preview: 100% covered minus a fixed copay
  const insurerShare = MED.price - scheme.copayValue;
  await expect(page.getByText('Insurer pays').locator('..')).toContainText(String(insurerShare));
  await expect(page.getByText('Patient pays').locator('..')).toContainText(String(scheme.copayValue));
  await expect(page.getByText('Copay', { exact: true }).locator('..')).toContainText(String(scheme.copayValue));

  // The patient pays the copay in cash (split payment pre-fills the remaining amount)
  await page.getByRole('button', { name: 'Split payment' }).click();
  await expect(paymentAmount(page, 1)).toHaveValue(String(scheme.copayValue));
  await expect(page.getByText('Paid in full')).toBeVisible();

  const saleResponse = page.waitForResponse((r) => r.url().endsWith('/api/sales') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Complete sale/ }).click();
  const res = await saleResponse;
  expect(res.ok()).toBeTruthy();
  const { sale } = await res.json();

  const byMethod = Object.fromEntries(sale.payments.map((p) => [p.method, p.amount]));
  expect(byMethod.insurance).toBe(insurerShare);
  expect(byMethod.cash).toBe(scheme.copayValue);
  await expect(page.getByText(sale.invoiceNumber).first()).toBeVisible();

  await expect.poll(() => stockOf(request, token, MED.name)).toBe(before - 1);
});
