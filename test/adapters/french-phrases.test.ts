/**
 * French phrase units (src/adapters/french/phrases.ts), through the real adapter. Machine-drafted data: these tests show the units
 * are found in real sentences (inflected verbs, elided forms, the hyphenated question marker) and that near misses are not.
 */
import { describe, expect, it } from 'vitest';
import { frAdapter } from '../../src/adapters/fr';
import { PHRASE_UNITS, VERB_SLOT_PATTERNS, buildPhraseRules } from '../../src/adapters/french/phrases';

function found(sentence: string): string[] {
  const tokens = frAdapter.tokenize(sentence);
  const analyses = frAdapter.analyze(tokens);
  return (frAdapter.detectPhrases?.(tokens, analyses) ?? []).map((p) => p.display);
}

/** [sentence, display of the unit that must be found] */
const FOUND: ReadonlyArray<readonly [string, string]> = [
  ['Il y avait un homme dans la rue.', 'il y a'],
  ['Il n\'y a pas de pain.', 'il y a'],
  ['Il y aura du monde demain.', 'il y a'],
  ['Il est parti il y a deux ans.', 'il y a … (time)'],
  ['J\'ai eu besoin de votre aide.', 'avoir besoin de'],
  ['Elle n\'a pas envie de sortir.', 'avoir envie de'],
  ['Les enfants ont peur du noir.', 'avoir peur de'],
  ['Tu as raison.', 'avoir raison'],
  ['Il a eu tort de partir.', 'avoir tort'],
  ['Nous avons très faim.', 'avoir faim'],
  ['J\'ai soif.', 'avoir soif'],
  ['Elle avait chaud.', 'avoir chaud'],
  ['Ils avaient froid.', 'avoir froid'],
  ['La réunion a eu lieu hier.', 'avoir lieu'],
  ['Elle a l\'air fatiguée.', 'avoir l\'air'],
  ['Il a eu beau chercher, il ne trouva rien.', 'avoir beau …'],
  ['Mon frère a douze ans.', 'avoir … ans'],
  ['Nous sommes en train de manger.', 'être en train de …'],
  ['Je ne suis pas d\'accord.', 'être d\'accord'],
  ['Il était sur le point de partir.', 'être sur le point de …'],
  ['Je viens de manger.', 'venir de …'],
  ['Elle vient d\'arriver.', 'venir de …'],
  ['Je me suis rendu compte de mon erreur.', 'se rendre compte (de, que)'],
  ['Il s\'agit de ma sœur.', 'il s\'agit de'],
  ['Il s\'agissait d\'un problème grave.', 'il s\'agit de'],
  ['Elle ne se souvient pas de moi.', 'se souvenir de …'],
  ['Qu\'est-ce qui se passe ?', 'se passer'],
  ['Il s\'en va demain.', 's\'en aller'],
  ['Elle s\'en est allée hier.', 's\'en aller'],
  ['Fais attention à la marche.', 'faire attention'],
  ['Il faisait toujours attention.', 'faire attention'],
  ['Elle fait partie du groupe.', 'faire partie de'],
  ['Il fait semblant de dormir.', 'faire semblant de …'],
  ['Il a fait la connaissance de Marie.', 'faire la connaissance de'],
  ['Il fait beau aujourd\'hui.', 'il fait beau'],
  ['Il faisait froid ce matin-là.', 'il fait froid'],
  ['Il faut partir.', 'il faut'],
  ['Il vaut mieux attendre.', 'il vaut mieux'],
  ['Il est tout à fait content.', 'tout à fait'],
  ['Tout à coup, la porte s\'ouvrit.', 'tout à coup'],
  ['Viens tout de suite !', 'tout de suite'],
  ['Tout le monde est là.', 'tout le monde'],
  ['À tout à l\'heure.', 'tout à l\'heure'],
  ['Il est quand même venu.', 'quand même'],
  ['Bien sûr, nous viendrons.', 'bien sûr'],
  ['Elle reste ici parce qu\'il pleut.', 'parce que'],
  ['Je l\'ai fait pour que tu sois content.', 'pour que'],
  ['Il lit pendant que je dors.', 'pendant que'],
  ['Il est arrivé alors que nous mangions.', 'alors que'],
  ['Reste ici jusqu\'à ce que je revienne.', 'jusqu\'à ce que'],
  ['Il ira à moins que tu ne viennes.', 'à moins que'],
  ['Elle parle de plus en plus vite.', 'de plus en plus'],
  ['Il mange de moins en moins.', 'de moins en moins'],
  ['Nous nous voyons de temps en temps.', 'de temps en temps'],
  ['Il recommença de nouveau.', 'de nouveau'],
  ['D\'abord, il faut lire.', 'd\'abord'],
  ['D\'ailleurs, il est parti.', 'd\'ailleurs'],
  ['D\'accord, je viens.', 'd\'accord'],
  ['D\'habitude, il dort tard.', 'd\'habitude'],
  ['Il lit en même temps.', 'en même temps'],
  ['En effet, tu as raison.', 'en effet'],
  ['En fait, je ne sais pas.', 'en fait'],
  ['En tout cas, il est là.', 'en tout cas'],
  ['La maison est en face de l\'église.', 'en face de'],
  ['Il habite à côté de la gare.', 'à côté de'],
  ['Il habite à côté du parc.', 'à côté de'],
  ['Nous nous souvenons de lui.', 'se souvenir de …'],
  ['Vous vous êtes bien rendu compte du risque.', 'se rendre compte (de, que)'],
  ['Nous sommes restés à cause de la pluie.', 'à cause de'],
  ['Grâce à toi, nous avons réussi.', 'grâce à'],
  ['Il a joué au lieu de travailler.', 'au lieu de'],
  ['Au milieu de la nuit, elle se réveilla.', 'au milieu de'],
  ['Elle vit à peine.', 'à peine'],
  ['Il reste à peu près une heure.', 'à peu près'],
  ['Il chante et danse à la fois.', 'à la fois'],
  ['À propos de ton frère, comment va-t-il ?', 'à propos de'],
  ['Par exemple, le chat.', 'par exemple'],
  ['Par contre, il est riche.', 'par contre'],
  ['Il est venu par hasard.', 'par hasard'],
  ['Peu à peu, il comprit.', 'peu à peu'],
  ['Il n\'aime pas du tout le lait.', 'pas du tout'],
  ['Il peut manger n\'importe quoi.', 'n\'importe quoi'],
  ['N\'importe qui peut le faire.', 'n\'importe qui'],
  ['Il habite quelque part.', 'quelque part'],
  ['Je ne le trouve nulle part.', 'nulle part'],
  ['La plupart des gens dorment.', 'la plupart de'],
  ['Il y a beaucoup de bruit.', 'beaucoup de'],
  ['Elle a un peu de pain.', 'un peu de'],
  ['Il y a trop de monde.', 'trop de'],
  ['Il parlera plus tard.', 'plus tard'],
  ['S\'il vous plaît, madame.', 's\'il vous plaît'],
  ['S\'il te plaît, viens.', 's\'il te plaît'],
  ['Je vous en prie.', 'je vous en prie'],
  ['De rien, monsieur.', 'de rien'],
  ['Allez, à bientôt !', 'à bientôt'],
  ['Au revoir, monsieur.', 'au revoir'],
  ['Comment allez-vous ?', 'comment allez-vous'],
  ['Ça va ?', 'ça va'],
  ['Est-ce que tu viens ?', 'est-ce que'],
  ['Qu\'est-ce que tu fais ?', 'qu\'est-ce que'],
  ['Qu\'est-ce qui se passe ?', 'qu\'est-ce qui'],
  ['Il est beau, n\'est-ce pas ?', 'n\'est-ce pas'],
  ['Il était une fois un roi.', 'il était une fois'],
  ['Cela veut dire quelque chose.', 'vouloir dire'],
  ['Ne laisse pas tomber ton livre.', 'laisser tomber'],
  ['Elle prend soin de sa mère.', 'prendre soin de'],
  ['Nous rendons visite à nos amis.', 'rendre visite à …'],
  ['Il pense à son frère.', 'penser à …'],
  ['Il s\'occupe de ses enfants.', 's\'occuper de …'],
  ['Elle s\'intéresse à la musique.', 's\'intéresser à …'],
  ['Il se met à pleuvoir.', 'se mettre à …'],
  ['Il se sert de son stylo.', 'se servir de …'],
  ['Ils se moquent de nous.', 'se moquer de …'],
  ['Il finit par dormir.', 'finir par …'],
  ['Elle commence à comprendre.', 'commencer à …'],
  ['Il continue à travailler.', 'continuer à …'],
  ['Elle essaie de dormir.', 'essayer de …'],
  ['Il a décidé de partir.', 'décider de …'],
  ['Il a réussi à gagner.', 'réussir à …'],
  ['J\'ai oublié de fermer la porte.', 'oublier de …'],
  ['Il cesse de pleuvoir.', 'cesser de …'],
  ['Sans doute viendra-t-il.', 'sans doute'],
  ['Il parle sans cesse.', 'sans cesse'],
  ['Quant à moi, je reste.', 'quant à …'],
  ['Afin de comprendre, il lit.', 'afin de'],
  ['Au sujet de ce livre, je ne sais rien.', 'au sujet de'],
  ['En dépit de la pluie, nous sortons.', 'en dépit de'],
  ['Il marche le long de la rivière.', 'le long de'],
  ['Il est sorti hors de la maison.', 'hors de'],
  ['Il a marché jusqu\'à la ville.', 'jusqu\'à'],
  ['D\'après lui, il pleuvra.', 'd\'après'],
  ['Il est mort faute de soins.', 'faute de'],
  ['Il est fatigué à force de travailler.', 'à force de'],
  ['Il habite loin de la ville.', 'loin de'],
  ['Il marche à travers la forêt.', 'à travers'],
  ['Il est parti sans que je le voie.', 'sans que'],
  ['Il viendra avant que tu partes.', 'avant que'],
  ['Il viendra bien que tu ne veuilles pas.', 'bien que'],
  ['Il rit tandis que je pleure.', 'tandis que'],
  ['Il a faim, de sorte que nous mangeons.', 'de sorte que'],
  ['Il reste tant que tu veux.', 'tant que'],
];

