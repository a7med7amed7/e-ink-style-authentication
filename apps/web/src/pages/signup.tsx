import { useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SignupSchema } from '@easygen/auth-contract';
import { AuthFields, type AuthFieldErrors, type AuthFieldName } from '../components/auth-fields.js';
import { AuthStatus } from '../components/auth-status.js';
import { useAuth } from '../auth/auth-context.js';

type SignupValues = { email: string; name: string; password: string };

export function SignupPage(): React.JSX.Element {
  const { controller, snapshot } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<SignupValues>({ email: '', name: '', password: '' });
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const verifiedSession = snapshot.status === 'authenticated' && snapshot.user !== undefined
    && snapshot.verifiedGeneration === snapshot.generation && snapshot.routeTrusted;
  const verifiedUncertainSignup = verifiedSession && snapshot.serverOutcomeUncertain;
  const verifiedSignupRecovery = verifiedSession && !snapshot.serverOutcomeUncertain
    && snapshot.lastOperationOutcome === 'verification-failed';
  const anonymousSignupRecovery = snapshot.status === 'unauthenticated' && snapshot.routeTrusted
    && snapshot.serverObservation === 'anonymous' && !snapshot.serverOutcomeUncertain
    && snapshot.lastOperationOutcome === 'verification-failed';
  const recoveryMessage = verifiedUncertainSignup ? 'Your account may have been created.'
    : verifiedSignupRecovery ? undefined
      : anonymousSignupRecovery
        ? 'Your account may have been created, but no session is currently observed. Sign in to continue.'
        : message;
  const hasFieldErrors = Object.values(errors).some((fieldErrors) =>
    fieldErrors !== undefined && fieldErrors.length > 0);
  const submissionMessage = hasFieldErrors ? message : recoveryMessage;

  const change = (field: AuthFieldName, value: string): void => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({
      email: field === 'email' ? undefined : previous.email,
      name: field === 'name' ? undefined : previous.name,
      password: field === 'password' ? undefined : previous.password
    }));
    setMessage(undefined);
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submittingRef.current) return;
    setMessage(undefined);
    const parsed = SignupSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<AuthFieldName, string[]>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'name' || field === 'password') {
          (next[field] ??= []).push(issue.message);
        }
      }
      setErrors(next);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    let submissionGeneration = controller.getSnapshot().generation;
    try {
      const request = controller.signup(parsed.data);
      submissionGeneration = controller.getSnapshot().generation;
      const result = await request;
      const current = controller.getSnapshot();
      if (current.generation !== submissionGeneration) return;
      const verified = current.status === 'authenticated'
        && current.user?.email === parsed.data.email
        && current.verifiedGeneration === current.generation
        && current.routeTrusted;
      if (verified && result.outcome === 'confirmed' && !current.serverOutcomeUncertain) {
        void navigate('/app', { replace: true });
        return;
      }
      const serverErrors: Partial<Record<AuthFieldName, readonly string[]>> = {};
      for (const field of ['email', 'name', 'password'] as const) {
        const fieldErrors = current.submissionErrors[field];
        if (fieldErrors?.length) serverErrors[field] = fieldErrors;
      }
      setErrors(serverErrors);
      const authStatusOwnsMessage = current.serverOutcomeUncertain || current.pendingOperation !== null;
      setMessage(result.outcome === 'uncertain' || result.outcome === 'verification-failed'
        ? 'Your account may have been created. Sign in is the recovery path; check your session before trying again.'
        : authStatusOwnsMessage ? undefined
          : result.outcome === 'busy'
          ? 'A sign-up request is already in progress.'
          : result.message ?? current.message ?? (result.outcome === 'confirmed'
            ? 'We could not verify the new session. Check your session before continuing.'
            : 'We could not complete sign-up.'));
    } catch {
      const current = controller.getSnapshot();
      if (current.generation === submissionGeneration && !current.serverOutcomeUncertain
        && current.pendingOperation === null) {
        setMessage('We could not confirm sign-up. Your account may have been created; sign in is the recovery path.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return <main>
    <h1>Create your account</h1>
    <form onSubmit={(event) => { void submit(event); }} noValidate>
      <AuthFields mode="signup" values={values} errors={errors} submissionError={submissionMessage} onChange={change} />
      <button type="submit" disabled={submitting || snapshot.pendingOperation === 'signup'}>
        {submitting || snapshot.pendingOperation === 'signup' ? 'Creating account…' : 'Create account'}
      </button>
    </form>
    <AuthStatus snapshot={snapshot} onCheckSession={() => controller.revalidate('retry')}
      submissionMessageVisible={submissionMessage !== undefined} />
    {verifiedSignupRecovery ? <p role="status">Session verified.</p> : null}
    {verifiedUncertainSignup || verifiedSignupRecovery
      ? <p><Link to="/app">Continue to the application</Link></p> : null}
    <p>Already have an account? <Link to="/signin">Sign in</Link></p>
  </main>;
}
