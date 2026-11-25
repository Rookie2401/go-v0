import { describe, expect, it } from 'vitest';
import { FRENCH_ABBREVIATIONS, segmentFrenchSentences } from '../../src/adapters/french/sentences';

const seg = (t: string): string[] => segmentFrenchSentences(t).map((s) => s.text);

describe('French sentences', () => {
  it('does not split after M. and splits after a real full stop', () => {
    expect(seg('M. Dupont est arrivé. Il a dit bonjour.')).toEqual(['M. Dupont est arrivé.', 'Il a dit bonjour.']);
  });

  it('does not split after other abbreviations', () => {
    expect(seg('Mme Martin et Mlle Durand sont venues. Dr Petit aussi.')).toEqual(['Mme Martin et Mlle Durand sont venues.', 'Dr Petit aussi.']);
    expect(seg('Voir cf. le chapitre 3, p. 12 et pp. 14-15. Fin.')).toEqual(['Voir cf. le chapitre 3, p. 12 et pp. 14-15.', 'Fin.']);
    expect(seg('MM. Durand et Roux sont partis. Mme. Lenoir reste.')).toEqual(['MM. Durand et Roux sont partis.', 'Mme. Lenoir reste.']);
    expect(seg('Il a vu J. Dupont hier. Puis rien.')).toEqual(['Il a vu J. Dupont hier.', 'Puis rien.']);
    expect(seg('La S.A. Durand ferme. Tant pis.')).toEqual(['La S.A. Durand ferme.', 'Tant pis.']);
    expect(seg('Il faut, p. ex. dans ce cas, attendre. Merci.')).toEqual(['Il faut, p. ex. dans ce cas, attendre.', 'Merci.']);
  });

  it('keeps et cetera apart: it ends a sentence before a capital and not before lower case', () => {
    expect(seg('Il a acheté des pommes, etc. Puis il est parti.')).toEqual(['Il a acheté des pommes, etc.', 'Puis il est parti.']);
    expect(seg('Des pommes, etc. et des poires.')).toEqual(['Des pommes, etc. et des poires.']);
  });

  it('takes an ordinary word as an abbreviation only before a number', () => {
    expect(seg('Voir vol. 3, art. 12 et chap. IV. Fin.')).toEqual(['Voir vol. 3, art. 12 et chap. IV.', 'Fin.']);
    expect(seg('Il a pris le vol. Ensuite il dormit.')).toEqual(['Il a pris le vol.', 'Ensuite il dormit.']);
  });

  it('splits after av. J.-C. and apr. J.-C. when a capital follows', () => {
    expect(seg('César mourut en 44 av. J.-C. Rome pleura.')).toEqual(['César mourut en 44 av. J.-C.', 'Rome pleura.']);
    expect(seg('En 70 apr. J.-C. le Temple fut détruit.')).toEqual(['En 70 apr. J.-C. le Temple fut détruit.']);
  });

  it('never splits inside a number or after a decimal comma', () => {
    expect(seg('Il mesure 1,85 mètre. Elle fait 3.5 cm de plus. Voilà.')).toEqual(['Il mesure 1,85 mètre.', 'Elle fait 3.5 cm de plus.', 'Voilà.']);
    // known limit: "m." is M. (monsieur) to the splitter, so "1,85 m. Elle" does not split
    expect(seg('Le prix est de 1 500,50 euros. C’est cher.')).toEqual(['Le prix est de 1 500,50 euros.', 'C’est cher.']);
  });

  it('keeps a reporting clause after a closing guillemet in the sentence', () => {
    expect(seg('« Viens ! » dit-il.')).toEqual(['« Viens ! » dit-il.']);
    expect(seg('« Viens ! » dit-il. Elle vint.')).toEqual(['« Viens ! » dit-il.', 'Elle vint.']);
    expect(seg('« Viens ! » dit-il.')).toEqual(['« Viens ! » dit-il.']);
    expect(seg('« Viens ! » dit-il.')).toEqual(['« Viens ! » dit-il.']);
    expect(seg('« Viens !» dit-il.')).toEqual(['« Viens !» dit-il.']);
  });

  it('ends the sentence after a closing guillemet when a capital follows', () => {
    expect(seg('Il dit : « Viens ! » Elle vint.')).toEqual(['Il dit : « Viens ! »', 'Elle vint.']);
    expect(seg('Il demanda : « Où vas-tu ? » Personne ne répondit.')).toEqual(['Il demanda : « Où vas-tu ? »', 'Personne ne répondit.']);
    expect(seg('Il dit : « Je viens. » Puis il partit.')).toEqual(['Il dit : « Je viens. »', 'Puis il partit.']);
  });

  it('handles French spacing before ; : ! ? with NBSP and NNBSP', () => {
    expect(seg('Vraiment ? Oui ! Peut-être ; mais non.')).toEqual(['Vraiment ?', 'Oui !', 'Peut-être ; mais non.']);
    expect(seg('Il dit : voilà. Elle rit.')).toEqual(['Il dit : voilà.', 'Elle rit.']);
  });

  it('handles dialogue dashes', () => {
    expect(seg('— Viens ! dit-il.\n— Où ça ? demanda-t-elle.')).toEqual(['— Viens ! dit-il.', '— Où ça ? demanda-t-elle.']);
    expect(seg('— Viens ! — dit-il. — Où ça ? — Là.')).toEqual(['— Viens ! — dit-il.', '— Où ça ?', '— Là.']);
    expect(seg('— Oui.\n— Non.')).toEqual(['— Oui.', '— Non.']);
  });

  it('continues an ellipsis in lower case, splits before a capital', () => {
    expect(seg('Bon… alors on y va.')).toEqual(['Bon… alors on y va.']);
    expect(seg('Bon... alors on y va.')).toEqual(['Bon... alors on y va.']);
    expect(seg('Je ne sais pas… Peut-être demain.')).toEqual(['Je ne sais pas…', 'Peut-être demain.']);
  });

  it('round-trips offsets and trims', () => {
    const text = '  « Viens ! » dit-il. M. Dupont rit.  \n\nFin.';
    for (const s of segmentFrenchSentences(text)) {
      expect(text.slice(s.start, s.end)).toBe(s.text);
      expect(s.text).toBe(s.text.trim());
    }
    expect(seg(text)).toEqual(['« Viens ! » dit-il.', 'M. Dupont rit.', 'Fin.']);
  });

  it('lists its abbreviations', () => {
    for (const a of ['m', 'mme', 'mlle', 'dr', 'pr', 'etc', 'cf', 'p', 'pp', 'vol', 'chap', 'av', 'apr', 'éd']) expect(FRENCH_ABBREVIATIONS).toContain(a);
  });
});
