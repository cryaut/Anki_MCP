import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSatServer } from '../src/server.js';
import type { SatService } from '../src/sat/service.js';
import { FakeAnki, makeService } from './fake-anki.js';

async function connect(service: SatService): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createSatServer(service);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** Joins the text parts of a tool result. */
function textOf(result: unknown): string {
  const content = (result as { content?: { type?: string; text?: string }[] }).content ?? [];
  return content.map((part) => part.text ?? '').join('\n');
}

const QUESTION = {
  stem: 'Which choice best completes the text? The results were ____.',
  choices: { A: 'inconclusive', B: 'conclusive', C: 'hidden', D: 'exact' },
  answer: 'B',
  explanation: 'Conclusive fits the sentence logic.',
};

describe('MCP tool surface', () => {
  it('exposes the quiz tools, and commit accepts only previewToken', async () => {
    const { service } = makeService();
    const { client, close } = await connect(service);
    try {
      const { tools } = await client.listTools();
      assert.deepEqual(
        tools.map((tool) => tool.name).sort(),
        ['check_deck', 'commit_sat_preview', 'export_sat_quiz', 'export_sat_tsv', 'list_decks',
          'preview_sat_questions', 'preview_sat_quiz'],
      );

      const commit = tools.find((tool) => tool.name === 'commit_sat_preview');
      assert.deepEqual(Object.keys(commit?.inputSchema.properties ?? {}), ['previewToken']);
      assert.equal(commit?.annotations?.readOnlyHint, false);
      assert.equal(commit?.annotations?.destructiveHint, false);

      const preview = tools.find((tool) => tool.name === 'preview_sat_questions');
      assert.equal(preview?.annotations?.readOnlyHint, true);
    } finally {
      await close();
    }
  });
});

