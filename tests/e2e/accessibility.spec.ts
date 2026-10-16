import { expect, test, type Page } from "@playwright/test";

const user = { id: "64d5a21d6a1c9f0c2a1b0001", email: "ada@example.test", name: "Ada Example" };
const anonymousError = {
  error: {
    code: "UNAUTHENTICATED",
    message: "Authentication is required.",
    requestId: "00000000-0000-4000-8000-000000000001",
  },
};

async function prepareAnonymousForm(page: Page, path: "/signup" | "/signin"): Promise<void> {
  await page.route("**/api/auth/me*", async (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    headers: { "cache-control": "no-store", "x-request-id": anonymousError.error.requestId },
    body: JSON.stringify(anonymousError),
  }));
  await page.goto(path);
  await expect(page.getByRole("heading", { name: path === "/signup" ? "Create your account" : "Sign in" }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Check session" })).toHaveCount(0);
}

async function expectVisibleKeyboardFocus(page: Page): Promise<void> {
  const indicator = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return { style: "none", width: 0 };
    const computed = getComputedStyle(active);
    return { style: computed.outlineStyle, width: Number.parseFloat(computed.outlineWidth) };
  });
  expect(indicator.style).toBe("solid");
  expect(indicator.width).toBeGreaterThanOrEqual(2);
}

test("accessibility: signup keyboard order announces errors and retains password-toggle focus", async ({ page }) => {
  await prepareAnonymousForm(page, "/signup");
  const email = page.getByRole("textbox", { name: "Email" });
  const name = page.getByRole("textbox", { name: "Name" });
  const password = page.getByLabel("Password", { exact: true });
  const showPassword = page.getByRole("button", { name: "Show password" });
  const submit = page.getByRole("button", { name: "Create account" });

  await page.keyboard.press("Tab");
  await expect(email).toBeFocused();
  await expectVisibleKeyboardFocus(page);
  await page.keyboard.press("Tab");
  await expect(name).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(showPassword).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "password");
  await expect(showPassword).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await page.keyboard.press("Enter");

  const announcement = page.getByRole("alert");
  await expect(announcement).toContainText("Email");
  await expect(announcement).toContainText("Name");
  await expect(announcement).toContainText("Password");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  const emailDescriptionId = await email.getAttribute("aria-describedby");
  expect(emailDescriptionId).toBeTruthy();
  await expect(page.locator(`#${emailDescriptionId}`)).toContainText(/email/i);
  await expect(email).toBeFocused();
});

test("accessibility: signin keyboard order announces errors and retains password-toggle focus", async ({ page }) => {
  await prepareAnonymousForm(page, "/signin");
  const email = page.getByRole("textbox", { name: "Email" });
  const password = page.getByLabel("Password", { exact: true });
  const showPassword = page.getByRole("button", { name: "Show password" });
  const submit = page.getByRole("button", { name: "Sign in" });

  await page.keyboard.press("Tab");
  await expect(email).toBeFocused();
  await expectVisibleKeyboardFocus(page);
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(showPassword).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "password");
  await expect(showPassword).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await page.keyboard.press("Enter");

  const announcement = page.getByRole("alert");
  await expect(announcement).toContainText("Email");
  await expect(announcement).toContainText("Password");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  const emailDescriptionId = await email.getAttribute("aria-describedby");
  expect(emailDescriptionId).toBeTruthy();
  await expect(page.locator(`#${emailDescriptionId}`)).toContainText(/email/i);
  await expect(email).toBeFocused();
});

