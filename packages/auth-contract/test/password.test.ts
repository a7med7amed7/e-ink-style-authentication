import { expect, it } from 'vitest';
import {
  canonicalizePassword,
  codePointLength,
  signinPasswordIssues,
  signupPasswordIssues
} from '../src/password.js';
import {
  composedPassword,
  decomposedPassword,
  forbiddenCategoryExamples,
  postNfcLengthExamples,
  preservedCombiningMarkPassword,
  requiredSignupExamples
} from './unicode-cases.js';

it.each(requiredSignupExamples)('password: signup example — $description', ({ password, valid }) => {
  const issues = signupPasswordIssues(password);

  if (valid) {
    expect(issues).toEqual([]);
  } else {
    expect(issues.length).toBeGreaterThan(0);
  }
});

it.each(forbiddenCategoryExamples)('password: rejects $category', ({ password }) => {
  expect(signupPasswordIssues(password).length).toBeGreaterThan(0);
});

it('password: counts signup boundaries after NFC', () => {
  expect(codePointLength(canonicalizePassword(postNfcLengthExamples.seven))).toBe(7);
  expect(codePointLength(canonicalizePassword(postNfcLengthExamples.eight))).toBe(8);
  expect(codePointLength(canonicalizePassword(postNfcLengthExamples.oneTwentyEight))).toBe(128);
  expect(codePointLength(canonicalizePassword(postNfcLengthExamples.oneTwentyNine))).toBe(129);

  expect(signupPasswordIssues(postNfcLengthExamples.seven).length).toBeGreaterThan(0);
  expect(signupPasswordIssues(postNfcLengthExamples.eight)).toEqual([]);
  expect(signupPasswordIssues(postNfcLengthExamples.oneTwentyEight)).toEqual([]);
  expect(signupPasswordIssues(postNfcLengthExamples.oneTwentyNine).length).toBeGreaterThan(0);
});

it('password: canonicalizes only NFC and preserves spaces and case', () => {
  const raw = ' Abcde\u0301f1! ';

  expect(canonicalizePassword(raw)).toBe(' Abcdéf1! ');
  expect(signupPasswordIssues(raw)).toEqual([]);
});

it('password: counts paired and lone surrogate code points correctly', () => {
  expect(codePointLength('😀')).toBe(1);
  expect(codePointLength('\ud800')).toBe(1);
  expect(codePointLength('\udc00')).toBe(1);
  expect(signupPasswordIssues('Abcdef1😀')).toEqual([]);
});

it('password: preserves isolated surrogates across NFC and rejects them only for signup', () => {
  const highSurrogate = 'Abcdef1!\ud800';
  const lowSurrogate = 'Abcdef1!\udc00';

  expect(canonicalizePassword(highSurrogate)).toBe(highSurrogate);
  expect(canonicalizePassword(lowSurrogate)).toBe(lowSurrogate);
  expect(canonicalizePassword('A\u0301\ud800A\u0301')).toBe('Á\ud800Á');
  expect(signupPasswordIssues(highSurrogate)).not.toEqual([]);
  expect(signupPasswordIssues(lowSurrogate)).not.toEqual([]);
  expect(signinPasswordIssues(highSurrogate)).toEqual([]);
  expect(signinPasswordIssues(lowSurrogate)).toEqual([]);
});

it('password: permits a combining mark without treating it as punctuation', () => {
  expect(canonicalizePassword(composedPassword)).toBe(composedPassword);
  expect(canonicalizePassword(decomposedPassword)).toBe(composedPassword);
  expect(codePointLength(canonicalizePassword(decomposedPassword))).toBe(8);
  expect(signupPasswordIssues(preservedCombiningMarkPassword)).toEqual([]);
});

it('password: signin requires a nonempty value but skips signup composition rules', () => {
  expect(signinPasswordIssues('')).not.toEqual([]);
  expect(signinPasswordIssues('x')).toEqual([]);
  expect(signinPasswordIssues(' ')).toEqual([]);
  expect(signupPasswordIssues('x')).not.toEqual([]);
  expect(signinPasswordIssues(postNfcLengthExamples.oneTwentyEight)).toEqual([]);
  expect(signinPasswordIssues(postNfcLengthExamples.oneTwentyNine)).not.toEqual([]);
});
