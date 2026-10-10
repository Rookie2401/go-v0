/**
 * Albanian paradigm generation (GoLearn Linguistic Engine V2, Stage 3): the forms a lexeme takes, as the shared
 * `GeneratedParadigm` shape of src/core/paradigm.ts, produced ONLY from what the adapter's own analysis generates:
 * the word list (lexicon-*.ts), `nounForms`, `adjectiveForms`, `verbForms` and the closed-class pronoun list. Nothing
 * here has a rule of its own: the cells are the analysis' forms with their union features (Case "Nom,Acc",
 * Mood "Ind,Sub", Person "2,3") taken apart into one cell per value, so a table cell and the analysis of the same
 * written form carry the same keys.
 *
 *   noun       Gender (a fact of the word) × Case (Nom, Acc, 'Gen,Dat', Abl) × Definite (Ind, Def) × Number.
 *              Albanian genitive and dative share their forms, so they are ONE row ('Gen,Dat', the dictionary's "dative"
 *              row); the ablative is its own row, because the indefinite plural ablative has a form of its own (librash).
 *   adjective  Gender (Masc, Fem) × Number, the linking article inside the form (i mirë, e mirë, të mirë, të mira). The
 *              word list gives an adjective no case or definiteness; the article of the other cases is a note.
 *   verb       Voice (Act, Mid) × Mood (Ind, Sub, Imp, Opt, Adm) × Tense (Pres, Imp, Past = aorist) × Person × Number, plus
 *              the participle and the gerund (duke + participle) as single cells. Future, perfect, pluperfect,
 *              conditional and progressive are CONSTRUCTIONS (`constructions` names them): they are not cells.
 *   pronoun    the personal pronouns (unë, ti, ai, ne, ju): Case × Number (× Gender), full forms and short (clitic) forms.
 *
 * What it will not do: a lemma outside the word list gets nothing, except a verb in -oj (the productive class the
 * ending rules of morph-verb-guess.ts also guess at): its paradigm is made from the regular -oj rules, says "guessed from
 * the ending" in its notes and has no template. Nouns and adjectives are never guessed from a lemma.
 */
import type { GeneratedParadigm, Paradigm, ParadigmCell, ParadigmLayout, PartOfSpeech } from '../../core';
import { featureKey, mergeParadigm } from '../../core/paradigm';
import { linkingArticle } from './function-article';
import { formsOf as closedClassForms } from './function-build';
import { PERSONAL } from './function-pronouns';
import { SQ_LEXEMES } from './morphology';
import { adjectiveForms } from './morph-adjective';
import { nounForms } from './morph-noun';
import { verbForms } from './morph-verb';
import { sqTableTagsDetail } from './table-tags';
import type { SqForm, SqLexeme } from './types';
import { V } from './types';
import { SQ_ANALYZER } from './version';

type Features = Record<string, string>;
interface Cell { features: Features; form: string; note?: string }

const nfc = (s: string): string => s.normalize('NFC');
const lc = (s: string): string => nfc(s).toLowerCase();
const GENDER_WORD: Record<string, string> = { m: 'masculine', f: 'feminine', n: 'neuter' };

// ───────────────────────────── the lexemes of the word list, by lemma ─────────────────────────────

