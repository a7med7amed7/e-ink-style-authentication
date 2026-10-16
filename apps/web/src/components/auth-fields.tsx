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

export function AuthFields({ mode, values, errors = {}, submissionError, onChange }: AuthFieldsProps): ReactElement {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const submitAttempted = useRef(false);
  const fieldOrder: readonly AuthFieldName[] = mode === 'signup'
    ? ['email', 'name', 'password'] : ['email', 'password'];
  const invalidFields = fieldOrder.flatMap((name) => {
    const rawError = errors[name];
    const message = Array.isArray(rawError) ? rawError.join(' ') : rawError;
    return message ? [{ name, message }] : [];
  });

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
    const firstInvalid = fieldOrder.find((name) => invalidFields.some((field) => field.name === name));
    if (firstInvalid) document.getElementById(`${id}-${firstInvalid}`)?.focus();
  }, [errors, fieldOrder, id, invalidFields]);

  const field = (name: AuthFieldName, label: string, autocomplete: string, type: string): ReactElement => {
    const rawError = errors[name];
    const message = Array.isArray(rawError) ? rawError.join(' ') : rawError;
    const errorId = `${id}-${name}-error`;
    const inputId = `${id}-${name}`;
    return <div key={name}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        name={name}
        type={name === 'password' && visible ? 'text' : type}
        autoComplete={autocomplete}
        required
        value={values[name] ?? ''}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? errorId : undefined}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          submitAttempted.current = false;
          onChange(name, event.currentTarget.value);
        }}
      />
      {message && <p id={errorId}>{message}</p>}
      {name === 'password' && <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => { setVisible((shown) => !shown); }}
      >{visible ? 'Hide password' : 'Show password'}</button>}
    </div>;
  };
  return <fieldset ref={fieldsetRef}>
    <legend>{mode === 'signup' ? 'Create your account' : 'Sign in'}</legend>
    {invalidFields.length > 0 && submissionError === undefined && <div role="alert">
      <p>Check these fields:</p>
      <ul>{invalidFields.map(({ name, message }) => <li key={name}>
        {name === 'email' ? 'Email' : name === 'name' ? 'Name' : 'Password'}: {message}
      </li>)}</ul>
    </div>}
    {field('email', 'Email', 'email', 'email')}
    {mode === 'signup' && field('name', 'Name', 'name', 'text')}
    {field('password', 'Password', mode === 'signup' ? 'new-password' : 'current-password', 'password')}
    {submissionError && <p role="alert">{submissionError}</p>}
  </fieldset>;
}
