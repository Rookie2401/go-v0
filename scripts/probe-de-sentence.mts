import { deAdapter as de } from '../src/adapters/de';

const show = (s: string) => {
  const tokens = de.tokenize(s);
  const analyzed = de.analyze(tokens);
  console.log('\n== ' + s);
  analyzed.forEach((a, i) => {
    if (tokens[i].surface.toLowerCase() === tokens[i].surface.toUpperCase()) return;
    const c = a.candidates[0];
    console.log(`  ${tokens[i].surface}: ${c?.lemma}/${c?.pos} ${JSON.stringify(c?.morph ?? {})} conf=${c?.confidence}${c?.unconfirmed ? ' UNCONFIRMED' : ''}${c?.role ? ` role="${c.role}"` : ''}${c?.unit ? ` unit=${c.unit.display}` : ''}${c?.parts ? ` parts=${c.parts.map((p) => `${p.text}:${p.kind}`).join('+')}` : ''}  [alts ${a.candidates.length - 1}]`);
  });
  const pats = de.detectPatterns?.(tokens, analyzed) ?? [];
  console.log('  patterns:', pats.map((p) => p.key).join(', ') || 'none');
  const errs = de.checkProduction?.(tokens, analyzed, s) ?? [];
  console.log('  production:', errs.map((e) => `${e.category}: ${e.message}${e.suggestion ? ` → "${e.suggestion.replacement}"` : ''}`).join(' | ') || 'none');
};

for (const s of process.argv.slice(2)) show(s);