const BY_LEMMA = (() => {
  const map = new Map<string, SqLexeme[]>();
  for (const lx of SQ_LEXEMES) {
    const pos = lx.pos === 'AUX' ? 'VERB' : lx.pos;
    const k = `${lc(lx.lemma)}|${pos}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push(lx);
  }
  return map;
})();

const ARTICLE_LEMMA = /^(?:i|e|të|së) (.+)$/u;

function lexemesOf(lemma: string, pos: PartOfSpeech): SqLexeme[] {
  const wanted = pos === 'AUX' ? 'VERB' : pos;
  const bare = pos === 'ADJ' ? (ARTICLE_LEMMA.exec(lc(lemma))?.[1] ?? lc(lemma)) : lc(lemma);
  return BY_LEMMA.get(`${bare}|${wanted}`) ?? [];
}

// ───────────────────────────── helpers: taking a union reading apart ─────────────────────────────

const CASE_ROW: Record<string, string> = { Nom: 'Nom', Acc: 'Acc', Gen: 'Gen,Dat', Dat: 'Gen,Dat', Abl: 'Abl' };
const split = (v: string | undefined): string[] => (v ? v.split(',').filter(Boolean) : []);
const ORDER = {
  Number: ['Sing', 'Plur'], Definite: ['Ind', 'Def'], Case: ['Nom', 'Acc', 'Gen,Dat', 'Abl'], Gender: ['Masc', 'Fem', 'Neut'],
  Person: ['1', '2', '3'], Voice: ['Act', 'Mid'], Mood: ['Ind', 'Sub', 'Imp', 'Opt', 'Adm'], Tense: ['Pres', 'Imp', 'Past'],
  VerbForm: ['Fin', 'Part', 'Ger'], Clitic: ['Yes'],
} as const;
const rank = (key: keyof typeof ORDER, v: string | undefined): number => {
  const i = v === undefined ? -1 : (ORDER[key] as readonly string[]).indexOf(v);
  return i < 0 ? (v === undefined ? -1 : 99) : i;
};
function sortCells(cells: Cell[], keys: Array<keyof typeof ORDER>): Cell[] {
  return cells.map((c, i) => ({ c, i })).sort((a, b) => {
    for (const k of keys) { const d = rank(k, a.c.features[k]) - rank(k, b.c.features[k]); if (d) return d; }
    return a.i - b.i;
  }).map((x) => x.c);
}

/** Take the union features of a reading apart: one cell per combination. `specific` = the reading named exactly this cell. */
function expand(forms: ReadonlyArray<{ form: string; morph: Features }>, dims: string[], map: Record<string, Record<string, string>> = {}): Array<Cell & { specific: boolean }> {
  const out: Array<Cell & { specific: boolean }> = [];
  for (const f of forms) {
    let combos: Features[] = [{ ...f.morph }];
    let specific = true;
    for (const d of dims) {
      const raw = split(f.morph[d]);
      if (raw.length === 0) continue;
      const vals = [...new Set(raw.map((v) => map[d]?.[v] ?? v))];
      if (raw.length > 1) specific = false;
      combos = combos.flatMap((c) => vals.map((v) => ({ ...c, [d]: v })));
    }
    for (const features of combos) out.push({ features, form: nfc(f.form), specific });
  }
  return out;
}

/**
 * One cell per feature bundle and form. Where a union reading and a specific reading name the same cell with different
 * forms, the specific one wins (librave is "genitive-dative or ablative plural", but the indefinite ablative plural is
 * librash).
 */
function settle(cells: Array<Cell & { specific: boolean }>): Cell[] {
  const hasSpecific = new Set(cells.filter((c) => c.specific).map((c) => featureKey(c.features)));
  const seen = new Set<string>();
  const out: Cell[] = [];
  for (const c of cells) {
    const k = featureKey(c.features);
    if (!c.specific && hasSpecific.has(k) && !cells.some((o) => o.specific && featureKey(o.features) === k && o.form === c.form)) continue;
    const id = `${k}|${c.form}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ features: c.features, form: c.form, ...(c.note ? { note: c.note } : {}) });
  }
  return out;
}

// ───────────────────────────── nouns ─────────────────────────────

const CASE_LABELS: Array<[string, string]> = [['Nom', 'nominative'], ['Acc', 'accusative'], ['Gen,Dat', 'genitive / dative'], ['Abl', 'ablative']];
const NOUN_LAYOUT: ParadigmLayout = {
  columns: { key: 'Definite', values: [['Ind', 'indefinite (a / no article)'], ['Def', 'definite (the)']] },
  rows: { key: 'Case', values: CASE_LABELS },
  sections: ['Number'],
  labels: { Number: { Sing: 'singular', Plur: 'plural' } },
};

/** The class of the singular, by the definite nominative (what morph-noun.ts keys its rules on). */
function nounClass(lex: SqLexeme): string | undefined {
  const d = (lex.def ?? '').toLowerCase();
  if (!d) return undefined;
  if (d.endsWith('ai')) return 'definite in -ai (vëllai)';
  if (/[iu]$/.test(d)) return 'definite in -i / -u (libri, shoku)';
  if (/[eë]ja$/.test(d)) return 'definite in -eja / -ëja (kafeja)';
  if (d.endsWith('ia')) return 'definite in -ia (shtëpia)';
  if (d.endsWith('ja')) return 'definite in -ja (lulja, fëmija)';
  if (d.endsWith('a')) return 'definite in consonant + -a (vajza)';
  return undefined;
}

