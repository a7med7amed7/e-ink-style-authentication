import type { z } from 'zod';
import type { ApiErrorSchema, PublicUserSchema, SigninSchema, SignupSchema } from './schemas.js';

export type SignupInput = z.infer<typeof SignupSchema>;
export type SigninInput = z.infer<typeof SigninSchema>;
export type PublicUser = z.infer<typeof PublicUserSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
