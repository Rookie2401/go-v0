/**
 * Register pairs and groups: words for the same thing in different layers of Hindi — Persian and Arabic words (ज़रूरत),
 * Sanskrit-derived words (आवश्यकता), English loans (स्कूल), everyday words, and the vocabulary of Scripture and church.
 * Hindi has always drawn on all of them; none of these layers is "the correct Hindi", and a reader of the Bible, a
 * newspaper, a film and a village market meets different mixtures.
 *
 * The words of a group are NEVER merged: each keeps its own lemma, its own item in the learner model, its own reading.
 * The relation is information, for the word sheet ("the same thing is also said …") and for difficulty (a learner who has
 * met one word of the group has a head start on the others). A member marked with `*` is a real word that the course word
 * list does not hold (yet): it is shown, never analysed.
 *
 * Layers: ev everyday, sk sanskritic, pa perso-arabic, el english-loan, bi biblical, fo formal, li literary, co colloquial,
 * re religious. Machine-drafted, not reviewed by a native speaker.
 */
import type { RegisterTag } from '../../core';

export interface HindiRegisterMember {
  lemma: string;
  register: RegisterTag[];
  /** True when the word list does not hold this word: it is information for the word sheet, not a word the adapter analyses. */
  outside?: boolean;
}

export interface HindiRegisterGroup {
  /** What the words of the group have in common, in plain English. */
  meaning: string;
  members: HindiRegisterMember[];
}

const LAYER: Readonly<Record<string, RegisterTag>> = {
  ev: 'everyday', sk: 'sanskritic', pa: 'perso-arabic', el: 'english-loan', bi: 'biblical', fo: 'formal', li: 'literary', co: 'colloquial', re: 'religious',
};

