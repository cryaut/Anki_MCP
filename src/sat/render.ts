import { CHOICE_LETTERS, type SatQuestion } from './questions.js';

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const PANEL = 'box-sizing:border-box;width:100%;max-width:680px;margin:12px auto;' +
  'padding:clamp(16px,4vw,28px);border:1px solid #344b70;border-radius:18px;' +
  'background:#101c32;color:#f7f9ff;text-align:left;font:16px/1.6 Segoe UI,Arial,sans-serif;' +
  'overflow-wrap:anywhere;';
const LABEL = 'font-size:12px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;';
const ROW = 'display:flex;align-items:flex-start;gap:12px;padding:10px 13px;' +
  'border:1px solid #405575;border-radius:11px;background:#1b2b46;';
const BADGE = 'display:inline-block;flex:none;min-width:27px;padding:0 3px;border-radius:7px;' +
  'background:#9ec7ff;color:#142643;text-align:center;font-weight:700;';

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

/** Markup comes only from this module. Tabs become spaces so they also work in TSV. */
export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\t/g, ' ').replace(/\n/g, '<br>');
}

export function renderFront(question: SatQuestion): string {
  const choices = CHOICE_LETTERS.map((letter) =>
    '<div class="sat-choice" style="' + ROW + '">' +
    '<span class="sat-letter" style="' + BADGE + '">' + letter + '.</span> ' +
    '<span>' + textToHtml(question.choices[letter]) + '</span></div>',
  ).join('');
  return '<div class="sat-question" lang="en" style="' + PANEL + '">' +
    '<div style="' + LABEL + 'color:#9ec7ff;">SAT Reading &amp; Writing</div>' +
    '<div class="sat-stem" style="margin:12px 0 18px;font-size:18px;">' +
    textToHtml(question.stem) + '</div>' +
    '<div class="sat-choices" style="display:grid;gap:8px;">' + choices + '</div></div>';
}

export function renderBack(question: SatQuestion): string {
  const explanation = question.explanation === undefined ? '' :
    '<div style="margin-top:14px;color:#d9e9ff;">' +
    '<div style="' + LABEL + 'color:#9ec7ff;">Why it works</div>' +
    '<div class="sat-explanation">' + textToHtml(question.explanation) + '</div></div>';
  return '<div class="sat-feedback" lang="en" style="' + PANEL + '">' +
    '<div style="' + LABEL + 'color:#94f2cb;margin-bottom:8px;">Correct answer</div>' +
    '<div class="sat-answer" style="' + ROW + 'background:#123a34;border-color:#3d8b74;">' +
    '<span class="sat-letter" style="' + BADGE + 'background:#94f2cb;">' +
    question.answer + '.</span> <span>' + textToHtml(question.choices[question.answer]) +
    '</span></div>' + explanation + '</div>';
}
