import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  PublicUserSchema,
  SigninSchema,
  SignupSchema
} from '../src/schemas.js';

const validSignup = {
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  password: 'Abcdef1!'
};

const boundaryEmail = (lastLabelLength: number): string =>
  `${'a'.repeat(64)}@${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(lastLabelLength)}`;

describe('schemas: signup canonicalization and limits', () => {
  it('schemas: trims and lowercases email, trims name, and applies NFC only to password', () => {
    const result = SignupSchema.safeParse({
      email: '  Ada.Lovelace+tag@GMail.com  ',
      name: '  Ada  Lovelace  ',
      password: 'A\u0301bcdef1!'
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        email: 'ada.lovelace+tag@gmail.com',
        name: 'Ada  Lovelace',
        password: 'Ábcdef1!'
      });
    }
  });

  it('schemas: accepts a 254-code-point email and rejects a 255-code-point email', () => {
    expect(SignupSchema.safeParse({ ...validSignup, email: boundaryEmail(61) }).success).toBe(true);
    const tooLong = SignupSchema.safeParse({ ...validSignup, email: boundaryEmail(62) });

    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(tooLong.error.issues.map((issue) => issue.path)).toContainEqual(['email']);
  });

  it('schemas: rejects malformed email syntax without provider-specific rewriting', () => {
    expect(SignupSchema.safeParse({ ...validSignup, email: 'not-an-email' }).success).toBe(false);
    const gmail = SignupSchema.safeParse({ ...validSignup, email: 'name+tag@gmail.com' });
    expect(gmail.success).toBe(true);
    if (gmail.success) expect(gmail.data.email).toBe('name+tag@gmail.com');
  });

  it('schemas: trims names before enforcing the 3-code-point minimum', () => {
    expect(SignupSchema.safeParse({ ...validSignup, name: '  A😀B  ' }).success).toBe(true);
    const tooShort = SignupSchema.safeParse({ ...validSignup, name: '  A😀  ' });
    expect(tooShort.success).toBe(false);
    if (!tooShort.success) expect(tooShort.error.issues.map((issue) => issue.path)).toContainEqual(['name']);
  });

  it('schemas: counts astral names as code points at the 80/81 boundary', () => {
    expect(SignupSchema.safeParse({ ...validSignup, name: '😀'.repeat(80) }).success).toBe(true);
    const tooLong = SignupSchema.safeParse({ ...validSignup, name: '😀'.repeat(81) });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(tooLong.error.issues.map((issue) => issue.path)).toContainEqual(['name']);
  });

  it('schemas: preserves internal name whitespace and case', () => {
    const result = SignupSchema.safeParse({ ...validSignup, name: '  Ada  van Lovelace  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Ada  van Lovelace');
  });

  it.each([
    ['unknown property', { ...validSignup, admin: true }],
    ['wrong email type', { ...validSignup, email: 42 }],
    ['wrong name type', { ...validSignup, name: null }],
    ['wrong password type', { ...validSignup, password: ['Abcdef1!'] }],
    ['missing email', { name: validSignup.name, password: validSignup.password }],
    ['missing name', { email: validSignup.email, password: validSignup.password }],
    ['missing password', { email: validSignup.email, name: validSignup.name }]
  ])('schemas: rejects signup %s', (_label, value) => {
    expect(SignupSchema.safeParse(value).success).toBe(false);
  });

  it('schemas: reports password validation with static messages that do not echo credential values', () => {
    const credential = 'SecretCredentialValueABC';
    const result = SignupSchema.safeParse({ ...validSignup, password: credential });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'password')).toBe(true);
      expect(JSON.stringify(result.error.issues)).not.toContain(credential);
    }
  });
});

describe('schemas: signin-specific validation', () => {
  it('schemas: canonicalizes email and NFC password without trimming or signup composition checks', () => {
    const result = SigninSchema.safeParse({ email: '  USER@example.com ', password: ' e\u0301 ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ email: 'user@example.com', password: ' é ' });
  });

  it('schemas: permits a nonempty password that fails signup composition', () => {
    expect(SigninSchema.safeParse({ email: 'user@example.com', password: 'x' }).success).toBe(true);
    expect(SigninSchema.safeParse({ email: 'user@example.com', password: ' ' }).success).toBe(true);
  });

  it('schemas: rejects empty and over-128-code-point signin passwords', () => {
    expect(SigninSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(false);
    expect(SigninSchema.safeParse({ email: 'user@example.com', password: '😀'.repeat(129) }).success).toBe(false);
  });

  it.each([
    ['unknown property', { email: 'user@example.com', password: 'x', remember: true }],
    ['wrong email type', { email: false, password: 'x' }],
    ['wrong password type', { email: 'user@example.com', password: 7 }],
    ['missing email', { password: 'x' }],
    ['missing password', { email: 'user@example.com' }]
  ])('schemas: rejects signin %s', (_label, value) => {
    expect(SigninSchema.safeParse(value).success).toBe(false);
  });
});

describe('schemas: public user and API error shape', () => {
  const validUser = {
    id: '507f1f77bcf86cd799439011',
    email: 'ada@example.com',
    name: 'Ada Lovelace'
  };

  it('schemas: accepts exactly the canonical public identity', () => {
    expect(PublicUserSchema.safeParse(validUser).success).toBe(true);
  });

  it.each([
    ['password hash', { ...validUser, passwordHash: 'secret-hash' }],
    ['malformed id', { ...validUser, id: 'not-an-object-id' }],
    ['noncanonical email', { ...validUser, email: 'ADA@example.com' }],
    ['missing name', { id: validUser.id, email: validUser.email }],
    ['wrong email type', { ...validUser, email: 8 }]
  ])('schemas: rejects public user with %s', (_label, value) => {
    expect(PublicUserSchema.safeParse(value).success).toBe(false);
  });

  it('schemas: accepts a safe error envelope with recognized validation fields', () => {
    const result = ApiErrorSchema.safeParse({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Check the highlighted fields.',
        requestId: '6fdba486-8e0f-4a2c-bd4f-9530e77b34cd',
        fields: { email: ['Enter a valid email address.'], password: ['Password is too short.'] }
      }
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['unknown outer field', { error: { code: 'INTERNAL_ERROR', message: 'Request failed.', requestId: 'r1' }, debug: 'secret' }],
    ['unknown error field', { error: { code: 'INTERNAL_ERROR', message: 'Request failed.', requestId: 'r1', stack: 'secret' } }],
    ['unknown validation field', { error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', requestId: 'r1', fields: { passwordHash: ['secret'] } } }],
    ['wrong fields value', { error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', requestId: 'r1', fields: { email: 'invalid' } } }],
    ['missing request id', { error: { code: 'INTERNAL_ERROR', message: 'Request failed.' } }]
  ])('schemas: rejects API error with %s', (_label, value) => {
    expect(ApiErrorSchema.safeParse(value).success).toBe(false);
  });
});
