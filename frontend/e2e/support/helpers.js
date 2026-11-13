// Shared helpers for the Playwright suite. Seeded data lives in
// backend/tests/e2e/fixtures.json (the e2e backend seeds exactly that).
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';

export const fixtures = JSON.parse(
  readFileSync(new URL('../../../backend/tests/e2e/fixtures.json', import.meta.url), 'utf8')
);

const API_PORT = Number(process.env.E2E_PORT) || fixtures.port;
export const API = `http://localhost:${API_PORT}/api`;
export const PASSWORD = fixtures.password;

let counter = 0;
export const uniq = (prefix = 'e2e') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1e4)}`;

// Receipts auto-print through a hidden iframe; make print() a no-op in the browser.
export async function stubPrint(page) {
  await page.addInitScript(() => {
    window.print = () => {};
  });
}

// ---------- UI ----------

export async function fillLogin(page, email, password) {
  await page.goto('/login');
  await page.getByPlaceholder('name@pharmacy.com').fill(email);
  await page.getByPlaceholder('Enter password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

// Signs in through the login form and waits for the pharmacy portal.
export async function loginAs(page, email, password = PASSWORD) {
  await fillLogin(page, email, password);
  await expect(page).toHaveURL(/\/pharmacy(\/|$)/);
  await expect(page.getByRole('complementary')).toBeVisible();
}

export const sidebar = (page) => page.getByRole('complementary');

// Opens the POS and skips the "Open shift" prompt (shifts are optional for the seeded pharmacy).
export async function openPos(page) {
  await page.goto('/pharmacy/pos');
  await expect(page.getByPlaceholder(/Search name, generic or scan barcode/)).toBeVisible();
  const shiftDialog = page.getByRole('dialog').filter({ hasText: 'Open shift' });
  const skip = shiftDialog.getByRole('button', { name: 'Sell without a shift' });
  try {
    await skip.waitFor({ state: 'visible', timeout: 5_000 });
    await skip.click();
  } catch {
    // no prompt (already answered in this page load)
  }
  await expect(shiftDialog).toHaveCount(0);
}

// Searches the POS catalog and adds `quantity` base units of the medicine to the cart.
export async function addToCart(page, name, quantity = 1) {
  await page.getByPlaceholder(/Search name, generic or scan barcode/).fill(name);
  const result = page.getByRole('option').filter({ hasText: name });
  await expect(result).toHaveCount(1);
  const add = result.getByRole('button', { name: /^Add 1 / });
  for (let i = 0; i < quantity; i += 1) await add.click();
}

// The amount input of the n-th payment row (rows have no visible label; the POS marks them).
export const paymentAmount = (page, n = 0) => page.locator('[data-pos-payment-amount]').nth(n);

// The method <select> of the n-th payment row.
export const paymentMethod = (page, n = 0) =>
  page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Mobile money' }) }).nth(n);

// ---------- API (for setup and assertions) ----------

export async function apiLogin(request, email, password = PASSWORD) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.ok(), `login ${email}: ${res.status()}`).toBeTruthy();
  return (await res.json()).token;
}

const headers = (token) => ({ Authorization: `Bearer ${token}` });

export async function apiGet(request, token, path) {
  const res = await request.get(`${API}${path}`, { headers: headers(token) });
  expect(res.ok(), `GET ${path}: ${res.status()}`).toBeTruthy();
  return res.json();
}

export async function apiPost(request, token, path, data) {
  const res = await request.post(`${API}${path}`, { headers: headers(token), data });
  const body = await res.json().catch(() => ({}));
  expect(res.ok(), `POST ${path}: ${res.status()} ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

// Sellable stock (base units) of a medicine, by exact name.
export async function stockOf(request, token, name) {
  const { medicines } = await apiGet(request, token, '/sales/pos-catalog');
  const med = medicines.find((m) => m.name === name);
  expect(med, `medicine ${name}`).toBeTruthy();
  return med.stock;
}

export async function medicineByName(request, token, name) {
  const { medicines } = await apiGet(request, token, '/sales/pos-catalog');
  return medicines.find((m) => m.name === name);
}

// ---------- TOTP (RFC 6238: SHA-1, 30 s, 6 digits, base32 secret) ----------

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error(`invalid base32 character "${ch}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / 30);

export function totp(secret, step = currentStep()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}
