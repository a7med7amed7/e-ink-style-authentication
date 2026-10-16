import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function expectFieldErrorList(page: Page, input: Locator, itemCount: number): Promise<Locator> {
  await expect(input).toHaveAttribute("aria-invalid", "true");
  const inputId = await input.getAttribute("id");
  expect(inputId).toBeTruthy();
  const describedBy = (await input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const listIds = await page.evaluate((ids) => ids.filter((id) => document.getElementById(id)?.tagName === "UL"), describedBy);
  expect(listIds).toHaveLength(1);
  const listId = listIds[0] as string;
  const list = page.locator(`[id=${JSON.stringify(listId)}]`);
  await expect(list.locator("li")).toHaveCount(itemCount);

  const label = page.locator(`label[for=${JSON.stringify(inputId)}]`);
  const field = label.locator("xpath=..");
  await expect(field.locator("ul")).toHaveCount(1);
  const relationships = await page.evaluate(({ fieldId, errorId }) => {
    const fieldInput = document.getElementById(fieldId);
    const errorList = document.getElementById(errorId);
    const fieldLabel = Array.from(document.querySelectorAll("label")).find((candidate) => candidate.htmlFor === fieldId);
    return {
      isList: errorList?.tagName === "UL",
      followsInput: fieldInput !== null && errorList !== null
        && Boolean(fieldInput.compareDocumentPosition(errorList) & Node.DOCUMENT_POSITION_FOLLOWING),
      isInsideField: fieldLabel?.parentElement?.contains(errorList) ?? false,
      hasLiveAnnouncement: errorList?.closest('[aria-live], [role="alert"]') !== null,
    };
  }, { fieldId: inputId as string, errorId: listId });
  expect(relationships.isList).toBe(true);
  expect(relationships.followsInput).toBe(true);
  expect(relationships.isInsideField).toBe(true);
  expect(relationships.hasLiveAnnouncement).toBe(true);
  return list;
}

async function expectNoFieldSummary(page: Page): Promise<void> {
  await expect(page.locator("fieldset > [role=\"alert\"]")).toHaveCount(0);
  await expect(page.getByText("Check these fields:", { exact: true })).toHaveCount(0);
}

test("accessibility: signup keyboard order announces errors and retains password-toggle focus", async ({ page }) => {
  await prepareAnonymousForm(page, "/signup");
  const email = page.getByRole("textbox", { name: "Email" });
  const name = page.getByRole("textbox", { name: "Name" });
  const password = page.getByLabel("Password", { exact: true });
  const showPassword = page.getByRole("button", { name: "Show password" });
  const submit = page.getByRole("button", { name: "Create account" });

  await expect(showPassword).toHaveText("");
  await expect(showPassword.locator("svg")).toHaveCount(1);
  await expect(showPassword).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Tab");
  await expect(email).toBeFocused();
  await expectVisibleKeyboardFocus(page);
  await page.keyboard.press("Tab");
  await expect(name).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(showPassword).toBeFocused();
  await expectVisibleKeyboardFocus(page);
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "password");
  await expect(showPassword).toBeFocused();
  await expect(showPassword).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await page.keyboard.press("Enter");

  await expectNoFieldSummary(page);
  const emailErrors = await expectFieldErrorList(page, email, 1);
  const nameErrors = await expectFieldErrorList(page, name, 1);
  const passwordErrors = await expectFieldErrorList(page, password, 4);
  await expect(emailErrors.locator("li")).toContainText(/email/i);
  await expect(nameErrors.locator("li")).toContainText(/at least 3/i);
  await expect(passwordErrors.locator("li").nth(0)).toContainText(/8 to 128/i);
  await expect(passwordErrors.locator("li").nth(1)).toContainText(/letter/i);
  await expect(passwordErrors.locator("li").nth(2)).toContainText(/decimal digit/i);
  await expect(passwordErrors.locator("li").nth(3)).toContainText(/punctuation character or symbol/i);
  await expect(email).toBeFocused();
});

