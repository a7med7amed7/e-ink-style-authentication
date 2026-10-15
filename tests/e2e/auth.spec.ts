import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, firefox, test, type APIRequestContext, webkit } from '@playwright/test';

const browserPassword = 'PersistBrowser1!';
const browserTypes = { chromium, firefox, webkit } as const;

function originFrom(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error('Playwright baseURL is required for auth E2E tests.');
  return new URL(baseURL).origin;
}

async function seedAccount(request: APIRequestContext, baseURL: string | undefined): Promise<string> {
  const origin = originFrom(baseURL);
  const email = `auth-e2e-${randomUUID()}@example.test`;
  const response = await request.post(new URL('/api/auth/signup', origin).toString(), {
    headers: { origin, 'x-requested-with': 'XMLHttpRequest' },
    data: { email, name: 'Browser Test User', password: browserPassword },
  });

  expect(response.status(), 'the public API must create the E2E signin account').toBe(201);
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null || !('user' in payload)) {
    throw new Error('The public signup response did not contain a user.');
  }
  return email;
}

test('signin keeps anonymous direct API access denied', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome to the application.' })).toHaveCount(0);

  const anonymousIdentity = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    const body: unknown = await response.json();
    return { status: response.status, body };
  });
  expect(anonymousIdentity.status).toBe(401);
  expect(anonymousIdentity.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
});

test('signin survives refresh and a persistent browser restart', async ({ request, baseURL, browserName }) => {
  const email = await seedAccount(request, baseURL);
  const origin = originFrom(baseURL);
  const profileDirectory = await mkdtemp(join(tmpdir(), 'easygen-auth-browser-'));
  const browserType = browserTypes[browserName];
  let firstContext: Awaited<ReturnType<typeof browserType.launchPersistentContext>> | undefined;
  let restartedContext: Awaited<ReturnType<typeof browserType.launchPersistentContext>> | undefined;

  try {
    firstContext = await browserType.launchPersistentContext(profileDirectory, { headless: true });
    const firstPage = await firstContext.newPage();
    await firstPage.goto(new URL('/signin', origin).toString());
    await firstPage.getByLabel('Email').fill(email);
    await firstPage.getByLabel('Password', { exact: true }).fill(browserPassword);

    const signinResponsePromise = firstPage.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/auth/signin' && response.request().method() === 'POST');
    await firstPage.getByRole('button', { name: 'Sign in' }).click();
    expect((await signinResponsePromise).status()).toBe(200);
    await expect(firstPage.getByRole('heading', { name: 'Welcome to the application.' })).toBeVisible();

    const refreshResponsePromise = firstPage.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/auth/me' && response.request().method() === 'GET'
      && response.status() === 200);
    await firstPage.reload();
    expect((await refreshResponsePromise).status()).toBe(200);
    await expect(firstPage.getByRole('heading', { name: 'Welcome to the application.' })).toBeVisible();

    await firstContext.close();
    firstContext = undefined;

    restartedContext = await browserType.launchPersistentContext(profileDirectory, { headless: true });
    const restartedPage = await restartedContext.newPage();
    const restartResponsePromise = restartedPage.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/auth/me' && response.request().method() === 'GET'
      && response.status() === 200);
    await restartedPage.goto(new URL('/app', origin).toString());
    expect((await restartResponsePromise).status()).toBe(200);
    await expect(restartedPage.getByRole('heading', { name: 'Welcome to the application.' })).toBeVisible();
  } finally {
    await restartedContext?.close();
    await firstContext?.close();
    await rm(profileDirectory, { recursive: true, force: true });
  }
});
