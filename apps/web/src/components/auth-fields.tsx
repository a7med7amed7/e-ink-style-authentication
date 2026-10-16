import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactElement } from 'react';

export type AuthFieldName = 'email' | 'name' | 'password';
export type AuthFieldValues = Readonly<{ email: string; name?: string; password: string }>;
export type AuthFieldErrors = Readonly<Partial<Record<AuthFieldName, string | readonly string[] | undefined>>>;

export interface AuthFieldsProps {
  readonly mode: 'signup' | 'signin';
  readonly values: AuthFieldValues;
  readonly errors?: AuthFieldErrors;
  readonly submissionError?: string | undefined;
  readonly onChange: (field: AuthFieldName, value: string) => void;
}

const fieldMessages = (error: AuthFieldErrors[AuthFieldName]): readonly string[] =>
  typeof error === 'string' ? [error] : error ?? [];

export function AuthFields({ mode, values, errors = {}, submissionError, onChange }: AuthFieldsProps): ReactElement {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const submitAttempted = useRef(false);
  const fieldOrder: readonly AuthFieldName[] = mode === 'signup'
    ? ['email', 'name', 'password'] : ['email', 'password'];
  const invalidFields = fieldOrder.filter((name) => fieldMessages(errors[name]).length > 0);

  useEffect(() => {
    const form = fieldsetRef.current?.closest('form');
    if (!form) return;
    const markSubmit = (): void => { submitAttempted.current = true; };
    form.addEventListener('submit', markSubmit, true);
    return () => { form.removeEventListener('submit', markSubmit, true); };
  }, []);

  useEffect(() => {
    if (!submitAttempted.current) return;
    submitAttempted.current = false;
    const firstInvalid = fieldOrder.find((name) => invalidFields.includes(name));
    if (firstInvalid) document.getElementById(`${id}-${firstInvalid}`)?.focus();
  }, [errors, fieldOrder, id, invalidFields]);

  const field = (name: AuthFieldName, label: string, autocomplete: string, type: string): ReactElement => {
    const messages = fieldMessages(errors[name]);
    const errorId = `${id}-${name}-error`;
    const inputId = `${id}-${name}`;
    const input = <input
      id={inputId}
      name={name}
      type={name === 'password' && visible ? 'text' : type}
      autoComplete={autocomplete}
      required
      value={values[name] ?? ''}
      aria-invalid={messages.length > 0 ? true : undefined}
      aria-describedby={messages.length > 0 ? errorId : undefined}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        submitAttempted.current = false;
        onChange(name, event.currentTarget.value);
      }}
    />;
    return <div key={name}>
      <label htmlFor={inputId}>{label}</label>
      {name === 'password' ? <div className="password-control">
        {input}
        <button
          className="password-toggle"
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => { setVisible((shown) => !shown); }}
        >
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {visible
              ? <><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 002.8 2.8" />
                <path d="M9.9 5.2A11.3 11.3 0 0112 5c5 0 8.5 4.3 9.5 7-.4 1.1-1.2 2.4-2.4 3.6" />
                <path d="M6.2 6.2C4 7.5 2.8 9.6 2.5 12c1 2.7 4.5 7 9.5 7 1.3 0 2.5-.3 3.6-.8" /></>
              : <><path d="M2.5 12c1-2.7 4.5-7 9.5-7s8.5 4.3 9.5 7c-1 2.7-4.5 7-9.5 7s-8.5-4.3-9.5-7z" />
                <circle cx="12" cy="12" r="2.5" /></>}
          </svg>
        </button>
      </div> : input}
      {messages.length > 0 && <ul className="field-errors" id={errorId} aria-live="polite">
        {messages.map((message, index) => <li key={index}>{message}</li>)}
      </ul>}
    </div>;
  };
  return <fieldset ref={fieldsetRef}>
    <legend>{mode === 'signup' ? 'Create your account' : 'Sign in'}</legend>
    {field('email', 'Email', 'email', 'email')}
    {mode === 'signup' && field('name', 'Name', 'name', 'text')}
    {field('password', 'Password', mode === 'signup' ? 'new-password' : 'current-password', 'password')}
    {submissionError && <ul className="submission-errors" role="alert">
      <li>{submissionError}</li>
    </ul>}
  </fieldset>;
}
