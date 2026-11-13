const { isValidEmail } = require('../utils/email');

describe('isValidEmail', () => {
  test.each([
    'owner@pharmacy.com',
    'name@clinic.health',
    'x@company.info',
    'first.last+pos@mail.example.co.uk',
    'abebe_k@addis-pharma.et',
  ])('accepts %s', (email) => expect(isValidEmail(email)).toBe(true));

  test.each([
    '',
    'no-at-sign.com',
    'a@b',
    'a b@c.com',
    'a..b@c.com',
    '.a@c.com',
    'a.@c.com',
    'a@-c.com',
    'a@c..com',
    'a@c.c',
  ])('rejects %p', (email) => expect(isValidEmail(email)).toBe(false));
});
