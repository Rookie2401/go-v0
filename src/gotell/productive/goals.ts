/**
 * Semantic goals — MEANINGS the learner wants to be able to say, separate from any wording of them.
 *
 * A goal names the concepts its meaning must carry (ids of src/gotell/concepts.ts), its polarity, its place in a testimony
 * and how central it is. It holds no target-language text. The model wordings below are MODEL LANGUAGE: written for the
 * course, every one marked `unreviewed` until a native speaker has checked it (TODO(review)), shown with that label, and never
 * counted as the learner's language. A goal is offered in a language only where a model wording exists, so the ladder of
 * help always ends somewhere honest; the self-consistency test (test/gotell/practice/catalog.test.ts) checks that each model
 * wording is recognised as carrying its goal's meaning by the real adapter and concept tables, and that the checker finds
 * nothing in it.
 *
 * Learner-authored goals (TellGoalDefined events) are accepted only when their English maps to concepts GoTell can recognise.
 */
import { hash } from '../../core';
import type { GoalDomain, LanguageCode, ModelWording, SemanticComponent, SemanticGoal, SemanticSection } from '../../core';
import { CONCEPTS, englishConcepts } from '../concepts';
import type { ConceptId } from '../concepts';

const C = (concept: ConceptId, label: string, english: string): SemanticComponent => ({ concept, label, english });

type CatalogGoal = Omit<SemanticGoal, 'source' | 'version'>;

const GOALS: CatalogGoal[] = [
  { id: 'goal:t.family', domain: 'testimony', section: 'background', order: 1, delivery: 'full', importance: 0.4, negated: false,
    meaning: 'I grew up with my family.', question: 'Where did you grow up?', components: [C('family', 'your family', 'family')] },
  { id: 'goal:t.young-knew-jesus', domain: 'testimony', section: 'childhood', order: 2, delivery: 'standard', importance: 0.7, negated: false,
    meaning: 'When I was young, I knew about Jesus.', question: 'What did you know about Jesus as a child?',
    components: [C('young', 'being young', 'young'), C('know', 'knowing', 'know'), C('jesus', 'Jesus', 'Jesus')] },
  { id: 'goal:t.not-understand-sin', domain: 'testimony', section: 'understanding-of-sin', order: 3, delivery: 'standard', importance: 0.8, negated: true,
    meaning: 'But I did not understand my sin.', question: 'Did you understand your sin back then?',
    components: [C('understand', 'understanding', 'understand'), C('sin', 'your sin', 'sin')] },
  { id: 'goal:t.felt-guilt', domain: 'testimony', section: 'conviction', order: 4, delivery: 'standard', importance: 0.7, negated: false,
    meaning: 'I felt guilty before God.', question: 'How did you feel before God?',
    components: [C('guilt', 'guilt', 'guilty'), C('jesus', 'God', 'God')] },
  { id: 'goal:t.repented', domain: 'testimony', section: 'repentance', order: 5, delivery: 'short', importance: 0.9, negated: false,
    meaning: 'I repented of my sin.', question: 'What did you do about your sin?',
    components: [C('repent', 'repenting', 'repent'), C('sin', 'your sin', 'sin')] },
  { id: 'goal:t.believe-jesus', domain: 'testimony', section: 'faith', order: 6, delivery: 'short', importance: 1, negated: false,
    meaning: 'I believe in Jesus.', question: 'In whom do you believe?',
    components: [C('believe', 'believing', 'believe'), C('jesus', 'Jesus', 'Jesus')] },
  { id: 'goal:t.god-forgave', domain: 'testimony', section: 'forgiveness', order: 7, delivery: 'short', importance: 0.95, negated: false,
    meaning: 'God forgave my sin.', question: 'What did God do with your sin?',
    components: [C('jesus', 'God', 'God'), C('forgive', 'forgiving', 'forgave'), C('sin', 'your sin', 'sin')] },
  { id: 'goal:t.saved-by-grace', domain: 'testimony', section: 'grace', order: 8, delivery: 'standard', importance: 0.8, negated: false,
    meaning: 'God saved me by his grace.', question: 'How did God save you?',
    components: [C('jesus', 'God', 'God'), C('salvation', 'saving', 'saved'), C('grace', 'grace', 'grace')] },
  { id: 'goal:t.jesus-changed-me', domain: 'testimony', section: 'transformation', order: 9, delivery: 'short', importance: 0.9, negated: false,
    meaning: 'Jesus changed my life.', question: 'What did Jesus do in your life?',
    components: [C('jesus', 'Jesus', 'Jesus'), C('change', 'changing', 'changed')] },
  { id: 'goal:t.now-trust', domain: 'testimony', section: 'present-faith', order: 10, delivery: 'standard', importance: 0.8, negated: false,
    meaning: 'Now I trust Jesus every day.', question: 'How do you live with Jesus now?',
    components: [C('now', 'now', 'now'), C('trust', 'trusting', 'trust'), C('jesus', 'Jesus', 'Jesus')] },
  { id: 'goal:t.share', domain: 'testimony', section: 'why-sharing', order: 11, delivery: 'standard', importance: 0.7, negated: false,
    meaning: 'I want to share this with you.', question: 'Why are you telling me this?', components: [C('share', 'sharing', 'share')] },
  { id: 'goal:s.jesus-forgives', domain: 'scripture', importance: 0.8, negated: false,
    meaning: 'Jesus forgives sin.', question: 'What does Jesus do with sin?',
    components: [C('jesus', 'Jesus', 'Jesus'), C('forgive', 'forgiving', 'forgives'), C('sin', 'sin', 'sin')] },
  { id: 'goal:c.church-family', domain: 'church', importance: 0.5, negated: false,
    meaning: 'The church is my family.', question: 'What is the church to you?',
    components: [C('jesus', 'the church', 'church'), C('family', 'family', 'family')] },
  { id: 'goal:m.do-you-believe', domain: 'ministry', importance: 0.7, negated: false,
    meaning: 'Do you believe in Jesus?', components: [C('believe', 'believing', 'believe'), C('jesus', 'Jesus', 'Jesus')] },
  { id: 'goal:d.understand-now', domain: 'daily-life', importance: 0.4, negated: false,
    meaning: 'Now I understand.', question: 'Do you understand now?', components: [C('now', 'now', 'now'), C('understand', 'understanding', 'understand')] },
];

