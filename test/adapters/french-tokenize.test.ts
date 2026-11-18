import { describe, expect, it } from 'vitest';
import { ELIDED, FRENCH_WHOLE_APOSTROPHE, HYPHEN_CLITICS, HYPHEN_KEEP, tokenizeFrench } from '../../src/adapters/french/tokenize';
import { frenchSpeechNormalize, frNumberToWords } from '../../src/adapters/french/speech';

const surf = (t: string): string[] => tokenizeFrench(t).map((x) => x.surface);
const words = (t: string): string[] => tokenizeFrench(t).filter((x) => x.isWord).map((x) => x.surface);

describe('French tokenizer: offsets', () => {
  const samples = [
    " « L’homme qu’il a vu hier, c’est-à-dire Jean-Pierre, n’est-il pas venu aujourd’hui ? » demanda-t-elle.",
    "Qu'est-ce que tu veux ? Donne-le-moi ; allez-vous-en ! Va-t'en, y a-t-il quelqu'un ? — Non.",
    'Le prix : 1 500,50 euros (XIXe siècle, 3e étage) – voilà…',
    '_Peut-être_ que __l’œuvre__ est finie.',
    "L’été de 1914‑1918, jusqu’à présent.",
  ];
  for (const s of samples) {
    it(`every token slices the input: ${s.slice(0, 30)}`, () => {
      const toks = tokenizeFrench(s);
      expect(toks.length).toBeGreaterThan(3);
      let last = 0;
      for (const t of toks) {
        expect(s.slice(t.start, t.end)).toBe(t.surface);
        expect(t.start).toBeGreaterThanOrEqual(last);
        expect(t.surface).not.toMatch(/^\s|\s$/u);
        last = t.end;
      }
    });
  }

  it('measures offsets in the text as given (leading NBSP, guillemets, NNBSP)', () => {
    const s = ' « Viens ! »';
    const toks = tokenizeFrench(s);
    expect(toks.map((t) => t.surface)).toEqual(['«', 'Viens', '!', '»']);
    expect(toks[0].start).toBe(1);
    expect(toks[1].start).toBe(3);
    expect(toks.map((t) => t.isWord)).toEqual([false, true, false, false]);
  });
});

describe('French tokenizer: elision', () => {
  it('cuts after the apostrophe and keeps it', () => {
    expect(surf("l'homme")).toEqual(["l'", 'homme']);
    expect(surf("j'aime d'un n'est s'il m'a t'ai c'est ç'a qu'il")).toEqual(
      ["j'", 'aime', "d'", 'un', "n'", 'est', "s'", 'il', "m'", 'a', "t'", 'ai', "c'", 'est', "ç'", 'a', "qu'", 'il'],
    );
    expect(surf("jusqu'à lorsqu'il puisqu'on quoiqu'il")).toEqual(["jusqu'", 'à', "lorsqu'", 'il', "puisqu'", 'on', "quoiqu'", 'il']);
  });

  it('treats both apostrophe characters alike and normalizes to the straight one', () => {
    const a = tokenizeFrench("l'homme");
    const b = tokenizeFrench('l’homme');
    expect(b.map((t) => t.surface)).toEqual(['l’', 'homme']);
    expect(b.map((t) => t.normalized)).toEqual(a.map((t) => t.normalized));
    expect(b[0].normalized).toBe("l'");
    expect(b[0].isWord).toBe(true);
    for (const ap of ['ʼ', '‘', '′', '`', '´', '＇']) expect(tokenizeFrench(`l${ap}homme`)[0].normalized).toBe("l'");
  });

  it('handles capitals', () => {
    expect(surf("L'homme Qu'est-ce C'est J'ai D'abord")).toEqual(["L'", 'homme', "Qu'", 'est', '-', 'ce', "C'", 'est', "J'", 'ai', "D'", 'abord']);
    expect(tokenizeFrench("L'homme")[0].normalized).toBe("l'");
  });

  it('elides twice where the page does', () => {
    expect(surf("d'aujourd'hui")).toEqual(["d'", "aujourd'hui"]);
    expect(surf("l'arc-en-ciel")).toEqual(["l'", 'arc-en-ciel']);
  });

  it('keeps lexical words with an apostrophe whole', () => {
    expect(surf("aujourd'hui")).toEqual(["aujourd'hui"]);
    expect(surf('aujourd’hui')).toEqual(['aujourd’hui']);
    expect(tokenizeFrench('Aujourd’hui')[0].normalized).toBe("aujourd'hui");
    expect(surf("quelqu'un quelqu'une")).toEqual(["quelqu'un", "quelqu'une"]);
    expect(surf("presqu'île")).toEqual(["presqu'île"]);
    expect(surf("prud'homme prud'hommes entr'acte")).toEqual(["prud'homme", "prud'hommes", "entr'acte"]);
    expect(surf("presqu'il")).toEqual(["presqu'", 'il']);
    expect(surf("quelqu'il")).toEqual(["quelqu'", 'il']);
    expect(surf("d'aucuns")).toEqual(["d'", 'aucuns']);
    expect([...FRENCH_WHOLE_APOSTROPHE].every((w) => w === w.toLocaleLowerCase('fr'))).toBe(true);
  });

  it('exports the elided set', () => {
    for (const e of ["l'", "d'", "j'", "m'", "t'", "s'", "n'", "c'", "ç'", "qu'", "jusqu'", "lorsqu'", "puisqu'", "quoiqu'", "presqu'", "quelqu'"]) expect(ELIDED.has(e)).toBe(true);
  });

  it('leaves an apostrophe that is not an elision alone', () => {
    expect(surf("rock'n'roll")).toEqual(["rock'n'roll"]);
    expect(surf("les chiens' maîtres")).toEqual(['les', 'chiens', "'", 'maîtres']);
    expect(surf("'bonjour'")).toEqual(["'", 'bonjour', "'"]);
  });
});

