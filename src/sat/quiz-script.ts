// Fixed client code. User-provided question text is rendered as escaped HTML.
export const QUIZ_SCRIPT = `
(() => {
  const root = document.querySelector('.anki-sat-quiz[data-quiz]:not([data-ready])');
  if (!root) return;
  root.setAttribute('data-ready', '');

  const form = root.querySelector('form');
  const questions = [...form.querySelectorAll('[data-question]')];
  const controls = root.querySelector('[data-controls]');
  const steps = [...root.querySelectorAll('[data-step]')];
  const progress = root.querySelector('progress');
  const count = root.querySelector('[data-count]');
  const previous = form.querySelector('[data-previous]');
  const next = form.querySelector('[data-next]');
  const submit = form.querySelector('[type="submit"]');
  const message = form.querySelector('[data-message]');
  const results = root.querySelector('[data-results]');
  const review = results.querySelector('ol');
  let current = 0;
  let graded = false;

  function selections() {
    return questions.map((question) => question.querySelector('input:checked'));
  }

  function updateProgress() {
    const selected = selections();
    progress.value = selected.filter(Boolean).length;
    count.textContent = progress.value + ' of ' + questions.length + ' answered';
    steps.forEach((step, index) => step.toggleAttribute('data-answered', Boolean(selected[index])));
  }

  function goTo(index, focus) {
    current = index;
    questions.forEach((question, i) => { question.hidden = i !== current; });
    steps.forEach((step, i) => {
      if (i === current) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    previous.disabled = current === 0;
    next.hidden = current === questions.length - 1;
    submit.hidden = !next.hidden;
    message.textContent = '';
    if (focus) questions[current].querySelector('legend').focus();
  }

  function addText(parent, tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
  }

  form.addEventListener('change', updateProgress);
  steps.forEach((step, index) => step.addEventListener('click', () => goTo(index, true)));
  previous.addEventListener('click', () => { if (current > 0) goTo(current - 1, true); });
  next.addEventListener('click', () => { if (current + 1 < questions.length) goTo(current + 1, true); });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (graded) return;

    const selected = selections();
    const unanswered = selected.indexOf(null);
    if (unanswered !== -1) {
      goTo(unanswered, true);
      message.textContent = 'Answer every question before you submit.';
      return;
    }

    let score = 0;
    selected.forEach((choice, index) => {
      const question = questions[index];
      const correct = question.dataset.answer;
      const isCorrect = choice.value === correct;
      if (isCorrect) score += 1;

      const row = addText(review, 'li', '');
      const details = addText(row, 'details', '');
      details.open = !isCorrect;
      const summary = addText(details, 'summary', 'Question ' + (index + 1) + ' · ' + (isCorrect ? 'Correct' : 'Incorrect'));
      summary.dataset.outcome = isCorrect ? 'correct' : 'wrong';
      const prompt = addText(details, 'p', '');
      prompt.append(...[...question.querySelector('legend').childNodes].map((node) => node.cloneNode(true)));
      const answerLabel = (input) => input.value + '. ' + input.closest('label').querySelector('[data-choice-text]').textContent;
      addText(details, 'p', 'Your answer: ' + answerLabel(choice));
      const answerInput = [...question.querySelectorAll('input')].find((input) => input.value === correct);
      addText(details, 'p', 'Correct answer: ' + answerLabel(answerInput));
      const explanation = question.querySelector('[data-explanation]');
      if (explanation) {
        const note = addText(details, 'p', '');
        note.append(explanation.content.cloneNode(true));
      }
    });

    graded = true;
    form.hidden = true;
    controls.hidden = true;
    results.hidden = false;
    const percentage = Math.round((score / questions.length) * 100);
    results.querySelector('[data-score]').textContent = score + ' / ' + questions.length + ' correct · ' + percentage + '%';
    results.querySelector('h2').focus();
  });

  results.querySelector('[data-reset]').addEventListener('click', () => {
    graded = false;
    form.reset();
    review.replaceChildren();
    results.hidden = true;
    form.hidden = false;
    controls.hidden = false;
    updateProgress();
    goTo(0, true);
  });

  // Keep Anki's global reviewer shortcuts from eating native form keys.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    root.addEventListener(type, (event) => {
      if (event.target.closest('input, button, summary, legend, h2') && event.key !== 'Tab') {
        event.stopPropagation();
      }
    });
  }
  form.hidden = false;
  controls.hidden = false;
  root.querySelector('[data-no-script]').hidden = true;
  updateProgress();
  goTo(0, false);
})();
`;
