import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicUser, SignupInput } from "@easygen/auth-contract";
import type { OperationResult } from "../src/auth/auth-controller.js";
import { AuthProvider } from "../src/auth/auth-context.js";
import { ProtectedRoute } from "../src/auth/protected-route.js";
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
  readonly lastOperationOutcome: OperationResult["outcome"] | null;
  readonly serverObservation: "unknown" | "authenticated" | "anonymous";
  readonly serverOutcomeUncertain: boolean;
  readonly logoutDestructionReceipt: unknown;
  readonly user?: PublicUser;
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
    this.update({ status: "authenticating", pendingOperation: "signup" });
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
    this.update({
      status: "unknown",
      generation: 1,
      verifiedGeneration: null,
      latestReadId: 1,
      routeTrusted: false,
      pendingOperation: null,
      lastOperationOutcome: "verification-failed",
    });
    this.resolveSignup?.({ outcome: "verification-failed" });
  }
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

afterEach(() => { cleanup(); });

describe("signup-form:", () => {
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

    expect(await screen.findByText(/punctuation character or symbol/i)).toBeTruthy();
    expect(password.getAttribute("aria-invalid")).toBe("true");
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
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(screen.queryByText("Welcome to the application.")).toBeNull();
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