describe('French phrase units are found in real sentences', () => {
  it.each(FOUND)('%s', (sentence, display) => {
    expect(found(sentence), sentence).toContain(display);
  });
  it('exercises at least sixty distinct units', () => {
    expect(new Set(FOUND.map(([, d]) => d)).size).toBeGreaterThanOrEqual(60);
  });
});

/** More units, one sentence each: lemma-led units whose verbs the word list has to know. */
const MORE: ReadonlyArray<readonly [string, string]> = [
  ['Il paraît que tu as raison.', 'il paraît que'],
  ['Il suffit de lire.', 'il suffit de'],
  ['Il est temps de partir.', 'il est temps de'],
  ['Il se peut que tu viennes.', 'il se peut que'],
  ['Il est tombé amoureux de Marie.', 'tomber amoureux'],
  ['J\'ai entendu parler de ce livre.', 'entendre parler de'],
  ['Il jette un coup d\'œil.', 'jeter un coup d\'œil'],
  ['Cela donne lieu à des questions.', 'donner lieu à …'],
  ['Ils ont mis fin à la guerre.', 'mettre fin à …'],
  ['Le jour prend fin.', 'prendre fin'],
  ['Elle a pitié de lui.', 'avoir pitié de'],
  ['Il a le droit de partir.', 'avoir le droit de'],
  ['Elle a l\'habitude de lire.', 'avoir l\'habitude de'],
  ['J\'ai du mal à dormir.', 'avoir du mal à …'],
  ['Elle est en colère.', 'être en colère'],
  ['Il est en retard.', 'être en retard'],
  ['Je me dépêche de partir.', 'se dépêcher'],
  ['Il se lève tôt.', 'se lever'],
  ['Je m\'appelle Paul.', 's\'appeler'],
  ['Elle se trompe.', 'se tromper'],
  ['Je me demande pourquoi.', 'se demander'],
  ['Il se plaint de moi.', 'se plaindre de …'],
  ['Il fait la queue.', 'faire la queue'],
  ['Elle a fait la vaisselle.', 'faire la vaisselle'],
  ['Il fait un tour.', 'faire un tour'],
  ['Nous avons fait demi-tour.', 'faire demi-tour'],
  ['Ça m\'a fait plaisir.', 'faire plaisir à …'],
  ['Cela me fait peur.', 'faire peur à …'],
  ['Il a promis de venir.', 'promettre de …'],
  ['Il a refusé de manger.', 'refuser de …'],
  ['Elle risque de tomber.', 'risquer de …'],
  ['J\'apprends à lire.', 'apprendre à …'],
  ['Il cherche à comprendre.', 'chercher à …'],
  ['Il a tenu compte de mon avis.', 'tenir compte de'],
  ['À mon avis, il a tort.', 'à mon avis'],
  ['Il a beaucoup de chance et trop d\'amis.', 'beaucoup de'],
  ['Elle habite près de la gare.', 'près de'],
  ['Ils sont partis au bout de trois jours.', 'au bout de'],
  ['Il est assis au-dessus de moi.', 'au-dessus de'],
  ['Il rit tout le temps.', 'tout le temps'],
  ['Elle viendra tous les jours.', 'tous les jours'],
  ['Il parle de nos jours.', 'de nos jours'],
  ['Je vais bien, merci beaucoup.', 'merci beaucoup'],
  ['Bonne nuit, à demain.', 'bonne nuit'],
  ['Il y a longtemps, il y avait un roi.', 'il y a'],
];