test("accessibility: signin keyboard order announces errors and retains password-toggle focus", async ({ page }) => {
  await prepareAnonymousForm(page, "/signin");
  const email = page.getByRole("textbox", { name: "Email" });
  const password = page.getByLabel("Password", { exact: true });
  const showPassword = page.getByRole("button", { name: "Show password" });
  const submit = page.getByRole("button", { name: "Sign in" });

  await expect(showPassword).toHaveText("");
  await expect(showPassword.locator("svg")).toHaveCount(1);
  await expect(showPassword).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Tab");
  await expect(email).toBeFocused();
  await expectVisibleKeyboardFocus(page);
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(showPassword).toBeFocused();
  await expectVisibleKeyboardFocus(page);
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "password");
  await expect(showPassword).toBeFocused();
  await expect(showPassword).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await page.keyboard.press("Enter");

  await expectNoFieldSummary(page);
  const emailErrors = await expectFieldErrorList(page, email, 1);
  const passwordErrors = await expectFieldErrorList(page, password, 1);
  await expect(emailErrors.locator("li")).toContainText(/email/i);
  await expect(passwordErrors.locator("li")).toContainText(/password is required/i);
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
    const passwordToggle = main?.querySelector<HTMLButtonElement>('button[aria-label="Show password"]');
    const passwordIcon = passwordToggle?.querySelector("svg");
    const iconGraphic = passwordIcon?.querySelector("path, circle, line, polyline, rect") ?? passwordIcon;
    if (main === null || submit === null || passwordToggle === null || iconGraphic === null || iconGraphic === undefined) {
      throw new Error("The form, submit button, or password icon is missing");
    }
    const textElements = Array.from(main.querySelectorAll("h1, legend, label, a, button, input"))
      .filter((element) => element !== passwordToggle);
    const textContrast = textElements.map((element) => {
      const style = getComputedStyle(element);
      const [red, green, blue] = rgb(style.color);
      const size = Number.parseFloat(style.fontSize);
      const weight = Number.parseInt(style.fontWeight, 10) || 400;
      const large = size >= 24 || (weight >= 700 && size >= 18.66);
      return { contrast: contrast([red, green, blue], background(element)), required: large ? 3 : 4.5 };
    });
    const controlContrast = Array.from(main.querySelectorAll("input, button"))
      .filter((element) => element !== passwordToggle).map((element) => {
      const style = getComputedStyle(element);
      const [red, green, blue] = rgb(style.borderTopColor);
      return {
        contrast: contrast([red, green, blue], background(element.parentElement ?? element)),
        border: style.borderTopStyle,
      };
    });
    const iconStyle = getComputedStyle(iconGraphic);
    const iconPaint = iconStyle.fill !== "none" ? iconStyle.fill : iconStyle.stroke;
    const [iconRed, iconGreen, iconBlue] = rgb(iconPaint);
    const iconContrast = contrast([iconRed, iconGreen, iconBlue], background(iconGraphic));
    const rect = main.getBoundingClientRect();
    const submitRect = submit.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainLeft: rect.left,
      mainRight: rect.right,
      submitWidth: submitRect.width,
      submitHeight: submitRect.height,
      iconContrast,
      textContrast,
      controlContrast,
    };
  });

  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const main = document.querySelector("main");
      const password = document.querySelector<HTMLInputElement>('input[name="password"]');
      const toggle = document.querySelector<HTMLButtonElement>('button[aria-label="Show password"]');
      if (main === null || password === null || toggle === null) throw new Error("The form controls are missing");
      const rect = main.getBoundingClientRect();
      const inputRect = password.getBoundingClientRect();
      const toggleRect = toggle.getBoundingClientRect();
      return { viewport: window.innerWidth, document: document.documentElement.scrollWidth,
        left: rect.left, right: rect.right,
        input: { left: inputRect.left, right: inputRect.right, top: inputRect.top, bottom: inputRect.bottom },
        toggle: { left: toggleRect.left, right: toggleRect.right, top: toggleRect.top, bottom: toggleRect.bottom,
          width: toggleRect.width, height: toggleRect.height },
        paddingRight: Number.parseFloat(getComputedStyle(password).paddingRight) };
    });
    expect(layout.document, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(layout.viewport);
    expect(layout.left, `main is clipped at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(layout.right, `main is clipped at ${width}px`).toBeLessThanOrEqual(width);
    expect(layout.toggle.width, `password toggle target width at ${width}px`).toBeGreaterThanOrEqual(44);
    expect(layout.toggle.height, `password toggle target height at ${width}px`).toBeGreaterThanOrEqual(44);
    expect(layout.toggle.left, `toggle left edge at ${width}px`).toBeGreaterThanOrEqual(layout.input.left);
    expect(layout.toggle.right, `toggle right edge at ${width}px`).toBeLessThanOrEqual(layout.input.right + 1);
    expect(layout.toggle.top, `toggle top edge at ${width}px`).toBeGreaterThanOrEqual(layout.input.top);
    expect(layout.toggle.bottom, `toggle bottom edge at ${width}px`).toBeLessThanOrEqual(layout.input.bottom + 1);
    expect(layout.input.right - layout.toggle.right, `toggle is at the input end at ${width}px`).toBeLessThanOrEqual(8);
    expect(layout.paddingRight, `input reserves room for the toggle at ${width}px`).toBeGreaterThanOrEqual(44);
  }

  expect(measurements.viewportWidth).toBe(1280);
  expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth);
  expect(measurements.mainLeft).toBeGreaterThanOrEqual(0);
  expect(measurements.mainRight).toBeLessThanOrEqual(measurements.viewportWidth);
  expect(measurements.submitWidth).toBeGreaterThanOrEqual(44);
  expect(measurements.submitHeight).toBeGreaterThanOrEqual(44);
  expect(measurements.iconContrast).toBeGreaterThanOrEqual(3);
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
