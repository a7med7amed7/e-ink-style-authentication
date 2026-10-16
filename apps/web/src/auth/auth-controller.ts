import { PublicUserSchema, type PublicUser, type SigninInput, type SignupInput } from '@easygen/auth-contract';
import { AuthApiError, type AuthApi } from '../api/auth-api.js';

export type Operation = 'signup' | 'signin' | 'logout';
export type RecheckReason = 'bootstrap' | 'focus' | 'navigation' | 'retry';
export type OperationOutcome = 'confirmed' | 'rejected' | 'uncertain' | 'verification-failed' | 'already-anonymous' | 'busy';
export type ServerObservation = 'authenticated' | 'anonymous' | 'unknown';
export interface OperationResult { outcome: OperationOutcome; message?: string }
type SubmissionErrorField = 'email' | 'name' | 'password';
export type SubmissionErrors = Readonly<Partial<Record<SubmissionErrorField, readonly string[] | undefined>>>;
export interface AuthSnapshot {
  readonly status: 'unknown' | 'unauthenticated' | 'authenticating' | 'authenticated';
  readonly user?: PublicUser | undefined;
  readonly generation: number;
  readonly verifiedGeneration: number | null;
  readonly latestReadId: number;
  readonly routeTrusted: boolean;
  readonly pendingOperation: Operation | null;
  readonly queuedLogout: boolean;
  readonly slow: boolean;
  readonly submissionErrors: SubmissionErrors;
  readonly message?: string | undefined;
  readonly lastOperationOutcome: OperationOutcome | null;
  readonly serverObservation: ServerObservation;
  readonly serverOutcomeUncertain: boolean;
  readonly logoutDestructionReceipt: Readonly<{ operationId: number }> | null;
}

const INITIAL_SNAPSHOT: AuthSnapshot = Object.freeze({
  status: 'unknown', generation: 0, verifiedGeneration: null, latestReadId: 0,
  routeTrusted: false, pendingOperation: null, queuedLogout: false, slow: false,
  submissionErrors: Object.freeze({}), lastOperationOutcome: null,
  serverObservation: 'unknown', serverOutcomeUncertain: false, logoutDestructionReceipt: null
});
const SLOW_OPERATION_MS = 5_000;

function freezeSubmissionErrors(errors: SubmissionErrors): SubmissionErrors {
  const copied: Partial<Record<SubmissionErrorField, readonly string[] | undefined>> = {};
  for (const field of ['email', 'name', 'password'] as const) {
    const messages = errors[field];
    if (messages !== undefined) copied[field] = Object.freeze([...messages]);
  }
  return Object.freeze(copied);
}

interface ActiveMutation {
  readonly generation: number;
  transportSettled: boolean;
  slowTimer: ReturnType<typeof setTimeout> | null;
  revalidationWaiters: Array<() => void>;
}
interface QueuedLogout {
  readonly generation: number;
  readonly promise: Promise<OperationResult>;
  readonly resolve: (result: OperationResult) => void;
}
type AuthPost = { readonly ok: true; readonly user: PublicUser }
  | { readonly ok: false; readonly error: unknown };

export class AuthController {
  private snapshot: AuthSnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private readId = 0;
  private activeMutation: ActiveMutation | null = null;
  private queuedLogout: QueuedLogout | null = null;

  constructor(private readonly api: AuthApi) {}
  getSnapshot = (): AuthSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  // Revalidation sources share a trust policy; mutations defer reads to reconciliation.
  async revalidate(reason: RecheckReason): Promise<void> {
    switch (reason) {
      case 'bootstrap':
      case 'focus':
      case 'navigation':
      case 'retry':
        break;
    }
    if (this.activeMutation !== null) {
      const active = this.activeMutation;
      const pending = new Promise<void>((resolve) => { active.revalidationWaiters.push(resolve); });
      const readId = ++this.readId;
      this.publish({ ...this.snapshot, latestReadId: readId, routeTrusted: false });
      return pending;
    }
    const generation = this.generation;
    const readId = ++this.readId;
    this.publish({ ...this.snapshot, latestReadId: readId, routeTrusted: false });
    try {
      const user = PublicUserSchema.parse(await this.api.me());
      if (!this.isCurrent(generation, readId)) return;
      this.publish({ ...this.snapshot, status: 'authenticated', user, verifiedGeneration: generation,
        routeTrusted: true, serverObservation: 'authenticated' });
    } catch (error) {
      if (!this.isCurrent(generation, readId)) return;
      if (error instanceof AuthApiError && error.kind === 'unauthenticated') {
        this.publish({ ...this.snapshot, status: 'unauthenticated', user: undefined,
          verifiedGeneration: null, routeTrusted: true, serverObservation: 'anonymous' });
      } else {
        this.publish({ ...this.snapshot, status: 'unknown', user: undefined,
          verifiedGeneration: null, routeTrusted: false, serverObservation: 'unknown' });
      }
    }
  }

