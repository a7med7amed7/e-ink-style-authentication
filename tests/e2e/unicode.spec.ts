import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  canonicalizePassword,
  codePointLength,
  signinPasswordIssues,
  signupPasswordIssues,
} from '../../packages/auth-contract/dist/password.js';
import {
  composedPassword,
  decomposedPassword,
  forbiddenCategoryExamples,
  postNfcLengthExamples,
  preservedCombiningMarkPassword,
  requiredSignupExamples,
} from '../../packages/auth-contract/test/unicode-cases.ts';

const fixturePath = fileURLToPath(new URL('./fixtures/unicode.html', import.meta.url));
const passwordModulePath = fileURLToPath(new URL('../../packages/auth-contract/dist/password.js', import.meta.url));
const fixtureHtml = readFileSync(fixturePath, 'utf8');

function evaluateNodeFixtures() {
  return {
    required: requiredSignupExamples.map(({ password, valid }) => ({
      valid: signupPasswordIssues(password).length === 0,
      expected: valid,
      canonical: canonicalizePassword(password),
    })),
    forbidden: forbiddenCategoryExamples.map(({ password }) => signupPasswordIssues(password).length === 0),
    lengths: Object.values(postNfcLengthExamples).map((password) => codePointLength(canonicalizePassword(password))),
    canonicalEquivalent: canonicalizePassword(decomposedPassword) === canonicalizePassword(composedPassword),
    preservedCombiningMark: canonicalizePassword(preservedCombiningMarkPassword) === preservedCombiningMarkPassword,
    signin: [signinPasswordIssues('').length, signinPasswordIssues('x').length,
      signinPasswordIssues(postNfcLengthExamples.oneTwentyNine).length],
  };
}

test('unicode: browser and Node share Unicode password behavior', async ({ page, baseURL, browserName, browser }) => {
  if (baseURL === undefined) throw new Error('Playwright baseURL is required for Unicode browser tests.');
  const fixtureOrigin = new URL('/__e2e__/unicode', baseURL).origin;
  await page.route(`${fixtureOrigin}/__e2e__/unicode`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml }));
  await page.route(`${fixtureOrigin}/__e2e__/password.js`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', path: passwordModulePath }));
  await page.goto(`${fixtureOrigin}/__e2e__/unicode`);
  await expect(page.getByTestId('password-module-ready')).toHaveText('ready');

  const browserResults = await page.evaluate((fixtures) => {
    type PasswordModule = typeof import('../../packages/auth-contract/src/password.js');
    const api = (window as Window & { authPassword?: PasswordModule }).authPassword;
    if (api === undefined) throw new Error('The test-only page did not load the built password module.');
    return {
      required: fixtures.required.map(({ password, valid }) => ({
        valid: api.signupPasswordIssues(password).length === 0,
        expected: valid,
        canonical: api.canonicalizePassword(password),
      })),
      forbidden: fixtures.forbidden.map(({ password }) => api.signupPasswordIssues(password).length === 0),
      lengths: Object.values(fixtures.lengths).map((password) => api.codePointLength(api.canonicalizePassword(password))),
      canonicalEquivalent: api.canonicalizePassword(fixtures.decomposed) === api.canonicalizePassword(fixtures.composed),
      preservedCombiningMark: api.canonicalizePassword(fixtures.preserved) === fixtures.preserved,
      signin: ['', 'x', fixtures.lengths.oneTwentyNine].map((password) => api.signinPasswordIssues(password).length),
    };
  }, {
    required: requiredSignupExamples,
    forbidden: forbiddenCategoryExamples,
    lengths: postNfcLengthExamples,
    composed: composedPassword,
    decomposed: decomposedPassword,
    preserved: preservedCombiningMarkPassword,
  });
  console.log(`Unicode runtime ${JSON.stringify({ node: process.version, icu: process.versions['icu'],
    browser: browserName, browserVersion: browser.version() })}`);
  expect(browserResults).toEqual(evaluateNodeFixtures());
  expect(browserResults.required.every(({ valid, expected }) => valid === expected)).toBe(true);
  expect(browserResults.forbidden.every((valid) => !valid)).toBe(true);
  expect(browserResults.lengths).toEqual([7, 8, 128, 129]);
  expect(browserResults.canonicalEquivalent).toBe(true);
  expect(browserResults.preservedCombiningMark).toBe(true);
  expect(browserResults.signin[0]).toBeGreaterThan(0);
  expect(browserResults.signin[1]).toBe(0);

  const email = `unicode-e2e-${randomUUID()}@example.test`;
  const origin = new URL(baseURL).origin;
  const signup = await page.request.post(new URL('/api/auth/signup', origin).toString(), {
    headers: { origin, 'x-requested-with': 'XMLHttpRequest' },
    data: { email, name: 'Unicode Browser User', password: decomposedPassword },
  });
  expect(signup.status(), 'the API should accept the shared decomposed Unicode example').toBe(201);
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(composedPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to the application.' })).toBeVisible();
});
