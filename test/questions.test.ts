import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import {
  CHOICE_LETTERS,
  type ChoiceLetter,
  previewInputShape,
  type RawQuestion,
  questionSchema,
  questionTag,
  type SatQuestion,
  validateQuestions,
  type ValidationResult,
} from '../src/sat/questions.js';

function rawQuestion(overrides: Partial<RawQuestion> = {}): RawQuestion {
  return {
    stem: 'Which choice best completes the text? The results were ____.',
    choices: { A: 'inconclusive', B: 'conclusive', C: 'hidden', D: 'exact' },
    answer: 'B',
    explanation: 'Conclusive fits the sentence logic.',
    ...overrides,
  };
}

function expectValid(result: ValidationResult): SatQuestion[] {
  if (!result.ok) {
    assert.fail(`expected a valid batch, got: ${result.issues.join(' | ')}`);
  }
  return result.questions;
}

function expectIssues(result: ValidationResult): string[] {
  if (result.ok) {
    assert.fail('expected the batch to be rejected');
  }
  return result.issues;
}

describe('validateQuestions', () => {
  it('accepts a well-formed question, trims it, and drops a blank explanation', () => {
    const [item] = expectValid(
      validateQuestions([rawQuestion({ stem: '  Which word fits?  ', explanation: '   ' })]),
    );
    assert.ok(item);
    assert.equal(item.stem, 'Which word fits?');
    assert.equal(item.explanation, undefined);
    assert.match(item.tag, /^sat-mcq-[0-9a-f]{16}$/);
  });

  it('normalizes CRLF line endings in multi-line stems', () => {
    const [item] = expectValid(validateQuestions([rawQuestion({ stem: 'Line one.\r\nLine two?' })]));
    assert.equal(item?.stem, 'Line one.\nLine two?');
  });

  it('reports blank fields with their question number', () => {
    const issues = expectIssues(
      validateQuestions([
        rawQuestion({ stem: '   ' }),
        rawQuestion({ choices: { A: 'x', B: '  ', C: 'y', D: 'z' } }),
      ]),
    );
    assert.ok(issues.includes('question 1 stem is blank.'), issues.join(' | '));
    assert.ok(issues.includes('question 2 choice B is blank.'), issues.join(' | '));
  });

  it('rejects a choice that spans several lines', () => {
    const issues = expectIssues(
      validateQuestions([rawQuestion({ choices: { A: 'a', B: 'line one\nline two', C: 'c', D: 'd' } })]),
    );
    assert.ok(issues.includes('question 1 choice B must be on one line.'), issues.join(' | '));
  });

  it('treats choices that differ only in letter case or spacing as the same text', () => {
    const issues = expectIssues(
      validateQuestions([rawQuestion({ choices: { A: 'Big  Idea', B: 'x', C: 'big idea', D: 'y' } })]),
    );
    assert.ok(issues.includes('question 1 choices A and C have the same text.'), issues.join(' | '));
  });

  it('rejects control characters', () => {
    const issues = expectIssues(validateQuestions([rawQuestion({ stem: 'bad\u0007bell' })]));
    assert.ok(issues.includes('question 1 stem contains control characters.'), issues.join(' | '));
  });

  it('rejects a question that repeats an earlier one in the same batch', () => {
    const issues = expectIssues(
      validateQuestions([rawQuestion(), rawQuestion({ explanation: 'A different explanation.' })]),
    );
    assert.ok(
      issues.includes('question 2 repeats question 1 (same stem, choices, and answer).'),
      issues.join(' | '),
    );
  });

  it('rejects an answer letter outside A to D even when the caller bypasses the schema', () => {
    const invalid = 'E' as unknown as ChoiceLetter;
    const issues = expectIssues(validateQuestions([rawQuestion({ answer: invalid })]));
    assert.ok(issues.includes('question 1 answer must be A, B, C, or D.'), issues.join(' | '));
  });
});

describe('questionTag', () => {
  it('is stable across spacing and letter case and ignores the explanation', () => {
    const base = rawQuestion();
    const variant = rawQuestion({
      stem: '  WHICH choice best completes the text?   The results were ____. ',
      choices: { A: ' inconclusive ', B: 'CONCLUSIVE', C: 'hidden', D: 'exact' },
      explanation: 'Something else entirely.',
    });
    const tagOf = (q: RawQuestion): string => questionTag({ stem: q.stem.trim(), choices: q.choices, answer: q.answer });
    assert.equal(tagOf(variant), tagOf(base));
  });

  it('changes when the answer letter changes', () => {
    const tagOf = (answer: ChoiceLetter): string =>
      questionTag({ stem: 'Q?', choices: { A: 'a', B: 'b', C: 'c', D: 'd' }, answer });
    assert.notEqual(tagOf('A'), tagOf('B'));
  });

  it('has the sat-mcq prefix followed by 16 lowercase hex digits', () => {
    const tag = questionTag({ stem: 'Q?', choices: { A: 'a', B: 'b', C: 'c', D: 'd' }, answer: 'A' });
    assert.match(tag, /^sat-mcq-[0-9a-f]{16}$/);
  });
});

describe('question input schema', () => {
  const validInput = {
    deck: 'SAT::Math',
    questions: [
      {
        stem: 'What is 2 + 2?',
        choices: { A: '3', B: '4', C: '5', D: '6' },
        answer: 'B',
      },
    ],
  };

  it('accepts a valid batch', () => {
    assert.equal(z.object(previewInputShape).safeParse(validInput).success, true);
  });

  it('rejects a fifth choice', () => {
    const input = structuredClone(validInput);
    input.questions[0]!.choices = { A: '3', B: '4', C: '5', D: '6', E: '7' } as never;
    assert.equal(z.object(previewInputShape).safeParse(input).success, false);
  });

  it('rejects a lowercase answer letter', () => {
    assert.equal(questionSchema.safeParse({ ...validInput.questions[0], answer: 'b' }).success, false);
  });

  it('rejects an empty batch and a batch over 50 questions', () => {
    const schema = z.object(previewInputShape);
    assert.equal(schema.safeParse({ deck: 'SAT::Math', questions: [] }).success, false);
    const fifty = Array.from({ length: 51 }, () => validInput.questions[0]);
    assert.equal(schema.safeParse({ deck: 'SAT::Math', questions: fifty }).success, false);
  });

  it('lists the four choice letters in order', () => {
    assert.deepEqual([...CHOICE_LETTERS], ['A', 'B', 'C', 'D']);
  });
});
