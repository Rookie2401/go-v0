/**
 * The writing workspace's own stylesheet, injected once into the document so the shell's stylesheet stays untouched.
 * It uses the shell's colour variables (paper, ink, rule, accent), so light and dark follow the rest of the application.
 * It declares no colour literal of its own.
 */
const CSS = `
.tell-nav { display: flex; flex-wrap: wrap; gap: .25rem .5rem; margin: 0 0 1.25rem; padding-bottom: .6rem; border-bottom: 1px solid var(--rule); }
.tell-nav a { padding: .2rem .75rem; border-radius: 6px; text-decoration: none; color: var(--ink-soft); border: 1px solid transparent; }
.tell-nav a:hover { background: color-mix(in srgb, var(--ink) 3.5%, transparent); color: var(--ink); }
.tell-nav a[aria-current="page"] { border-color: var(--rule-strong); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--ink); font-weight: 600; }
.tell-modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: .7rem; margin: .7rem 0; border: 0; padding: 0; }
.tell-mode { position: relative; display: grid; gap: .15rem; padding: .7rem .9rem; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); cursor: pointer; }
.tell-mode input { position: absolute; opacity: 0; }
.tell-mode:has(input:checked) { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.tell-mode:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 3px; }
.tell-mode .name { font-weight: 600; }
.tell-mode .blurb { color: var(--muted); font-size: .92rem; font-style: italic; }
.tell-tabs { display: flex; flex-wrap: wrap; gap: .3rem; margin: .6rem 0; }
.tell-tabs button[aria-selected="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); font-weight: 600; }
.tell-prompts { list-style: none; padding: 0; margin: .6rem 0; border-top: 1px solid var(--divider); }
.tell-prompt { border-bottom: 1px solid var(--divider); padding: .8rem .6rem; }
.tell-prompt:hover { padding-left: 1rem; background: color-mix(in srgb, var(--ink) 3.5%, transparent); }
.tell-prompt h3 { margin: 0 0 .25rem; font-size: 1.1rem; }
.tell-prompt .meta { color: var(--muted); font-size: .9rem; font-style: italic; }
.tell-prompt ul { margin: .3rem 0 .3rem 1.1rem; padding: 0; }
.tell-badge { display: inline-block; font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; padding: 0 .55rem; border-radius: 999px; border: 1px solid var(--rule-strong); color: var(--muted); }
.tell-badge.warn { background: var(--warn-bg); }
.tell-suggest { border: 1px dashed var(--accent); border-radius: 8px; padding: .7rem 1rem; margin: .7rem 0; }
.tell-draft-actions { display: inline-flex; gap: .35rem; flex-wrap: wrap; margin-inline-start: .5rem; }

.tell-writer { display: grid; gap: .7rem; }
.writer-bar { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; }
.writer-bar .grow { flex: 1 1 14rem; }
.writer-title { font-size: 1.15rem; font-weight: 600; }
.writer-text { width: 100%; min-height: 55vh; font-size: 1.35rem; line-height: 1.7; padding: 1.1rem 1.3rem; border-radius: 8px; resize: vertical; }
.writer-state { color: var(--muted); font-size: .92rem; font-style: italic; margin: 0; }
.writer-panel { border: 1px solid var(--divider); border-radius: 8px; background: var(--panel); box-shadow: var(--shadow-raised); padding: .8rem 1.1rem; }
.writer-panel > :first-child { margin-top: 0; }
.writer-panel[hidden] { display: none; }
.tell-sentence { margin: .6rem 0; padding: .55rem 0; border-top: 1px solid var(--divider); }
.tell-sentence:first-child { border-top: 0; }
.tell-sentence .text { font-size: 1.2rem; margin: 0 0 .3rem; }
.issue-mark { background: color-mix(in srgb, var(--bad) 18%, transparent); border-bottom: 2px solid var(--bad); border-radius: 3px; padding: 0 .1em; }
.issue-mark[data-class="acceptable-but-awkward"], .issue-mark[data-class="stylistic-alternative"], .issue-mark[data-class="register-difference"], .issue-mark[data-class="regional-variation"] { background: color-mix(in srgb, var(--accent) 16%, transparent); border-bottom-color: var(--accent); }
.issue-mark[data-class="uncertain-analysis"], .issue-mark[data-class="semantically-unclear"] { background: var(--warn-bg); border-bottom-color: var(--muted); }
.issue-mark[data-state="rejected"] { background: transparent; border-bottom: 2px dotted var(--muted); opacity: .7; }
.tell-issue { border: 1px solid var(--divider); border-radius: 6px; padding: .55rem .85rem; margin: .45rem 0; }
.tell-issue[data-state="rejected"] { opacity: .65; }
.tell-issue .label { font-weight: 600; }
.tell-ladder { display: flex; flex-wrap: wrap; gap: .3rem; margin: .45rem 0; }
.tell-ladder button[data-next="true"] { border-color: var(--accent); }
.tell-step { margin: .35rem 0; padding: .35rem .7rem; border-inline-start: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
.tell-step.refused { border-inline-start-color: var(--bad); background: color-mix(in srgb, var(--bad) 7%, transparent); }
.tell-step .src { color: var(--muted); font-size: .85rem; letter-spacing: .04em; }
.tell-warning { background: var(--warn-bg); border: 1px solid var(--divider); border-inline-start: 3px solid var(--accent-soft); border-radius: 6px; padding: .55rem .85rem; margin: .45rem 0; }
.tell-diff { font-family: ui-monospace, Consolas, monospace; font-size: .92rem; white-space: pre-wrap; margin: .45rem 0; }
.tell-diff .added { background: color-mix(in srgb, var(--ok) 20%, transparent); }
.tell-diff .removed { background: color-mix(in srgb, var(--bad) 18%, transparent); text-decoration: line-through; }
.tell-versions { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--divider); }
.tell-versions li { padding: .5rem .6rem; border-bottom: 1px solid var(--divider); }
.tell-goals { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--divider); }
.tell-goals li { display: flex; gap: .6rem; align-items: baseline; padding: .45rem .6rem; border-bottom: 1px solid var(--divider); }
.tell-goals li[data-done="true"] .goal-text { text-decoration: line-through; color: var(--muted); }
.tell-evidence li { margin: .15rem 0; }
@media (max-width: 40rem) { .writer-text { font-size: 1.2rem; min-height: 45vh; } }
@media (prefers-reduced-motion: no-preference) { .tell-prompt { transition: padding-left .15s, background-color .15s; } }
`;

export function ensureStyles(doc: Document): void {
  if (doc.getElementById('tell-styles')) return;
  const style = doc.createElement('style');
  style.id = 'tell-styles';
  style.textContent = CSS;
  doc.head.append(style);
}
