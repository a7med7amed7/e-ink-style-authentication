import assert from "node:assert/strict";
import { test } from "node:test";
import { HashWork } from "../src/security/hash-work.js";
import { PasswordService } from "../src/security/password.service.js";

class CountingHashWork extends HashWork {
  admissions = 0;

  override run<T>(work: () => Promise<T>): Promise<T> {
    this.admissions += 1;
    return super.run(work);
  }
}

async function createService(t: { after(callback: () => void): void }) {
  const hashWork = new CountingHashWork();
  t.after(() => {
    hashWork.close();
  });
  const service = await PasswordService.create(hashWork);
  return { hashWork, service };
}

void test("password-service: hashes with the selected Argon2id parameters and random salt", async (t) => {
  const { hashWork, service } = await createService(t);

  const first = await service.hash("correct horse battery staple");
  const second = await service.hash("correct horse battery staple");
  const firstParts = first.split("$");
  const secondParts = second.split("$");

  assert.equal(firstParts[1], "argon2id");
  assert.equal(firstParts[2], "v=19");
  assert.deepEqual(new Set(firstParts[3]?.split(",")), new Set(["m=19456", "t=2", "p=1"]));
  assert.ok(firstParts[4]);
  assert.ok(firstParts[5]);
  assert.notEqual(firstParts[4], secondParts[4]);
  assert.equal(Buffer.from(firstParts[5], "base64").byteLength, 32);
  assert.equal(hashWork.admissions, 3, "dummy precompute and both hashes use HashWork");
});

void test("password-service: verifies real passwords with the same admitted work boundary", async (t) => {
  const { hashWork, service } = await createService(t);
  const encoded = await service.hash("correct horse battery staple");

  assert.equal(await service.verify(encoded, "correct horse battery staple"), true);
  assert.equal(await service.verify(encoded, "wrong password"), false);
  assert.equal(hashWork.admissions, 4, "each verification adds exactly one admitted job");
});

void test("password-service: dummy verification uses its precomputed verifier through HashWork", async (t) => {
  const { hashWork, service } = await createService(t);

  assert.equal(await service.verifyDummy("unknown account password"), false);
  assert.equal(await service.verifyDummy("another unknown account password"), false);
  assert.equal(hashWork.admissions, 3, "startup precompute and both dummy verifications are admitted");
});