test("accessibility: layout fits narrow and desktop viewports with contrast and practical targets", async ({ page }) => {
  await prepareAnonymousForm(page, "/signup");

  const measurements = await page.evaluate(() => {
    function rgb(color: string): [number, number, number, number] {
      const values = color.match(/[\d.]+/g)?.map(Number);
      if (values === undefined || values.length < 3) throw new Error(`Unsupported computed color: ${color}`);
      return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
    }

    function background(element: Element): [number, number, number] {
      let current: Element | null = element;
      while (current !== null) {
        const [red, green, blue, alpha] = rgb(getComputedStyle(current).backgroundColor);
        if (alpha > 0) return [red, green, blue];
        current = current.parentElement;
      }
      return [255, 255, 255];
    }

    function luminance(color: [number, number, number]): number {
      const [red, green, blue] = color.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
    }

    function contrast(foreground: [number, number, number], backdrop: [number, number, number]): number {
      const first = luminance(foreground);
      const second = luminance(backdrop);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }

    const main = document.querySelector("main");
    const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (main === null || submit === null) throw new Error("The form or primary submit button is missing");
    const textElements = Array.from(main.querySelectorAll("h1, legend, label, a, button, input"));
    const textContrast = textElements.map((element) => {
      const style = getComputedStyle(element);
      const [red, green, blue] = rgb(style.color);
      const size = Number.parseFloat(style.fontSize);
      const weight = Number.parseInt(style.fontWeight, 10) || 400;
      const large = size >= 24 || (weight >= 700 && size >= 18.66);
      return { contrast: contrast([red, green, blue], background(element)), required: large ? 3 : 4.5 };
    });
    const controlContrast = Array.from(main.querySelectorAll("input, button")).map((element) => {
      const style = getComputedStyle(element);
      const [red, green, blue] = rgb(style.borderTopColor);
      return {
        contrast: contrast([red, green, blue], background(element.parentElement ?? element)),
        border: style.borderTopStyle,
      };
    });
    const rect = main.getBoundingClientRect();
    const submitRect = submit.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainLeft: rect.left,
      mainRight: rect.right,
      submitWidth: submitRect.width,
      submitHeight: submitRect.height,
      textContrast,
      controlContrast,
    };
  });

  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (main === null) throw new Error("The main region is missing");
      const rect = main.getBoundingClientRect();
      return { viewport: window.innerWidth, document: document.documentElement.scrollWidth,
        left: rect.left, right: rect.right };
    });
    expect(layout.document, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(layout.viewport);
    expect(layout.left, `main is clipped at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(layout.right, `main is clipped at ${width}px`).toBeLessThanOrEqual(width);
  }

  expect(measurements.viewportWidth).toBe(1280);
  expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
  expect(measurements.mainLeft).toBeGreaterThanOrEqual(0);
  expect(measurements.mainRight).toBeLessThanOrEqual(measurements.viewportWidth);
  expect(measurements.submitWidth).toBeGreaterThanOrEqual(44);
  expect(measurements.submitHeight).toBeGreaterThanOrEqual(44);
  expect(measurements.textContrast.every(({ contrast, required }) => contrast >= required)).toBe(true);
  expect(measurements.controlContrast.every(({ contrast, border }) => border !== "none" && contrast >= 3)).toBe(true);
});

test("accessibility: reduced motion removes nonessential transitions and animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareAnonymousForm(page, "/signup");

  const longestMotionMs = await page.locator("body").evaluate((body) => {
    const elements = [body, ...Array.from(body.querySelectorAll("*"))];
    const durations = elements.flatMap((element) => {
      const style = getComputedStyle(element);
      return [...style.animationDuration.split(","), ...style.transitionDuration.split(",")].map((value) => {
        const duration = value.trim();
        return duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1_000;
      });
    });
    return Math.max(0, ...durations);
  });

  expect(longestMotionMs).toBeLessThanOrEqual(0.1);
});

test("accessibility: confirmed signup has one success state and no duplicate live announcement", async ({ page }) => {
  let identityReads = 0;
  await page.route("**/api/auth/me*", async (route) => {
    identityReads += 1;
    if (identityReads === 1) {
      await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify(anonymousError) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) });
  });
  await page.route("**/api/auth/signup", async (route) => route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ user }),
  }));
  await page.goto("/signup");
  await expect(page.getByRole("button", { name: "Check session" })).toHaveCount(0);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Password", { exact: true }).fill("Valid123!");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Welcome to the application." })).toBeVisible();
  await expect(page.getByRole("heading")).toHaveCount(1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
});
