import { randomBytes } from 'node:crypto';
import { ToolError } from '../errors.js';
import type { SatQuestion } from './questions.js';

export const PREVIEW_TTL_MINUTES = 10;
export const MAX_PENDING_PREVIEWS = 20;

export interface PendingPreview {
  deck: string;
  questions: SatQuestion[];
  format?: 'quiz';
}

export interface PreviewStoreOptions {
  ttlMs: number;
  maxEntries: number;
  /** Clock in epoch milliseconds. Replaced in tests. */
  now?: () => number;
  /** Token source. Defaults to 32 random bytes, base64url encoded. */
  createToken?: () => string;
}

interface Entry extends PendingPreview {
  expiresAt: number;
}

/**
 * Holds previewed batches in memory, keyed by an opaque random token. A token works once,
 * expires after the TTL, and is gone when the process exits.
 */
export class PreviewStore {
  readonly #entries = new Map<string, Entry>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;
  readonly #createToken: () => string;

  constructor(options: PreviewStoreOptions) {
    this.#ttlMs = options.ttlMs;
    this.#maxEntries = options.maxEntries;
    this.#now = options.now ?? (() => Date.now());
    this.#createToken = options.createToken ?? (() => randomBytes(32).toString('base64url'));
  }

  get size(): number {
    return this.#entries.size;
  }

  /** Stores a batch and returns its token and expiry time in epoch milliseconds. */
  create(deck: string, questions: SatQuestion[], format?: 'quiz'): { token: string; expiresAt: number } {
    this.#purgeExpired();
    while (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.#entries.delete(oldest);
    }

    const token = this.#createToken();
    const expiresAt = this.#now() + this.#ttlMs;
    this.#entries.set(token, { deck, questions, expiresAt, ...(format && { format }) });
    return { token, expiresAt };
  }

  /** Returns the batch for a token and removes the token, so it cannot be used again. */
  take(token: string): PendingPreview {
    const entry = this.#entries.get(token);
    if (entry === undefined) {
      throw new ToolError('Unknown or already used previewToken. Run the corresponding preview tool again.');
    }
    this.#entries.delete(token);
    if (this.#now() >= entry.expiresAt) {
      throw new ToolError(
        `previewToken expired after ${PREVIEW_TTL_MINUTES} minutes. Run the corresponding preview tool again.`,
      );
    }
    const { deck, questions, format } = entry;
    return { deck, questions, ...(format && { format }) };
  }

  #purgeExpired(): void {
    const now = this.#now();
    for (const [token, entry] of this.#entries) {
      if (now >= entry.expiresAt) {
        this.#entries.delete(token);
      }
    }
  }
}
