import { useRef, useState } from 'react';
import type { AuthSnapshot, Operation } from '../auth/auth-controller.js';

export interface AuthStatusProps {
  readonly snapshot: AuthSnapshot;
  readonly onCheckSession: () => Promise<void>;
  readonly submissionMessageVisible?: boolean;
}

function operationLabel(operation: Operation): string {
  switch (operation) {
    case 'signup': return 'sign-up';
    case 'signin': return 'sign-in';
    case 'logout': return 'sign-out';
  }
}

export function AuthStatus({ snapshot, onCheckSession, submissionMessageVisible = false }: AuthStatusProps): React.JSX.Element | null {
  const checkId = useRef(0);
  const [checking, setChecking] = useState<{ readonly generation: number; readonly id: number } | null>(null);
  const isChecking = checking?.generation === snapshot.generation && checking.id === checkId.current;
  const canCheck = snapshot.pendingOperation === null
    && (snapshot.status === 'unknown' || snapshot.serverOutcomeUncertain);
  const visible = snapshot.pendingOperation !== null || snapshot.status === 'unknown'
    || snapshot.serverOutcomeUncertain;
  if (!visible) return null;

  const sessionObservation = snapshot.status === 'authenticated'
    && snapshot.verifiedGeneration === snapshot.generation && snapshot.routeTrusted ? 'Session verified.'
    : snapshot.serverObservation === 'anonymous' && (snapshot.status === 'unknown'
      || (snapshot.status === 'unauthenticated' && snapshot.routeTrusted)) ? 'No session is currently observed.'
      : undefined;
  let statusMessage: string | undefined;
  if (snapshot.pendingOperation !== null) {
    statusMessage = `${snapshot.slow ? `Still verifying ${operationLabel(snapshot.pendingOperation)}`
      : `${operationLabel(snapshot.pendingOperation)} is in progress`}.${snapshot.queuedLogout
        ? ' Sign-out is queued until this request settles.' : ''}`;
  } else if (isChecking) {
    statusMessage = 'Checking your session…';
  } else if (submissionMessageVisible) {
    statusMessage = sessionObservation === 'Session verified.' ? sessionObservation : undefined;
  } else if (sessionObservation === 'Session verified.') {
    statusMessage = sessionObservation;
  } else if (snapshot.serverOutcomeUncertain) {
    statusMessage = snapshot.message ?? 'We could not confirm the earlier request.';
  } else {
    statusMessage = snapshot.message ?? 'We could not verify your session.';
  }

  const checkMessage = snapshot.serverOutcomeUncertain && snapshot.pendingOperation === null
    ? 'An earlier request may still complete on the server.'
    : snapshot.status === 'unknown' && snapshot.pendingOperation === null && !submissionMessageVisible && !isChecking
      ? 'Check your session before continuing.' : undefined;
  const separateSessionObservation = snapshot.serverOutcomeUncertain && snapshot.pendingOperation === null
    && sessionObservation !== 'Session verified.' ? sessionObservation : undefined;

  const handleCheckSession = (): void => {
    const id = ++checkId.current;
    setChecking({ generation: snapshot.generation, id });
    void onCheckSession().catch(() => undefined).finally(() => {
      if (checkId.current === id) setChecking(null);
    });
  };

  return <section>
    {statusMessage !== undefined || separateSessionObservation !== undefined || checkMessage !== undefined
      ? <div role="status">
        {statusMessage === undefined ? null : <p>{statusMessage}</p>}
        {separateSessionObservation === undefined ? null : <p>{separateSessionObservation}</p>}
        {checkMessage === undefined ? null : <p>{checkMessage}</p>}
      </div> : null}
    {canCheck ? <button type="button" disabled={isChecking} onClick={handleCheckSession}>
      {isChecking ? 'Checking session…' : 'Check session'}
    </button> : null}
  </section>;
}
