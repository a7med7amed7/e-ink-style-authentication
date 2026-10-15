import { Injectable, type PipeTransform } from "@nestjs/common";
import {
  SigninSchema,
  SignupSchema,
  type SigninInput,
  type SignupInput,
} from "@easygen/auth-contract";
import type { ZodType } from "zod";
import { ApiHttpError } from "../common/api-error.filter.js";

const VALIDATION_FIELDS = new Set(["email", "name", "password"]);

@Injectable()
export class AuthValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && VALIDATION_FIELDS.has(field)) {
        (fields[field] ??= []).push(issue.message);
      }
    }
    throw new ApiHttpError("VALIDATION_ERROR", { fields });
  }
}

@Injectable()
export class SignupValidationPipe extends AuthValidationPipe<SignupInput> {
  constructor() {
    super(SignupSchema);
  }
}

@Injectable()
export class SigninValidationPipe extends AuthValidationPipe<SigninInput> {
  constructor() {
    super(SigninSchema);
  }
}
