import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ToolError } from './errors.js';
import { DEFAULT_EXPORT_DIRECTORY, exportSatQuiz, exportSatTsv } from './sat/export.js';
import { PREVIEW_TTL_MINUTES } from './sat/preview-store.js';
import { deckNameSchema, LIMITS, previewInputShape } from './sat/questions.js';
import type { SatService } from './sat/service.js';

export const SERVER_NAME = 'anki-sat-mcp';
export const SERVER_VERSION = '0.1.0';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const PREVIEW = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const COMMIT = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

/** Runs a tool action. Expected errors become tool errors that the client can read. */
async function runTool(action: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const value = await action();
    return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    if (error instanceof ToolError) {
      return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
    // stderr only. Anything written to stdout would corrupt the MCP stream.
    console.error('anki-sat-mcp: unexpected error during a tool call:', error);
    return {
      isError: true,
      content: [
        { type: 'text', text: 'Unexpected error. Details were written to the server log on stderr.' },
      ],
    };
  }
}

export function createSatServer(
  service: SatService,
  exportDirectory = DEFAULT_EXPORT_DIRECTORY,
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Creates interactive SAT quizzes and flashcards in local Anki. Use preview_sat_quiz for a questionnaire ' +
        'with answer selection, grading and review. Use preview_sat_questions for individual flashcards. ' +
        'Present the preview before committing. Only commit_sat_preview changes Anki. ' +
        'Use export_sat_quiz for a self-contained offline HTML quiz.',
    },
  );

  server.registerTool(
    'list_decks',
    {
      title: 'List Anki decks',
      description: 'List the names of all decks in the local Anki collection. Read-only.',
      annotations: READ_ONLY,
    },
    () => runTool(() => service.listDecks().then((decks) => ({ count: decks.length, decks }))),
  );

  server.registerTool(
    'check_deck',
    {
      title: 'Check an Anki deck',
      description:
        'Check whether a deck exists. Matching ignores letter case, and the result gives the exact deck name. Read-only.',
      inputSchema: { deck: deckNameSchema },
      annotations: READ_ONLY,
    },
    ({ deck }) => runTool(() => service.checkDeck(deck)),
  );

  server.registerTool(
    'preview_sat_questions',
    {
      title: 'Preview SAT multiple-choice questions',
      description:
        'Validate SAT multiple-choice questions (exactly four choices A to D and one answer letter) and show the ' +
        'Anki notes they would create, with all text HTML-escaped. Reports which questions already exist in Anki, ' +
        'matched by tag, and whether the deck exists. If the deck is missing, says that commit_sat_preview will ' +
        'create it. Writes nothing to Anki. Returns a previewToken that expires in ' +
        `${PREVIEW_TTL_MINUTES} minutes and works only in this server process. Pass it to commit_sat_preview to add the new questions.`,
      inputSchema: previewInputShape,
      annotations: PREVIEW,
    },
    (args) => runTool(() => service.preview(args)),
  );

  server.registerTool(
    'preview_sat_quiz',
    {
      title: 'Preview an interactive SAT questionnaire',
      description:
        'Preview one interactive Anki card containing the whole questionnaire. The student can choose answers, ' +
        'submit, see a score, and review explanations. Returns a one-time previewToken and does not write to Anki.',
      inputSchema: previewInputShape,
      annotations: PREVIEW,
    },
    (args) => runTool(() => service.previewQuiz(args)),
  );

  server.registerTool(
    'commit_sat_preview',
    {
      title: 'Save a previewed SAT quiz or flashcard batch to Anki',
      description:
        'Save a preview_sat_quiz or preview_sat_questions result. Pass only previewToken. Each token works once, ' +
        `expires after ${PREVIEW_TTL_MINUTES} minutes, and is valid only in the server process that issued it. ` +
        'The server skips duplicates and creates the destination deck when needed. ' +
        'An interactive quiz uses a dedicated note type that is created on first use.',
      inputSchema: {
        previewToken: z
          .string()
          .min(1)
          .max(LIMITS.tokenChars)
          .describe('previewToken returned by preview_sat_questions.'),
      },
      annotations: COMMIT,
    },
    ({ previewToken }) => runTool(() => service.commit(previewToken)),
  );

  server.registerTool(
    'export_sat_quiz',
    {
      title: 'Export a fillable SAT quiz as HTML',
      description:
        'Save a self-contained interactive questionnaire. Open the file in any modern browser to choose answers, ' +
        'submit, see a score and review explanations. Works offline and does not change Anki.',
      inputSchema: previewInputShape,
      annotations: COMMIT,
    },
    (args) => runTool(() => exportSatQuiz(args, exportDirectory)),
  );

  server.registerTool(
    'export_sat_tsv',
    {
      title: 'Export individual SAT flashcards for Anki',
      description:
        'Save an import-ready TSV with the requested deck, styled question and answer cards, and tags. ' +
        'Works without AnkiConnect and does not change the Anki collection. Returns the file path.',
      inputSchema: previewInputShape,
      annotations: COMMIT,
    },
    (args) => runTool(() => exportSatTsv(args, exportDirectory)),
  );

  return server;
}
