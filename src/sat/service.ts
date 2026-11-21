import { type AnkiGateway, NOTE_MODEL_NAME, type NewAnkiNote } from '../anki-connect.js';
import { ToolError } from '../errors.js';
import type { PreviewStore } from './preview-store.js';
import {
  type RawQuestion,
  SAT_TAG,
  type SatQuestion,
  validateQuestions,
} from './questions.js';
import { quizTag, QUIZ_MODEL, QUIZ_TAG, renderQuizForm, renderQuizKey } from './quiz.js';
import { renderBack, renderFront } from './render.js';

export interface PreviewInput {
  deck: string;
  questions: readonly RawQuestion[];
}

export interface PreviewQuestion {
  number: number;
  tag: string;
  status: 'new' | 'duplicate';
  existingNoteId?: number;
  front: string;
  back: string;
}

export interface PreviewReport {
  previewToken: string;
  expiresAt: string;
  /** Anki's exact name when the deck exists. Otherwise the requested name, which commit creates. */
  deck: string;
  deckExists: boolean;
  /** True when commit will create the deck: the deck is missing and at least one question is new. */
  deckWillBeCreated: boolean;
  summary: { questions: number; new: number; duplicates: number };
  questions: PreviewQuestion[];
  note: string;
}

export interface CommitQuestion {
  number: number;
  tag: string;
  status: 'added' | 'duplicate' | 'failed';
  noteId?: number;
  reason?: string;
}

export interface QuizPreviewReport {
  previewToken: string;
  expiresAt: string;
  deck: string;
  deckExists: boolean;
  deckWillBeCreated: boolean;
  questionCount: number;
  status: 'new' | 'duplicate';
  existingNoteId?: number;
  prompts: string[];
}

export interface CommitReport {
  quizQuestionCount?: number;
  deck: string;
  /** True when this commit created the deck. */
  deckCreated: boolean;
  summary: { added: number; duplicates: number; failed: number };
  questions: CommitQuestion[];
}

const NOT_ADDED_REASON =
  'Anki did not add this note. A note with the same Front field may already exist in this note type.';

/** Trims a deck name and rejects blank or control-character names. */
export function cleanDeckName(raw: string): string {
  const name = raw.trim();
  if (name === '') {
    throw new ToolError('Deck name is blank.');
  }
  if (/[\u0000-\u001F\u007F]/.test(name)) {
    throw new ToolError('Deck name contains control characters.');
  }
  return name;
}

/** Finds a deck by name without regard to letter case. Returns Anki's exact spelling. */
function findDeck(names: readonly string[], requested: string): string | undefined {
  const wanted = requested.toLowerCase();
  return names.find((name) => name.toLowerCase() === wanted);
}

export function validBatchOrThrow(questions: readonly RawQuestion[]): SatQuestion[] {
  const result = validateQuestions(questions);
  if (!result.ok) {
    const lines = result.issues.map((issue) => `- ${issue}`);
    throw new ToolError(
      ['Fix these questions and try again:', ...lines].join(
        '\n',
      ),
    );
  }
  return result.questions;
}

/** Anki search for the notes that carry a question's tag. The tag has only [a-z0-9-] characters. */
function tagQuery(tag: string): string {
  return `tag:${tag}`;
}

function buildNote(deckName: string, question: SatQuestion): NewAnkiNote {
  return {
    deckName,
    modelName: NOTE_MODEL_NAME,
    fields: { Front: renderFront(question), Back: renderBack(question) },
    tags: [SAT_TAG, question.tag],
    // allowDuplicate stays false, so Anki's own check on the Front field also applies.
    options: { allowDuplicate: false },
  };
}

/** Tells the client what commit will do with the deck. */
function previewNote(deck: string, deckExists: boolean, newCount: number): string {
  if (deckExists) {
    return 'Nothing has been written to Anki. Call commit_sat_preview with previewToken to add the new questions.';
  }
  if (newCount === 0) {
    return (
      `Nothing has been written to Anki. Deck "${deck}" does not exist yet, and every question ` +
      'is already in Anki. commit_sat_preview will add nothing and will not create the deck.'
    );
  }
  return (
    `Nothing has been written to Anki. Deck "${deck}" does not exist yet. commit_sat_preview ` +
    'will create it before adding the new questions. Call commit_sat_preview with previewToken to add them.'
  );
}