describe('French tokenizer: hyphens', () => {
  it('keeps compounds whole', () => {
    for (const w of ['peut-être', "c'est-à-dire", 'grand-mère', 'quatre-vingt-dix', 'arc-en-ciel', 'là-bas', 'au-dessus', 'rendez-vous', 'vis-à-vis', 'après-midi', 'Jean-Pierre', 'États-Unis', 'quelques-uns', 'là-haut', 'ci-dessus', 'garde-à-vous']) {
      expect(surf(w)).toEqual([w]);
    }
    expect(tokenizeFrench("C'est-à-dire")[0].normalized).toBe("c'est-à-dire");
  });

  it('cuts a trailing chain of clitics, each hyphen its own non-word token', () => {
    expect(surf('donne-le-moi')).toEqual(['donne', '-', 'le', '-', 'moi']);
    expect(surf('a-t-il')).toEqual(['a', '-', 't', '-', 'il']);
    expect(surf('est-ce')).toEqual(['est', '-', 'ce']);
    expect(surf('dit-il')).toEqual(['dit', '-', 'il']);
    expect(surf('allez-vous-en')).toEqual(['allez', '-', 'vous', '-', 'en']);
    expect(surf("va-t'en")).toEqual(['va', '-', "t'", 'en']);
    expect(surf("donne-m'en")).toEqual(['donne', '-', "m'", 'en']);
    expect(surf('peut-on')).toEqual(['peut', '-', 'on']);
    expect(surf('y a-t-il')).toEqual(['y', 'a', '-', 't', '-', 'il']);
    expect(surf("n'a-t-il pas")).toEqual(["n'", 'a', '-', 't', '-', 'il', 'pas']);
    expect(surf("Qu'est-ce que")).toEqual(["Qu'", 'est', '-', 'ce', 'que']);
    expect(surf('vas-y')).toEqual(['vas', '-', 'y']);
    const t = tokenizeFrench('donne-le-moi');
    expect(t.map((x) => x.isWord)).toEqual([true, false, true, false, true]);
  });

  it('cuts a trailing -ci / -là from a noun, not from the words that are words', () => {
    expect(surf('cet homme-là')).toEqual(['cet', 'homme', '-', 'là']);
    expect(surf('ces jours-ci')).toEqual(['ces', 'jours', '-', 'ci']);
    for (const w of ['celui-ci', 'celui-là', 'celle-ci', 'celles-là', 'ceux-ci', 'jusque-là', 'par-là', 'de-ci', 'ci-joint', 'ci-après', 'là-dedans']) {
      expect(surf(w)).toEqual([w]);
    }
  });

  it('keeps lexical compounds that end in a clitic word, and ones that begin with one', () => {
    for (const w of ['rendez-vous', 'garde-à-vous', 'chez-moi', "qu'en-dira-t-on", "m'as-tu-vu", 'je-ne-sais-quoi', 'sauve-qui-peut', 'va-et-vient', 'on-dit', 'quant-à-soi']) {
      expect(surf(w)).toEqual([w]);
    }
    for (const w of ['vous-même', 'moi-même', 'toi-même', 'lui-même', 'elle-même', 'nous-mêmes', 'vous-mêmes', 'eux-mêmes', 'elles-mêmes', 'soi-même']) {
      expect(surf(w)).toEqual([w]);
    }
    expect(HYPHEN_KEEP.has('est-ce')).toBe(false);
    expect(HYPHEN_CLITICS.has('t')).toBe(true);
  });

  it('takes the non-breaking hyphen like the ordinary one', () => {
    expect(surf('grand‑mère')).toEqual(['grand‑mère']);
    expect(surf('donne‑le‑moi')).toEqual(['donne', '‑', 'le', '‑', 'moi']);
    expect(tokenizeFrench('grand‑mère')[0].normalized).toBe('grand-mère');
    expect(tokenizeFrench('a‑t‑il')[1].normalized).toBe('-');
    expect(surf('grand‐mère')).toEqual(['grand‐mère']);
  });

  it('never makes a hyphen at the edge of a word, or a dash, part of a word', () => {
    expect(surf('-Viens')).toEqual(['-', 'Viens']);
    expect(surf('Viens- ici')).toEqual(['Viens', '-', 'ici']);
    expect(surf('— Viens')).toEqual(['—', 'Viens']);
    expect(surf('un mot – un autre')).toEqual(['un', 'mot', '–', 'un', 'autre']);
    expect(surf('oui—non')).toEqual(['oui', '—', 'non']);
  });
});

