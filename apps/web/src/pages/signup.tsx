import { useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SignupSchema } from '@easygen/auth-contract';
import { AuthFields, type AuthFieldErrors, type AuthFieldName } from '../components/auth-fields.js';
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
    try {
      const result = await controller.signup(parsed.data);
      const current = controller.getSnapshot();
      const verified = current.status === 'authenticated'
        && current.user?.email === parsed.data.email
        && current.verifiedGeneration === current.generation
        && current.routeTrusted;
      if (verified && (result.outcome === 'confirmed' || result.outcome === 'uncertain')) {
        void navigate('/app', { replace: true });
        return;
      }
      const serverErrors: Partial<Record<AuthFieldName, readonly string[]>> = {};
      for (const field of ['email', 'name', 'password'] as const) {
        const fieldErrors = current.submissionErrors[field];
        if (fieldErrors?.length) serverErrors[field] = fieldErrors;
      }
      setErrors(serverErrors);
      setMessage(result.outcome === 'uncertain' || result.outcome === 'verification-failed'
        ? 'Your account may have been created. Sign in is the recovery path; check your session before trying again.'
        : result.outcome === 'busy'
          ? 'A sign-up request is already in progress.'
          : result.message ?? current.message ?? (result.outcome === 'confirmed'
            ? 'We could not verify the new session. Check your session before continuing.'
            : 'We could not complete sign-up.'));
    } catch {
      setMessage('We could not confirm sign-up. Your account may have been created; sign in is the recovery path.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return <main>
    <h1>Create your account</h1>
    <form onSubmit={(event) => { void submit(event); }} noValidate>
      <AuthFields mode="signup" values={values} errors={errors} submissionError={message} onChange={change} />
      <button type="submit" disabled={submitting || snapshot.pendingOperation === 'signup'}>
        {submitting || snapshot.pendingOperation === 'signup' ? 'Creating account…' : 'Create account'}
      </button>
    </form>
    <p>Already have an account? <Link to="/signin">Sign in</Link></p>
  </main>;
}