function nounParadigm(lexemes: SqLexeme[]): GeneratedParadigm | undefined {
  const raw: Array<Cell & { specific: boolean }> = [];
  for (const lx of lexemes) {
    let forms: SqForm[];
    try { forms = nounForms(lx); } catch { continue; }
    raw.push(...expand(forms, ['Case', 'Number', 'Definite'], { Case: CASE_ROW }));
  }
  const cells = sortCells(settle(raw), ['Number', 'Definite', 'Case']);
  if (cells.length === 0) return undefined;
  const lx = lexemes[0];
  const notes: string[] = [];
  const genDefSg = cells.find((c) => c.features.Case === 'Gen,Dat' && c.features.Number === 'Sing' && c.features.Definite === 'Def') ?? cells.find((c) => c.features.Case === 'Gen,Dat');
  notes.push(
    'Albanian genitive and dative share their forms (one row). The genitive stands after the noun it belongs to, with a linking article that agrees with THAT noun: i, e, të or së'
    + `${genDefSg ? ` (${['i', 'e', 'të', 'së'].map((a) => `${a} ${genDefSg.form}`).join(', ')})` : ''}. The dative is the same form without an article. The ablative singular equals the genitive-dative; the indefinite plural ablative has its own form.`,
  );
  if (!cells.some((c) => c.features.Number === 'Plur')) notes.push('No plural is in use for this word (the word list states none).');
  if (!cells.some((c) => c.features.Case === 'Acc' && c.features.Number === 'Sing' && c.features.Definite === 'Def')) {
    notes.push('The word list does not state this word\'s definite endings and the rules do not reach its shape: only the forms listed by hand are given.');
  }
  if (lx.pos === 'PROPN' && lx.def === lx.lemma) notes.push('A personal name is already in its definite form (Beni, Benin, Benit); it has no indefinite forms.');
  if (lexemes.some((l) => (l.forms ?? []).length)) notes.push('Some forms are listed by hand in the word list and replace the rule\'s form for their cell.');
  if (lexemes.length > 1) notes.push('The word list holds more than one entry for this spelling; their forms are merged.');
  const cls = nounClass(lx);
  const reached = cells.some((c) => c.features.Case === 'Acc' && c.features.Number === 'Sing' && c.features.Definite === 'Def');
  return {
    kind: 'noun-declension', cells, layout: NOUN_LAYOUT, notes,
    ...(cls && reached && lx.gender ? { template: `${GENDER_WORD[lx.gender]}, ${cls}` } : {}),
  };
}

// ───────────────────────────── adjectives ─────────────────────────────

const ADJ_LAYOUT: ParadigmLayout = {
  columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] },
  rows: { key: 'Gender', values: [['Masc', 'masculine'], ['Fem', 'feminine']] },
};

/** The linking article of the nominative, which is the article shown in the table (djali i mirë, vajza e mirë, djemtë e mirë, të mirë). */
const NOM_ARTICLE: Record<string, string> = { 'Masc|Sing': 'i', 'Fem|Sing': 'e', 'Masc|Plur': 'të', 'Fem|Plur': 'të' };

