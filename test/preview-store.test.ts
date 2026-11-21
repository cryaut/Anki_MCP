import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PreviewStore } from '../src/sat/preview-store.js';
import type { SatQuestion } from '../src/sat/questions.js';

const TEN_MINUTES = 10 * 60_000;

function question(): SatQuestion {
  return {
    stem: 'Choose the word.',
    choices: { A: 'alpha', B: 'beta', C: 'gamma', D: 'delta' },
    answer: 'C',
    explanation: undefined,
    tag: 'sat-mcq-0000000000000000',
  };
}

describe('PreviewStore tokens', () => {
  it('issues opaque base64url tokens that do not reveal the deck or the content', () => {
    const store = new PreviewStore({ ttlMs: TEN_MINUTES, maxEntries: 5 });
    const { token } = store.create('SAT::Math', [question()]);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(!token.includes('SAT'));
  });

  it('issues a different token for each preview', () => {
    const store = new PreviewStore({ ttlMs: TEN_MINUTES, maxEntries: 5 });
    const first = store.create('SAT::Math', [question()]).token;
    const second = store.create('SAT::Math', [question()]).token;
    assert.notEqual(first, second);
  });

  it('returns the batch once, then refuses the same token', () => {
    const store = new PreviewStore({ ttlMs: TEN_MINUTES, maxEntries: 5 });
    const { token } = store.create('SAT::Math', [question()]);

    const taken = store.take(token);
    assert.equal(taken.deck, 'SAT::Math');
    assert.equal(taken.questions.length, 1);
    assert.throws(() => store.take(token), /Unknown or already used previewToken/);
    assert.equal(store.size, 0);
  });

  it('refuses a token it never issued', () => {
    const store = new PreviewStore({ ttlMs: TEN_MINUTES, maxEntries: 5 });
    assert.throws(() => store.take('not-issued'), /Unknown or already used previewToken/);
  });
});

describe('PreviewStore expiry', () => {
  it('accepts a token one millisecond before its expiry time', () => {
    let now = 0;
    const store = new PreviewStore({ ttlMs: TEN_MINUTES, maxEntries: 5, now: () => now });
    const { token, expiresAt } = store.create('SAT::Math', [question()]);
    assert.equal(expiresAt, TEN_MINUTES);

    now = TEN_MINUTES - 1;
    assert.equal(store.take(token).deck, 'SAT::Math');
  });

  it('refuses a token at its expiry time', () => {
    let now = 0;
    const store = new PreviewStore({ ttlMs: TEN_MINUTES, maxEntries: 5, now: () => now });
    const { token } = store.create('SAT::Math', [question()]);

    now = TEN_MINUTES;
    assert.throws(() => store.take(token), /previewToken expired after 10 minutes/);
    assert.equal(store.size, 0);
  });

  it('removes expired previews when a new one is created', () => {
    let now = 0;
    const store = new PreviewStore({ ttlMs: TEN_MINUTES, maxEntries: 5, now: () => now });
    store.create('SAT::Math', [question()]);
    store.create('SAT::Math', [question()]);
    assert.equal(store.size, 2);

    now = TEN_MINUTES;
    store.create('SAT::Math', [question()]);
    assert.equal(store.size, 1);
  });
});

describe('PreviewStore size bound', () => {
  it('evicts the oldest preview when the store is full', () => {
    const tokens = ['token-a', 'token-b', 'token-c'];
    const store = new PreviewStore({
      ttlMs: TEN_MINUTES,
      maxEntries: 2,
      createToken: () => tokens.shift() ?? 'exhausted',
    });
    store.create('SAT::Math', [question()]);
    store.create('SAT::Math', [question()]);
    store.create('SAT::Math', [question()]);

    assert.equal(store.size, 2);
    assert.throws(() => store.take('token-a'), /Unknown or already used/);
    assert.equal(store.take('token-b').deck, 'SAT::Math');
    assert.equal(store.take('token-c').deck, 'SAT::Math');
  });
});
