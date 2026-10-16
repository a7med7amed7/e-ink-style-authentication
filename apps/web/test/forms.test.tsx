import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicUser, SigninInput, SignupInput } from "@easygen/auth-contract";
import type { OperationResult } from "../src/auth/auth-controller.js";
import { AuthProvider } from "../src/auth/auth-context.js";
import { ProtectedRoute } from "../src/auth/protected-route.js";
import { createAppRouter } from "../src/router.js";
import { SignupPage } from "../src/pages/signup.js";
import { WelcomePage } from "../src/pages/welcome.js";

type Snapshot = {
  readonly status: "unknown" | "unauthenticated" | "authenticating" | "authenticated";
  readonly generation: number;
  readonly verifiedGeneration: number | null;
  readonly latestReadId: number;
  readonly routeTrusted: boolean;
  readonly pendingOperation: "signup" | "signin" | "logout" | null;
  readonly queuedLogout: boolean;
  readonly slow: boolean;
  readonly submissionErrors: Readonly<Record<string, readonly string[]>>;
  readonly message?: string | undefined;
  readonly lastOperationOutcome: OperationResult["outcome"] | null;
  readonly serverObservation: "unknown" | "authenticated" | "anonymous";
  readonly serverOutcomeUncertain: boolean;
  readonly logoutDestructionReceipt: unknown;
  readonly user?: PublicUser | undefined;
};

const signedInUser: PublicUser = {
  id: "64d5a21d6a1c9f0c2a1b0001",
  email: "ada@example.test",
  name: "Ada Example",
};

function initialSnapshot(): Snapshot {
  return {
    status: "unknown",
    generation: 0,
    verifiedGeneration: null,
    latestReadId: 0,
    routeTrusted: false,
    pendingOperation: null,
    queuedLogout: false,
    slow: false,
    submissionErrors: {},
    lastOperationOutcome: null,
    serverObservation: "unknown",
    serverOutcomeUncertain: false,
    logoutDestructionReceipt: null,
  };
}

function authenticatedSnapshot(): Snapshot {
  return {
    ...initialSnapshot(),
    status: "authenticated",
    generation: 1,
    verifiedGeneration: 1,
    latestReadId: 1,
    routeTrusted: true,
    serverObservation: "authenticated",
    user: signedInUser,
  };
}

class FormsController {
  snapshot = initialSnapshot();
  readonly listeners = new Set<() => void>();
  readonly signupInputs: SignupInput[] = [];
  private resolveSignup?: (result: OperationResult) => void;

  getSnapshot = (): Snapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  revalidate = (): Promise<void> => Promise.resolve();

  signup = (input: SignupInput): Promise<OperationResult> => {
    this.signupInputs.push(input);
    this.update({ status: "authenticating", generation: this.snapshot.generation + 1, pendingOperation: "signup" });
    return new Promise((resolve) => {
      this.resolveSignup = resolve;
    });
  };

  update(values: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...values };
    for (const listener of this.listeners) listener();
  }

  confirmSignup(): void {
    this.update({
      status: "authenticated",
      generation: 1,
      verifiedGeneration: 1,
      latestReadId: 1,
      routeTrusted: true,
      pendingOperation: null,
      lastOperationOutcome: "confirmed",
      serverObservation: "authenticated",
      user: signedInUser,
    });
    this.resolveSignup?.({ outcome: "confirmed" });
  }

  failSignup(): void {
    const message = "We could not verify the new session. Check session again.";
    this.update({
      status: "unknown",
      generation: 1,
      verifiedGeneration: null,
      latestReadId: 1,
      routeTrusted: false,
      pendingOperation: null,
      lastOperationOutcome: "verification-failed",
      serverObservation: "unknown",
      message,
    });
    this.resolveSignup?.({ outcome: "verification-failed", message });
  }

  completeSignupAfterUpdate(values: Partial<Snapshot>, result: OperationResult): void {
    this.update(values);
    this.resolveSignup?.(result);
  }
}

class SigninFormsController {
  snapshot = initialSnapshot();
  readonly listeners = new Set<() => void>();
  readonly signinInputs: SigninInput[] = [];
  private resolveSignin?: (result: OperationResult) => void;

  getSnapshot = (): Snapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  revalidate = (): Promise<void> => Promise.resolve();

  signin = (input: SigninInput): Promise<OperationResult> => {
    this.signinInputs.push(input);
    this.update({ status: "authenticating", generation: this.snapshot.generation + 1,
      pendingOperation: "signin", routeTrusted: false });
    return new Promise((resolve) => { this.resolveSignin = resolve; });
  };