function adjectiveParadigm(lexemes: SqLexeme[]): GeneratedParadigm | undefined {
  const raw: Array<Cell & { specific: boolean }> = [];
  for (const lx of lexemes) {
    let forms: SqForm[];
    try { forms = adjectiveForms(lx); } catch { continue; }
    raw.push(...expand(forms, ['Gender', 'Number']).map((c) => ({
      ...c,
      form: lx.articulated ? `${NOM_ARTICLE[`${c.features.Gender}|${c.features.Number}`] ?? ''} ${c.form}`.trim() : c.form,
    })));
  }
  const cells = sortCells(settle(raw), ['Number', 'Gender']);
  if (cells.length === 0) return undefined;
  const lx = lexemes[0];
  const notes: string[] = [];
  if (lx.articulated) {
    // from the adapter's own article table (function-article.ts): the form after a definite noun, and after an indefinite one
    const art = (gender: 'Masc' | 'Fem', number: 'Sing' | 'Plur', c: 'Nom' | 'Acc' | 'Gen', definite: 'Def' | 'Ind'): string =>
      linkingArticle({ gender, number, case: c, definite, adjacent: true })[0] ?? '';
    notes.push(
      'The linking article is shown for the nominative (it agrees with the noun the adjective belongs to). It changes with the case of that noun: '
      + `masculine singular ${art('Masc', 'Sing', 'Nom', 'Def')} in the nominative, ${art('Masc', 'Sing', 'Acc', 'Def')} in the accusative after a definite noun (${art('Masc', 'Sing', 'Acc', 'Ind')} after an indefinite one), ${art('Masc', 'Sing', 'Gen', 'Def')} in the genitive-dative; `
      + `feminine singular ${art('Fem', 'Sing', 'Nom', 'Def')} in the nominative, ${art('Fem', 'Sing', 'Gen', 'Def')} in the genitive-dative after a definite noun (${art('Fem', 'Sing', 'Gen', 'Ind')} after an indefinite one); `
      + `plural ${art('Masc', 'Plur', 'Nom', 'Def')} after a definite noun (${art('Masc', 'Plur', 'Nom', 'Ind')} after an indefinite one), ${art('Masc', 'Plur', 'Gen', 'Def')} in the genitive-dative.`,
    );
  } else {
    notes.push('This adjective is not written with a linking article in the word list, so the forms are shown bare.');
  }
  notes.push('The word list gives an adjective no case, definiteness or degree: the comparative (më i mirë) and the superlative are constructions.');
  if (lexemes.length > 1) notes.push('The word list holds more than one entry for this spelling; their forms are merged.');
  return { kind: 'adjective-declension', cells, layout: ADJ_LAYOUT, notes, template: lx.articulated ? 'adjective with a linking article' : 'adjective without a linking article' };
}

// ───────────────────────────── verbs ─────────────────────────────

const VERB_LAYOUT: ParadigmLayout = {
  columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] },
  rows: { key: 'Person', values: [['1', 'first person (I, we)'], ['2', 'second person (you)'], ['3', 'third person (he, she, it, they)']] },
  sections: ['Voice', 'Mood', 'Tense'],
  labels: {
    Voice: { Act: 'active', Mid: 'non-active (mediopassive)' },
    Mood: { Ind: 'indicative', Sub: 'subjunctive (after të)', Imp: 'imperative', Opt: 'optative (wishes)', Adm: 'admirative (surprise, hearsay)' },
    Tense: { Pres: 'present', Imp: 'imperfect', Past: 'aorist (simple past)' },
  },
};

const VERB_CONSTRUCTIONS = ['future', 'perfect', 'pluperfect', 'conditional', 'progressive-po', 'gerund-duke'];
const VERB_CONSTRUCTION_NOTE = 'Not cells, because they are built with other words: future (do të + subjunctive: do të punoj), perfect (kam + participle: kam punuar), pluperfect (kisha + participle), conditional (do të + imperfect), progressive (po + present). The gerund is duke + the participle.';

function verbCells(lexemes: SqLexeme[]): Cell[] {
  const raw: Array<Cell & { specific: boolean }> = [];
  for (const lx of lexemes) {
    let forms: SqForm[];
    try { forms = verbForms(lx); } catch { continue; }
    raw.push(...expand(forms, ['Person', 'Mood', 'Number']));
    // a verb that exists only in the non-active takes u: duke u lutur
    if (lx.participle) raw.push({ features: { VerbForm: 'Ger' }, form: `duke ${lx.nonActive === 'only' ? 'u ' : ''}${lx.participle}`, specific: true, note: lx.nonActive === 'only' ? 'duke u + participle' : 'duke + participle' });
  }
  return sortCells(settle(raw), ['VerbForm', 'Voice', 'Mood', 'Tense', 'Number', 'Person']);
}

function missingNote(cells: Cell[], lx: SqLexeme, guessed: boolean): string | undefined {
  const has = (f: (c: Cell) => boolean): boolean => cells.some(f);
  const missing: string[] = [];
  if (!has((c) => c.features.Mood === 'Ind' && c.features.Tense === 'Pres' && c.features.Voice === 'Act')) missing.push('present');
  if (!has((c) => c.features.Mood === 'Ind' && c.features.Tense === 'Imp' && c.features.Voice === 'Act') && !(lx.nonActive === 'only')) missing.push('imperfect');
  if (!has((c) => c.features.Tense === 'Past')) missing.push('aorist');
  if (!has((c) => c.features.VerbForm === 'Part')) missing.push('participle');
  if (!guessed) {
    if (!has((c) => c.features.Mood === 'Opt')) missing.push('optative');
    if (!has((c) => c.features.Mood === 'Adm')) missing.push('admirative');
    if (!has((c) => c.features.Voice === 'Mid')) missing.push('non-active');
  }
  if (!missing.length) return undefined;
  const why = missing.some((m) => m === 'optative' || m === 'admirative') ? ' The rules reach the optative and the admirative only for verbs in -oj (the admirative also needs a participle in -uar) and for verbs whose entry lists them.' : '';
  return `Not generated for this verb: ${missing.join(', ')}. The word list states only what it knows.${why}`;
}

