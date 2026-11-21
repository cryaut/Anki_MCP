export const QUIZ_CSS = `
.anki-sat-quiz {
  --paper:#f7f7f1; --white:#fff; --ink:#172d28; --muted:#4b655d;
  --line:#cedbd2; --accent:#155e49; --wash:#e7f3e9; --bad:#983929;
  box-sizing:border-box; inline-size:100%; max-inline-size:1040px;
  margin:12px auto; padding:clamp(16px,4vw,38px);
  border:1px solid var(--line); border-radius:18px; background:var(--paper);
  color:var(--ink); font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;
  text-align:start; color-scheme:light; overflow-wrap:anywhere;
}
.anki-sat-quiz *, .anki-sat-quiz *::before, .anki-sat-quiz *::after { box-sizing:border-box }
.anki-sat-quiz [hidden] { display:none !important }
.anki-sat-quiz h1, .anki-sat-quiz h2, .anki-sat-quiz p { margin:0 }
.anki-sat-quiz header { border-block-end:1px solid var(--line); padding-block-end:22px; margin-block-end:22px }
.anki-sat-quiz .asq-section { color:var(--accent); font-size:.78rem; font-weight:750; letter-spacing:.12em; text-transform:uppercase }
.anki-sat-quiz h1 { margin-block-start:6px; font:700 clamp(1.65rem,4vw,2.5rem)/1.12 Georgia,serif }
.anki-sat-quiz h2 { font-size:1.25rem; line-height:1.3 }
.anki-sat-quiz .asq-layout { display:grid; grid-template-columns:11rem minmax(0,1fr); gap:24px; align-items:start }
.anki-sat-quiz .asq-nav, .anki-sat-quiz .asq-work { background:var(--white); border:1px solid var(--line); border-radius:12px; padding:16px }
.anki-sat-quiz .asq-work { padding:clamp(14px,3vw,24px) }
.anki-sat-quiz .asq-nav p { margin-block-end:8px; color:var(--muted); font-size:.9rem }
.anki-sat-quiz progress { display:block; inline-size:100%; accent-color:var(--accent); margin-block-end:14px }
.anki-sat-quiz .asq-steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(32px,1fr)); gap:5px }
.anki-sat-quiz button { min-block-size:40px; border:1px solid var(--line); border-radius:8px; padding:7px 13px; background:var(--white); color:var(--ink); font:inherit; font-weight:650; cursor:pointer }
.anki-sat-quiz .asq-steps button { padding:5px 0; min-block-size:34px; font-size:.88rem }
.anki-sat-quiz button:hover:not(:disabled) { border-color:var(--accent); background:var(--wash) }
.anki-sat-quiz button[aria-current="step"] { outline:2px solid var(--accent); outline-offset:-2px }
.anki-sat-quiz button[data-answered] { background:var(--wash); color:var(--accent) }
.anki-sat-quiz button:disabled { opacity:.45; cursor:default }
.anki-sat-quiz button:focus-visible, .anki-sat-quiz label:focus-within { outline:2px solid var(--accent); outline-offset:3px }
.anki-sat-quiz button.asq-primary { background:var(--accent); border-color:var(--accent); color:#fff }
.anki-sat-quiz button.asq-primary:hover { background:#104a39 }
.anki-sat-quiz .asq-position { color:var(--muted); font-weight:700; font-size:.9rem; margin-block-end:10px }
.anki-sat-quiz fieldset { min-inline-size:0; border:0; margin:0; padding:0 }
.anki-sat-quiz legend { margin-block-end:16px; padding:0; font-weight:600; max-inline-size:100% }
.anki-sat-quiz .asq-options { display:grid; gap:8px }
.anki-sat-quiz label { display:grid; grid-template-columns:auto auto minmax(0,1fr); align-items:baseline; gap:8px; min-block-size:46px; padding:10px 12px; border:1px solid var(--line); border-radius:9px; cursor:pointer }
.anki-sat-quiz label:has(input:checked) { background:var(--wash); border-color:var(--accent) }
.anki-sat-quiz input { accent-color:var(--accent); margin:0 }
.anki-sat-quiz .asq-letter { color:var(--accent); font-weight:750 }
.anki-sat-quiz .asq-actions { display:flex; flex-wrap:wrap; gap:8px; margin-block-start:16px }
.anki-sat-quiz .asq-actions .asq-primary { margin-inline-start:auto }
.anki-sat-quiz .asq-message { margin-block-start:10px; color:var(--bad); font-weight:650 }
.anki-sat-quiz .asq-score { margin:14px 0 5px; color:var(--accent); font-weight:750; font-size:1.25rem }
.anki-sat-quiz .asq-review { padding-inline-start:1.4em; margin:16px 0 }
.anki-sat-quiz .asq-review li { padding:12px; margin-block-end:8px; border:1px solid var(--line); border-radius:9px; background:var(--white) }
.anki-sat-quiz .asq-review summary { cursor:pointer; font-weight:700 }
.anki-sat-quiz .asq-review p, .anki-sat-quiz .asq-key p { margin-block-start:7px }
.anki-sat-quiz .asq-review [data-outcome="wrong"] { color:var(--bad) }
.anki-sat-quiz .asq-key li { margin-block-end:16px }
@media(max-width:650px) {
  .anki-sat-quiz { border-radius:12px }
  .anki-sat-quiz .asq-layout { grid-template-columns:minmax(0,1fr); gap:12px }
  .anki-sat-quiz .asq-steps { grid-template-columns:repeat(auto-fill,minmax(34px,1fr)) }
}
`;