/** `meaning = word:ev,pa ; word2*:sk,fo` (a word that ends in * is outside the word list). */
const GROUPS_SOURCE = `
need = ज़रूरत:pa,ev ; आवश्यकता:sk,fo
beginning = शुरुआत:ev ; आरंभ:sk,fo ; प्रारंभ:sk,fo
death = मौत:pa,ev ; मृत्यु:sk,fo
book = किताब:pa,ev ; पुस्तक:sk,fo
world = दुनिया:pa,ev ; संसार:sk,fo ; जगत:sk,li
heart = दिल:pa,ev ; हृदय:sk,fo
time = वक़्त:pa,ev ; समय:sk,ev
life = ज़िंदगी:pa,ev ; जीवन:sk,fo
help = मदद:pa,ev ; सहायता:sk,fo
waiting = इंतज़ार:pa,ev ; प्रतीक्षा:sk,fo
joy = ख़ुशी:pa,ev ; प्रसन्नता:sk,fo ; आनंद:sk
letter = चिट्ठी:ev ; पत्र:sk,fo
friend = दोस्त:pa,ev ; मित्र:sk,fo
enemy = दुश्मन:pa,ev ; शत्रु:sk,fo
school = स्कूल:el,ev ; विद्यालय:sk,fo ; पाठशाला:sk
hospital = अस्पताल:el,ev ; चिकित्सालय*:sk,fo
medicine = दवा:pa,ev ; औषधि:sk,fo
water = पानी:ev ; जल*:sk,fo
fire = आग:ev ; अग्नि*:sk,li
sky = आसमान:pa,ev ; आकाश:sk,fo
sun = सूरज:ev ; सूर्य:sk,fo
moon = चाँद:ev ; चंद्रमा:sk,fo
earth, ground = ज़मीन:pa,ev ; धरती:ev ; पृथ्वी:sk,fo
sea = समुद्र:sk,ev ; सागर:sk,li ; दरिया*:pa,li
mountain = पहाड़:ev ; पर्वत:sk,fo
village = गाँव:ev ; ग्राम:sk,fo
city = शहर:pa,ev ; नगर:sk,fo
country = देश:sk,ev ; मुल्क*:pa,co
king = राजा:sk,ev ; बादशाह*:pa,ev
question = सवाल:pa,ev ; प्रश्न:sk,fo
answer = जवाब:pa,ev ; उत्तर:sk,fo
trust = भरोसा:pa,ev ; विश्वास:sk ; यक़ीन*:pa,ev
mistake = ग़लती:pa,ev ; भूल:ev
forgiveness = माफ़ी:pa,ev ; क्षमा:sk,fo
year = साल:pa,ev ; वर्ष:sk,fo
week = हफ़्ता:pa,ev ; सप्ताह:sk,fo
morning = सुबह:pa,ev ; प्रातः*:sk,fo
evening = शाम:pa,ev ; संध्या:sk,li
respect = इज़्ज़त:pa,ev ; सम्मान:sk,fo
strength = ताक़त:pa,ev ; शक्ति:sk,fo ; बल:sk
courage = हिम्मत:pa,ev ; साहस:sk,ev
doubt = शक:pa,ev ; संदेह:sk,fo
hatred = नफ़रत:pa,ev ; घृणा:sk,fo
anger = ग़ुस्सा:pa,ev ; क्रोध:sk,fo
fear = डर:ev ; भय:sk,fo
hope = उम्मीद:pa,ev ; आशा:sk
peace of mind = सुकून:pa,ev ; चैन:pa,ev ; शांति:sk
love = मोहब्बत:pa,ev ; प्रेम:sk,fo ; प्यार:ev
blood = ख़ून:pa,ev ; रक्त:sk,fo ; लहू:ev,bi
health = सेहत:pa,ev ; स्वास्थ्य:sk,fo
illness = बीमारी:pa,ev ; रोग:sk,fo
body = शरीर:sk,ev ; देह:sk,li ; जिस्म*:pa,ev
man, human being = आदमी:pa,ev ; इंसान:pa,ev ; मनुष्य:sk,fo ; पुरुष:sk,fo
woman = औरत:pa,ev ; स्त्री:sk,fo ; महिला:sk,fo
wife = बीवी:pa,co ; पत्नी:sk,fo
husband = पति:sk,ev ; शौहर*:pa,ev
child = बच्चा:ev ; बालक:sk,fo ; शिशु:sk
mother = माँ:ev ; माता:sk,fo
father = पिता:sk,ev ; बाप:ev,co
son = बेटा:ev ; पुत्र:sk,fo
daughter = बेटी:ev ; पुत्री:sk,fo
guest = मेहमान:pa,ev ; अतिथि:sk,fo
servant = नौकर:pa,ev ; सेवक:sk,fo ; दास:sk,bi
master, owner = मालिक:pa,ev ; स्वामी*:sk,fo
God = परमेश्वर:sk,bi ; ईश्वर:sk,re ; भगवान:sk,re ; ख़ुदा:pa,re
prayer = प्रार्थना:sk,re ; दुआ:pa,re
worship = पूजा:sk,ev,re ; उपासना:sk,re ; आराधना:sk,re
sin = पाप:sk,re ; गुनाह*:pa,ev
blessing = आशीष:sk,bi ; आशीर्वाद:sk,re ; दुआ:pa,re
witness = गवाही:pa,bi ; साक्षी*:sk,fo
prophet = नबी:pa,bi ; भविष्यवक्ता:sk,bi 
heaven = स्वर्ग:sk,re ; जन्नत*:pa,re
hell = नरक:sk,re ; जहन्नुम*:pa,re
truth = सच:ev ; सत्य:sk,fo
lie = झूठ:ev ; असत्य*:sk,fo
law = क़ानून:pa,ev ; नियम:sk ; व्यवस्था:sk,bi
government = सरकार:pa,ev ; शासन*:sk,fo
court = अदालत:pa,ev ; न्यायालय:sk,fo
justice = इंसाफ़*:pa,ev ; न्याय:sk,fo
army = फ़ौज:pa,ev ; सेना:sk,fo
war = जंग*:pa,ev ; युद्ध:sk,fo ; लड़ाई:ev
meaning = मतलब:pa,ev ; अर्थ:sk,fo
language = ज़बान*:pa,ev ; भाषा:sk
word = लफ़्ज़*:pa,li ; शब्द:sk,ev
price = दाम:ev ; क़ीमत:pa,ev ; मूल्य:sk,fo
salary = तनख़्वाह:pa,ev ; वेतन:sk,fo
wealth = दौलत*:pa,ev ; धन:sk,ev
debt = क़र्ज़:pa,ev ; ऋण*:sk,fo
picture = तस्वीर:pa,ev ; चित्र:sk,fo
journey = सफ़र:pa,ev ; यात्रा:sk,fo
traveller = मुसाफ़िर:pa,ev ; यात्री:sk,fo
pain = दर्द:pa,ev ; पीड़ा*:sk,fo
trouble = तकलीफ़:pa,ev ; कष्ट:sk,fo
calamity = मुसीबत:pa,ev ; संकट:sk,fo ; विपत्ति:sk,fo
duty = फ़र्ज़:pa,ev ; कर्तव्य:sk,fo
right = हक़:pa,ev ; अधिकार:sk,fo
wish, will = मर्ज़ी:pa,ev ; इच्छा:sk
road, way = रास्ता:pa,ev ; मार्ग:sk,fo
news = ख़बर:pa,ev ; समाचार:sk,fo
light = रोशनी:pa,ev ; प्रकाश:sk,fo ; उजाला:ev
darkness = अँधेरा:ev ; अंधकार:sk,fo
rain = बारिश:pa,ev ; बरसात:ev ; वर्षा*:sk,fo
moment = पल:ev ; क्षण:sk,fo
door = दरवाज़ा:pa,ev ; द्वार:sk,li
house, building = मकान:pa,ev ; भवन*:sk,fo
date = तारीख़:pa,ev ; तिथि:sk,fo
age = उम्र:pa,ev ; आयु:sk,fo
responsibility = ज़िम्मेदारी:pa,ev ; दायित्व*:sk,fo
room = कमरा:ev ; कक्ष*:sk,fo
good news = ख़ुशख़बरी:pa,ev ; सुसमाचार:sk,bi
dream = सपना:ev ; स्वप्न:sk,fo ; ख़्वाब:pa,li
gift = भेंट:ev,bi ; उपहार:sk,fo ; तोहफ़ा:pa,ev
festival = त्योहार:ev ; उत्सव:sk ; पर्व:sk,bi
food = खाना:ev ; भोजन:sk,fo
thank you = धन्यवाद:sk,ev ; शुक्रिया:pa,co
greeting = नमस्ते:sk,ev ; नमस्कार:sk,fo ; सलाम:pa,ev
please = कृपया:sk,fo ; प्लीज़:el,co ; मेहरबानी*:pa,ev
difficult = मुश्किल:pa,ev ; कठिन:sk,fo
easy = आसान:pa,ev ; सरल:sk,fo
clean = साफ़:pa,ev ; स्वच्छ*:sk,fo ; शुद्ध:sk,fo
beautiful = सुंदर:sk,ev ; ख़ूबसूरत:pa,ev
special = ख़ास:pa,ev ; विशेष:sk,fo
ordinary = आम:pa,ev ; साधारण:sk,fo ; सामान्य:sk,fo
necessary = ज़रूरी:pa,ev ; आवश्यक:sk,fo
strong = मज़बूत:pa,ev ; दृढ़*:sk,fo
brave = बहादुर:pa,ev ; वीर*:sk,li
alive = ज़िंदा:pa,ev ; जीवित:sk,fo
dead = मुर्दा:pa,ev ; मृत:sk,fo
rich = अमीर:pa,ev ; धनी:sk,fo
poor = ग़रीब:pa,ev ; निर्धन*:sk,fo
happy = ख़ुश:pa,ev ; प्रसन्न:sk,fo
last = आख़िरी:pa,ev ; अंतिम:sk,fo
wicked = बुरा:ev ; दुष्ट:sk,bi
humble = विनम्र:sk,fo ; नम्र:sk,bi
always = हमेशा:pa,ev ; सदा:sk,li ; सदैव:sk,fo
often = अक्सर:pa,ev ; प्रायः:sk,fo
daily = रोज़:pa,ev ; प्रतिदिन:sk,fo
about, nearly = लगभग:sk,ev ; क़रीब:pa,ev
perhaps = शायद:pa,ev ; कदाचित्*:sk,fo
certainly = ज़रूर:pa,ev ; अवश्य:sk,fo
only = सिर्फ़:pa,ev ; केवल:sk
more = ज़्यादा:pa,ev ; अधिक:sk,fo
at once = फ़ौरन:pa,ev ; तुरंत:ev ; शीघ्र:sk,fo
if = अगर:pa,ev ; यदि:sk,fo
but = लेकिन:pa,ev ; मगर:pa,ev ; परन्तु:sk,fo ; किन्तु:sk,li
and = और:ev ; तथा:sk,fo ; एवं:sk,fo
or = या:ev ; अथवा:sk,fo
otherwise = वरना:pa,ev ; अन्यथा:sk,fo
that is = यानी:pa,ev ; अर्थात्:sk,fo
against = ख़िलाफ़:pa,ev ; विरुद्ध*:sk,fo
without = बिना:ev ; बगैर:pa,ev
because of = वजह:pa,ev ; कारण:sk,fo
near = नज़दीक:pa,ev ; निकट:sk,fo ; समीप:sk,fo ; पास:ev
inside = अंदर:pa,ev ; भीतर:sk,fo
all = सब:ev ; सभी:ev ; समस्त:sk,fo
`;