  update(values: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...values };
    for (const listener of this.listeners) listener();
  }

  confirmSignin(user: PublicUser = signedInUser): void {
    this.update({ status: "authenticated", generation: 1, verifiedGeneration: 1, latestReadId: 1,
      routeTrusted: true, pendingOperation: null, lastOperationOutcome: "confirmed",
      serverObservation: "authenticated", user });
    this.resolveSignin?.({ outcome: "confirmed" });
  }

  rejectSignin(): void {
    this.update({ status: "unauthenticated", generation: 1, verifiedGeneration: null, latestReadId: 1,
      routeTrusted: true, pendingOperation: null, lastOperationOutcome: "rejected",
      serverObservation: "anonymous", message: "Invalid email or password." });
    this.resolveSignin?.({ outcome: "rejected", message: "Invalid email or password." });
  }

  failSigninVerification(): void {
    const message = "We could not verify this sign-in. Check session again.";
    this.update({ status: "unknown", generation: 1, verifiedGeneration: null, latestReadId: 1,
      routeTrusted: false, pendingOperation: null, lastOperationOutcome: "verification-failed",
      serverObservation: "unknown", message });
    this.resolveSignin?.({ outcome: "verification-failed", message });
  }

  completeSigninAfterUpdate(values: Partial<Snapshot>, result: OperationResult): void {
    this.update(values);
    this.resolveSignin?.(result);
  }
}

class UncertainSignupFormsController extends FormsController {
  readonly rechecks: string[] = [];

  override revalidate = (reason = "bootstrap"): Promise<void> => {
    this.rechecks.push(reason);
    if (reason === "retry") {
      this.update({ status: "authenticated", generation: 1, verifiedGeneration: 1, latestReadId: 2,
        routeTrusted: true, serverObservation: "authenticated", serverOutcomeUncertain: true,
        lastOperationOutcome: "uncertain", message: "Session verified", user: signedInUser });
    }
    return Promise.resolve();
  };

  override signup = (input: SignupInput): Promise<OperationResult> => {
    this.signupInputs.push(input);
    const message = "We couldn't confirm sign-up. Check session again.";
    this.update({ status: "unknown", generation: 1, latestReadId: 1, verifiedGeneration: null,
      routeTrusted: false, pendingOperation: null, serverObservation: "anonymous",
      serverOutcomeUncertain: true, lastOperationOutcome: "uncertain", message });
    return Promise.resolve({ outcome: "uncertain", message });
  };
}

class VerifiedSignupRecoveryFormsController extends FormsController {
  readonly rechecks: string[] = [];

  constructor(private readonly observeAuthenticated = true) {
    super();
  }

  override revalidate = (reason = "bootstrap"): Promise<void> => {
    this.rechecks.push(reason);
    if (reason === "retry") {
      this.update(this.observeAuthenticated
        ? { status: "authenticated", generation: 1, verifiedGeneration: 1, latestReadId: 2,
          routeTrusted: true, serverObservation: "authenticated", user: signedInUser }
        : { status: "unauthenticated", generation: 1, verifiedGeneration: null, latestReadId: 2,
          routeTrusted: true, serverObservation: "anonymous", user: undefined });
    }
    return Promise.resolve();
  };
}

class UncertainSigninFormsController extends SigninFormsController {
  readonly rechecks: string[] = [];

  override revalidate = (reason = "bootstrap"): Promise<void> => {
    this.rechecks.push(reason);
    if (reason === "retry") {
      this.update({ status: "authenticated", generation: 1, verifiedGeneration: 1, latestReadId: 2,
        routeTrusted: true, serverObservation: "authenticated", serverOutcomeUncertain: true,
        lastOperationOutcome: "uncertain", message: "Session verified", user: signedInUser });
    }
    return Promise.resolve();
  };

  override signin = (input: SigninInput): Promise<OperationResult> => {
    this.signinInputs.push(input);
    const message = "We couldn't confirm sign-in. Check session again.";
    this.update({ status: "unknown", generation: 1, latestReadId: 1, verifiedGeneration: null,
      routeTrusted: false, pendingOperation: null, serverObservation: "anonymous",
      serverOutcomeUncertain: true, lastOperationOutcome: "uncertain", message });
    return Promise.resolve({ outcome: "uncertain", message });
  };
}

class VerifiedSigninRecoveryFormsController extends SigninFormsController {
  readonly rechecks: string[] = [];

  constructor(private readonly observeAuthenticated = true) {
    super();
  }

  override revalidate = (reason = "bootstrap"): Promise<void> => {
    this.rechecks.push(reason);
    if (reason === "retry") {
      this.update(this.observeAuthenticated
        ? { status: "authenticated", generation: 1, verifiedGeneration: 1, latestReadId: 2,
          routeTrusted: true, serverObservation: "authenticated", user: signedInUser }
        : { status: "unauthenticated", generation: 1, verifiedGeneration: null, latestReadId: 2,
          routeTrusted: true, serverObservation: "anonymous", user: undefined });
    }
    return Promise.resolve();
  };
}

