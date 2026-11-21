import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ANKI_CONNECT_URL,
  AnkiConnectClient,
  AnkiConnectError,
  type NewAnkiNote,
} from '../src/anki-connect.js';

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function recordingFetch(respond: () => Response | Promise<Response>): {
  calls: RecordedCall[];
  fetch: (url: string, init: RequestInit) => Promise<Response>;
} {
  const calls: RecordedCall[] = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return respond();
  };
  return { calls, fetch };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function onlyCall(calls: RecordedCall[]): RecordedCall {
  const [call] = calls;
  assert.ok(call, 'expected exactly one request');
  return call;
}

function bodyOf(call: RecordedCall): unknown {
  return JSON.parse(String(call.init.body));
}

const NOTE: NewAnkiNote = {
  deckName: 'SAT::Math',
  modelName: 'Basic',
  fields: { Front: '<div>Q</div>', Back: '<div>A</div>' },
  tags: ['sat-mcq', 'sat-mcq-0123456789abcdef'],
  options: { allowDuplicate: false },
};

describe('AnkiConnect request shape', () => {
  it('posts the AnkiConnect envelope to the fixed loopback URL with no redirects', async () => {
    const { calls, fetch } = recordingFetch(() => json({ result: ['Default'], error: null }));
    const client = new AnkiConnectClient({ fetch });

    assert.deepEqual(await client.deckNames(), ['Default']);

    const call = onlyCall(calls);
    assert.equal(ANKI_CONNECT_URL, 'http://127.0.0.1:8765/');
    assert.equal(call.url, 'http://127.0.0.1:8765/');
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.redirect, 'error');
    assert.ok(call.init.signal instanceof AbortSignal, 'a timeout signal must be attached');
    assert.deepEqual(bodyOf(call), { action: 'deckNames', version: 6, params: {} });
  });

  it('sends findNotes with the query as its only parameter', async () => {
    const { calls, fetch } = recordingFetch(() => json({ result: [1700000000001], error: null }));
    const client = new AnkiConnectClient({ fetch });

    assert.deepEqual(await client.findNotes('tag:sat-mcq-0123456789abcdef'), [1700000000001]);
    assert.deepEqual(bodyOf(onlyCall(calls)), {
      action: 'findNotes',
      version: 6,
      params: { query: 'tag:sat-mcq-0123456789abcdef' },
    });
  });

  it('sends addNotes and keeps null for any note Anki refused', async () => {
    const { calls, fetch } = recordingFetch(() => json({ result: [1700000000002, null], error: null }));
    const client = new AnkiConnectClient({ fetch });

    assert.deepEqual(await client.addNotes([NOTE, NOTE]), [1700000000002, null]);
    assert.deepEqual(bodyOf(onlyCall(calls)), {
      action: 'addNotes',
      version: 6,
      params: { notes: [NOTE, NOTE] },
    });
  });

  it('sends createDeck with the deck name as its only parameter and returns the deck ID', async () => {
    const { calls, fetch } = recordingFetch(() => json({ result: 1700000000003, error: null }));
    const client = new AnkiConnectClient({ fetch });

    assert.equal(await client.createDeck('SAT::Math'), 1700000000003);
    assert.deepEqual(bodyOf(onlyCall(calls)), {
      action: 'createDeck',
      version: 6,
      params: { deck: 'SAT::Math' },
    });
  });

  it('exposes only the allowed AnkiConnect operations', () => {
    const methods = Object.getOwnPropertyNames(AnkiConnectClient.prototype)
      .filter((name) => name !== 'constructor')
      .sort();
    assert.deepEqual(methods, ['addNotes', 'createDeck', 'createModel', 'deckNames', 'findNotes', 'modelFieldNames', 'modelNames']);
  });
});

describe('AnkiConnect failures', () => {
  it('surfaces the error text that AnkiConnect returns', async () => {
    const { fetch } = recordingFetch(() => json({ result: null, error: 'deck was not found: Nope' }));
    const client = new AnkiConnectClient({ fetch });

    await assert.rejects(
      client.addNotes([NOTE]),
      (error: unknown) =>
        error instanceof AnkiConnectError && error.message.includes('deck was not found: Nope'),
    );
  });

  it('reports a non-200 HTTP status', async () => {
    const { fetch } = recordingFetch(() => json({}, 500));
    await assert.rejects(new AnkiConnectClient({ fetch }).deckNames(), /HTTP 500/);
  });

  it('rejects a body that is not JSON', async () => {
    const { fetch } = recordingFetch(() => new Response('<html></html>', { status: 200 }));
    await assert.rejects(new AnkiConnectClient({ fetch }).deckNames(), /not valid JSON/);
  });

  it('rejects an envelope with the wrong shape', async () => {
    const { fetch } = recordingFetch(() => json({ answer: 42 }));
    await assert.rejects(new AnkiConnectClient({ fetch }).deckNames(), /unexpected response/);
  });

  it('rejects a result whose type does not match the action', async () => {
    const { fetch } = recordingFetch(() => json({ result: 'Default', error: null }));
    await assert.rejects(new AnkiConnectClient({ fetch }).deckNames(), /unexpected result for deckNames/);
  });

  it('rejects addNotes results that are not note IDs or null', async () => {
    const { fetch } = recordingFetch(() => json({ result: ['not-an-id'], error: null }));
    await assert.rejects(new AnkiConnectClient({ fetch }).addNotes([NOTE]), /unexpected result for addNotes/);
  });

  it('surfaces the error text when AnkiConnect refuses createDeck', async () => {
    const { fetch } = recordingFetch(() => json({ result: null, error: 'cannot create deck: busy' }));
    await assert.rejects(
      new AnkiConnectClient({ fetch }).createDeck('SAT::Math'),
      /AnkiConnect rejected createDeck: cannot create deck: busy/,
    );
  });

  it('rejects a createDeck result that is not an integer deck ID', async () => {
    for (const result of ['1700000000003', 1.5, null, { id: 1 }]) {
      const { fetch } = recordingFetch(() => json({ result, error: null }));
      await assert.rejects(
        new AnkiConnectClient({ fetch }).createDeck('SAT::Math'),
        /unexpected result for createDeck/,
      );
    }
  });

  it('names the loopback address when AnkiConnect cannot be reached', async () => {
    const { fetch } = recordingFetch(() => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(
      new AnkiConnectClient({ fetch }).deckNames(),
      (error: unknown) =>
        error instanceof AnkiConnectError &&
        error.message.includes('127.0.0.1:8765') &&
        error.message.includes('AnkiConnect add-on'),
    );
  });

  it('reports a timeout with the configured duration', async () => {
    const { fetch } = recordingFetch(() => {
      throw Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });
    });
    await assert.rejects(
      new AnkiConnectClient({ fetch, timeoutMs: 2000 }).deckNames(),
      /did not answer within 2 seconds/,
    );
  });
});
