/**
 * The writing workspace's own stylesheet, injected once into the document so the shell's stylesheet stays untouched.
 * It uses the shell's colour variables, so light and dark follow the rest of the application.
 */
const CSS = `
.tell-nav { display: flex; flex-wrap: wrap; gap: .25rem .5rem; margin: 0 0 1rem; }
.tell-nav a { padding: .25rem .7rem; border-radius: 8px; text-decoration: none; color: inherit; border: 1px solid transparent; }
.tell-nav a[aria-current="page"] { border-color: var(--line); background: color-mix(in srgb, var(--accent) 14%, transparent); font-weight: 600; }
.tell-modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: .6rem; margin: .6rem 0; border: 0; padding: 0; }
.tell-mode { position: relative; display: grid; gap: .15rem; padding: .6rem .8rem; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); cursor: pointer; }
.tell-mode input { position: absolute; opacity: 0; }
.tell-mode:has(input:checked) { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.tell-mode:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 2px; }
.tell-mode .name { font-weight: 600; }
.tell-mode .blurb { color: var(--muted); font-size: .88rem; }
.tell-tabs { display: flex; flex-wrap: wrap; gap: .3rem; margin: .5rem 0; }
.tell-tabs button[aria-selected="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); font-weight: 600; }
.tell-prompts { list-style: none; padding: 0; margin: .5rem 0; display: grid; gap: .6rem; }
.tell-prompt { border: 1px solid var(--line); border-radius: 10px; background: var(--panel); padding: .7rem .9rem; }
.tell-prompt h3 { margin: 0 0 .25rem; font-size: 1rem; }
.tell-prompt .meta { color: var(--muted); font-size: .85rem; }
.tell-prompt ul { margin: .3rem 0 .3rem 1.1rem; padding: 0; }
.tell-badge { font-size: .75rem; padding: 0 .5rem; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
.tell-badge.warn { background: var(--warn-bg); }
.tell-suggest { border: 1px dashed var(--accent); border-radius: 10px; padding: .6rem .9rem; margin: .6rem 0; }
.tell-draft-actions { display: inline-flex; gap: .35rem; flex-wrap: wrap; margin-inline-start: .5rem; }

.tell-writer { display: grid; gap: .6rem; }
.writer-bar { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; }
.writer-bar .grow { flex: 1 1 14rem; }
.writer-title { font-size: 1.05rem; font-weight: 600; }
.writer-text { width: 100%; min-height: 55vh; font-size: 1.35rem; line-height: 1.7; padding: 1rem 1.2rem; border-radius: 12px; resize: vertical; }
.writer-state { color: var(--muted); font-size: .88rem; margin: 0; }
.writer-panel { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); padding: .7rem 1rem; }
.writer-panel > :first-child { margin-top: 0; }
.writer-panel[hidden] { display: none; }
.tell-sentence { margin: .6rem 0; padding: .5rem 0; border-top: 1px solid var(--line); }
.tell-sentence:first-child { border-top: 0; }
.tell-sentence .text { font-size: 1.15rem; margin: 0 0 .3rem; }
.issue-mark { background: color-mix(in srgb, var(--bad) 18%, transparent); border-bottom: 2px solid var(--bad); border-radius: 3px; padding: 0 .1em; }
.issue-mark[data-class="acceptable-but-awkward"], .issue-mark[data-class="stylistic-alternative"], .issue-mark[data-class="register-difference"], .issue-mark[data-class="regional-variation"] { background: color-mix(in srgb, var(--accent) 16%, transparent); border-bottom-color: var(--accent); }
.issue-mark[data-class="uncertain-analysis"], .issue-mark[data-class="semantically-unclear"] { background: var(--warn-bg); border-bottom-color: var(--muted); }
.issue-mark[data-state="rejected"] { background: transparent; border-bottom: 2px dotted var(--muted); opacity: .7; }
.tell-issue { border: 1px solid var(--line); border-radius: 10px; padding: .5rem .75rem; margin: .4rem 0; }
.tell-issue[data-state="rejected"] { opacity: .65; }
.tell-issue .label { font-weight: 600; }
.tell-ladder { display: flex; flex-wrap: wrap; gap: .3rem; margin: .4rem 0; }
.tell-ladder button[data-next="true"] { border-color: var(--accent); }
.tell-step { margin: .3rem 0; padding: .3rem .6rem; border-inline-start: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
.tell-step.refused { border-inline-start-color: var(--bad); background: color-mix(in srgb, var(--bad) 7%, transparent); }
.tell-step .src { color: var(--muted); font-size: .8rem; }
.tell-warning { background: var(--warn-bg); border: 1px solid var(--line); border-radius: 8px; padding: .5rem .75rem; margin: .4rem 0; }
.tell-diff { font-family: ui-monospace, Consolas, monospace; font-size: .9rem; white-space: pre-wrap; margin: .4rem 0; }
.tell-diff .added { background: color-mix(in srgb, var(--ok) 20%, transparent); }
.tell-diff .removed { background: color-mix(in srgb, var(--bad) 18%, transparent); text-decoration: line-through; }
.tell-versions { list-style: none; padding: 0; margin: 0; }
.tell-versions li { padding: .4rem 0; border-bottom: 1px solid var(--line); }
.tell-goals { list-style: none; padding: 0; }
.tell-goals li { display: flex; gap: .6rem; align-items: baseline; padding: .35rem 0; border-bottom: 1px solid var(--line); }
.tell-goals li[data-done="true"] .goal-text { text-decoration: line-through; color: var(--muted); }
.tell-evidence li { margin: .15rem 0; }
@media (max-width: 40rem) { .writer-text { font-size: 1.2rem; min-height: 45vh; } }
`;

export function ensureStyles(doc: Document): void {
  if (doc.getElementById('tell-styles')) return;
  const style = doc.createElement('style');
  style.id = 'tell-styles';
  style.textContent = CSS;
  doc.head.append(style);
}
