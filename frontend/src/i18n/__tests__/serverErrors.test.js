// Run with (from frontend/): node --test src/i18n/__tests__/serverErrors.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVER_MESSAGE_PATTERNS, translateServerMessage } from '../serverErrors.js';

const load = (lng) => JSON.parse(readFileSync(new URL(`../locales/${lng}/errors.json`, import.meta.url), 'utf8'));
const bundles = { en: load('en'), am: load('am'), om: load('om') };

// Minimal i18next-like t: 'errors:messages.key' / 'errors:patterns.key' with {{name}} interpolation
// and defaultValue when the key is missing.
const makeT = (lng) => (fullKey, options = {}) => {
  const [, path] = fullKey.split(':');
  const value = path.split('.').reduce((obj, part) => obj?.[part], bundles[lng]);
  if (typeof value !== 'string') return options.defaultValue;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name] ?? ''));
};

const en = bundles.en.messages;

test('every language has the same message and pattern keys', () => {
  for (const lng of ['am', 'om']) {
    assert.deepEqual(Object.keys(bundles[lng].messages).sort(), Object.keys(en).sort(), `${lng} messages`);
    assert.deepEqual(Object.keys(bundles[lng].patterns).sort(), Object.keys(bundles.en.patterns).sort(), `${lng} patterns`);
  }
});

test('every pattern has an English text and reproduces the server message', () => {
  for (const p of SERVER_MESSAGE_PATTERNS) {
    const template = bundles.en.patterns[p.key];
    assert.ok(template, `missing en pattern ${p.key}`);
    const sample = Object.fromEntries(p.params.map((name, i) => [name, String(i + 2)]));
    const text = template.replace(/\{\{(\w+)\}\}/g, (_, name) => sample[name]);
    assert.ok(p.re.test(text), `${p.key} regex does not match its own English text: ${text}`);
    assert.equal(translateServerMessage(text, makeT('en'), en), text);
  }
});

test('exact messages are translated', () => {
  assert.equal(translateServerMessage('Invalid email or password', makeT('am'), en), bundles.am.messages.invalidLogin);
  assert.equal(translateServerMessage('Open a shift before making sales', makeT('om'), en), bundles.om.messages.shiftRequired);
  assert.equal(translateServerMessage('You do not have permission to change prices (price:manage)', makeT('am'), en), 'ዋጋ ለመቀየር ፈቃድ የለዎትም');
});

test('dynamic messages keep their values', () => {
  const am = translateServerMessage('Insufficient stock for "Amoxicillin 500mg". Requested: 30, Available: 12', makeT('am'), en);
  assert.equal(am, 'ለ"Amoxicillin 500mg" በቂ ክምችት የለም። የተጠየቀ፦ 30፣ ያለ፦ 12');
  const om = translateServerMessage('Credit limit exceeded for Abebe Kebede: available credit is 150.00, requested 320.50', makeT('om'), en);
  assert.match(om, /Abebe Kebede/);
  assert.match(om, /150\.00/);
  assert.match(om, /320\.50/);
  assert.equal(
    translateServerMessage('Cannot return 3 of "Paracetamol" (batch B-12): only 1 left to return', makeT('am'), en),
    'ከ"Paracetamol" (ባች B-12) 3 መመለስ አይቻልም፦ ለመመለስ የቀረው 1 ብቻ ነው'
  );
});

test('unknown and non-string messages are returned unchanged', () => {
  assert.equal(translateServerMessage('Something new from the server', makeT('am'), en), 'Something new from the server');
  assert.equal(translateServerMessage('', makeT('am'), en), '');
  assert.equal(translateServerMessage(undefined, makeT('am'), en), undefined);
});