class LogoutFormsController {
  snapshot = authenticatedSnapshot();
  readonly listeners = new Set<() => void>();
  readonly rechecks: string[] = [];
  logoutCalls = 0;
  private resolveLogout?: (result: OperationResult) => void;

  getSnapshot = (): Snapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  revalidate = (reason: string): Promise<void> => {
    this.rechecks.push(reason);
    return Promise.resolve();
  };

  logout = (): Promise<OperationResult> => {
    this.logoutCalls += 1;
    this.update({ status: "unknown", user: undefined, generation: 2, verifiedGeneration: null,
      routeTrusted: false, pendingOperation: "logout", message: undefined,
      lastOperationOutcome: null, serverObservation: "unknown", serverOutcomeUncertain: false,
      logoutDestructionReceipt: null });
    return new Promise((resolve) => { this.resolveLogout = resolve; });
  };

  observeFailedInvalidation(): void {
    const message = "We couldn't confirm sign-out. Check your session again.";
    this.update({ status: "unknown", user: undefined, generation: 2, verifiedGeneration: null,
      routeTrusted: false, pendingOperation: null, message, lastOperationOutcome: "uncertain",
      serverObservation: "anonymous", serverOutcomeUncertain: true, logoutDestructionReceipt: null });
    this.resolveLogout?.({ outcome: "uncertain", message });
  }

  observeConfirmedDestruction(): void {
    this.update({ status: "unauthenticated", user: undefined, generation: 2, verifiedGeneration: null,
      routeTrusted: true, pendingOperation: null, message: undefined, lastOperationOutcome: "confirmed",
      serverObservation: "anonymous", serverOutcomeUncertain: false,
      logoutDestructionReceipt: { operationId: 2 } });
    this.resolveLogout?.({ outcome: "confirmed" });
  }

  observeAnonymousWithoutReceipt(): void {
    this.update({ status: "unauthenticated", user: undefined, generation: 2, verifiedGeneration: null,
      routeTrusted: true, pendingOperation: null, message: undefined, lastOperationOutcome: "already-anonymous",
      serverObservation: "anonymous", serverOutcomeUncertain: false, logoutDestructionReceipt: null });
    this.resolveLogout?.({ outcome: "already-anonymous" });
  }

  update(values: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...values };
    for (const listener of this.listeners) listener();
  }
}

function fieldErrorList(input: HTMLInputElement, expectedMessages: readonly RegExp[]): HTMLUListElement {
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const describedBy = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const lists = describedBy.map((id) => document.getElementById(id))
    .filter((element): element is HTMLUListElement => element?.tagName === "UL");
  expect(lists).toHaveLength(1);
  const list = lists[0] as HTMLUListElement;
  const label = Array.from(document.querySelectorAll("label")).find((candidate) => candidate.htmlFor === input.id);
  expect(label).toBeTruthy();
  const field = label?.parentElement;
  expect(field?.contains(list)).toBe(true);
  expect(field?.querySelectorAll("ul")).toHaveLength(1);
  expect(input.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(list.closest('[aria-live], [role="alert"]')).not.toBeNull();
  const items = Array.from(list.querySelectorAll(":scope > li"));
  expect(items).toHaveLength(expectedMessages.length);
  expectedMessages.forEach((message, index) => {
    expect(items[index]?.textContent).toMatch(message);
  });
  return list;
}

function expectNoFieldSummary(form: HTMLFormElement | null): void {
  expect(form).not.toBeNull();
  expect(form?.querySelector("fieldset > [role=\"alert\"]")).toBeNull();
  expect(form?.textContent).not.toMatch(/check these fields/i);
}

async function renderSigninWithServerFieldErrors(): Promise<void> {
  const user = userEvent.setup();
  const controller = new SigninFormsController();
  await renderApplication(controller, "/signin");
  await user.type(await screen.findByRole("textbox", { name: "Email" }), "ada@example.test");
  await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "Valid123!");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  await act(async () => {
    controller.completeSigninAfterUpdate({
      status: "unauthenticated", generation: 1, verifiedGeneration: null, latestReadId: 1,
      routeTrusted: true, pendingOperation: null, serverObservation: "anonymous", serverOutcomeUncertain: false,
      submissionErrors: { email: ["Email is not accepted."], password: ["Password rule one.", "Password rule two."] },
      message: "Validation failed.", lastOperationOutcome: "rejected",
    }, { outcome: "rejected", message: "Validation failed." });
    await Promise.resolve();
  });
}