describe('MCP tool calls', () => {
  it('list_decks returns the deck names as JSON', async () => {
    const anki = new FakeAnki();
    const { client, close } = await connect(makeService(anki).service);
    try {
      const result = await client.callTool({ name: 'list_decks', arguments: {} });
      assert.notEqual(result.isError, true);
      assert.deepEqual(JSON.parse(textOf(result)), { count: 2, decks: ['Default', 'SAT::Math'] });
    } finally {
      await close();
    }
  });

  it('preview returns a token and escaped HTML, and writes nothing', async () => {
    const anki = new FakeAnki();
    const { client, close } = await connect(makeService(anki).service);
    try {
      const result = await client.callTool({
        name: 'preview_sat_questions',
        arguments: {
          deck: 'SAT::Math',
          questions: [{ ...QUESTION, stem: '<img src=x onerror=alert(1)> Which?' }],
        },
      });
      assert.notEqual(result.isError, true, textOf(result));

      const payload = JSON.parse(textOf(result)) as {
        previewToken: string;
        questions: { front: string }[];
      };
      assert.match(payload.previewToken, /^[A-Za-z0-9_-]{43}$/);
      const front = payload.questions[0]?.front ?? '';
      assert.ok(front.includes('&lt;img src=x onerror=alert(1)&gt; Which?'), front);
      assert.ok(!front.includes('<img'), front);
      assert.equal(anki.addBatches.length, 0);
    } finally {
      await close();
    }
  });

  it('commit adds the previewed notes when given only the token', async () => {
    const anki = new FakeAnki();
    const { client, close } = await connect(makeService(anki).service);
    try {
      const preview = JSON.parse(
        textOf(
          await client.callTool({
            name: 'preview_sat_questions',
            arguments: { deck: 'SAT::Math', questions: [QUESTION] },
          }),
        ),
      ) as { previewToken: string };

      const result = await client.callTool({
        name: 'commit_sat_preview',
        arguments: { previewToken: preview.previewToken },
      });
      assert.notEqual(result.isError, true, textOf(result));
      assert.deepEqual(JSON.parse(textOf(result)).summary, { added: 1, duplicates: 0, failed: 0 });
      assert.equal(anki.addBatches.length, 1);
    } finally {
      await close();
    }
  });

  it('a missing deck is disclosed at preview and created at commit', async () => {
    const anki = new FakeAnki();
    const { client, close } = await connect(makeService(anki).service);
    try {
      const preview = JSON.parse(
        textOf(
          await client.callTool({
            name: 'preview_sat_questions',
            arguments: { deck: 'Biology', questions: [QUESTION] },
          }),
        ),
      ) as { previewToken: string; deckExists: boolean; deckWillBeCreated: boolean; note: string };
      assert.equal(preview.deckExists, false);
      assert.equal(preview.deckWillBeCreated, true);
      assert.match(preview.note, /will create it/);
      assert.deepEqual(anki.createdDecks, [], 'preview must not create the deck');

      const result = await client.callTool({
        name: 'commit_sat_preview',
        arguments: { previewToken: preview.previewToken },
      });
      assert.notEqual(result.isError, true, textOf(result));
      const report = JSON.parse(textOf(result)) as {
        deck: string;
        deckCreated: boolean;
        summary: unknown;
      };
      assert.equal(report.deck, 'Biology');
      assert.equal(report.deckCreated, true);
      assert.deepEqual(report.summary, { added: 1, duplicates: 0, failed: 0 });
      assert.deepEqual(anki.createdDecks, ['Biology']);
      assert.equal(anki.addBatches[0]?.[0]?.deckName, 'Biology');
    } finally {
      await close();
    }
  });

  it('a bogus token comes back as a tool error and writes nothing', async () => {
    const anki = new FakeAnki();
    const { client, close } = await connect(makeService(anki).service);
    try {
      const result = await client.callTool({
        name: 'commit_sat_preview',
        arguments: { previewToken: 'bogus' },
      });
      assert.equal(result.isError, true);
      assert.match(textOf(result), /Unknown or already used previewToken/);
      assert.equal(anki.addBatches.length, 0);
    } finally {
      await close();
    }
  });

  it('a content problem comes back as a tool error that names the question', async () => {
    const anki = new FakeAnki();
    const { client, close } = await connect(makeService(anki).service);
    try {
      const result = await client.callTool({
        name: 'preview_sat_questions',
        arguments: {
          deck: 'SAT::Math',
          questions: [{ ...QUESTION, choices: { A: 'a', B: 'b', C: 'c', D: '  ' } }],
        },
      });
      assert.equal(result.isError, true);
      assert.match(textOf(result), /question 1 choice D is blank/);
      assert.equal(anki.findQueries.length, 0);
    } finally {
      await close();
    }
  });
});


describe('interactive questionnaire', () => {
  it('previews without writing and stores the full form in one dedicated Anki card', async () => {
    const anki = new FakeAnki();
    const { client, close } = await connect(makeService(anki).service);
    const args = {
      deck: 'SAT::Practice',
      questions: [QUESTION, { ...QUESTION, stem: 'Review a second question.' }],
    };
    try {
      const preview = await client.callTool({ name: 'preview_sat_quiz', arguments: args });
      assert.notEqual(preview.isError, true, textOf(preview));
      const input = JSON.parse(textOf(preview));
      assert.equal(input.questionCount, 2);
      assert.equal(input.deckWillBeCreated, true);
      assert.equal(anki.createdModels.length, 0);
      assert.equal(anki.createdDecks.length, 0);
      assert.equal(anki.addBatches.length, 0);

      const commit = await client.callTool({
        name: 'commit_sat_preview',
        arguments: { previewToken: input.previewToken },
      });
      assert.notEqual(commit.isError, true, textOf(commit));
      assert.deepEqual(JSON.parse(textOf(commit)).summary, { added: 1, duplicates: 0, failed: 0 });
      assert.equal(anki.createdModels.length, 1);
      const [note] = anki.addBatches[0] ?? [];
      assert.match(note?.fields.Front ?? '', /<form class="asq-work"/);
      assert.equal((note?.fields.Front.match(/type="radio"/g) ?? []).length, 8);
      assert.match(note?.fields.Back ?? '', /Answer key/);

      const again = await client.callTool({ name: 'preview_sat_quiz', arguments: args });
      assert.equal(JSON.parse(textOf(again)).status, 'duplicate');
    } finally {
      await close();
    }
  });
});