  signup(input: SignupInput): Promise<OperationResult> {
    const active = this.beginMutation('signup');
    if (active === null) return Promise.resolve({ outcome: 'busy' });
    return this.runSignup(active, input);
  }

  signin(input: SigninInput): Promise<OperationResult> {
    const active = this.beginMutation('signin');
    if (active === null) return Promise.resolve({ outcome: 'busy' });
    return this.runSignin(active, input);
  }

  logout(): Promise<OperationResult> {
    if (this.activeMutation !== null) {
      if (this.queuedLogout !== null) return this.queuedLogout.promise;
      if (this.snapshot.pendingOperation === 'signup' || this.snapshot.pendingOperation === 'signin') {
        return this.queueLogout();
      }
      return Promise.resolve({ outcome: 'busy' });
    }
    const active = this.beginMutation('logout');
    if (active === null) return Promise.resolve({ outcome: 'busy' });
    return this.runLogout(active);
  }

  private queueLogout(): Promise<OperationResult> {
    let resolve!: (result: OperationResult) => void;
    const promise = new Promise<OperationResult>((resolvePromise) => { resolve = resolvePromise; });
    const queued = { generation: ++this.generation, promise, resolve };
    this.queuedLogout = queued;
    const readId = ++this.readId;
    this.publish({ ...this.snapshot, status: 'unknown', user: undefined, generation: queued.generation,
      verifiedGeneration: null, latestReadId: readId, routeTrusted: false, queuedLogout: true,
      submissionErrors: {}, message: undefined, logoutDestructionReceipt: null });
    if (this.activeMutation?.transportSettled === true) this.startQueuedLogout(this.activeMutation);
    return promise;
  }

  private startQueuedLogout(active: ActiveMutation): boolean {
    const queued = this.queuedLogout;
    if (queued === null || this.activeMutation !== active) return false;
    this.clearSlowTimer(active);
    this.queuedLogout = null;
    const logoutActive = { generation: queued.generation, transportSettled: false, slowTimer: null,
      revalidationWaiters: active.revalidationWaiters };
    active.revalidationWaiters = [];
    this.activeMutation = logoutActive;
    const readId = ++this.readId;
    this.publish({ ...this.snapshot, status: 'unknown', user: undefined, generation: queued.generation,
      verifiedGeneration: null, latestReadId: readId, routeTrusted: false, pendingOperation: 'logout',
      queuedLogout: false, slow: false, submissionErrors: {}, message: undefined });
    this.startSlowTimer(logoutActive);
    void this.runLogout(logoutActive).then(
      queued.resolve,
      () => { queued.resolve({ outcome: 'uncertain' }); }
    );
    return true;
  }

  private beginMutation(operation: Operation): ActiveMutation | null {
    if (this.activeMutation !== null) return null;
    const generation = ++this.generation;
    const readId = ++this.readId;
    const active = { generation, transportSettled: false, slowTimer: null,
      revalidationWaiters: [] };
    this.activeMutation = active;
    this.publish({ ...this.snapshot, status: operation === 'logout' ? 'unknown' : 'authenticating', user: undefined, generation,
      verifiedGeneration: null, latestReadId: readId, routeTrusted: false, pendingOperation: operation,
      queuedLogout: false, slow: false, submissionErrors: {}, message: undefined,
      lastOperationOutcome: null, logoutDestructionReceipt: null });
    this.startSlowTimer(active);
    return active;
  }