function renderRoutes(controller: FormsController, initialEntry: string) {
  return render(
    <AuthProvider controller={controller as never}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/app" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
          <Route path="/signin" element={<p>Sign in route</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function renderWelcome(controller: LogoutFormsController) {
  return render(
    <AuthProvider controller={controller as never}>
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
          <Route path="/signin" element={<p>Sign in route</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function renderApplication(controller: SigninFormsController, initialEntry: string) {
  const router = createAppRouter(controller as never);
  await act(async () => { await router.navigate(initialEntry); });
  return render(
    <AuthProvider controller={controller as never}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

afterEach(() => { cleanup(); });

describe("signup-form:", () => {
  it("uses an icon-only inline password toggle with an accessible state", () => {
    const controller = new FormsController();
    renderRoutes(controller, "/signup");

    const password = screen.getByLabelText<HTMLInputElement>("Password");
    const toggle = screen.getByRole<HTMLButtonElement>("button", { name: "Show password" });
    expect(toggle.textContent).toBe("");
    expect(toggle.querySelector("svg")).not.toBeNull();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(password.parentElement?.contains(toggle)).toBe(true);
  });

  it("renders each password validation message in its associated list item", async () => {
    const user = userEvent.setup();
    const controller = new FormsController();
    renderRoutes(controller, "/signup");
    await user.type(screen.getByLabelText<HTMLInputElement>("Email"), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Name"), "Ada Example");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    const password = screen.getByLabelText<HTMLInputElement>("Password");
    fieldErrorList(password, [
      /8 to 128 Unicode code points/i,
      /at least one Unicode decimal digit/i,
      /at least one punctuation character or symbol/i,
    ]);
    expect(controller.signupInputs).toHaveLength(0);
  });

  it("does not add a form-level validation summary", async () => {
    const user = userEvent.setup();
    const controller = new FormsController();
    renderRoutes(controller, "/signup");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expectNoFieldSummary(screen.getByRole("button", { name: "Create account" }).closest("form"));
  });

  it("uses semantic labeled fields and shared validation before dispatch", async () => {
    const user = userEvent.setup();
    const controller = new FormsController();
    renderRoutes(controller, "/signup");

    const email = screen.getByLabelText<HTMLInputElement>("Email");
    const name = screen.getByLabelText<HTMLInputElement>("Name");
    const password = screen.getByLabelText<HTMLInputElement>("Password");
    await user.type(email, "ada@example.test");
    await user.type(name, "Ada Example");
    await user.type(password, "Abcdef1 ");
    await user.click(screen.getByRole("button", { name: /create account|sign up/i }));

    fieldErrorList(password, [/punctuation character or symbol/i]);
    expectNoFieldSummary(screen.getByRole("button", { name: "Create account" }).closest("form"));
    expect(controller.signupInputs).toHaveLength(0);
  });

  it("keeps signup keyboard order, password-toggle focus, and announced first-field errors", async () => {
    const user = userEvent.setup();
    const controller = new FormsController();
    renderRoutes(controller, "/signup");

    const email = screen.getByLabelText<HTMLInputElement>("Email");
    const name = screen.getByLabelText<HTMLInputElement>("Name");
    const password = screen.getByLabelText<HTMLInputElement>("Password");
    const toggle = screen.getByRole<HTMLButtonElement>("button", { name: "Show password" });
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: /create account|sign up/i });

    await user.tab();
    expect(document.activeElement).toBe(email);
    await user.tab();
    expect(document.activeElement).toBe(name);
    await user.tab();
    expect(document.activeElement).toBe(password);
    await user.tab();
    expect(document.activeElement).toBe(toggle);
    await user.keyboard("{Enter}");
    expect(password.type).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(toggle);
    await user.keyboard(" ");
    expect(password.type).toBe("password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    await user.tab();
    expect(document.activeElement).toBe(submit);
    await user.keyboard("{Enter}");

    fieldErrorList(email, [/email/i]);
    fieldErrorList(name, [/at least 3 Unicode code points/i]);
    fieldErrorList(password, [
      /8 to 128 Unicode code points/i,
      /at least one Unicode letter/i,
      /at least one Unicode decimal digit/i,
      /at least one punctuation character or symbol/i,
    ]);
    expectNoFieldSummary(screen.getByRole("button", { name: /create account|sign up/i }).closest("form"));
    expect(document.activeElement).toBe(email);
    expect(controller.signupInputs).toHaveLength(0);
  });

  it("locks a pending submit and navigates only after the controller confirms identity", async () => {
    const user = userEvent.setup();
    const controller = new FormsController();
    renderRoutes(controller, "/signup");

    await user.type(screen.getByLabelText<HTMLInputElement>("Email"), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Name"), "Ada Example");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "Abcdef1!");
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: /create account|sign up/i });
    await user.click(submit);
    expect(submit.disabled).toBe(true);
    await user.click(submit);
    expect(controller.signupInputs).toHaveLength(1);

    act(() => { controller.confirmSignup(); });
    await waitFor(() => { expect(screen.getByText("Welcome to the application.")).toBeTruthy(); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(controller.signupInputs[0]).toEqual({
      email: "ada@example.test",
      name: "Ada Example",
      password: "Abcdef1!",
    });
  });

  it("keeps signup open and explains recovery when the new session cannot be verified", async () => {
    const user = userEvent.setup();
    const controller = new FormsController();
    renderRoutes(controller, "/signup");

    await user.type(screen.getByLabelText<HTMLInputElement>("Email"), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Name"), "Ada Example");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "Abcdef1!");
    await user.click(screen.getByRole("button", { name: /create account|sign up/i }));
    act(() => { controller.failSignup(); });

    const recovery = await screen.findByRole("alert");
    expect(recovery.textContent).toMatch(/account may have been created/i);
    expect(recovery.textContent).toMatch(/sign in is the recovery path/i);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Check session" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();
  });

  it("does not show a stale signup rejection after a newer auth generation", async () => {
    const user = userEvent.setup();
    const controller = new FormsController();
    renderRoutes(controller, "/signup");

    await user.type(screen.getByLabelText<HTMLInputElement>("Email"), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Name"), "Ada Example");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "Abcdef1!");
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: /create account|sign up/i });
    await user.click(submit);

    act(() => {
      controller.completeSignupAfterUpdate({
        status: "unauthenticated", generation: 2, verifiedGeneration: null, latestReadId: 2,
        routeTrusted: true, pendingOperation: null, serverObservation: "anonymous",
      }, { outcome: "rejected", message: "Stale sign-up rejection." });
    });
    await waitFor(() => { expect(submit.disabled).toBe(false); });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Stale sign-up rejection.")).toBeNull();
  });

  it("does not navigate from a signup callback superseded by a newer auth generation", async () => {
    const user = userEvent.setup();
    const controller = new FormsController();
    renderRoutes(controller, "/signup");

    await user.type(screen.getByLabelText<HTMLInputElement>("Email"), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Name"), "Ada Example");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "Abcdef1!");
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: /create account|sign up/i });
    await user.click(submit);

    act(() => {
      controller.completeSignupAfterUpdate({
        status: "authenticated", generation: 2, verifiedGeneration: 2, latestReadId: 2,
        routeTrusted: true, pendingOperation: null, serverObservation: "authenticated", user: signedInUser,
      }, { outcome: "confirmed" });
    });
    await waitFor(() => { expect(submit.disabled).toBe(false); });

    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();
  });

  it("keeps signup uncertainty visible after a session check observes the user", async () => {
    const userEvents = userEvent.setup();
    const controller = new UncertainSignupFormsController();
    renderRoutes(controller, "/signup");

    await userEvents.type(screen.getByLabelText<HTMLInputElement>("Email"), "ada@example.test");
    await userEvents.type(screen.getByLabelText<HTMLInputElement>("Name"), "Ada Example");
    await userEvents.type(screen.getByLabelText<HTMLInputElement>("Password"), "Abcdef1!");
    await userEvents.click(screen.getByRole("button", { name: /create account|sign up/i }));

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/account may have been created/i);
    expect(screen.getByRole("status").textContent).not.toMatch(/couldn't confirm sign-up/i);
    expect(screen.getByRole("status").textContent).toMatch(/may still complete/i);
    expect(screen.getByRole("status").textContent).toMatch(/no session is currently observed/i);
    expect(screen.getByRole("status").textContent).not.toMatch(/check your session before trying again/i);
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();

    await userEvents.click(screen.getByRole("button", { name: /check session/i }));

    expect(controller.rechecks.at(-1)).toBe("retry");
    expect(controller.signupInputs).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toMatch(/session verified/i);
    expect(screen.getByRole("status").textContent).toMatch(/may still complete/i);
    const recoveryAfterCheck = screen.getByRole("alert");
    expect(recoveryAfterCheck.textContent).toMatch(/account may have been created/i);
    expect(recoveryAfterCheck.textContent).not.toMatch(/sign in is the recovery path/i);
    expect(recoveryAfterCheck.textContent).not.toMatch(/check your session before trying again/i);
    expect(screen.getByRole("link", { name: "Continue to the application" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();

    const password = screen.getByLabelText<HTMLInputElement>("Password");
    await userEvents.clear(password);
    await userEvents.type(password, "short");
    await userEvents.click(screen.getByRole("button", { name: "Create account" }));
    fieldErrorList(password, [
      /8 to 128 Unicode code points/i,
      /at least one Unicode decimal digit/i,
      /at least one punctuation character or symbol/i,
    ]);
    expectNoFieldSummary(screen.getByRole("button", { name: /create account|sign up/i }).closest("form"));
    expect(screen.getByRole("status").textContent).toMatch(/may still complete/i);
  });

  it("offers verified signup continuation after an acknowledged response could not be checked", async () => {
    const userEvents = userEvent.setup();
    const controller = new VerifiedSignupRecoveryFormsController();
    renderRoutes(controller, "/signup");

    await userEvents.type(screen.getByLabelText<HTMLInputElement>("Email"), "ada@example.test");
    await userEvents.type(screen.getByLabelText<HTMLInputElement>("Name"), "Ada Example");
    await userEvents.type(screen.getByLabelText<HTMLInputElement>("Password"), "Abcdef1!");
    await userEvents.click(screen.getByRole("button", { name: /create account|sign up/i }));
    act(() => { controller.failSignup(); });

    expect((await screen.findByRole("alert")).textContent).toMatch(/account may have been created/i);
    expect(screen.getByRole("alert").textContent).toMatch(/check your session/i);
    await userEvents.click(screen.getByRole("button", { name: "Check session" }));

    expect(controller.rechecks.at(-1)).toBe("retry");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/session verified/i);
    expect(screen.getByRole("status").textContent).not.toMatch(/may still complete/i);
    expect(screen.getByRole("link", { name: "Continue to the application" })).toBeTruthy();
  });

  it("replaces signup recovery instructions after a retry observes an anonymous session", async () => {
    const userEvents = userEvent.setup();
    const controller = new VerifiedSignupRecoveryFormsController(false);
    renderRoutes(controller, "/signup");

    await userEvents.type(screen.getByLabelText<HTMLInputElement>("Email"), "ada@example.test");
    await userEvents.type(screen.getByLabelText<HTMLInputElement>("Name"), "Ada Example");
    await userEvents.type(screen.getByLabelText<HTMLInputElement>("Password"), "Abcdef1!");
    await userEvents.click(screen.getByRole("button", { name: /create account|sign up/i }));
    act(() => { controller.failSignup(); });

    expect((await screen.findByRole("alert")).textContent).toMatch(/check your session/i);
    await userEvents.click(screen.getByRole("button", { name: "Check session" }));

    expect(controller.rechecks.at(-1)).toBe("retry");
    expect(screen.getByRole("alert").textContent).toMatch(/no session is currently observed/i);
    expect(screen.getByRole("alert").textContent).toMatch(/sign in to continue/i);
    expect(screen.getByRole("alert").textContent).not.toMatch(/check your session/i);
    expect(screen.queryByRole("button", { name: "Check session" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Continue to the application" })).toBeNull();

    const email = screen.getByLabelText<HTMLInputElement>("Email");
    await userEvents.clear(email);
    await userEvents.type(email, "not-an-email");
    await userEvents.click(screen.getByRole("button", { name: "Create account" }));
    fieldErrorList(email, [/valid email address/i]);
    expectNoFieldSummary(screen.getByRole("button", { name: "Create account" }).closest("form"));
  });

  it("keeps protected welcome content hidden until the current generation is verified", () => {
    const controller = new FormsController();
    renderRoutes(controller, "/app");

    expect(screen.queryByText("Welcome to the application.")).toBeNull();
    act(() => {
      controller.update({
        status: "authenticated",
        generation: 1,
        verifiedGeneration: 1,
        latestReadId: 1,
        routeTrusted: true,
        user: signedInUser,
      });
    });
    expect(screen.getByText("Welcome to the application.")).toBeTruthy();
  });
});

describe("signin-form:", () => {
  it("uses only semantic email and password fields with current-password autocomplete", async () => {
    const controller = new SigninFormsController();
    await renderApplication(controller, "/signin");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Email" })).toBeTruthy();
    const password = screen.getByLabelText<HTMLInputElement>("Password");
    expect(password.autocomplete).toBe("current-password");
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("keeps signin keyboard order, password-toggle focus, and announced first-field errors", async () => {
    const user = userEvent.setup();
    const controller = new SigninFormsController();
    await renderApplication(controller, "/signin");

    const email = await screen.findByRole<HTMLInputElement>("textbox", { name: "Email" });
    const password = screen.getByLabelText<HTMLInputElement>("Password");
    const toggle = screen.getByRole<HTMLButtonElement>("button", { name: "Show password" });
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: "Sign in" });

    await user.tab();
    expect(document.activeElement).toBe(email);
    await user.tab();
    expect(document.activeElement).toBe(password);
    await user.tab();
    expect(document.activeElement).toBe(toggle);
    await user.keyboard("{Enter}");
    expect(password.type).toBe("text");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(toggle);
    await user.keyboard(" ");
    expect(password.type).toBe("password");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    await user.tab();
    expect(document.activeElement).toBe(submit);
    await user.keyboard("{Enter}");

    fieldErrorList(email, [/email/i]);
    fieldErrorList(password, [/password is required/i]);
    expectNoFieldSummary(screen.getByRole("button", { name: "Sign in" }).closest("form"));
    expect(document.activeElement).toBe(email);
    expect(controller.signinInputs).toHaveLength(0);
  });

  it("restores a working sign-in link from signup", async () => {
    const user = userEvent.setup();
    const controller = new SigninFormsController();
    await renderApplication(controller, "/signup");

    await user.click(await screen.findByRole("link", { name: /sign in/i }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("locks duplicate submit and navigates only after the intended identity is verified", async () => {
    const user = userEvent.setup();
    const controller = new SigninFormsController();
    await renderApplication(controller, "/signin");

    await user.type(await screen.findByRole("textbox", { name: "Email" }), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "short");
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: "Sign in" });
    await user.click(submit);
    expect(submit.disabled).toBe(true);
    await user.click(submit);
    expect(controller.signinInputs).toEqual([{ email: "ada@example.test", password: "short" }]);

    act(() => { controller.confirmSignin(); });
    await waitFor(() => { expect(screen.getByText("Welcome to the application.")).toBeTruthy(); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces generic credential rejection without navigating or revealing account existence", async () => {
    const user = userEvent.setup();
    const controller = new SigninFormsController();
    await renderApplication(controller, "/signin");

    await user.type(await screen.findByRole("textbox", { name: "Email" }), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    act(() => { controller.rejectSignin(); });

    const feedback = await screen.findByRole("alert");
    expect(feedback.textContent).toBe("Invalid email or password.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    const password = screen.getByLabelText<HTMLInputElement>("Password");
    const submit = screen.getByRole("button", { name: "Sign in" });
    expect(password.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(feedback.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();
    expect(controller.signinInputs).toEqual([{ email: "ada@example.test", password: "short" }]);
  });

  it("renders server field errors as separate list items per field", async () => {
    await renderSigninWithServerFieldErrors();

    fieldErrorList(screen.getByLabelText<HTMLInputElement>("Email"), [/Email is not accepted\./i]);
    fieldErrorList(screen.getByLabelText<HTMLInputElement>("Password"), [/Password rule one\./i, /Password rule two\./i]);
  });

  it("hides the generic validation failure when server field errors are shown", async () => {
    await renderSigninWithServerFieldErrors();

    expect(screen.queryByText("Validation failed.", { exact: true })).toBeNull();
    expectNoFieldSummary(screen.getByRole("button", { name: "Sign in" }).closest("form"));
  });

  it("does not duplicate signin verification failure in the status region", async () => {
    const user = userEvent.setup();
    const controller = new SigninFormsController();
    await renderApplication(controller, "/signin");

    await user.type(await screen.findByRole("textbox", { name: "Email" }), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    act(() => { controller.failSigninVerification(); });

    expect((await screen.findByRole("alert")).textContent).toMatch(/could not verify this sign-in/i);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Check session" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("offers verified sign-in continuation after verification recovery", async () => {
    const user = userEvent.setup();
    const controller = new VerifiedSigninRecoveryFormsController();
    await renderApplication(controller, "/signin");

    await user.type(await screen.findByRole("textbox", { name: "Email" }), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "Abcdef1!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    act(() => { controller.failSigninVerification(); });

    expect((await screen.findByRole("alert")).textContent).toMatch(/could not verify this sign-in/i);
    await user.click(screen.getByRole("button", { name: "Check session" }));

    expect(controller.rechecks.at(-1)).toBe("retry");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/session verified/i);
    expect(screen.getByRole("status").textContent).not.toMatch(/may still complete/i);
    expect(screen.getByRole("link", { name: "Continue to the application" })).toBeTruthy();
  });

  it("replaces sign-in check instructions after anonymous recheck", async () => {
    const user = userEvent.setup();
    const controller = new VerifiedSigninRecoveryFormsController(false);
    await renderApplication(controller, "/signin");

    await user.type(await screen.findByRole("textbox", { name: "Email" }), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "Abcdef1!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    act(() => { controller.failSigninVerification(); });

    expect((await screen.findByRole("alert")).textContent).toMatch(/check session/i);
    await user.click(screen.getByRole("button", { name: "Check session" }));

    expect(controller.rechecks.at(-1)).toBe("retry");
    expect(screen.getByRole("alert").textContent).toMatch(/no session is currently observed/i);
    expect(screen.getByRole("alert").textContent).toMatch(/try signing in again/i);
    expect(screen.getByRole("alert").textContent).not.toMatch(/check session/i);
    expect(screen.queryByRole("button", { name: "Check session" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Continue to the application" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();

    const email = screen.getByLabelText<HTMLInputElement>("Email");
    await user.clear(email);
    await user.type(email, "not-an-email");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    fieldErrorList(email, [/valid email address/i]);
    expectNoFieldSummary(screen.getByRole("button", { name: "Sign in" }).closest("form"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not show a stale signin rejection after a newer auth generation", async () => {
    const user = userEvent.setup();
    const controller = new SigninFormsController();
    await renderApplication(controller, "/signin");

    await user.type(await screen.findByRole("textbox", { name: "Email" }), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "short");
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: "Sign in" });
    await user.click(submit);

    act(() => {
      controller.completeSigninAfterUpdate({
        status: "unauthenticated", generation: 2, verifiedGeneration: null, latestReadId: 2,
        routeTrusted: true, pendingOperation: null, serverObservation: "anonymous",
      }, { outcome: "rejected", message: "Stale sign-in rejection." });
    });
    await waitFor(() => { expect(submit.disabled).toBe(false); });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Stale sign-in rejection.")).toBeNull();
  });

  it("does not navigate from a signin callback superseded by a newer auth generation", async () => {
    const user = userEvent.setup();
    const controller = new SigninFormsController();
    await renderApplication(controller, "/signin");

    await user.type(await screen.findByRole("textbox", { name: "Email" }), "ada@example.test");
    await user.type(screen.getByLabelText<HTMLInputElement>("Password"), "short");
    const submit = screen.getByRole<HTMLButtonElement>("button", { name: "Sign in" });
    await user.click(submit);

    act(() => {
      controller.completeSigninAfterUpdate({
        status: "authenticated", generation: 2, verifiedGeneration: 2, latestReadId: 2,
        routeTrusted: true, pendingOperation: null, serverObservation: "authenticated", user: signedInUser,
      }, { outcome: "confirmed" });
    });
    await waitFor(() => { expect(submit.disabled).toBe(false); });

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();
  });

  it("keeps signin uncertainty visible after a session check observes the user", async () => {
    const userEvents = userEvent.setup();
    const controller = new UncertainSigninFormsController();
    await renderApplication(controller, "/signin");

    await userEvents.type(await screen.findByRole("textbox", { name: "Email" }), "ada@example.test");
    await userEvents.type(screen.getByLabelText<HTMLInputElement>("Password"), "short");
    await userEvents.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/couldn't confirm sign-in/i);
    expect(screen.getByRole("status").textContent).toMatch(/may still complete/i);
    expect(screen.getByRole("status").textContent).not.toMatch(/check your session before trying again/i);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();

    await userEvents.click(screen.getByRole("button", { name: /check session/i }));

    expect(controller.rechecks.at(-1)).toBe("retry");
    expect(controller.signinInputs).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toMatch(/session verified/i);
    expect(screen.getByRole("status").textContent).toMatch(/may still complete/i);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();
  });
});

describe("logout-ui:", () => {
  it("uses a keyboard-operable button and never reports destruction before confirmation", async () => {
    const user = userEvent.setup();
    const controller = new LogoutFormsController();
    renderWelcome(controller);

    const signOut = screen.getByRole<HTMLButtonElement>("button", { name: /sign out/i });
    await user.tab();
    expect(document.activeElement).toBe(signOut);
    await user.keyboard("{Enter}");

    expect(controller.logoutCalls).toBe(1);
    expect(screen.queryByText(/signed out|logout confirmed/i)).toBeNull();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/signing out/i);

    act(() => { controller.observeConfirmedDestruction(); });
    expect(await screen.findByText("Sign in route")).toBeTruthy();
    expect(controller.snapshot.logoutDestructionReceipt).toEqual({ operationId: 2 });
  });

  it("keeps uncertain invalidation feedback visible and offers a session check", async () => {
    const user = userEvent.setup();
    const controller = new LogoutFormsController();
    renderWelcome(controller);
    controller.rechecks.length = 0;
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    act(() => { controller.observeFailedInvalidation(); });

    expect(await screen.findByText(/couldn't confirm sign-out/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /check session/i })).toBeTruthy();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();
    expect(controller.snapshot.logoutDestructionReceipt).toBeNull();

    await user.click(screen.getByRole("button", { name: /check session/i }));
    expect(controller.rechecks).toEqual(["retry"]);
    expect(controller.snapshot.logoutDestructionReceipt).toBeNull();
  });

  it("does not describe an anonymous observation as confirmed logout without a destruction receipt", async () => {
    const user = userEvent.setup();
    const controller = new LogoutFormsController();
    renderWelcome(controller);
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    act(() => { controller.observeAnonymousWithoutReceipt(); });

    expect(await screen.findByText("Sign in route")).toBeTruthy();
    expect(controller.snapshot.logoutDestructionReceipt).toBeNull();
    expect(screen.queryByText(/signed out|logout confirmed/i)).toBeNull();
  });
});
