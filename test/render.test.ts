import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type SatQuestion } from '../src/sat/questions.js';
import { escapeHtml, renderBack, renderFront, textToHtml } from '../src/sat/render.js';

function question(overrides: Partial<SatQuestion> = {}): SatQuestion {
  return {
    stem: 'Choose the word.',
    choices: { A: 'alpha', B: 'beta', C: 'gamma', D: 'delta' },
    answer: 'C',
    explanation: undefined,
    tag: 'sat-mcq-0000000000000000',
    ...overrides,
  };
}

/** Every tag name in the markup. Used to prove that only the expected elements appear. */
function tagNames(html: string): Set<string> {
  return new Set([...html.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((match) => match[1]!.toLowerCase()));
}

describe('HTML escaping', () => {
  it('escapes the five characters that can start markup or end an attribute', () => {
    assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapes ampersands first so existing entities are shown literally', () => {
    assert.equal(escapeHtml('&lt;b&gt;'), '&amp;lt;b&amp;gt;');
  });

  it('turns line breaks into br and escapes any markup in the text', () => {
    assert.equal(textToHtml('<b>x</b>\ny'), '&lt;b&gt;x&lt;/b&gt;<br>y');
  });
});

describe('card rendering', () => {
  it('neutralizes injected markup in the stem and choices', () => {
    const html = renderFront(
      question({
        stem: '<img src=x onerror=alert(1)> Which?',
        choices: { A: '<script>alert(1)</script>', B: 'b', C: 'c', D: 'd' },
      }),
    );
    assert.ok(!html.includes('<img'), html);
    assert.ok(!html.includes('<script'), html);
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; Which?'), html);
    assert.deepEqual([...tagNames(html)].sort(), ['div', 'span']);
  });

  it('lists all four choices with their letters', () => {
    const html = renderFront(question());
    for (const letter of ['A', 'B', 'C', 'D']) {
      assert.ok(new RegExp(`<span class="sat-letter"[^>]*>${letter}\\.</span>`).test(html), html);
    }
    assert.ok(html.includes('alpha') && html.includes('delta'));
  });

  it('shows the correct letter and its text on the back', () => {
    const html = renderBack(question({ answer: 'C' }));
    assert.match(html, /<span class="sat-letter"[^>]*>C\.<\/span> <span>gamma<\/span>/);
    assert.ok(!html.includes('sat-explanation'));
  });

  it('adds an escaped explanation to the back only when there is one', () => {
    const html = renderBack(question({ explanation: 'Use "gamma" & <check>.' }));
    assert.ok(
      html.includes('<div class="sat-explanation">Use &quot;gamma&quot; &amp; &lt;check&gt;.</div>'),
      html,
    );
    assert.deepEqual([...tagNames(html)].sort(), ['div', 'span']);
  });
});