export const CATALOG_GOALS: SemanticGoal[] = GOALS.map((g) => ({ ...g, source: 'catalog', version: 1 }));

const HI_MASC = 'Masculine forms (a man speaking); a woman uses the feminine forms (था → थी, -ता → -ती).';

/** TODO(review): every wording below needs a native-speaker pass. Shown as "model wording, not yet reviewed". */
const MODELS: Record<LanguageCode, Record<string, string | { text: string; note: string }>> = {
  es: {
    'goal:t.family': 'Crecí con mi familia.',
    'goal:t.young-knew-jesus': 'Cuando era joven, conocía a Jesús.',
    'goal:t.not-understand-sin': 'Pero no entendía mi pecado.',
    'goal:t.felt-guilt': 'Me sentía culpable delante de Dios.',
    'goal:t.repented': 'Me arrepentí de mi pecado.',
    'goal:t.believe-jesus': 'Creo en Jesús.',
    'goal:t.god-forgave': 'Dios perdonó mi pecado.',
    'goal:t.saved-by-grace': 'Dios me salvó por su gracia.',
    'goal:t.jesus-changed-me': 'Jesús cambió mi vida.',
    'goal:t.now-trust': 'Ahora confío en Jesús cada día.',
    'goal:t.share': { text: 'Quiero compartir esto con vos.', note: 'Honduran voseo: "con vos" (not "contigo"). To an older person, a stranger or a pastor say "con usted".' },
    'goal:s.jesus-forgives': 'Jesús perdona el pecado.',
    'goal:c.church-family': 'La iglesia es mi familia.',
    'goal:m.do-you-believe': { text: '¿Creés en Jesús?', note: 'Honduran voseo: "vos creés" (not "tú crees"). To an older person, a stranger or a pastor say "¿Cree usted en Jesús?".' },
    'goal:d.understand-now': 'Ahora entiendo.',
  },
  de: {
    'goal:t.family': 'Ich bin mit meiner Familie aufgewachsen.',
    'goal:t.young-knew-jesus': 'Als ich jung war, kannte ich Jesus.',
    'goal:t.not-understand-sin': 'Aber ich verstand meine Sünde nicht.',
    'goal:t.felt-guilt': 'Ich fühlte mich schuldig vor Gott.',
    'goal:t.repented': 'Ich bereute meine Sünde.',
    'goal:t.believe-jesus': 'Ich glaube an Jesus.',
    'goal:t.god-forgave': 'Gott hat meine Sünde vergeben.',
    'goal:t.saved-by-grace': 'Gott hat mich durch seine Gnade gerettet.',
    'goal:t.jesus-changed-me': 'Jesus hat mein Leben verändert.',
    'goal:t.now-trust': 'Jetzt vertraue ich Jesus jeden Tag.',
    'goal:t.share': 'Ich möchte dir davon erzählen.',
    'goal:s.jesus-forgives': 'Jesus vergibt Sünde.',
    'goal:c.church-family': 'Die Gemeinde ist meine Familie.',
    'goal:m.do-you-believe': 'Glaubst du an Jesus?',
    'goal:d.understand-now': 'Jetzt verstehe ich.',
  },
  // machine-draft, native review pending: plain Bokmål and Nynorsk wordings of the same fifteen meanings
  nb: {
    'goal:t.family': 'Jeg vokste opp med familien min.',
    'goal:t.young-knew-jesus': 'Da jeg var ung, kjente jeg Jesus.',
    'goal:t.not-understand-sin': 'Men jeg forsto ikke synden min.',
    'goal:t.felt-guilt': 'Jeg følte meg skyldig overfor Gud.',
    'goal:t.repented': 'Jeg angret synden min.',
    'goal:t.believe-jesus': 'Jeg tror på Jesus.',
    'goal:t.god-forgave': 'Gud tilga synden min.',
    'goal:t.saved-by-grace': 'Gud frelste meg ved sin nåde.',
    'goal:t.jesus-changed-me': 'Jesus forandret livet mitt.',
    'goal:t.now-trust': 'Nå stoler jeg på Jesus hver dag.',
    'goal:t.share': 'Jeg vil gjerne fortelle deg om dette.',
    'goal:s.jesus-forgives': 'Jesus tilgir synd.',
    'goal:c.church-family': 'Menigheten er min familie.',
    'goal:m.do-you-believe': 'Tror du på Jesus?',
    'goal:d.understand-now': 'Nå forstår jeg.',
  },
  nn: {
    'goal:t.family': 'Eg voks opp med familien min.',
    'goal:t.young-knew-jesus': 'Då eg var ung, kjende eg Jesus.',
    'goal:t.not-understand-sin': 'Men eg forstod ikkje synda mi.',
    'goal:t.felt-guilt': 'Eg kjende meg skuldig overfor Gud.',
    'goal:t.repented': 'Eg angra synda mi.',
    'goal:t.believe-jesus': 'Eg trur på Jesus.',
    'goal:t.god-forgave': 'Gud tilgav synda mi.',
    'goal:t.saved-by-grace': 'Gud frelste meg ved si nåde.',
    'goal:t.jesus-changed-me': 'Jesus forandra livet mitt.',
    'goal:t.now-trust': 'No stolar eg på Jesus kvar dag.',
    'goal:t.share': 'Eg vil gjerne fortelje deg om dette.',
    'goal:s.jesus-forgives': 'Jesus tilgjev synd.',
    'goal:c.church-family': 'Kyrkja er familien min.',
    'goal:m.do-you-believe': 'Trur du på Jesus?',
    'goal:d.understand-now': 'No forstår eg.',
  },
  hi: {
    'goal:t.family': { text: 'मैं अपने परिवार के साथ बड़ा हुआ।', note: HI_MASC },
    'goal:t.young-knew-jesus': { text: 'जब मैं छोटा था, तब मैं यीशु के बारे में जानता था।', note: HI_MASC },
    'goal:t.not-understand-sin': { text: 'लेकिन मैं अपने पाप को नहीं समझता था।', note: HI_MASC },
    'goal:t.felt-guilt': { text: 'मैं परमेश्वर के सामने दोषी महसूस करता था।', note: HI_MASC },
    'goal:t.repented': 'मैंने अपने पाप से पश्चाताप किया।',
    'goal:t.believe-jesus': { text: 'मैं यीशु पर विश्वास करता हूँ।', note: HI_MASC },
    'goal:t.god-forgave': 'परमेश्वर ने मेरे पाप क्षमा किए।',
    'goal:t.saved-by-grace': 'परमेश्वर ने अपने अनुग्रह से मेरा उद्धार किया।',
    'goal:t.jesus-changed-me': 'यीशु ने मेरा जीवन बदल दिया।',
    'goal:t.now-trust': { text: 'अब मैं हर दिन यीशु पर भरोसा करता हूँ।', note: HI_MASC },
    'goal:t.share': { text: 'मैं यह आपके साथ साझा करना चाहता हूँ।', note: HI_MASC },
    'goal:s.jesus-forgives': 'यीशु पाप क्षमा करता है।',
    'goal:c.church-family': 'कलीसिया मेरा परिवार है।',
    'goal:m.do-you-believe': 'क्या आप यीशु पर विश्वास करते हैं?',
    'goal:d.understand-now': { text: 'अब मैं समझता हूँ।', note: HI_MASC },
  },
  sq: {
    'goal:t.family': 'Unë u rrita me familjen time.',
    'goal:t.young-knew-jesus': { text: 'Kur isha i vogël, e njihja Jezusin.', note: 'A woman says "e vogël".' },
    'goal:t.not-understand-sin': 'Por nuk e kuptoja mëkatin tim.',
    'goal:t.felt-guilt': { text: 'Ndihesha fajtor para Perëndisë.', note: 'A woman says "fajtore".' },
    'goal:t.repented': 'U pendova për mëkatin tim.',
    'goal:t.believe-jesus': 'Unë besoj në Jezusin.',
    'goal:t.god-forgave': 'Perëndia më fali mëkatin.',
    'goal:t.saved-by-grace': 'Perëndia më shpëtoi me hirin e tij.',
    'goal:t.jesus-changed-me': 'Jezusi ma ndryshoi jetën.',
    'goal:t.now-trust': 'Tani mbështetem te Jezusi çdo ditë.',
    'goal:t.share': 'Dua ta ndaj këtë me ty.',
    'goal:s.jesus-forgives': 'Jezusi fal mëkatet.',
    // no model for 'goal:c.church-family': "kisha" (church) is also "I had"; the concept tables cannot tell them apart
    'goal:m.do-you-believe': 'A beson në Jezusin?',
    'goal:d.understand-now': 'Tani e kuptoj.',
  },
  th: {
    'goal:t.family': 'ฉันโตมากับครอบครัว',
    'goal:t.young-knew-jesus': 'ตอนเด็ก ฉันรู้จักพระเยซู',
    'goal:t.not-understand-sin': 'แต่ฉันไม่เข้าใจบาปของตัวเอง',
    'goal:t.felt-guilt': 'ฉันรู้สึกผิดต่อพระเจ้า',
    'goal:t.repented': 'ฉันกลับใจจากบาป',
    'goal:t.believe-jesus': 'ฉันเชื่อในพระเยซู',
    'goal:t.god-forgave': 'พระเจ้าทรงอภัยบาปของฉัน',
    'goal:t.saved-by-grace': 'พระเจ้าทรงช่วยฉันให้รอดโดยพระคุณ',
    'goal:t.jesus-changed-me': 'พระเยซูเปลี่ยนชีวิตของฉัน',
    'goal:t.now-trust': 'ตอนนี้ฉันไว้วางใจพระเยซูทุกวัน',
    'goal:t.share': 'ฉันอยากแบ่งปันเรื่องนี้กับคุณ',
    'goal:s.jesus-forgives': 'พระเยซูทรงอภัยบาป',
    'goal:c.church-family': 'คริสตจักรเป็นครอบครัวของฉัน',
    'goal:m.do-you-believe': 'คุณเชื่อในพระเยซูไหม',
    'goal:d.understand-now': 'ตอนนี้ฉันเข้าใจแล้ว',
  },
};

