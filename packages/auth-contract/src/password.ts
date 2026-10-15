const letterPattern = /\p{L}/u;
const decimalDigitPattern = /\p{Nd}/u;
const punctuationOrSymbolPattern = /[\p{P}\p{S}]/u;
const forbiddenCharacterPattern = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

export function canonicalizePassword(raw: string): string {
  return raw.normalize('NFC');
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function signupPasswordIssues(raw: string): string[] {
  const password = canonicalizePassword(raw);
  const issues: string[] = [];
  const length = codePointLength(password);

  if (length < 8 || length > 128) {
    issues.push('Password must contain 8 to 128 Unicode code points.');
  }
  if (!letterPattern.test(password)) {
    issues.push('Password must contain at least one Unicode letter.');
  }
  if (!decimalDigitPattern.test(password)) {
    issues.push('Password must contain at least one Unicode decimal digit.');
  }
  if (!punctuationOrSymbolPattern.test(password)) {
    issues.push('Password must contain at least one punctuation character or symbol.');
  }
  if (forbiddenCharacterPattern.test(password)) {
    issues.push('Password contains a character that is not allowed.');
  }

  return issues;
}

export function signinPasswordIssues(raw: string): string[] {
  const length = codePointLength(canonicalizePassword(raw));
  const issues: string[] = [];

  if (length === 0) {
    issues.push('Password is required.');
  }
  if (length > 128) {
    issues.push('Password must contain no more than 128 Unicode code points.');
  }

  return issues;
}
