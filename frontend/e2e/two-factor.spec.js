import { test, expect } from '@playwright/test';
import { fixtures, PASSWORD, apiLogin, apiPost, loginAs, fillLogin, totp, currentStep, uniq } from './support/helpers.js';

test('two-factor login: enable in Settings with a TOTP code, sign out, sign in with a code', async ({ page, request }) => {
  // A fresh staff member per run, so a retry never meets an account that already has 2FA on
  const ownerToken = await apiLogin(request, fixtures.owner.email);
  const email = `${uniq('twofa.')}@example.com`;
  await apiPost(request, ownerToken, '/staff', { name: 'Tess Twofactor', email, password: PASSWORD, role: 'pharmacist' });

  await loginAs(page, email);
  await page.goto('/pharmacy/settings');

  // Start setup (password confirmation)
  await expect(page.getByText('Two-factor login is off')).toBeVisible();
  await page.getByRole('button', { name: 'Set up two-factor login' }).click();
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Read the manual setup key shown under the QR code
  await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
  const keyText = await page.getByText('Setup key', { exact: true }).locator('..').locator('code').innerText();
  const secret = keyText.replace(/\s+/g, '');
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);

  const enableStep = currentStep();
  await page.getByLabel('6-digit code from the app').fill(totp(secret, enableStep));
  await page.getByRole('button', { name: 'Verify and turn on' }).click();

  // Recovery codes are shown once
  await page.getByText('I have saved my recovery codes in a safe place').click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Two-factor login is on', { exact: true })).toBeVisible();

  // Sign out, then sign in again: the password alone is not enough
  await page.getByRole('button', { name: 'Sign Out' }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await fillLogin(page, email, PASSWORD);
  await expect(page.getByRole('heading', { name: 'Two-factor verification' })).toBeVisible();
  await expect(page.getByRole('complementary')).toHaveCount(0);

  // A wrong code is rejected
  await page.getByLabel('Verification code').fill('000000');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByText('That code is not valid. Check your phone and try again.')).toBeVisible();

  // The code used to enable 2FA cannot be replayed, so use the next time step (the server
  // accepts one step of clock drift either way).
  const loginStep = Math.max(currentStep(), enableStep) + 1;
  await page.getByLabel('Verification code').fill(totp(secret, loginStep));
  await page.getByRole('button', { name: 'Verify', exact: true }).click();

  await expect(page).toHaveURL(/\/pharmacy(\/|$)/);
  await expect(page.getByRole('complementary').getByText('Tess Twofactor')).toBeVisible();
});