  private startSlowTimer(active: ActiveMutation): void {
    active.slowTimer = setTimeout(() => {
      active.slowTimer = null;
      const queuedGeneration = this.queuedLogout?.generation;
      const generationIsCurrent = this.generation === active.generation || queuedGeneration === this.generation;
      if (this.activeMutation !== active || !generationIsCurrent || this.snapshot.slow) return;
      this.publish({ ...this.snapshot, slow: true });
    }, SLOW_OPERATION_MS);
  }

  private clearSlowTimer(active: ActiveMutation): void {
    if (active.slowTimer === null) return;
    clearTimeout(active.slowTimer);
    active.slowTimer = null;
  }

  private finishMutation(active: ActiveMutation): boolean {
    if (this.activeMutation !== active || this.generation !== active.generation) return false;
    this.clearSlowTimer(active);
    this.activeMutation = null;
    for (const resolve of active.revalidationWaiters.splice(0)) resolve();
    return true;
  }

  private async runSignup(active: ActiveMutation, input: SignupInput): Promise<OperationResult> {
    let post: AuthPost;
    try { post = { ok: true, user: PublicUserSchema.parse(await this.api.signup(input)) }; }
    catch (error) { post = { ok: false, error }; }
    active.transportSettled = true;
    this.recordUncertainPost(active, post);
    if (this.queuedLogout !== null) return this.startQueuedLogout(active) ? { outcome: 'uncertain' } : { outcome: 'busy' };
    return this.reconcileAuthentication(active, input.email.trim().toLowerCase(), post, 'signup');
  }

  private async runSignin(active: ActiveMutation, input: SigninInput): Promise<OperationResult> {
    let post: AuthPost;
    try { post = { ok: true, user: PublicUserSchema.parse(await this.api.signin(input)) }; }
    catch (error) { post = { ok: false, error }; }
    active.transportSettled = true;
    this.recordUncertainPost(active, post);
    if (this.queuedLogout !== null) return this.startQueuedLogout(active) ? { outcome: 'uncertain' } : { outcome: 'busy' };
    return this.reconcileAuthentication(active, input.email.trim().toLowerCase(), post, 'signin');
  }

  private async runLogout(active: ActiveMutation): Promise<OperationResult> {
    let acknowledged = false;
    let failure: unknown;
    try { await this.api.logout(); acknowledged = true; }
    catch (error) { failure = error; }
    active.transportSettled = true;
    const read = await this.readMutationObservation(active);
    if (read === null) return { outcome: 'uncertain' };
    const { observation } = read;

    const confirmed = acknowledged && observation === 'anonymous';
    const alreadyAnonymous = !acknowledged && observation === 'anonymous' && failure instanceof AuthApiError
      && failure.kind === 'unauthenticated' && failure.status === 401;
    const uncertain = !acknowledged && !alreadyAnonymous && this.isUncertain(failure);
    const outcome: OperationOutcome = confirmed ? 'confirmed'
      : alreadyAnonymous ? 'already-anonymous' : uncertain ? 'uncertain' : 'verification-failed';
    const message = confirmed || alreadyAnonymous ? undefined
      : uncertain ? "We couldn't confirm sign-out. Check your session again."
        : 'We could not verify sign-out. Check your session again.';
    if (!this.finishMutation(active)) return { outcome: 'uncertain' };
    this.publish({ ...this.snapshot, status: confirmed || alreadyAnonymous ? 'unauthenticated' : 'unknown',
      user: undefined, verifiedGeneration: null, routeTrusted: confirmed || alreadyAnonymous,
      pendingOperation: null, slow: false, message, lastOperationOutcome: outcome,
      serverObservation: observation,
      serverOutcomeUncertain: this.snapshot.serverOutcomeUncertain || uncertain,
      logoutDestructionReceipt: confirmed ? Object.freeze({ operationId: active.generation }) : null });
    return message === undefined ? { outcome } : { outcome, message };
  }