describe('more units through the real adapter', () => {
  it.each(MORE)('%s', (sentence, display) => {
    expect(found(sentence), sentence).toContain(display);
  });
});

describe('phrase units are not found where the words only look alike', () => {
  it('a unit needs its words', () => {
    expect(found('J\'ai un livre.')).not.toContain('avoir besoin de');
    expect(found('Il a faim de pain blanc.')).not.toContain('avoir envie de');
  });
  it('venir de needs a verb after it: "je viens de Paris" is not "to have just"', () => {
    expect(found('Je viens de Paris.')).not.toContain('venir de …');
    expect(found('Elle vient de la gare.')).not.toContain('venir de …');
  });
  it('a pronominal verb needs its reflexive pronoun', () => {
    expect(found('Il passe la porte.')).not.toContain('se passer');
    expect(found('Je lève la main.')).not.toContain('se lever');
  });
  it('il y a is not found without il or y', () => {
    expect(found('Il a un livre.')).not.toContain('il y a');
    expect(found('Il y pense.')).not.toContain('il y a');
  });
  it('"à travers" and "tout à fait" need all their words', () => {
    expect(found('Il va à Paris.')).not.toContain('à travers');
    expect(found('Il est tout seul.')).not.toContain('tout à fait');
  });
  it('the "ago" reading of il y a needs a time word', () => {
    expect(found('Il y a deux chats.')).not.toContain('il y a … (time)');
  });
});