const VERB_CLASS: Record<NonNullable<SqLexeme['cls']>, string> = {
  oj: 'verb in -oj / -aj / -ej (vowel stem, regular endings)',
  cons: 'verb with a consonant stem',
  vowel: 'verb with a short vowel stem',
  irr: 'irregular verb (every form listed by hand)',
};

function verbParadigm(lexemes: SqLexeme[]): GeneratedParadigm | undefined {
  const cells = verbCells(lexemes);
  if (cells.length === 0) return undefined;
  const lx = lexemes[0];
  const notes = [VERB_CONSTRUCTION_NOTE];
  const missing = missingNote(cells, lx, false);
  if (missing) notes.push(missing);
  if (lx.cls === 'irr') notes.push('Every form of this irregular verb is listed by hand in the word list.');
  else if ((lx.forms ?? []).length) notes.push('Some forms are listed by hand in the word list and replace the rule\'s form for their cell.');
  if (lx.nonActive === 'only') notes.push('This verb exists only in the non-active voice.');
  if (cells.some((c) => c.features.Mood === 'Sub' && c.features.Voice === 'Act')) {
    notes.push('The subjunctive is the form used after të (të punoj); it differs from the indicative only in the second and third person singular for most verbs.');
  }
  if (lexemes.length > 1) notes.push('The word list holds more than one entry for this spelling; their forms are merged.');
  return {
    kind: 'verb-conjugation', cells, layout: VERB_LAYOUT, notes, constructions: VERB_CONSTRUCTIONS,
    ...(lx.cls ? { template: VERB_CLASS[lx.cls] } : {}),
  };
}

/**
 * A verb in -oj that the word list does not hold: the regular -oj class (aorist -ova, participle -uar), the class the
 * ending rules of morph-verb-guess.ts also guess at. Said so in the notes; no template; no optative, admirative or
 * non-active forms (the guess rules do not claim them).
 */
function guessedVerbParadigm(lemma: string): GeneratedParadigm | undefined {
  const l = lc(lemma);
  if (!/^[a-zçë]{3,}oj$/u.test(l)) return undefined;
  const stem = l.slice(0, -2);
  const synthetic = V(l, 'oj', `${stem}ova`, `${stem}uar`, '');
  const cells = verbCells([synthetic]).filter((c) => c.features.Mood !== 'Opt' && c.features.Mood !== 'Adm' && c.features.Voice !== 'Mid');
  if (cells.length === 0) return undefined;
  const notes = [
    `Guessed from the ending -oj: ${l} is not in the word list, so these are the forms of the regular class in -oj (aorist -ova, participle -uar), unconfirmed. Verbs in -oj are mostly regular, but a stem change or an irregular aorist would not show here.`,
    VERB_CONSTRUCTION_NOTE,
  ];
  const missing = missingNote(cells, synthetic, true);
  if (missing) notes.push(missing);
  notes.push('Not generated for a guessed verb: optative, admirative and non-active forms.');
  return { kind: 'verb-conjugation', cells, layout: VERB_LAYOUT, notes, constructions: VERB_CONSTRUCTIONS };
}

// ───────────────────────────── pronouns ─────────────────────────────

const PRON_LAYOUT: ParadigmLayout = {
  columns: { key: 'Number', values: [['Sing', 'singular'], ['Plur', 'plural']] },
  rows: { key: 'Case', values: CASE_LABELS },
  sections: ['Gender', 'Clitic'],
  labels: { Gender: { Masc: 'masculine', Fem: 'feminine' }, Clitic: { Yes: 'short form (before the verb)' } },
};

