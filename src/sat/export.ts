import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { NOTE_MODEL_NAME } from '../anki-connect.js';
import { ToolError } from '../errors.js';
import { SAT_TAG } from './questions.js';
import { renderQuizPage } from './quiz.js';
import { renderBack, renderFront } from './render.js';
import { cleanDeckName, type PreviewInput, validBatchOrThrow } from './service.js';

export const DEFAULT_EXPORT_DIRECTORY = process.env.ANKI_SAT_EXPORT_DIR?.trim() ||
  join(homedir(), 'Anki SAT Exports');

async function saveExport(directory: string, extension: 'html' | 'tsv', content: string): Promise<string> {
  const path = resolve(directory, 'sat-quiz-' + randomUUID() + '.' + extension);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path, content, { encoding: 'utf8', flag: 'wx' });
  } catch {
    throw new ToolError('Could not save the export in ' + resolve(directory) + '. Check write permissions.');
  }
  return path;
}

export async function exportSatQuiz(input: PreviewInput, directory: string): Promise<{
  path: string;
  deck: string;
  questions: number;
}> {
  const deck = cleanDeckName(input.deck);
  const questions = validBatchOrThrow(input.questions);
  const path = await saveExport(directory, 'html', renderQuizPage(deck, questions));
  return { path, deck, questions: questions.length };
}

export async function exportSatTsv(input: PreviewInput, directory: string): Promise<{
  path: string;
  deck: string;
  questions: number;
}> {
  const deck = cleanDeckName(input.deck);
  const questions = validBatchOrThrow(input.questions);
  const lines = [
    '#separator:Tab',
    '#html:true',
    '#notetype:' + NOTE_MODEL_NAME,
    '#deck column:3',
    '#tags column:4',
    '#columns:Front\tBack\tDeck\tTags',
    ...questions.map((question) => [
      renderFront(question),
      renderBack(question),
      '"' + deck.replace(/"/g, '""') + '"',
      SAT_TAG + ' ' + question.tag,
    ].join('\t')),
  ];
  const path = await saveExport(directory, 'tsv', lines.join('\n') + '\n');
  return { path, deck, questions: questions.length };
}
