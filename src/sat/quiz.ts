import { createHash } from 'node:crypto';
import { CHOICE_LETTERS, type SatQuestion } from './questions.js';
import { QUIZ_SCRIPT } from './quiz-script.js';
import { QUIZ_CSS } from './quiz-style.js';
import { escapeHtml, textToHtml } from './render.js';

export const QUIZ_TAG = 'sat-interactive-quiz';
export const QUIZ_MODEL = {
  modelName: 'SAT Interactive Quiz v1',
  inOrderFields: ['Front', 'Back'],
  cardTemplates: [{
    Name: 'Questionnaire',
    Front: '{{Front}}<script>' + QUIZ_SCRIPT + '</script>',
    Back: '{{Back}}',
  }],
  css: QUIZ_CSS,
};

export function quizTag(questions: readonly SatQuestion[]): string {
  const digest = createHash('sha256').update(questions.map((question) => question.tag).join('\n')).digest('hex');
  return QUIZ_TAG + '-' + digest.slice(0, 24);
}

function quizText(text: string): string {
  // Prevent Anki's own audio markers from being interpreted as references.
  return textToHtml(text).replace(/\[/g, '&#91;').replace(/\]/g, '&#93;');
}

export function renderQuizForm(title: string, questions: readonly SatQuestion[]): string {
  const steps = questions.map((_, index) =>
    '<button type="button" data-step aria-label="Question ' + (index + 1) + '">' + (index + 1) + '</button>',
  );
  const items = questions.map((question, index) => {
    const position = index + 1;
    const choices = CHOICE_LETTERS.map((letter) =>
      '<label><input type="radio" name="asq-' + position + '" value="' + letter + '">' +
      '<span class="asq-letter" aria-hidden="true">' + letter + '.</span>' +
      '<span data-choice-text>' + quizText(question.choices[letter]) + '</span></label>',
    ).join('');
    const explanation = question.explanation === undefined ? '' :
      '<template data-explanation>' + quizText(question.explanation) + '</template>';
    return '<section data-question data-answer="' + question.answer + '" hidden>' +
      '<p class="asq-position">Question ' + position + ' of ' + questions.length + '</p>' +
      '<fieldset><legend tabindex="-1">' + quizText(question.stem) + '</legend>' +
      '<div class="asq-options">' + choices + '</div></fieldset>' + explanation + '</section>';
  });
  return [
    '<section class="anki-sat-quiz" lang="en" data-quiz>',
    '<header><p class="asq-section">SAT Reading &amp; Writing</p><h1>' + quizText(title) + '</h1></header>',
    '<p data-no-script>This questionnaire needs JavaScript. You can also open its exported HTML file in a browser.</p>',
    '<div class="asq-layout"><nav class="asq-nav" data-controls hidden aria-label="Quiz questions">',
    '<p data-count aria-live="polite"></p><progress max="' + questions.length + '" value="0" aria-label="Questions answered"></progress>',
    '<div class="asq-steps">' + steps.join('') + '</div></nav>',
    '<form class="asq-work" hidden>',
    items.join(''),
    '<div class="asq-actions"><button type="button" data-previous>Previous</button>',
    '<button type="button" class="asq-primary" data-next>Next question</button>',
    '<button type="submit" class="asq-primary" hidden>Submit quiz</button></div>',
    '<p class="asq-message" data-message role="alert"></p></form>',
    '</div><section data-results hidden>',
    '<h2 tabindex="-1">Results</h2><p class="asq-score" data-score role="status"></p>',
    '<ol class="asq-review" aria-label="Answer review"></ol>',
    '<button type="button" data-reset>Try again</button></section></section>',
  ].join('');
}

export function renderQuizKey(title: string, questions: readonly SatQuestion[]): string {
  const answers = questions.map((question) =>
    '<li><p>' + quizText(question.stem) + '</p><p><strong>' + question.answer + '. ' +
    quizText(question.choices[question.answer]) + '</strong></p>' +
    (question.explanation === undefined ? '' : '<p>' + quizText(question.explanation) + '</p>') + '</li>',
  );
  return '<section class="anki-sat-quiz" lang="en"><header><p class="asq-section">Answer key</p><h1>' +
    quizText(title) + '</h1></header><ol class="asq-key">' + answers.join('') + '</ol></section>';
}

export function renderQuizPage(title: string, questions: readonly SatQuestion[]): string {
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; ' +
    'script-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' +
    '<title>' + escapeHtml(title) + '</title><style>' + QUIZ_CSS +
    'body{margin:0;padding:clamp(8px,4vw,32px);background:#e5ece6}</style></head><body><main>' +
    renderQuizForm(title, questions) + '</main><script>' + QUIZ_SCRIPT + '</script></body></html>\n';
}