function pronounParadigm(lemma: string): GeneratedParadigm | undefined {
  const lx = PERSONAL.find((p) => lc(p.lemma) === lc(lemma));
  if (!lx) return undefined;
  const raw = expand(closedClassForms(lx).map((f) => ({ form: f.form, morph: f.morph })), ['Case', 'Gender'], { Case: CASE_ROW });
  const cells = sortCells(settle(raw), ['Gender', 'Clitic', 'Number', 'Case']);
  if (cells.length === 0) return undefined;
  return {
    kind: 'pronoun-paradigm', cells, layout: PRON_LAYOUT,
    notes: [
      'Genitive and dative share their forms (one row). The ablative of a personal pronoun has its own form (meje, teje, tij, saj).',
      'The short forms (më, të, e, i, u, na, ju) are object pronouns that stand before the verb (të shoh); the full forms stand after a preposition or carry stress.',
      ...(lc(lemma) === 'ai' ? ['"Ai" is one lexeme for he, she, it and they; the demonstrative "that" is a different word with the same spelling and is not in this table.'] : []),
      ...(lc(lemma) === 'ju' ? ['"Ju" is also the polite singular "you".'] : []),
    ],
  };
}

// ───────────────────────────── the adapter's methods ─────────────────────────────

/** `LanguageAdapter.paradigm`: the generated paradigm of a word of the list (or a verb in -oj, guessed), else undefined. */
export function sqParadigm(lemma: string, pos: PartOfSpeech, hint?: { features?: Record<string, string>; surface?: string }): GeneratedParadigm | undefined {
  switch (pos) {
    case 'NOUN': case 'PROPN': {
      let lexemes = [...lexemesOf(lemma, 'NOUN'), ...lexemesOf(lemma, 'PROPN')];
      const g = hint?.features?.Gender;
      if (g && lexemes.length > 1) {
        const want = ({ Masc: 'm', Fem: 'f', Neut: 'n' } as Record<string, string>)[g];
        const narrowed = lexemes.filter((l) => l.gender === want);
        if (narrowed.length) lexemes = narrowed;
      }
      // the requested part of speech first; a name and a noun of one spelling are different words
      const asked = lexemes.filter((l) => l.pos === pos);
      return lexemes.length ? nounParadigm(asked.length ? asked : lexemes) : undefined;
    }
    case 'ADJ': {
      const lexemes = lexemesOf(lemma, 'ADJ');
      return lexemes.length ? adjectiveParadigm(lexemes) : undefined;
    }
    case 'VERB': case 'AUX': {
      const lexemes = lexemesOf(lemma, 'VERB');
      return lexemes.length ? verbParadigm(lexemes) : guessedVerbParadigm(lemma);
    }
    case 'PRON': return pronounParadigm(lemma);
    default: return undefined;
  }
}

/**
 * The cells of a paradigm that an ANALYSIS reading names. An analysis keeps a feature the written form leaves open as a
 * comma union (libri: Case "Nom" / "Gen,Dat,Abl"; punon: Person "2,3", Mood "Ind,Sub"), and the sentence layer may narrow
 * it; a table cell has one value per feature. A cell matches when, for every feature the cell has and the reading
 * states, their values overlap; a feature the reading does not state does not constrain. `cellOf` finds the cell when the
 * reading is already narrowed to one; this finds every cell a union reading could be, which is what the card highlights.
 * `surface` (optional) keeps only cells whose form is that written form (an adjective's article is not part of it).
 */
export function sqCellsFor(paradigm: Pick<Paradigm, 'cells' | 'kind'>, features: Record<string, string>, surface?: string): ParadigmCell[] {
  const hits = paradigm.cells.filter((c) => {
    for (const [k, v] of Object.entries(c.features)) {
      const asked = features[k];
      if (asked === undefined) continue;
      const a = split(asked);
      if (!split(v).some((x) => a.includes(x))) return false;
    }
    return true;
  });
  if (!surface) return hits;
  const s = lc(surface);
  const bare = (f: string): string => (paradigm.kind === 'adjective-declension' ? lc(f).replace(/^(?:i|e|të|së) /u, '') : lc(f));
  return hits.filter((c) => bare(c.form) === s || (c.alternatives ?? []).some((a) => bare(a) === s));
}

// ───────────────────────────── the dictionary half, merged ─────────────────────────────

export interface SqTableRow { form: string; tags: readonly string[] }

/**
 * The spellings a table row stands for. A table writes the subjunctive with its particle ("të punoj"), which is not part
 * of the cell's form; and a variant may follow in brackets ("humbitni (humbisni)", "mbyt (mbys)"; a few carry a
 * superscript footnote mark, "pres (³prej, ³prëj)"). The first spelling is the table's main one.
 */