/** The catalog's model wording for a goal in a language, if there is one. */
export function catalogModel(goalId: string, lang: LanguageCode): ModelWording | undefined {
  const m = MODELS[lang]?.[goalId];
  if (!m) return undefined;
  const { text, note } = typeof m === 'string' ? { text: m, note: undefined } : m;
  return { goalId, lang, text, review: 'unreviewed', origin: 'catalog', ...(note ? { note } : {}) };
}

/** Catalog goals offered in a language: those with a model wording there. */
export function catalogGoals(lang: LanguageCode): SemanticGoal[] {
  return CATALOG_GOALS.filter((g) => !!MODELS[lang]?.[g.id]);
}

const NEGATION_EN = /\b(not|never|no|didn't|don't|doesn't|wasn't|isn't|couldn't|can't|cannot)\b/i;

/**
 * A learner-authored goal from English. Its components are the concepts the English names (the same table intent() uses);
 * a meaning with no recognisable concept is refused, because no attempt at it could be assessed.
 */
export function learnerGoal(input: { meaning: string; domain?: GoalDomain; section?: SemanticSection }, userId: string, version = 1): { ok: true; goal: SemanticGoal } | { ok: false; reason: string } {
  const meaning = input.meaning.trim().replace(/\s+/g, ' ');
  if (meaning.length < 3) return { ok: false, reason: 'Write the meaning you want to be able to say, in English.' };
  if (meaning.length > 200) return { ok: false, reason: 'Keep it to one sentence: a meaning you would say in one breath.' };
  const hits = englishConcepts(meaning);
  if (hits.length === 0) {
    return { ok: false, reason: 'GoTell cannot yet recognise any of the ideas in this sentence in your attempts, so it could not tell whether you said it. Try naming the key idea (believe, forgive, sin, grace, family, change, now …).' };
  }
  const components = hits.map((h) => ({ concept: h.concept, label: h.word, english: h.word }));
  const importance = Math.max(...hits.map((h) => (CONCEPTS[h.concept].theological ? 0.8 : 0.6)));
  const goal: SemanticGoal = {
    id: `goal:u.${hash(`${userId}|${meaning.toLowerCase()}`).slice(0, 12)}`,
    domain: input.domain ?? 'testimony',
    ...(input.section ? { section: input.section } : {}),
    meaning,
    components,
    negated: NEGATION_EN.test(meaning),
    importance,
    source: 'learner',
    version,
  };
  return { ok: true, goal };
}
