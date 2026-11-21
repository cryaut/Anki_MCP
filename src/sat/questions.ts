import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;
export type ChoiceLetter = (typeof CHOICE_LETTERS)[number];

/** Tag shared by every note this server creates. Per-question tags add to it. */
export const SAT_TAG = 'sat-mcq';

export const LIMITS = {
  deckNameChars: 200,
  stemChars: 4000,
  choiceChars: 1000,
  explanationChars: 4000,
  questionsPerPreview: 50,
  tokenChars: 128,
} as const;

const choiceSchema = z.string().min(1).max(LIMITS.choiceChars);

/** Input schema for one question. Strict, so a fifth choice or an unknown key is rejected. */
export const questionSchema = z.strictObject({
  stem: z
    .string()
    .min(1)
    .max(LIMITS.stemChars)
    .describe('The question text as plain text. Line breaks are allowed.'),
  choices: z
    .strictObject({
      A: choiceSchema.describe('Choice A as one line of plain text.'),
      B: choiceSchema.describe('Choice B as one line of plain text.'),
      C: choiceSchema.describe('Choice C as one line of plain text.'),
      D: choiceSchema.describe('Choice D as one line of plain text.'),
    })
    .describe('Exactly four choices labeled A, B, C, and D. No other keys.'),
  answer: z.enum(CHOICE_LETTERS).describe('Letter of the correct choice: A, B, C, or D.'),
  explanation: z
    .string()
    .max(LIMITS.explanationChars)
    .optional()
    .describe('Optional explanation of the answer as plain text. Shown on the back of the card.'),
});

export const deckNameSchema = z
  .string()
  .min(1)
  .max(LIMITS.deckNameChars)
  .describe('Name of an Anki deck. Matched without regard to letter case.');

/** Raw shape for the preview tool. The MCP SDK wraps it in an object schema. */
export const previewInputShape = {
  deck: deckNameSchema.describe(
    'Deck for the notes. If the deck is missing, commit_sat_preview creates it when at least one question is new.',
  ),
  questions: z
    .array(questionSchema)
    .min(1)
    .max(LIMITS.questionsPerPreview)
    .describe('One to fifty SAT multiple-choice questions.'),
};

/** A question as received from the client, before cleaning. */
export interface RawQuestion {
  stem: string;
  choices: Record<ChoiceLetter, string>;
  answer: ChoiceLetter;
  explanation?: string | undefined;
}

/** A cleaned question with its stable tag. */
export interface SatQuestion {
  stem: string;
  choices: Record<ChoiceLetter, string>;
  answer: ChoiceLetter;
  explanation: string | undefined;
  tag: string;
}

export type ValidationResult =
  | { ok: true; questions: SatQuestion[] }
  | { ok: false; issues: string[] };

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function hasControlCharacters(text: string): boolean {
  return CONTROL_CHARACTERS.test(text);
}

interface FieldRule {
  required: boolean;
  singleLine: boolean;
}

const STEM_RULE: FieldRule = { required: true, singleLine: false };
const CHOICE_RULE: FieldRule = { required: true, singleLine: true };
const EXPLANATION_RULE: FieldRule = { required: false, singleLine: false };

/** Cleans one text field and records a problem for each rule it breaks. */
function cleanField(value: string, label: string, rule: FieldRule, issues: string[]): string {
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (text === '') {
    if (rule.required) {
      issues.push(`${label} is blank.`);
    }
    return text;
  }
  if (hasControlCharacters(text)) {
    issues.push(`${label} contains control characters.`);
  }
  if (rule.singleLine && text.includes('\n')) {
    issues.push(`${label} must be on one line.`);
  }
  return text;
}

/** Comparison form for duplicate checks: whitespace collapsed and letters lower-cased. */
export function identityKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Stable per-question tag. It depends only on the stem, the four choices, and the answer
 * letter, so the same question always gets the same tag. Explanations and spacing
 * differences do not change it.
 */
export function questionTag(question: Pick<SatQuestion, 'stem' | 'choices' | 'answer'>): string {
  const material = JSON.stringify([
    identityKey(question.stem),
    ...CHOICE_LETTERS.map((letter) => identityKey(question.choices[letter])),
    question.answer,
  ]);
  const digest = createHash('sha256').update(material, 'utf8').digest('hex');
  return `${SAT_TAG}-${digest.slice(0, 16)}`;
}

/**
 * Checks and cleans a batch. Every problem is reported, so the caller can fix them in one pass.
 * Questions that repeat an earlier question in the same batch are rejected.
 */
export function validateQuestions(raw: readonly RawQuestion[]): ValidationResult {
  const issues: string[] = [];
  const questions: SatQuestion[] = [];
  const firstNumberByTag = new Map<string, number>();

  raw.forEach((item, index) => {
    const number = index + 1;
    const label = `question ${number}`;
    const issuesBefore = issues.length;

    const stem = cleanField(item.stem, `${label} stem`, STEM_RULE, issues);
    const choices: Record<ChoiceLetter, string> = {
      A: cleanField(item.choices.A, `${label} choice A`, CHOICE_RULE, issues),
      B: cleanField(item.choices.B, `${label} choice B`, CHOICE_RULE, issues),
      C: cleanField(item.choices.C, `${label} choice C`, CHOICE_RULE, issues),
      D: cleanField(item.choices.D, `${label} choice D`, CHOICE_RULE, issues),
    };

    const letterByKey = new Map<string, ChoiceLetter>();
    for (const letter of CHOICE_LETTERS) {
      if (choices[letter] === '') {
        continue;
      }
      const key = identityKey(choices[letter]);
      const earlier = letterByKey.get(key);
      if (earlier === undefined) {
        letterByKey.set(key, letter);
      } else {
        issues.push(`${label} choices ${earlier} and ${letter} have the same text.`);
      }
    }

    if (!CHOICE_LETTERS.includes(item.answer)) {
      issues.push(`${label} answer must be A, B, C, or D.`);
    }

    const explanationText =
      item.explanation === undefined
        ? ''
        : cleanField(item.explanation, `${label} explanation`, EXPLANATION_RULE, issues);
    const explanation = explanationText === '' ? undefined : explanationText;

    const tag = questionTag({ stem, choices, answer: item.answer });
    if (issues.length === issuesBefore) {
      const firstNumber = firstNumberByTag.get(tag);
      if (firstNumber === undefined) {
        firstNumberByTag.set(tag, number);
      } else {
        issues.push(`${label} repeats question ${firstNumber} (same stem, choices, and answer).`);
      }
    }

    questions.push({ stem, choices, answer: item.answer, explanation, tag });
  });

  return issues.length === 0 ? { ok: true, questions } : { ok: false, issues };
}
