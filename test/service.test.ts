import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewAnkiNote } from '../src/anki-connect.js';
import { type ChoiceLetter, type RawQuestion, questionTag } from '../src/sat/questions.js';
import { FakeAnki, makeService } from './fake-anki.js';

function rawQuestion(overrides: Partial<RawQuestion> = {}): RawQuestion {
  return {
    stem: 'Which choice best completes the text? The results were ____.',
    choices: { A: 'inconclusive', B: 'conclusive', C: 'hidden', D: 'exact' },
    answer: 'B',
    explanation: 'Conclusive fits the sentence logic.',
    ...overrides,
  };
}

function onlyBatch(anki: FakeAnki): NewAnkiNote[] {
  const [batch] = anki.addBatches;
  assert.ok(batch, 'expected exactly one addNotes call');
  return batch;
}

describe('SatService.preview', () => {
  it('reports new questions, writes nothing, and returns a token', async () => {
    const { anki, service } = makeService();
    const report = await service.preview({
      deck: '  sat::math  ',
      questions: [rawQuestion(), rawQuestion({ stem: 'A second question?' })],
    });

    assert.equal(report.deck, 'SAT::Math');
    assert.equal(report.deckExists, true);
    assert.equal(report.deckWillBeCreated, false);
    assert.deepEqual(report.summary, { questions: 2, new: 2, duplicates: 0 });
    assert.match(report.previewToken, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(report.questions.every((item) => item.status === 'new'));
    assert.equal(anki.addBatches.length, 0);
    assert.ok(report.note.includes('Nothing has been written to Anki'));
  });

  it('includes escaped Front and Back HTML for each question', async () => {
    const { service } = makeService();
    const report = await service.preview({
      deck: 'SAT::Math',
      questions: [rawQuestion({ stem: 'Use <b>this</b> & that?', explanation: 'Say "yes".' })],
    });
    const [item] = report.questions;
    assert.ok(item?.front.includes('Use &lt;b&gt;this&lt;/b&gt; &amp; that?'), item?.front);
    assert.ok(item?.back.includes('Say &quot;yes&quot;.'), item?.back);
  });

  it('flags a question whose tag already has a note in Anki', async () => {
    const { anki, service } = makeService();
    const existing = rawQuestion();
    anki.notesByTag.set(
      questionTag({ stem: existing.stem, choices: existing.choices, answer: existing.answer }),
      [42],
    );

    const report = await service.preview({ deck: 'SAT::Math', questions: [existing] });

    assert.equal(report.questions[0]?.status, 'duplicate');
    assert.equal(report.questions[0]?.existingNoteId, 42);
    assert.deepEqual(report.summary, { questions: 1, new: 0, duplicates: 1 });
  });

  it('accepts a deck that does not exist yet, says commit will create it, and writes nothing', async () => {
    const anki = new FakeAnki();
    const { previews, service } = makeService(anki);
    const report = await service.preview({ deck: '  Biology  ', questions: [rawQuestion()] });

    assert.equal(report.deck, 'Biology');
    assert.equal(report.deckExists, false);
    assert.equal(report.deckWillBeCreated, true);
    assert.match(report.note, /Deck "Biology" does not exist yet/);
    assert.match(report.note, /will create it/);
    assert.equal(previews.size, 1);
    assert.deepEqual(anki.createdDecks, []);
    assert.equal(anki.addBatches.length, 0);
  });

  it('does not promise a new deck when every question is already in Anki', async () => {
    const anki = new FakeAnki();
    const { service } = makeService(anki);
    const question = rawQuestion();
    anki.notesByTag.set(
      questionTag({ stem: question.stem, choices: question.choices, answer: question.answer }),
      [42],
    );

    const report = await service.preview({ deck: 'Biology', questions: [question] });

    assert.equal(report.deckExists, false);
    assert.equal(report.deckWillBeCreated, false);
    assert.match(report.note, /will not create the deck/);
  });

  it('validates the batch before calling Anki at all', async () => {
    const anki = new FakeAnki();
    const { previews, service } = makeService(anki);
    const invalid = 'E' as unknown as ChoiceLetter;

    await assert.rejects(
      service.preview({ deck: 'SAT::Math', questions: [rawQuestion({ answer: invalid })] }),
      /answer must be A, B, C, or D/,
    );
    assert.equal(anki.findQueries.length, 0);
    assert.equal(anki.addBatches.length, 0);
    assert.equal(previews.size, 0);
  });

  it('rejects a batch that repeats a question, listing the problem', async () => {
    const { service } = makeService();
    await assert.rejects(
      service.preview({ deck: 'SAT::Math', questions: [rawQuestion(), rawQuestion()] }),
      /question 2 repeats question 1/,
    );
  });

  it('rejects a blank deck name', async () => {
    const { service } = makeService();
    await assert.rejects(service.preview({ deck: '   ', questions: [rawQuestion()] }), /Deck name is blank/);
  });
});

describe('SatService.commit', () => {
  it('adds only new questions, with escaped fields, the exact deck name, and both tags', async () => {
    const { anki, service } = makeService();
    const existing = rawQuestion({ stem: 'Existing <b>question</b>?' });
    const fresh = rawQuestion({ stem: 'Fresh & new <i>question</i>?', explanation: 'Because "reasons".' });
    anki.notesByTag.set(
      questionTag({ stem: existing.stem, choices: existing.choices, answer: existing.answer }),
      [7],
    );

    const preview = await service.preview({ deck: 'SAT::Math', questions: [existing, fresh] });
    assert.equal(preview.summary.duplicates, 1);
    const report = await service.commit(preview.previewToken);

    assert.deepEqual(report.summary, { added: 1, duplicates: 1, failed: 0 });
    assert.deepEqual(
      report.questions.map((item) => item.status),
      ['duplicate', 'added'],
    );
    assert.equal(report.questions[0]?.noteId, 7);
    assert.equal(report.deckCreated, false);
    assert.deepEqual(anki.createdDecks, []);

    const note = onlyBatch(anki)[0];
    assert.ok(note);
    assert.equal(note.deckName, 'SAT::Math');
    assert.equal(note.modelName, 'Basic');
    assert.deepEqual(note.options, { allowDuplicate: false });
    assert.deepEqual(note.tags, ['sat-mcq', preview.questions[1]?.tag]);
    assert.ok(note.fields.Front.includes('Fresh &amp; new &lt;i&gt;question&lt;/i&gt;?'), note.fields.Front);
    assert.ok(!note.fields.Front.includes('<i>'));
    assert.ok(note.fields.Back.includes('Because &quot;reasons&quot;.'), note.fields.Back);
  });

  it('refuses a token a second time and adds nothing', async () => {
    const { anki, service } = makeService();
    const preview = await service.preview({ deck: 'SAT::Math', questions: [rawQuestion()] });
    await service.commit(preview.previewToken);

    await assert.rejects(service.commit(preview.previewToken), /Unknown or already used previewToken/);
    assert.equal(anki.addBatches.length, 1);
  });

  it('refuses a token after 10 minutes and adds nothing', async () => {
    let now = 1_000;
    const anki = new FakeAnki();
    const { service } = makeService(anki, { now: () => now });
    const preview = await service.preview({ deck: 'SAT::Math', questions: [rawQuestion()] });

    now += 10 * 60_000;
    await assert.rejects(service.commit(preview.previewToken), /previewToken expired/);
    assert.equal(anki.addBatches.length, 0);
  });

  it('reports every question as a duplicate when the same batch is committed again', async () => {
    const { anki, service } = makeService();
    const questions = [rawQuestion(), rawQuestion({ stem: 'A second question?' })];

    const first = await service.preview({ deck: 'SAT::Math', questions });
    await service.commit(first.previewToken);

    const second = await service.preview({ deck: 'SAT::Math', questions });
    assert.deepEqual(second.summary, { questions: 2, new: 0, duplicates: 2 });

    const again = await service.commit(second.previewToken);
    assert.deepEqual(again.summary, { added: 0, duplicates: 2, failed: 0 });
    assert.equal(anki.addBatches.length, 1, 'no second addNotes call when nothing is new');
  });

  it('reports a note that Anki refuses as failed, with a reason', async () => {
    const anki = new FakeAnki();
    anki.refuseAll = true;
    const { service } = makeService(anki);
    const preview = await service.preview({ deck: 'SAT::Math', questions: [rawQuestion()] });

    const report = await service.commit(preview.previewToken);

    assert.deepEqual(report.summary, { added: 0, duplicates: 0, failed: 1 });
    assert.match(report.questions[0]?.reason ?? '', /did not add this note/);
  });

  it('adds a question once when two commits race for it', async () => {
    const anki = new FakeAnki();
    anki.addDelayMs = 20;
    const { service } = makeService(anki);
    const questions = [rawQuestion()];

    const first = await service.preview({ deck: 'SAT::Math', questions });
    const second = await service.preview({ deck: 'SAT::Math', questions });
    const [a, b] = await Promise.all([
      service.commit(first.previewToken),
      service.commit(second.previewToken),
    ]);

    assert.equal(anki.addBatches.flat().length, 1);
    assert.equal(a.summary.added + b.summary.added, 1);
    assert.equal(a.summary.duplicates + b.summary.duplicates, 1);
  });

  it('creates a deck that was removed after the preview, using the requested name', async () => {
    const anki = new FakeAnki();
    const { service } = makeService(anki);
    const preview = await service.preview({ deck: 'SAT::Math', questions: [rawQuestion()] });

    anki.decks = ['Default'];
    const report = await service.commit(preview.previewToken);

    assert.deepEqual(anki.createdDecks, ['SAT::Math']);
    assert.equal(onlyBatch(anki)[0]?.deckName, 'SAT::Math');
    assert.equal(report.deckCreated, true);
    assert.deepEqual(report.summary, { added: 1, duplicates: 0, failed: 0 });
  });

  it('creates a missing deck once, before addNotes, and uses the requested name', async () => {
    const anki = new FakeAnki();
    const { service } = makeService(anki);
    const preview = await service.preview({
      deck: '  Biology  ',
      questions: [rawQuestion(), rawQuestion({ stem: 'A second question?' })],
    });

    const report = await service.commit(preview.previewToken);

    assert.deepEqual(anki.createdDecks, ['Biology']);
    const createAt = anki.log.indexOf('createDeck Biology');
    const addAt = anki.log.findIndex((entry) => entry.startsWith('addNotes'));
    assert.ok(createAt >= 0 && createAt < addAt, anki.log.join(' | '));
    assert.equal(anki.log.filter((entry) => entry.startsWith('addNotes')).length, 1);
    assert.equal(onlyBatch(anki).length, 2);
    assert.ok(onlyBatch(anki).every((note) => note.deckName === 'Biology'));
    assert.equal(report.deck, 'Biology');
    assert.equal(report.deckCreated, true);
    assert.deepEqual(report.summary, { added: 2, duplicates: 0, failed: 0 });
    assert.ok(anki.decks.includes('Biology'));
  });

  it('uses a deck that appeared with other letter case before commit, and does not create it', async () => {
    const anki = new FakeAnki();
    const { service } = makeService(anki);
    const preview = await service.preview({ deck: 'biology', questions: [rawQuestion()] });
    assert.equal(preview.deckExists, false);

    anki.decks.push('Biology');
    const report = await service.commit(preview.previewToken);

    assert.deepEqual(anki.createdDecks, []);
    assert.equal(onlyBatch(anki)[0]?.deckName, 'Biology');
    assert.equal(report.deck, 'Biology');
    assert.equal(report.deckCreated, false);
  });

  it('creates no deck and adds nothing when every question is already in Anki', async () => {
    const anki = new FakeAnki();
    const { service } = makeService(anki);
    const question = rawQuestion();
    anki.notesByTag.set(
      questionTag({ stem: question.stem, choices: question.choices, answer: question.answer }),
      [42],
    );
    const preview = await service.preview({ deck: 'Biology', questions: [question] });

    const report = await service.commit(preview.previewToken);

    assert.deepEqual(anki.createdDecks, []);
    assert.equal(anki.addBatches.length, 0);
    assert.equal(anki.decks.includes('Biology'), false);
    assert.equal(report.deckCreated, false);
    assert.deepEqual(report.summary, { added: 0, duplicates: 1, failed: 0 });
  });

  it('adds nothing and keeps the token spent when AnkiConnect refuses createDeck', async () => {
    const anki = new FakeAnki();
    anki.refuseCreateDeck = true;
    const { service } = makeService(anki);
    const preview = await service.preview({ deck: 'Biology', questions: [rawQuestion()] });

    await assert.rejects(service.commit(preview.previewToken), /AnkiConnect rejected createDeck/);
    assert.equal(anki.addBatches.length, 0);

    await assert.rejects(service.commit(preview.previewToken), /Unknown or already used previewToken/);
    assert.deepEqual(anki.createdDecks, ['Biology']);
  });

  it('creates a missing deck only once when two commits race for the same new question', async () => {
    const anki = new FakeAnki();
    anki.addDelayMs = 20;
    const { service } = makeService(anki);
    const questions = [rawQuestion()];

    const first = await service.preview({ deck: 'Biology', questions });
    const second = await service.preview({ deck: 'Biology', questions });
    const [a, b] = await Promise.all([
      service.commit(first.previewToken),
      service.commit(second.previewToken),
    ]);

    assert.deepEqual(anki.createdDecks, ['Biology']);
    assert.equal(anki.addBatches.flat().length, 1);
    assert.equal(a.summary.added + b.summary.added, 1);
    assert.deepEqual([a.deckCreated, b.deckCreated], [true, false]);
  });

  it('fails loudly when AnkiConnect returns a different number of results', async () => {
    class ShortReplyAnki extends FakeAnki {
      override async addNotes(notes: NewAnkiNote[]): Promise<(number | null)[]> {
        this.addBatches.push(notes);
        return [];
      }
    }
    const { service } = makeService(new ShortReplyAnki());
    const preview = await service.preview({ deck: 'SAT::Math', questions: [rawQuestion()] });

    await assert.rejects(service.commit(preview.previewToken), /unexpected number of results/);
  });
});

describe('SatService deck and list queries', () => {
  it('checkDeck matches a deck regardless of letter case and reports absence', async () => {
    const { service } = makeService();
    assert.deepEqual(await service.checkDeck('sat::MATH'), {
      requested: 'sat::MATH',
      exists: true,
      name: 'SAT::Math',
    });
    assert.deepEqual(await service.checkDeck('Biology'), {
      requested: 'Biology',
      exists: false,
      name: null,
    });
  });

  it('listDecks returns the names sorted', async () => {
    const anki = new FakeAnki();
    anki.decks = ['Zeta', 'alpha', 'SAT::Math'];
    const { service } = makeService(anki);
    assert.deepEqual(await service.listDecks(), ['alpha', 'SAT::Math', 'Zeta']);
  });
});
