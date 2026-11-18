import { lexiconFor } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/norwegian/lexicon';
import fs from 'node:fs';
for (const std of ['nb', 'nn'] as const) {
  const lex = lexiconFor(std);
  console.log(std, JSON.stringify(lex.stats));
  const m = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' ');
  fs.writeFileSync(`C:/Users/CJWal/dev/tmp-mem/nbaudit/${std}-words.txt`, lex.words.map((w) => `${w.form}\t${w.lemma}\t${w.pos}\t${m(w.morph)}\t${w.gloss}${w.role ? `\t[${w.role}]` : ''}${w.register ? `\t#${w.register}` : ''}`).join('\n'));
  fs.writeFileSync(`C:/Users/CJWal/dev/tmp-mem/nbaudit/${std}-nouns.txt`, lex.nouns.map((n) => `${n.lemma}\t${n.gender}\t${n.defSg.map((d) => d.form).join('/')}\t${n.plural.join('/')}\t${n.defPl.join('/')}\t${n.gloss}${n.massNoun ? '\tMASS' : ''}${n.pluralOnly ? '\tPLONLY' : ''}${n.unverified ? '\t^' : ''}`).join('\n'));
  fs.writeFileSync(`C:/Users/CJWal/dev/tmp-mem/nbaudit/${std}-verbs.txt`, lex.verbs.map((v) => `${v.infinitives.join('/')}\t${v.cls}\t${v.present.join('/')}\t${v.past.join('/')}\t${v.supine.join('/')}\t${v.imperative.join('/')}\t${v.passive.join('/')}\t${v.gloss}${v.deponent ? '\tDEP' : ''}${v.reflexive ? '\tREFL' : ''}${v.aux ? '\tAUX' : ''}${v.unverified ? '\t^' : ''}`).join('\n'));
  fs.writeFileSync(`C:/Users/CJWal/dev/tmp-mem/nbaudit/${std}-adjs.txt`, lex.adjectives.map((a) => `${a.lemma}\t${a.neuter.join('/')}\t${a.plural.join('/')}\t${(a.feminine ?? []).join('/')}\t${a.comparative.join('/')}\t${a.superlative.join('/')}\t${a.gloss}${a.invariable ? '\tINV' : ''}${a.periphrastic ? '\tMER' : ''}${a.unverified ? '\t^' : ''}`).join('\n'));
}
