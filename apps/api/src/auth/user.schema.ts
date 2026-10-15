import { Schema, type HydratedDocument } from "mongoose";

export const USER_MODEL_NAME = "User";

export interface UserRecord {
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserRecord>;

export const UserSchema = new Schema<UserRecord>(
  {
    email: { type: String, required: true, immutable: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true, autoIndex: false, versionKey: false, strict: "throw" },
);

UserSchema.index({ email: 1 }, { unique: true, name: "users_email_unique" });
