import { randomBytes } from "node:crypto";
import { argon2id, hash as argon2Hash, verify as argon2Verify } from "argon2";
import { HashWork } from "./hash-work.js";

const ARGON2_OPTIONS = Object.freeze({
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

export class PasswordService {
  readonly #hashWork: HashWork;
  readonly #dummyHash: string;

  private constructor(hashWork: HashWork, dummyHash: string) {
    this.#hashWork = hashWork;
    this.#dummyHash = dummyHash;
  }

  static async create(hashWork: HashWork): Promise<PasswordService> {
    const dummyHash = await hashWork.run(() => argon2Hash(randomBytes(32), ARGON2_OPTIONS));
    return new PasswordService(hashWork, dummyHash);
  }

  hash(canonicalPassword: string): Promise<string> {
    return this.#hashWork.run(() => argon2Hash(canonicalPassword, ARGON2_OPTIONS));
  }

  verify(storedHash: string, canonicalPassword: string): Promise<boolean> {
    return this.#hashWork.run(() => argon2Verify(storedHash, canonicalPassword));
  }

  async verifyDummy(canonicalPassword: string): Promise<boolean> {
    await this.#hashWork.run(() => argon2Verify(this.#dummyHash, canonicalPassword));
    return false;
  }
}