  private async reconcileAuthentication(
    active: ActiveMutation,
    email: string,
    post: AuthPost,
    operation: 'signup' | 'signin'
  ): Promise<OperationResult> {
    const read = await this.readMutationObservation(active);
    if (read === null) return { outcome: 'uncertain' };
    const { observation, user: observedUser } = read;
    const matches = observedUser?.email === email && (!post.ok || observedUser.id === post.user.id);
    const verified = observation === 'authenticated' && matches;
    const uncertain = !post.ok && this.isUncertain(post.error);
    const outcome: OperationOutcome = post.ok ? verified ? 'confirmed' : 'verification-failed'
      : uncertain ? 'uncertain' : 'rejected';
    const status: AuthSnapshot['status'] = verified ? 'authenticated'
      : observation === 'anonymous' && !post.ok && !uncertain ? 'unauthenticated' : 'unknown';
    const submissionErrors = !post.ok && post.error instanceof AuthApiError
      ? post.error.apiError?.error.fields ?? {} : {};
    const invalidSignin = operation === 'signin' && !post.ok && post.error instanceof AuthApiError
      && post.error.kind === 'rejected' && post.error.status === 401;
    const message = verified && uncertain ? 'Session verified'
      : post.ok && !verified ? operation === 'signup'
        ? 'We could not verify the new session. Check session again.'
        : 'We could not verify this sign-in. Check session again.'
        : !post.ok && uncertain ? operation === 'signup'
          ? "We couldn't confirm sign-up. Check session again."
          : "We couldn't confirm sign-in. Check session again."
          : !post.ok && invalidSignin ? 'Invalid email or password.'
            : !post.ok ? post.error instanceof AuthApiError
            ? post.error.apiError?.error.message ?? (operation === 'signup'
              ? 'We could not complete sign-up.' : 'We could not complete sign-in.')
            : operation === 'signup' ? 'We could not complete sign-up.' : 'We could not complete sign-in.' : undefined;
    if (!this.finishMutation(active)) return { outcome: 'uncertain' };
    this.publish({ ...this.snapshot, status, user: verified ? observedUser : undefined,
      verifiedGeneration: verified ? active.generation : null,
      routeTrusted: verified || (status === 'unauthenticated' && observation === 'anonymous'),
      pendingOperation: null, slow: false, submissionErrors, message,
      lastOperationOutcome: outcome, serverObservation: observation,
      serverOutcomeUncertain: this.snapshot.serverOutcomeUncertain || uncertain });
    return message === undefined ? { outcome } : { outcome, message };
  }

  private isUncertain(error: unknown): boolean {
    return !(error instanceof AuthApiError) || error.kind === 'network' || error.kind === 'malformed'
      || error.kind === 'unexpected' || (error.status !== undefined && error.status >= 500);
  }

  private recordUncertainPost(active: ActiveMutation, post: AuthPost): void {
    if (post.ok || !this.isUncertain(post.error) || this.activeMutation !== active) return;
    const generationIsCurrent = this.generation === active.generation
      || this.queuedLogout?.generation === this.generation;
    if (!generationIsCurrent || this.snapshot.serverOutcomeUncertain) return;
    this.publish({ ...this.snapshot, serverOutcomeUncertain: true });
  }

  private async readMutationObservation(active: ActiveMutation): Promise<{
    readonly observation: ServerObservation;
    readonly user?: PublicUser;
  } | null> {
    while (this.activeMutation === active && this.generation === active.generation) {
      const readId = ++this.readId;
      this.publish({ ...this.snapshot, latestReadId: readId });
      let observation: ServerObservation = 'unknown';
      let user: PublicUser | undefined;
      try {
        user = PublicUserSchema.parse(await this.api.me());
        observation = 'authenticated';
      } catch (error) {
        if (error instanceof AuthApiError && error.kind === 'unauthenticated') observation = 'anonymous';
      }
      if (this.activeMutation !== active || this.generation !== active.generation) return null;
      if (this.readId !== readId) continue;
      return { observation, ...(user === undefined ? {} : { user }) };
    }
    return null;
  }

  private isCurrent(generation: number, readId: number): boolean {
    return this.generation === generation && this.readId === readId && this.snapshot.pendingOperation === null;
  }

  private publish(next: AuthSnapshot): void {
    this.snapshot = Object.freeze({ ...next, submissionErrors: freezeSubmissionErrors(next.submissionErrors),
      ...(next.user === undefined ? {} : { user: Object.freeze({ ...next.user }) }) });
    for (const listener of this.listeners) listener();
  }
}