function parseGroups(source: string): HindiRegisterGroup[] {
  const out: HindiRegisterGroup[] = [];
  source.split('\n').forEach((raw, n) => {
    const line = raw.normalize('NFC').trim();
    if (!line) return;
    const eq = line.indexOf(' = ');
    if (eq < 0) throw new Error(`register groups:${n + 1}: expected "meaning = word:layers ; …"`);
    const meaning = line.slice(0, eq).trim();
    const members = line.slice(eq + 3).split(';').map((m) => {
      const part = m.trim();
      const colon = part.lastIndexOf(':');
      if (colon <= 0) throw new Error(`register groups:${n + 1}: "${part}" has no layers`);
      let lemma = part.slice(0, colon).trim();
      const outside = lemma.endsWith('*');
      if (outside) lemma = lemma.slice(0, -1);
      const register = part.slice(colon + 1).split(',').map((a) => {
        const tag = LAYER[a.trim()];
        if (!tag) throw new Error(`register groups:${n + 1}: unknown layer "${a}"`);
        return tag;
      });
      const member: HindiRegisterMember = { lemma, register };
      if (outside) member.outside = true;
      return member;
    });
    if (members.length < 2) throw new Error(`register groups:${n + 1}: a group needs at least two words`);
    out.push({ meaning, members });
  });
  return out;
}