describe('French tokenizer: punctuation, numbers, marks', () => {
  it('makes whitespace disappear and punctuation separate tokens', () => {
    expect(surf('Bonjour, monde !')).toEqual(['Bonjour', ',', 'monde', '!']);
    expect(surf('« Oui »')).toEqual(['«', 'Oui', '»']);
    expect(surf('Alors… bon.')).toEqual(['Alors', '…', 'bon', '.']);
    expect(surf('a;b')).toEqual(['a', ';', 'b']);
  });

  it('does not break numbers', () => {
    expect(surf('1 500,50 euros')).toEqual(['1', '500,50', 'euros']);
    expect(surf('3e étage, XIXe siècle')).toEqual(['3e', 'étage', ',', 'XIXe', 'siècle']);
    expect(surf('de 1914-1918')).toEqual(['de', '1914', '-', '1918']);
    expect(surf('3,5 %')).toEqual(['3,5', '%']);
    expect(tokenizeFrench('3e')[0].isWord).toBe(true);
    expect(tokenizeFrench('500,50')[0].isWord).toBe(false);
  });

  it('treats _ at the edge of a word as an italics mark', () => {
    expect(surf('_Peut-être_ oui')).toEqual(['_', 'Peut-être', '_', 'oui']);
    expect(surf('_l’œuvre_')).toEqual(['_', 'l’', 'œuvre', '_']);
    expect(surf('__très__')).toEqual(['__', 'très', '__']);
  });

  it('lower-cases with the French locale and keeps accents', () => {
    expect(tokenizeFrench('École')[0].normalized).toBe('école');
    expect(tokenizeFrench('ŒUVRE')[0].normalized).toBe('œuvre');
    expect(tokenizeFrench('côté')[0].normalized).not.toBe(tokenizeFrench('cote')[0].normalized);
  });
});

