import type { Model, Types } from "mongoose";
import { PublicUserSchema, type PublicUser, type SignupInput, type SigninInput } from "@easygen/auth-contract";
import {
  MongoClientClosedError,
  MongoNetworkError,
  MongoNotConnectedError,
  MongoOperationTimeoutError,
  MongoServerClosedError,
  MongoServerError,
  MongoServerSelectionError,
  MongoTopologyClosedError,
} from "mongodb";
import { ApiHttpError } from "../common/api-error.filter.js";
import { PasswordService } from "../security/password.service.js";
import type { UserDocument, UserRecord } from "./user.schema.js";

function unavailable(error: unknown): boolean {
  return error instanceof MongoNetworkError ||
    error instanceof MongoNotConnectedError ||
    error instanceof MongoOperationTimeoutError ||
    error instanceof MongoServerClosedError ||
    error instanceof MongoServerSelectionError ||
    error instanceof MongoTopologyClosedError ||
    error instanceof MongoClientClosedError;
}

function toPublicUser(user: UserRecord & { readonly _id: Types.ObjectId }): PublicUser {
  return PublicUserSchema.parse({ id: user._id.toHexString(), email: user.email, name: user.name });
}

export class AuthService {
  constructor(
    private readonly users: Model<UserRecord>,
    private readonly passwords: PasswordService,
  ) {}

  async signup(input: SignupInput): Promise<PublicUser> {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const user = await this.users.create({
        email: input.email,
        name: input.name,
        passwordHash,
      });
      return toPublicUser(user);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new ApiHttpError("EMAIL_ALREADY_REGISTERED");
      }
      if (unavailable(error)) throw new ApiHttpError("SERVICE_UNAVAILABLE");
      throw error;
    }
  }

  async signin(input: SigninInput): Promise<PublicUser> {
    let user: UserDocument | null;
    try {
      user = await this.users.findOne({ email: input.email }).select("+passwordHash").exec();
    } catch (error) {
      if (unavailable(error)) throw new ApiHttpError("SERVICE_UNAVAILABLE");
      throw error;
    }

    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);
    if (!valid || !user) throw new ApiHttpError("INVALID_CREDENTIALS");
    return toPublicUser(user);
  }

  async getPublicUser(userId: string): Promise<PublicUser> {
    if (!/^[0-9a-f]{24}$/.test(userId)) throw new ApiHttpError("UNAUTHENTICATED");
    let user: UserDocument | null;
    try {
      user = await this.users.findById(userId).exec();
    } catch (error) {
      if (unavailable(error)) throw new ApiHttpError("SERVICE_UNAVAILABLE");
      throw error;
    }
    if (!user) throw new ApiHttpError("UNAUTHENTICATED");
    return toPublicUser(user);
  }
}