/** Every group, in the order written. */
export const REGISTER_GROUPS: readonly HindiRegisterGroup[] = parseGroups(GROUPS_SOURCE);

const BY_LEMMA = new Map<string, HindiRegisterGroup[]>();
for (const g of REGISTER_GROUPS) {
  for (const m of g.members) {
    const list = BY_LEMMA.get(m.lemma) ?? [];
    list.push(g);
    BY_LEMMA.set(m.lemma, list);
  }
}

/**
 * The group a word belongs to: the other words for the same thing in other layers, each with its own layer. The first group
 * that holds the lemma (a word such as दुआ can sit in two). Undefined when the word is in no group.
 */
export function registerGroupOf(lemma: string): { members: Array<{ lemma: string; register: RegisterTag[] }>; meaning: string } | undefined {
  const g = BY_LEMMA.get(lemma.normalize('NFC'))?.[0];
  return g ? { meaning: g.meaning, members: g.members.map((m) => ({ lemma: m.lemma, register: [...m.register] })) } : undefined;
}

/** Every group a word belongs to. */
export function registerGroupsOf(lemma: string): readonly HindiRegisterGroup[] {
  return BY_LEMMA.get(lemma.normalize('NFC')) ?? [];
}

/** The layer a group gives one of its own words (for a word whose row names none). */
export function registerOf(lemma: string): RegisterTag[] | undefined {
  const g = registerGroupOf(lemma);
  const m = g?.members.find((x) => x.lemma === lemma.normalize('NFC'));
  return m ? m.register : undefined;
}
