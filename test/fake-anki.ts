import { AnkiConnectError, type AnkiGateway, type NewAnkiModel, type NewAnkiNote } from '../src/anki-connect.js';
import { PreviewStore } from '../src/sat/preview-store.js';
import { SatService } from '../src/sat/service.js';

/**
 * In-memory stand-in for AnkiConnect. Tag searches work like Anki's: a note added with a
 * tag can be found by "tag:<name>". Every write is recorded, so tests can prove that
 * nothing was written.
 *
 * Deck names match exactly here, so a test fails when the service uses a name other than the
 * one it should. addNotes refuses a deck that does not exist, as AnkiConnect does.
 */
export class FakeAnki implements AnkiGateway {
  decks: string[] = ['Default', 'SAT::Math'];
  readonly notesByTag = new Map<string, number[]>();
  readonly findQueries: string[] = [];
  readonly addBatches: NewAnkiNote[][] = [];
  /** Names passed to createDeck, in call order. */
  readonly createdDecks: string[] = [];
  readonly createdModels: NewAnkiModel[] = [];
  /** Every AnkiConnect call in order, for example "deckNames" or "createDeck Biology". */
  readonly log: string[] = [];
  refuseAll = false;
  refuseCreateDeck = false;
  addDelayMs = 0;
  #nextId = 1_700_000_000_000;
  #nextDeckId = 1_600_000_000_000;

  async modelNames(): Promise<string[]> {
    return this.createdModels.map((model) => model.modelName);
  }

  async modelFieldNames(modelName: string): Promise<string[]> {
    return this.createdModels.find((model) => model.modelName === modelName)?.inOrderFields ?? [];
  }

  async createModel(model: NewAnkiModel): Promise<void> {
    this.createdModels.push(model);
  }

  async deckNames(): Promise<string[]> {
    this.log.push('deckNames');
    return [...this.decks];
  }

  /** Adds the deck unless one with this name already exists, ignoring case, as Anki does. */
  async createDeck(name: string): Promise<number> {
    this.log.push(`createDeck ${name}`);
    this.createdDecks.push(name);
    if (this.refuseCreateDeck) {
      throw new AnkiConnectError('AnkiConnect rejected createDeck: refused by the test.');
    }
    const exists = this.decks.some((deck) => deck.toLowerCase() === name.toLowerCase());
    if (!exists) {
      this.decks.push(name);
    }
    return this.#nextDeckId++;
  }

  async findNotes(query: string): Promise<number[]> {
    this.findQueries.push(query);
    this.log.push(`findNotes ${query}`);
    const tag = /^tag:(.+)$/.exec(query)?.[1];
    if (tag === undefined) {
      throw new Error(`FakeAnki does not understand query: ${query}`);
    }
    return [...(this.notesByTag.get(tag) ?? [])];
  }

  async addNotes(notes: NewAnkiNote[]): Promise<(number | null)[]> {
    this.log.push(`addNotes ${notes.length}`);
    if (this.addDelayMs > 0) {
      await delay(this.addDelayMs);
    }
    for (const note of notes) {
      if (!this.decks.includes(note.deckName)) {
        throw new AnkiConnectError(`AnkiConnect rejected addNotes: deck was not found: ${note.deckName}`);
      }
    }
    this.addBatches.push(notes);
    return notes.map((note) => {
      if (this.refuseAll) {
        return null;
      }
      const id = this.#nextId++;
      for (const tag of note.tags) {
        this.notesByTag.set(tag, [...(this.notesByTag.get(tag) ?? []), id]);
      }
      return id;
    });
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function makeService(
  anki: FakeAnki = new FakeAnki(),
  options: { now?: () => number } = {},
): { anki: FakeAnki; previews: PreviewStore; service: SatService } {
  const previews = new PreviewStore({ ttlMs: 10 * 60_000, maxEntries: 20, now: options.now });
  return { anki, previews, service: new SatService({ anki, previews }) };
}
