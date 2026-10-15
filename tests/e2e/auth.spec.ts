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
  let independentProfileDirectory: string | undefined;
  const browserType = browserTypes[browserName];
  let firstContext: Awaited<ReturnType<typeof browserType.launchPersistentContext>> | undefined;
  let restartedContext: Awaited<ReturnType<typeof browserType.launchPersistentContext>> | undefined;
  let independentContext: Awaited<ReturnType<typeof browserType.launchPersistentContext>> | undefined;

  try {
    independentProfileDirectory = await mkdtemp(join(tmpdir(), 'easygen-auth-other-device-'));
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

    await restartedPage.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: {
          code: 'SESSION_STORE_UNAVAILABLE',
          message: 'Session storage is temporarily unavailable.',
          requestId: 'browser-logout-failure',
        } }),
      });
    });
    const failedLogoutResponse = restartedPage.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/auth/logout' && response.request().method() === 'POST');
    await restartedPage.getByRole('button', { name: 'Sign out' }).click();
    expect((await failedLogoutResponse).status()).toBe(503);
    await expect(restartedPage.getByRole('alert')).toContainText("couldn't confirm sign-out");
    await expect(restartedPage.getByRole('button', { name: 'Check session' })).toBeVisible();
    await expect(restartedPage.getByRole('heading', { name: 'Welcome to the application.' })).toHaveCount(0);
    await restartedPage.getByRole('button', { name: 'Check session' }).click();
    await expect(restartedPage.getByRole('heading', { name: 'Welcome to the application.' })).toBeVisible();
    await restartedPage.unroute('**/api/auth/logout');

    independentContext = await browserType.launchPersistentContext(independentProfileDirectory, { headless: true });
    const independentPage = await independentContext.newPage();
    await independentPage.goto(new URL('/signin', origin).toString());
    await independentPage.getByLabel('Email').fill(email);
    await independentPage.getByLabel('Password', { exact: true }).fill(browserPassword);
    const independentSignin = independentPage.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/auth/signin' && response.request().method() === 'POST');
    await independentPage.getByRole('button', { name: 'Sign in' }).click();
    expect((await independentSignin).status()).toBe(200);
    await expect(independentPage.getByRole('heading', { name: 'Welcome to the application.' })).toBeVisible();

    const oldCookie = (await restartedContext.cookies(origin)).find((cookie) => cookie.name === 'easygen.sid');
    if (oldCookie === undefined) throw new Error('The authenticated browser did not retain its session cookie.');
    const logoutResponse = restartedPage.waitForResponse((response) =>
      new URL(response.url()).pathname === '/api/auth/logout' && response.request().method() === 'POST');
    await restartedPage.getByRole('button', { name: 'Sign out' }).click();
    expect((await logoutResponse).status()).toBe(204);
    await expect(restartedPage.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(restartedPage.getByRole('heading', { name: 'Welcome to the application.' })).toHaveCount(0);

    const clearedCookies = await restartedContext.cookies(origin);
    expect(clearedCookies.some((cookie) => cookie.name === oldCookie.name)).toBe(false);
    const currentIdentity = await restartedPage.evaluate(async () => {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      return response.status;
    });
    expect(currentIdentity).toBe(401);

    const replay = await restartedContext.request.get(new URL('/api/auth/me', origin).toString(), {
      headers: { cookie: `${oldCookie.name}=${oldCookie.value}` },
    });
    expect(replay.status()).toBe(401);
    expect(await replay.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });

    const independentIdentity = await independentPage.evaluate(async () => {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      return response.status;
    });
    expect(independentIdentity).toBe(200);
    await expect(independentPage.getByRole('heading', { name: 'Welcome to the application.' })).toBeVisible();
  } finally {
    await independentContext?.close();
    await restartedContext?.close();
    await firstContext?.close();
    await rm(profileDirectory, { recursive: true, force: true });
    if (independentProfileDirectory !== undefined) {
      await rm(independentProfileDirectory, { recursive: true, force: true });
    }
  }
});
