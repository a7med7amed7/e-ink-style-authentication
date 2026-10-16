import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthFields } from '../src/components/auth-fields.js';

afterEach(() => { cleanup(); });

describe('auth-fields:', () => {
  it('renders labeled signup fields with correct autocomplete and associated errors', () => {
    render(<AuthFields
      mode="signup"
      values={{ email: '', name: '', password: '' }}
      errors={{ email: 'Enter a valid email address.', password: 'Password is too short.' }}
      submissionError="Account creation could not be confirmed."
      onChange={vi.fn()}
    />);

    const email = screen.getByRole<HTMLInputElement>('textbox', { name: 'Email' });
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' });
    const password = screen.getByLabelText<HTMLInputElement>('Password');
    expect(email.getAttribute('type')).toBe('email');
    expect(email.getAttribute('autocomplete')).toBe('email');
    expect(name.getAttribute('autocomplete')).toBe('name');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
    expect(password.getAttribute('minlength')).toBeNull();
    expect(password.getAttribute('maxlength')).toBeNull();

    expect(email.getAttribute('aria-invalid')).toBe('true');
    const emailErrors = document.getElementById(email.getAttribute('aria-describedby') ?? '');
    expect(emailErrors?.tagName).toBe('UL');
    expect(Array.from(emailErrors?.querySelectorAll(':scope > li') ?? [], (item) => item.textContent))
      .toEqual(['Enter a valid email address.']);
    expect(password.getAttribute('aria-invalid')).toBe('true');
    const passwordErrors = document.getElementById(password.getAttribute('aria-describedby') ?? '');
    expect(passwordErrors?.tagName).toBe('UL');
    expect(Array.from(passwordErrors?.querySelectorAll(':scope > li') ?? [], (item) => item.textContent))
      .toEqual(['Password is too short.']);
    expect(screen.getByRole('alert').textContent).toContain('Account creation could not be confirmed.');
  });

  it('toggles password visibility with the keyboard', async () => {
    const user = userEvent.setup();
    render(<AuthFields mode="signup" values={{ email: '', name: '', password: '' }} onChange={vi.fn()} />);

    const password = screen.getByLabelText<HTMLInputElement>('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(password.type).toBe('password');
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(password.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');
    await user.keyboard(' ');
    expect(password.type).toBe('password');
  });

  it('omits name for signin and uses the current-password autocomplete token', () => {
    render(<AuthFields mode="signin" values={{ email: '', password: '' }} onChange={vi.fn()} />);

    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
  });
});
