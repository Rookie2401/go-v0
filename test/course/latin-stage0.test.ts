// The Latin Stage 0 pack (data/stage0/la) with the FULL Latin lexicon loaded. The Stage 0 validator runs on the analyser's seed word list,
// so words such as avia, schola, clavis or pluit only warn there ("no reading"); this test reads every line of every scene and exit form with
// the whole lexicon (as the app does once it has loaded), and asks for a confirmed reading of every word and no alarm from the writing checks.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { laAdapter } from '../../src/adapters/la';
import { loadLatinLexicon } from '../../src/adapters/latin/lexicon-load';

beforeAll(async () => { await loadLatinLexicon(); }, 120_000);

const dir = path.resolve(__dirname, '../../data/stage0/la');
/** Every string of target-language text in the pack: scene lines, and every `text` in the exit forms. */
function texts(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const f of fs.readdirSync(path.join(dir, 'scenes')).sort()) {
    const s = JSON.parse(fs.readFileSync(path.join(dir, 'scenes', f), 'utf8')) as { id: string; lines: { text: string }[] };
    s.lines.forEach((l, i) => out.push({ where: `${s.id} line ${i + 1}`, text: l.text }));
  }
  const walk = (v: unknown, where: string): void => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (k === 'text' && typeof x === 'string') out.push({ where, text: x.replace(/{[^}]*}/g, '') }); // {x}: the learner's own words, not the pack's
      else walk(x, `${where}.${k}`);
    }
  };
  for (const f of fs.readdirSync(path.join(dir, 'exit')).sort()) walk(JSON.parse(fs.readFileSync(path.join(dir, 'exit', f), 'utf8')), f);
  return out;
}

describe('the Latin Stage 0 pack, read with the full lexicon', () => {
  const all = texts();

  it('has its scenes and exit forms', () => {
    expect(all.filter((t) => / line /.test(t.where)).length).toBeGreaterThanOrEqual(80);
    expect(all.filter((t) => t.where.includes('exit')).length).toBeGreaterThan(5);
  });

  it('every word has a confirmed reading', () => {
    const unread = all.flatMap(({ where, text }) => {
      const tokens = laAdapter.tokenize(text);
      const an = laAdapter.analyze(tokens);
      return tokens.flatMap((t, i) => (t.isWord && (!an[i].candidates[0]?.lemma || an[i].candidates[0]?.unconfirmed) ? [`${where}: ${t.surface}`] : []));
    });
    expect(unread).toEqual([]);
  });

  it('no line raises a writing alarm', () => {
    const alarms = all.flatMap(({ where, text }) => {
      const tokens = laAdapter.tokenize(text);
      return laAdapter.checkProduction(tokens, laAdapter.analyze(tokens), text).map((e) => `${where}: ${e.message} — ${text}`);
    });
    expect(alarms).toEqual([]);
  });
});
