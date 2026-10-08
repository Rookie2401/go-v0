/**
 * Adjective rows and the agreement / comparison generator (Bokmål and Nynorsk). MACHINE-DRAFTED, pending native review.
 *
 * Row format:   lemma[/flags] = gloss [| key:value; key:value] [^] [#register]
 *
 * Flags: `v` stressed vowel at the end, neuter doubles t (ny → nytt, blå → blått); `i` invariable (bra, rosa, gratis);
 * `m` compared with mer / mest; `s` no syncope before -e (ren, pen).
 * Overrides: `n` neuter, `pl` plural and definite, `f` feminine, `cmp`, `sup` (the superlative, without the definite -e).
 * Regular rules (recon B2): neuter adds -t except after -t, -ig, -sk, -ende, an unstressed -e (and -nn → -nt); the plural / definite
 * adds -e, and an adjective in -el / -en / -er loses its e (gammel → gamle, vakker → vakre, åpen → åpne).
 */
import type { RegisterTag } from '../../core';
import type { NoAdjective, NoStandard } from './types';
import { syllables } from './nouns';

const endsE = (w: string): boolean => /e$/.test(w);

function syncope(lemma: string): string | undefined {
  if (syllables(lemma) < 2) return undefined;
  const m = /^(.*[^aeiouyæøå])(el|en|er|al)$/.exec(lemma);
  if (!m) return undefined;
  const pre = m[1].replace(/([^aeiouyæøå])\1$/, '$1');
  return `${pre}${m[2][1]}e`;
}

export function parseAdjectiveRows(src: string, std: NoStandard): NoAdjective[] {
  const out: NoAdjective[] = [];
  for (const line of src.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    const eq = s.indexOf('=');
    if (eq < 0) throw new Error(`adjective row without "=": ${s}`);
    const head = s.slice(0, eq).trim();
    let rest = s.slice(eq + 1).trim();
    const register: RegisterTag[] = [];
    let unverified = false;
    for (;;) {
      const m = /\s(\^|#[a-z-]+)$/.exec(rest);
      if (!m) break;
      if (m[1] === '^') unverified = true; else register.push(m[1].slice(1) as RegisterTag);
      rest = rest.slice(0, m.index).trim();
    }
    const bar = rest.indexOf('|');
    const gloss = (bar < 0 ? rest : rest.slice(0, bar)).trim();
    const ov: Record<string, string[]> = {};
    if (bar >= 0) for (const kv of rest.slice(bar + 1).split(';')) {
      const c = kv.indexOf(':');
      if (c > 0) ov[kv.slice(0, c).trim()] = kv.slice(c + 1).split('/').map((x) => x.trim()).filter(Boolean);
    }
    const [lemma, flags = ''] = head.split('/').map((x) => x.trim());
    const inv = flags.includes('i');
    const periph = flags.includes('m');

    // plural / definite
    let plural: string[];
    if (ov.pl) plural = ov.pl;
    else if (inv || endsE(lemma)) plural = [lemma];
    else {
      const sy = flags.includes('s') ? undefined : syncope(lemma);
      plural = [sy ?? `${lemma}e`];
    }
    // neuter
    let neuter: string[];
    if (ov.n) neuter = ov.n;
    else if (inv || /(ig|sk|t|ende)$/.test(lemma) || (endsE(lemma) && !flags.includes('v'))) neuter = [lemma];
    else if (/nn$/.test(lemma)) neuter = [`${lemma.slice(0, -2)}nt`];
    else if (flags.includes('v')) neuter = [`${lemma}tt`];
    else neuter = [`${lemma}t`];
    // comparison
    const base = (plural[0] ?? lemma).replace(/e$/, '');
    const regular = !inv && !periph;
    const cmpEnding = std === 'nb' ? 'ere' : 'are';
    const supEnding = std === 'nb' ? (/(ig|lig|leg|som)$/.test(lemma) ? 'st' : 'est') : 'ast';
    const comparative = ov.cmp ?? (regular ? [`${base}${cmpEnding}`] : []);
    const superlative = ov.sup ?? (regular ? [`${base}${supEnding}`] : []);
    const superlativeDef = superlative.map((x) => (endsE(x) ? x : `${x}e`));
    out.push({
      lemma, gloss, neuter, plural, feminine: ov.f, comparative, superlative, superlativeDef,
      periphrastic: periph, invariable: inv, source: 'machine-draft', unverified: unverified || undefined, register: register.length ? register : undefined,
    });
  }
  return out;
}
