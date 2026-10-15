export const requiredSignupExamples = [
  { description: 'ASCII letter, decimal digit, and punctuation', password: 'Abcdef1!', valid: true },
  { description: 'trailing space does not satisfy punctuation', password: 'Abcdef1 ', valid: false },
  { description: 'Arabic-Indic decimal digit', password: 'Abcdef١!', valid: true },
  { description: 'supplementary-plane symbol', password: 'Abcdef1😀', valid: true },
  { description: 'missing punctuation or symbol', password: 'Abcdef1', valid: false },
  { description: 'combining mark does not satisfy punctuation', password: 'Abcdef1\u0301', valid: false },
  { description: 'newline is forbidden', password: 'Abcdef1!\n', valid: false },
  { description: 'zero-width joiner is forbidden', password: 'Abcdef1!\u200d', valid: false }
] as const;

export const postNfcLengthExamples = {
  seven: 'A\u0301bcd1!x',
  eight: 'A\u0301bcde1!x',
  oneTwentyEight: `A\u0301${'b'.repeat(124)}1!x`,
  oneTwentyNine: `A\u0301${'b'.repeat(125)}1!x`
} as const;

export const forbiddenCategoryExamples = [
  { category: 'Cc control', password: 'Abcdef1!\u0000' },
  { category: 'Cf formatting control', password: 'Abcdef1!\u200e' },
  { category: 'Cs lone high surrogate', password: 'Abcdef1!\ud800' },
  { category: 'Cs lone low surrogate', password: 'Abcdef1!\udc00' },
  { category: 'Zl line separator', password: 'Abcdef1!\u2028' },
  { category: 'Zp paragraph separator', password: 'Abcdef1!\u2029' }
] as const;

export const composedPassword = 'Abcdéf1!';
export const decomposedPassword = 'Abcde\u0301f1!';
export const preservedCombiningMarkPassword = '\u0301Abcdef1!';