export function sqTableForms(form: string, features: Features): string[] {
  // the dictionary marks stress with an acute accent on some headwords (gjárpri, líbër); Albanian spelling does not
  let f = form.trim().normalize('NFD').replace(/[\u0300\u0301]/gu, '').normalize('NFC');
  if (features.Mood === 'Sub') f = f.replace(/^të\s+/u, '');
  const m = /^(.+?)\s*\(([^)]*)\)\s*$/u.exec(f);
  if (!m) return [f];
  const alts = m[2].split(/[,;/]/).map((x) => x.replace(/[¹²³⁰-⁹]/gu, '').trim()).filter((x) => x && !/\s/u.test(x));
  return [m[1].trim(), ...alts.filter((a) => a !== m[1].trim())];
}

const DEFAULT_KIND: Partial<Record<PartOfSpeech, Paradigm['kind']>> = {
  NOUN: 'noun-declension', PROPN: 'noun-declension', ADJ: 'adjective-declension', VERB: 'verb-conjugation', AUX: 'verb-conjugation', PRON: 'pronoun-paradigm',
};

/**
 * The paradigm of a lexeme with the dictionary's table merged in: the rows of the table (`form` and `tags`, as kaikki
 * gives them) are mapped with `sqTableTagsDetail`, the generated cells and the table's cells are merged with
 * `mergeParadigm` (verified / supported / generated / conflicted per cell). A table row of a noun carries no gender, so a
 * noun's table cells take the word list's gender (or `opts.gender`) to land on the same key as the generated cells.
 * Returns undefined when neither the adapter nor the table has a cell.
 */
export function sqParadigmFromTable(
  lemma: string, pos: PartOfSpeech, rows: readonly SqTableRow[],
  opts: { gender?: 'Masc' | 'Fem' | 'Neut'; dictionarySource?: { id: string; label: string; licence?: string }; hint?: { features?: Record<string, string>; surface?: string } } = {},
): Paradigm | undefined {
  const g = sqParadigm(lemma, pos, opts.hint);
  const genders = new Set((g?.cells ?? []).map((c) => c.features.Gender).filter(Boolean));
  const gender = genders.size === 1 ? [...genders][0] : opts.gender;
  const nominal = pos === 'NOUN' || pos === 'PROPN';
  const wik: Cell[] = [];
  const generatedByKey = new Map((g?.cells ?? []).map((c) => [featureKey(c.features), c.form] as const));
  for (const r of rows) {
    const features = sqTableTagsDetail(r.tags, pos).features;
    if (!features) continue;
    const withGender = nominal && gender && !features.Gender ? { ...features, Gender: gender } : features;
    const mine = generatedByKey.get(featureKey(withGender));
    // the spelling that agrees with the rules goes first: a cell is verified when ANY of the table's spellings matches
    // (a table writes a name with its capital; the generated cell keeps the word list's spelling)
    const variants = sqTableForms(r.form, withGender).map((v) => (mine && lc(mine) === lc(v) ? mine : v));
    if (mine) variants.sort((a, b) => Number(b === mine) - Number(a === mine));
    for (const form of variants) wik.push({ features: withGender, form });
  }
  if (!g && wik.length === 0) return undefined;
  const kind = g?.kind ?? DEFAULT_KIND[pos] ?? 'none';
  const base: Omit<Paradigm, 'cells' | 'status'> = {
    languageId: 'sq', lemma, pos, kind,
    ...(g?.layout ? { layout: g.layout } : {}),
    ...(g?.template ? { template: g.template } : {}),
    notes: g?.notes ?? ['The adapter does not generate this word (it is not in the word list): the forms are the dictionary\'s table alone.'],
    sources: [
      ...(g ? [{ id: SQ_ANALYZER, label: 'Albanian word-form rules and word list (machine-drafted, no native review)' }] : []),
      ...(wik.length ? [opts.dictionarySource ?? { id: 'kaikki-sq', label: 'Wiktionary Albanian inflection tables via kaikki.org', licence: 'CC BY-SA 4.0' }] : []),
    ],
    ...(g?.constructions ? { constructions: g.constructions } : {}),
  };
  return mergeParadigm(base, g?.cells ?? [], wik);
}
