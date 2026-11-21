import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { DEFAULT_EXPORT_DIRECTORY, exportSatQuiz } from './sat/export.js';
import { previewInputShape } from './sat/questions.js';

const [inputPath, outputDirectory = DEFAULT_EXPORT_DIRECTORY, ...extra] = process.argv.slice(2);
if (!inputPath || extra.length > 0) {
  console.error('Usage: npm run quiz -- <questions.json> [output-directory]');
  process.exitCode = 1;
} else {
  try {
    const input = z.object(previewInputShape).parse(JSON.parse(await readFile(inputPath, 'utf8')));
    const result = await exportSatQuiz(input, outputDirectory);
    console.log(result.path);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Could not create the questionnaire.');
    process.exitCode = 1;
  }
}
