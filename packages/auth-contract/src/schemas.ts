import { z } from 'zod';
import {
  canonicalizePassword,
  codePointLength,
  signinPasswordIssues,
  signupPasswordIssues
} from './password.js';

const emailInputSchema = z
  .string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .refine((email) => codePointLength(email) <= 254, {
    error: 'Email must be at most 254 Unicode code points.'
  })
  .pipe(z.email({ error: 'Enter a valid email address.' }));

const nameInputSchema = z.string({ error: 'Name is required.' }).trim().superRefine((name, context) => {
  const length = codePointLength(name);
  if (length < 3) {
    context.addIssue({ code: 'custom', message: 'Name must contain at least 3 Unicode code points.' });
  }
  if (length > 80) {
    context.addIssue({ code: 'custom', message: 'Name must contain no more than 80 Unicode code points.' });
  }
});

const signupPasswordSchema = z.string({ error: 'Password is required.' }).transform(canonicalizePassword).superRefine((password, context) => {
  for (const message of signupPasswordIssues(password)) {
    context.addIssue({ code: 'custom', message });
  }
});

const signinPasswordSchema = z.string({ error: 'Password is required.' }).transform(canonicalizePassword).superRefine((password, context) => {
  for (const message of signinPasswordIssues(password)) {
    context.addIssue({ code: 'custom', message });
  }
});

export const SignupSchema = z.object({
  email: emailInputSchema,
  name: nameInputSchema,
  password: signupPasswordSchema
}).strict();

export const SigninSchema = z.object({
  email: emailInputSchema,
  password: signinPasswordSchema
}).strict();

const publicEmailSchema = z.string().pipe(z.email()).refine(
  (email) => email === email.trim() && email === email.toLowerCase() && codePointLength(email) <= 254,
  { error: 'Email must be canonical.' }
);

const publicNameSchema = z.string().superRefine((name, context) => {
  const length = codePointLength(name);
  if (name !== name.trim() || length < 3 || length > 80) {
    context.addIssue({ code: 'custom', message: 'Name must be a canonical 3 to 80 code point value.' });
  }
});

export const PublicUserSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/, { error: 'ID must be a lowercase ObjectId.' }),
  email: publicEmailSchema,
  name: publicNameSchema
}).strict();

const validationFieldsSchema = z.object({
  email: z.array(z.string().min(1)).optional(),
  name: z.array(z.string().min(1)).optional(),
  password: z.array(z.string().min(1)).optional()
}).strict().refine((fields) => Object.keys(fields).length > 0, {
  error: 'Validation fields must identify at least one recognized field.'
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1).max(256),
    requestId: z.string().min(1).max(128),
    fields: validationFieldsSchema.optional()
  }).strict()
}).strict();
