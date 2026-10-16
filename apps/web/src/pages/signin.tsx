import { useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SigninSchema } from '@easygen/auth-contract';
import { AuthFields, type AuthFieldErrors, type AuthFieldName } from '../components/auth-fields.js';
import { AuthStatus } from '../components/auth-status.js';
import { useAuth } from '../auth/auth-context.js';

type SigninValues = { email: string; password: string };

export function SigninPage(): React.JSX.Element {
  const { controller, snapshot } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<SigninValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const change = (field: AuthFieldName, value: string): void => {
    if (field === 'email' || field === 'password') {
      setValues((previous) => ({ ...previous, [field]: value }));
    }
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setMessage(undefined);
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submittingRef.current) return;
    setMessage(undefined);
    const parsed = SigninSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<AuthFieldName, string[]>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'password') (next[field] ??= []).push(issue.message);
      }
      setErrors(next);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    let submissionGeneration = controller.getSnapshot().generation;
    try {
      const request = controller.signin(parsed.data);
      submissionGeneration = controller.getSnapshot().generation;
      const result = await request;
      const current = controller.getSnapshot();
      if (current.generation !== submissionGeneration) return;
      const verified = current.status === 'authenticated' && current.user?.email === parsed.data.email
        && current.verifiedGeneration === current.generation && current.routeTrusted;
      if (verified && result.outcome === 'confirmed' && !current.serverOutcomeUncertain) {
        void navigate('/app', { replace: true });
        return;
      }
      const next: Partial<Record<AuthFieldName, readonly string[]>> = {};
      for (const field of ['email', 'password'] as const) {
        const fieldErrors = current.submissionErrors[field];
        if (fieldErrors?.length) next[field] = fieldErrors;
      }
      setErrors(next);
      const authStatusOwnsMessage = current.serverOutcomeUncertain || current.pendingOperation !== null;
      setMessage(authStatusOwnsMessage ? undefined
        : result.outcome === 'busy' ? 'A sign-in request is already in progress.'
          : result.message ?? current.message ?? (result.outcome === 'confirmed'
            ? 'We could not verify this sign-in. Check your session again.'
            : 'We could not complete sign-in.'));
    } catch {
      const current = controller.getSnapshot();
      if (current.generation === submissionGeneration && !current.serverOutcomeUncertain
        && current.pendingOperation === null) {
        setMessage("We couldn't confirm sign-in. Check your session again.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return <main>
    <h1>Sign in</h1>
    <form onSubmit={(event) => { void submit(event); }} noValidate>
      <AuthFields mode="signin" values={values} errors={errors} submissionError={message} onChange={change} />
      <button type="submit" disabled={submitting || snapshot.pendingOperation === 'signin'}>
        {submitting || snapshot.pendingOperation === 'signin' ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
    <AuthStatus snapshot={snapshot} onCheckSession={() => controller.revalidate('retry')}
      submissionMessageVisible={message !== undefined} />
    {snapshot.serverOutcomeUncertain && snapshot.status === 'authenticated'
      && snapshot.user !== undefined && snapshot.verifiedGeneration === snapshot.generation && snapshot.routeTrusted
      ? <p><Link to="/app">Continue to the application</Link></p> : null}
    <p>New here? <Link to="/signup">Create an account</Link></p>
  </main>;
}