describe('French tokenizer: a paragraph of prose', () => {
  const para =
    "Aujourd'hui, c'est-à-dire le premier jour de l'été, le grand-père de Jean-Pierre n'a-t-il pas dit : « Qu'est-ce que tu veux, mon petit ? » " +
    "Donne-le-moi, répondit celui-ci ; puis il s'en alla jusqu'à la gare, peut-être pour y trouver quelqu'un.";
  const toks = tokenizeFrench(para);

  it('has the tokens it should', () => {
    const s = toks.map((t) => t.surface);
    expect(s).toEqual([
      "Aujourd'hui", ',', "c'est-à-dire", 'le', 'premier', 'jour', 'de', "l'", 'été', ',', 'le', 'grand-père', 'de', 'Jean-Pierre', "n'", 'a', '-', 't', '-', 'il', 'pas', 'dit', ':',
      '«', "Qu'", 'est', '-', 'ce', 'que', 'tu', 'veux', ',', 'mon', 'petit', '?', '»',
      'Donne', '-', 'le', '-', 'moi', ',', 'répondit', 'celui-ci', ';', 'puis', 'il', "s'", 'en', 'alla', "jusqu'", 'à', 'la', 'gare', ',', 'peut-être', 'pour', 'y', 'trouver', "quelqu'un", '.',
    ]);
    expect(toks.length).toBe(61);
    expect(toks.filter((t) => t.isWord).length).toBe(45);
  });

  it('keeps every offset exact', () => {
    for (const t of toks) expect(para.slice(t.start, t.end)).toBe(t.surface);
  });

  it('words() sees the compounds as words', () => {
    expect(words(para)).toContain('grand-père');
    expect(words(para)).toContain("l'");
    expect(words(para)).not.toContain('-');
  });
});

describe('French speech normalization', () => {
  it('expands abbreviations, numbers and the dialogue dash', () => {
    const r = frenchSpeechNormalize('— M. Dupont a vu Mme Martin, etc. En 1998, 3 fois.');
    expect(r.speechText).toBe('monsieur Dupont a vu madame Martin, et cetera En mille neuf-cent-quatre-vingt-dix-huit, trois fois.');
    expect(r.normalizerVersion).toBe('speech-fr@1');
    expect(frenchSpeechNormalize('— M. Dupont a vu Mme Martin, etc. En 1998, 3 fois.')).toEqual(r);
  });

  it('reads numbers the French way', () => {
    expect(frNumberToWords(0)).toBe('zéro');
    expect(frNumberToWords(21)).toBe('vingt-et-un');
    expect(frNumberToWords(71)).toBe('soixante-et-onze');
    expect(frNumberToWords(80)).toBe('quatre-vingts');
    expect(frNumberToWords(81)).toBe('quatre-vingt-un');
    expect(frNumberToWords(200)).toBe('deux-cents');
    expect(frNumberToWords(201)).toBe('deux-cent-un');
    expect(frNumberToWords(1000)).toBe('mille');
    expect(frNumberToWords(80000)).toBe('quatre-vingt-mille');
    expect(frNumberToWords(2_000_000)).toBe('deux millions');
    expect(frNumberToWords(-1)).toBeNull();
  });

  it('joins thousands, reads the decimal comma, ordinals, n° and page numbers', () => {
    expect(frenchSpeechNormalize('1 500 euros').speechText).toBe('mille cinq-cents euros');
    expect(frenchSpeechNormalize('3,5 et 0,05').speechText).toBe('trois virgule cinq et zéro virgule zéro cinq');
    expect(frenchSpeechNormalize('le 1er, le 2e et le 5e').speechText).toBe('le premier, le deuxième et le cinquième');
    expect(frenchSpeechNormalize('n° 12, p. 30').speechText).toBe('numéro douze, page trente');
    expect(frenchSpeechNormalize('50 %').speechText).toBe('cinquante pour cent');
  });

  it('drops verse markers and the dash after a sentence', () => {
    expect(frenchSpeechNormalize('[16] Car Dieu a tant aimé le monde.').speechText).toBe('Car Dieu a tant aimé le monde.');
    expect(frenchSpeechNormalize('— Où ça ? — Là.').speechText).toBe('Où ça ? Là.');
  });
});
