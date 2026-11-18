// Latin production checks (src/adapters/latin/production.ts): each rule fires on its own shape and stays silent on correct Latin, and the
// whole set raises no alarm on native prose: every sentence of data/corpus/la (the Clementine Vulgate chapters, Ritchie's Fabulae Faciles,
// Caesar's Gallic War 1) is checked, and any flag there is a false alarm.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { laAdapter } from '../../src/adapters/la';
import { loadLatinLexicon } from '../../src/adapters/latin/lexicon-load';

beforeAll(async () => { await loadLatinLexicon(); }, 120_000);

const check = (s: string) => {
  const tokens = laAdapter.tokenize(s);
  return laAdapter.checkProduction(tokens, laAdapter.analyze(tokens), s);
};
const apply = (s: string, sug: { start: number; end: number; replacement: string }): string => s.slice(0, sug.start) + sug.replacement + s.slice(sug.end);

describe('Latin production checks: each rule', () => {
  it('a detached -que is joined to its word', () => {
    const s = 'Senatus populus que Romanus venit.';
    const [e] = check(s);
    expect(e).toMatchObject({ category: 'spelling' });
    expect(apply(s, e!.suggestion!)).toBe('Senatus populusque Romanus venit.');
    expect(check('Senatus populusque Romanus venit.')).toEqual([]);
  });

  it('a and e before a vowel or h become ab and ex', () => {
    const s = 'Puer a amico venit et e urbe exit.';
    const found = check(s).filter((e) => e.category === 'spelling');
    expect(found.map((e) => e.suggestion?.replacement)).toEqual(['ab', 'ex']);
    expect(check('Puer ab amico venit et ex urbe exit.')).toEqual([]);
    expect(check('Puer a patre venit et e silva exit.')).toEqual([]); // before a consonant a and e are right
    expect(check('Discipuli venerunt a Ierusalem.')).toEqual([]); // a consonantal i
  });

  it('a preposition before a case it never takes', () => {
    expect(check('Puer ad urbe ambulat.')).toEqual([expect.objectContaining({ category: 'case', tokenIndexes: [1, 2] })]);
    expect(check('Sine aquam venio.').map((e) => e.category)).toEqual(['case']);
    expect(check('Cum haec audiret, venit.')).toEqual([]); // cum is not checked: in prose it is mostly the conjunction
    expect(check('Propter eius magnitudinem venit.')).toEqual([]); // a genitive before the governed noun
    expect(check('Puer ad urbem ambulat.')).toEqual([]);
    expect(check('Sine aqua venio.')).toEqual([]);
    expect(check('In urbem venit et in urbe manet.')).toEqual([]); // in takes both
  });

  it('a personal pronoun before a verb of another person or number', () => {
    expect(check('Ego amat Deum.').map((e) => e.category)).toEqual(['agreement']);
    expect(check('Tu amat Deum.').map((e) => e.category)).toEqual(['agreement']);
    expect(check('Et ne nos inducas in tentationem.')).toEqual([]); // nos is as often an object: not checked
    expect(check('Ego amo Deum.')).toEqual([]);
    expect(check('Nos sumus discipuli.')).toEqual([]);
    expect(check('Ego et tu sumus amici.')).toEqual([]); // tu does not begin its clause
  });

  it('a finite verb where possum, volo or debeo need an infinitive', () => {
    expect(check('Possum venio.').map((e) => e.category)).toEqual(['syntax']);
    expect(check('Volo video Romam.').map((e) => e.category)).toEqual(['syntax']);
    expect(check('Possum venire.')).toEqual([]);
    expect(check('Volo videre Romam.')).toEqual([]);
    expect(check('Spiritus ubi vult spirat.')).toEqual([]); // a third-person form ends its clause in native prose
  });
});

describe('Latin production checks on native prose', () => {
  const dir = path.resolve(__dirname, '../../data/corpus/la');
  const sentences: { doc: string; id: string; text: string }[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as { id: string; sections: { paragraphs: { sentences: { id: string; text: string }[] }[] }[] };
    for (const s of doc.sections) for (const p of s.paragraphs) for (const x of p.sentences) sentences.push({ doc: doc.id, id: x.id, text: x.text });
  }

  it('raises no alarm on the Vulgate, Ritchie and Caesar sentences of data/corpus/la', () => {
    expect(sentences.length).toBeGreaterThan(500);
    const alarms = sentences.flatMap((s) => check(s.text).map((e) => `${s.doc} ${s.id} [${e.category}] ${e.message} — ${s.text}`));
    expect(alarms).toEqual([]);
  }, 120_000);
});