describe('est-ce que with its hyphen', () => {
  it('is found with the hyphen (est · - · ce · que) and in a longer question', () => {
    const tokens = frAdapter.tokenize('Est-ce que tu viens ?');
    expect(tokens.slice(0, 4).map((t) => t.normalized)).toEqual(['est', '-', 'ce', 'que']);
    expect(found('Est-ce que tu viens ?')).toContain('est-ce que');
    expect(found('Où est-ce que tu vas ?')).toContain('est-ce que');
  });
  it('the unit carries every word of the pattern', () => {
    const rule = buildPhraseRules().find((r) => r.display === 'est-ce que');
    expect(rule?.pattern).toEqual(['est', 'ce', 'que']);
  });
});

describe('the unit list', () => {
  const rules = buildPhraseRules();
  it('has about 250 units, each with a display, a gloss and a kind', () => {
    expect(PHRASE_UNITS.length).toBeGreaterThanOrEqual(240);
    expect(rules).toHaveLength(PHRASE_UNITS.length);
    for (const r of rules) {
      expect(r.display.length, r.pattern.join(' ')).toBeGreaterThan(0);
      expect(r.gloss.length, r.display).toBeGreaterThan(0);
      expect(['collocation', 'formula', 'idiom', 'frame', 'construction']).toContain(r.kind);
      expect(r.variants.length).toBeGreaterThan(0);
    }
  });
  it('has no duplicate pattern and no duplicate spec', () => {
    const patterns = rules.map((r) => r.pattern.join(' '));
    expect(patterns.filter((p, i) => patterns.indexOf(p) !== i)).toEqual([]);
    const specs = PHRASE_UNITS.map((u) => u[0]);
    expect(specs.filter((p, i) => specs.indexOf(p) !== i)).toEqual([]);
  });
  it('no variant starts with a gap (the matcher throws on that)', () => {
    for (const r of rules) for (const v of r.variants) {
      const first = v[0];
      expect(typeof first === 'object' && !Array.isArray(first) && 'gap' in first, r.display).toBe(false);
    }
  });
  it('all five kinds are used', () => {
    expect(new Set(rules.map((r) => r.kind)).size).toBe(5);
  });
  it('verb-slot patterns are listed', () => {
    expect(VERB_SLOT_PATTERNS.has('venir de _')).toBe(true);
    expect(VERB_SLOT_PATTERNS.has('il y avoir')).toBe(false);
  });
  it('a unit with a verb slot is found through an infinitive', () => {
    expect(found('Il va commencer par manger.')).toContain('commencer par …');
    expect(found('Il risque de tomber.')).toContain('risquer de …');
  });
});
