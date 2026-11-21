import { z } from 'zod';
import { ToolError } from './errors.js';

/**
 * AnkiConnect endpoint. It is hard-coded on purpose: no setting or input can point
 * this server at another host.
 */
export const ANKI_CONNECT_URL = 'http://127.0.0.1:8765/';

const ANKI_CONNECT_API_VERSION = 6;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ERROR_CHARS = 500;

/** Note type for generated cards. It must exist in Anki with fields named Front and Back. */
export const NOTE_MODEL_NAME = 'Basic';

export interface NewAnkiNote {
  deckName: string;
  modelName: string;
  fields: { Front: string; Back: string };
  tags: string[];
  options: { allowDuplicate: boolean };
}

export interface NewAnkiModel {
  modelName: string;
  inOrderFields: string[];
  cardTemplates: { Name: string; Front: string; Back: string }[];
  css: string;
}

/** The only AnkiConnect operations this server performs. */
export interface AnkiGateway {
  deckNames(): Promise<string[]>;
  modelNames(): Promise<string[]>;
  modelFieldNames(modelName: string): Promise<string[]>;
  createModel(model: NewAnkiModel): Promise<void>;
  /** Creates the deck if it is missing. Returns the deck's ID. */
  createDeck(name: string): Promise<number>;
  findNotes(query: string): Promise<number[]>;
  addNotes(notes: NewAnkiNote[]): Promise<(number | null)[]>;
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface AnkiConnectOptions {
  /** Replaced in tests. Defaults to the global fetch. */
  fetch?: FetchFn;
  timeoutMs?: number;
  apiKey?: string;
}

export class AnkiConnectError extends ToolError {
  constructor(message: string) {
    super(message);
    this.name = 'AnkiConnectError';
  }
}

type AnkiAction = 'deckNames' | 'createDeck' | 'findNotes' | 'addNotes' |
  'modelNames' | 'modelFieldNames' | 'createModel';

const EnvelopeSchema = z.object({
  result: z.unknown(),
  error: z.string().nullable(),
});

const DeckNamesResult = z.array(z.string());
const DeckIdResult = z.number().int();
const FindNotesResult = z.array(z.number().int());
const AddNotesResult = z.array(z.number().int().nullable());

export class AnkiConnectClient implements AnkiGateway {
  readonly #fetch: FetchFn;
  readonly #timeoutMs: number;
  readonly #apiKey: string | undefined;

  constructor(options: AnkiConnectOptions = {}) {
    this.#fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#apiKey = options.apiKey;
  }

  deckNames(): Promise<string[]> {
    return this.#invoke('deckNames', {}, DeckNamesResult);
  }

  modelNames(): Promise<string[]> {
    return this.#invoke('modelNames', {}, z.array(z.string()));
  }

  modelFieldNames(modelName: string): Promise<string[]> {
    return this.#invoke('modelFieldNames', { modelName }, z.array(z.string()));
  }

  async createModel(model: NewAnkiModel): Promise<void> {
    await this.#invoke('createModel', model, z.object({ id: z.number().int() }));
  }

  createDeck(name: string): Promise<number> {
    return this.#invoke('createDeck', { deck: name }, DeckIdResult);
  }

  findNotes(query: string): Promise<number[]> {
    return this.#invoke('findNotes', { query }, FindNotesResult);
  }

  addNotes(notes: NewAnkiNote[]): Promise<(number | null)[]> {
    return this.#invoke('addNotes', { notes }, AddNotesResult);
  }

  async #invoke<T>(action: AnkiAction, params: object, resultSchema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetch(ANKI_CONNECT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, version: ANKI_CONNECT_API_VERSION, params, key: this.#apiKey }),
        redirect: 'error',
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      throw new AnkiConnectError(this.#transportMessage(error));
    }

    if (!response.ok) {
      throw new AnkiConnectError(`AnkiConnect answered with HTTP ${response.status}.`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AnkiConnectError('AnkiConnect sent a body that is not valid JSON.');
    }

    const envelope = EnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      throw new AnkiConnectError('AnkiConnect sent an unexpected response.');
    }
    if (envelope.data.error !== null) {
      const reason = envelope.data.error.slice(0, MAX_ERROR_CHARS);
      throw new AnkiConnectError(`AnkiConnect rejected ${action}: ${reason}`);
    }

    const result = resultSchema.safeParse(envelope.data.result);
    if (!result.success) {
      throw new AnkiConnectError(`AnkiConnect returned an unexpected result for ${action}.`);
    }
    return result.data;
  }

  #transportMessage(error: unknown): string {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return `AnkiConnect did not answer within ${this.#timeoutMs / 1000} seconds.`;
    }
    return (
      'Cannot reach AnkiConnect at 127.0.0.1:8765. ' +
      'Open Anki and check that the AnkiConnect add-on is enabled, or use export_sat_quiz for offline practice.'
    );
  }
}
