/**
 * The legal drafts (docs/legal/PRIVACY-POLICY.md and TERMS.md) rendered into the page. They are bundled as text at build time and
 * turned into DOM by this small, safe Markdown reader (headings, paragraphs, lists, block quotes, bold, italic, code and links);
 * everything reaches the DOM through text nodes, never as markup, and a link is kept only when it is http(s), mailto or a #/ route.
 */
import PRIVACY_MD from '../../docs/legal/PRIVACY-POLICY.md?raw';
import TERMS_MD from '../../docs/legal/TERMS.md?raw';
import { h } from './dom';

export const PRIVACY_POLICY_MD: string = PRIVACY_MD;
export const TERMS_MD_TEXT: string = TERMS_MD;

const SAFE_HREF = /^(https?:\/\/|mailto:|#\/)/i;

function inline(text: string): Node[] {
  const out: Node[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    if (m[1] !== undefined) out.push(h('strong', {}, m[1]));
    else if (m[2] !== undefined) out.push(h('em', {}, m[2]));
    else if (m[3] !== undefined) out.push(h('code', {}, m[3]));
    else if (SAFE_HREF.test(m[5])) out.push(h('a', { href: m[5] }, m[4]));
    else out.push(document.createTextNode(m[4]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

/** `topLevel`: the heading level a Markdown `#` becomes (the screen already has its own h1, so a document usually starts at 2). */
export function renderMarkdown(src: string, topLevel = 2): HTMLElement {
  const root = h('div', { class: 'legal-text' });
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;
  let quote: string[] = [];
  const flushPara = (): void => { if (para.length) { root.append(h('p', {}, ...inline(para.join(' ')))); para = []; } };
  const flushList = (): void => {
    if (!list) return;
    root.append(h(list.ordered ? 'ol' : 'ul', {}, ...list.items.map((i) => h('li', {}, ...inline(i)))));
    list = undefined;
  };
  const flushQuote = (): void => { if (quote.length) { root.append(h('div', { class: 'notice' }, h('p', {}, ...inline(quote.join(' '))))); quote = []; } };
  const flushAll = (): void => { flushPara(); flushList(); flushQuote(); };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quoted = /^>\s?(.*)$/.exec(line);
    if (!line.trim()) { flushAll(); continue; }
    if (/^---+$/.test(line.trim())) { flushAll(); root.append(h('hr')); continue; }
    if (heading) { flushAll(); root.append(h(`h${Math.min(6, topLevel + heading[1].length - 1)}`, {}, ...inline(heading[2]))); continue; }
    if (quoted) { flushPara(); flushList(); quote.push(quoted[1]); continue; }
    if (bullet || numbered) {
      flushPara(); flushQuote();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    if (list && /^\s+\S/.test(raw)) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue; } // a wrapped list item
    flushList(); flushQuote();
    para.push(line.trim());
  }
  flushAll();
  return root;
}