export class SatService {
  readonly #anki: AnkiGateway;
  readonly #previews: PreviewStore;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: { anki: AnkiGateway; previews: PreviewStore }) {
    this.#anki = options.anki;
    this.#previews = options.previews;
  }

  async listDecks(): Promise<string[]> {
    const names = await this.#anki.deckNames();
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  async checkDeck(requested: string): Promise<{ requested: string; exists: boolean; name: string | null }> {
    const wanted = cleanDeckName(requested);
    const name = findDeck(await this.#anki.deckNames(), wanted);
    return { requested: wanted, exists: name !== undefined, name: name ?? null };
  }

  /**
   * Validates a batch and reports, for each question, whether Anki already has a note with
   * its tag. It also reports whether the deck exists and whether commit will create it.
   * Writes nothing to Anki. The batch is stored under a token for commit(), which looks the
   * deck up again.
   */
  async preview(input: PreviewInput): Promise<PreviewReport> {
    const requested = cleanDeckName(input.deck);
    const questions = validBatchOrThrow(input.questions);
    const existingDeck = findDeck(await this.#anki.deckNames(), requested);

    const report: PreviewQuestion[] = [];
    for (const [index, question] of questions.entries()) {
      const [existingNote] = await this.#anki.findNotes(tagQuery(question.tag));
      report.push({
        number: index + 1,
        tag: question.tag,
        status: existingNote === undefined ? 'new' : 'duplicate',
        existingNoteId: existingNote,
        front: renderFront(question),
        back: renderBack(question),
      });
    }

    // The requested name is stored, not Anki's spelling, so commit() does its own lookup.
    const { token, expiresAt } = this.#previews.create(requested, questions);
    const duplicates = report.filter((item) => item.status === 'duplicate').length;
    const newCount = report.length - duplicates;
    const deckExists = existingDeck !== undefined;
    const deck = existingDeck ?? requested;
    return {
      previewToken: token,
      expiresAt: new Date(expiresAt).toISOString(),
      deck,
      deckExists,
      deckWillBeCreated: !deckExists && newCount > 0,
      summary: { questions: report.length, new: newCount, duplicates },
      questions: report,
      note: previewNote(deck, deckExists, newCount),
    };
  }

  async previewQuiz(input: PreviewInput): Promise<QuizPreviewReport> {
    const requested = cleanDeckName(input.deck);
    const questions = validBatchOrThrow(input.questions);
    const existingDeck = findDeck(await this.#anki.deckNames(), requested);
    const [existingNoteId] = await this.#anki.findNotes(tagQuery(quizTag(questions)));
    const { token, expiresAt } = this.#previews.create(requested, questions, 'quiz');
    return {
      previewToken: token,
      expiresAt: new Date(expiresAt).toISOString(),
      deck: existingDeck ?? requested,
      deckExists: existingDeck !== undefined,
      deckWillBeCreated: existingDeck === undefined && existingNoteId === undefined,
      questionCount: questions.length,
      status: existingNoteId === undefined ? 'new' : 'duplicate',
      ...(existingNoteId !== undefined && { existingNoteId }),
      prompts: questions.map((question) => question.stem),
    };
  }

  /** Creates a dedicated note type on first use. Existing note types are never edited. */
  async #ensureQuizModel(): Promise<void> {
    const modelName = QUIZ_MODEL.modelName;
    if (!(await this.#anki.modelNames()).includes(modelName)) {
      await this.#anki.createModel(QUIZ_MODEL);
      return;
    }
    const fields = await this.#anki.modelFieldNames(modelName);
    if (fields.length !== 2 || fields[0] !== 'Front' || fields[1] !== 'Back') {
      throw new ToolError('The existing ' + modelName + ' note type has incompatible fields.');
    }
  }

  /**
   * Adds the notes from a preview. The token is spent before the first await, so two calls
   * with one token cannot both succeed. Each question is checked again with findNotes, and
   * commits run one at a time, so the same question is never added twice. The deck is looked
   * up by name without regard to case. If it exists, its exact name is used and it is not
   * created again. If it is missing and at least one note will be added, it is created once,
   * with the requested name, before addNotes runs.
   */
  async commit(token: string): Promise<CommitReport> {
    const pending = this.#previews.take(token);
    return this.#serialized(async () => {
      const existingDeck = findDeck(await this.#anki.deckNames(), pending.deck);

      const candidates = pending.format === 'quiz'
        ? [{
            tag: quizTag(pending.questions),
            build: (deck: string): NewAnkiNote => ({
              deckName: deck,
              modelName: QUIZ_MODEL.modelName,
              fields: {
                Front: renderQuizForm(pending.deck, pending.questions),
                Back: renderQuizKey(pending.deck, pending.questions),
              },
              tags: [QUIZ_TAG, quizTag(pending.questions)],
              options: { allowDuplicate: false },
            }),
          }]
        : pending.questions.map((question) => ({
            tag: question.tag,
            build: (deck: string) => buildNote(deck, question),
          }));

      const existingIds: (number | undefined)[] = [];
      for (const candidate of candidates) {
        const [existing] = await this.#anki.findNotes(tagQuery(candidate.tag));
        existingIds.push(existing);
      }

      const fresh = candidates.flatMap((candidate, index) =>
        existingIds[index] === undefined ? [{ index, candidate }] : [],
      );
      if (pending.format === 'quiz' && fresh.length > 0) await this.#ensureQuizModel();

      // A missing deck is created only when a note is about to go into it.
      const deckCreated = existingDeck === undefined && fresh.length > 0;
      if (deckCreated) {
        await this.#anki.createDeck(pending.deck);
      }
      const deck = existingDeck ?? pending.deck;

      const addedIds =
        fresh.length === 0
          ? []
          : await this.#anki.addNotes(fresh.map(({ candidate }) => candidate.build(deck)));
      if (addedIds.length !== fresh.length) {
        throw new ToolError(
          'AnkiConnect returned an unexpected number of results. Some notes may have been added. ' +
            'Check the deck before running preview_sat_questions again.',
        );
      }

      const addedByIndex = new Map<number, number | null | undefined>();
      fresh.forEach((item, position) => addedByIndex.set(item.index, addedIds[position]));

      const questions = candidates.map((candidate, index): CommitQuestion => {
        const base = { number: index + 1, tag: candidate.tag };
        const existing = existingIds[index];
        if (existing !== undefined) {
          return { ...base, status: 'duplicate', noteId: existing };
        }
        const addedId = addedByIndex.get(index);
        if (typeof addedId === 'number') {
          return { ...base, status: 'added', noteId: addedId };
        }
        return { ...base, status: 'failed', reason: NOT_ADDED_REASON };
      });

      const count = (status: CommitQuestion['status']): number =>
        questions.filter((item) => item.status === status).length;
      return {
        deck,
        deckCreated,
        ...(pending.format === 'quiz' && { quizQuestionCount: pending.questions.length }),
        summary: { added: count('added'), duplicates: count('duplicate'), failed: count('failed') },
        questions,
      };
    });
  }

  #serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task);
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
