/**
 * Teaching Cyrillic fast: the 33 letters of the Russian alphabet as plain typed data, the order that lets a beginner read real words
 * soonest, the pairs of letters learners mix up, the reading rules that are not obvious from the letters, and a first list of common
 * words and expressions in learning order. No dependency on anything outside this folder.
 *
 * MACHINE-DRAFTED, not reviewed by a native speaker or a teacher. The sound hints are approximations for an English speaker (one usual
 * value a letter, not a description of the sound system). Every example word and every stress below was read against the Wiktionary
 * Russian extract (data/dictionaries/kaikki.org-dictionary-Russian.jsonl.gz): each is a headword (or, for forms like читаю, люблю,
 * хочу, зовут, a form page) there, and its stress is the one the source marks. Stress positions are indexes into the lower-case key
 * (`ruKey`) of the word or phrase, with spaces and punctuation counted.
 *
 * The transliteration of a letter is the scheme of translit.ts (scholarly: ž š č šč x c j, ʹ for ь, ʺ for ъ).
 */

export interface RuLetter {
  upper: string;
  lower: string;
  /** The letter's name in Russian. */
  name: string;
  /** Plain English hint, at most 70 characters. */
  sound: string;
  /** The letter in the scholarly transliteration (translit.ts). */
  translit: string;
  /**
   * The stage the letter is taught in: 1 looks and sounds familiar, 2 looks familiar but sounds different (the "false friends"; also
   * е and ё, which begin with a y-sound), 3 a new shape, 4 the two signs, which have no sound of their own.
   */
  group: 1 | 2 | 3 | 4;
  /** A common word that starts with, or clearly shows, the letter; `stress` are positions in the word's key. */
  example: { word: string; gloss: string; stress: number[] };
  /** One short remark (at most 100 characters). */
  note?: string;
}

const L = (
  upper: string, lower: string, name: string, sound: string, translit: string, group: 1 | 2 | 3 | 4,
  word: string, gloss: string, stress: number[], note?: string,
): RuLetter => ({ upper, lower, name, sound, translit, group, example: { word, gloss, stress }, ...(note ? { note } : {}) });

/** The 33 letters, in alphabet order. */
export const RU_ALPHABET: RuLetter[] = [
  L('А', 'а', 'а', 'a as in father', 'a', 1, 'автобус', 'bus', [3], 'Same as Latin A. Said fully only when stressed; weaker otherwise.'),
  L('Б', 'б', 'бэ', 'b as in bat', 'b', 3, 'брат', 'brother', [2], 'Not Latin B (that is В): Б has a flat bar on top.'),
  L('В', 'в', 'вэ', 'v as in van', 'v', 2, 'вода', 'water', [3], 'Looks like Latin B, sounds like v.'),
  L('Г', 'г', 'гэ', 'g as in go', 'g', 3, 'город', 'city, town', [1], 'A hard g. In the endings -ого and -его it says v (его).'),
  L('Д', 'д', 'дэ', 'd as in dog', 'd', 3, 'дом', 'house, home', [1], 'Looks like a little house with feet. At the end of a word it says t (год).'),
  L('Е', 'е', 'е', 'ye as in yes; after a consonant it softens it and says e', 'e', 2, 'еда', 'food', [2], 'Looks like Latin E but starts with a y-sound: ель is said yel.'),
  L('Ё', 'ё', 'ё', 'yo as in yore; after a consonant it softens it and says o', 'ë', 2, 'ёлка', 'fir tree', [0], 'E with two dots. Always stressed; many texts print it as е without the dots.'),
  L('Ж', 'ж', 'жэ', 'zh as the s in measure', 'ž', 3, 'жена', 'wife', [3], 'Looks like a beetle with six legs. Always hard.'),
  L('З', 'з', 'зэ', 'z as in zoo', 'z', 3, 'зима', 'winter', [3], 'Looks like the digit 3 and says z.'),
  L('И', 'и', 'и', 'ee as in see', 'i', 3, 'игра', 'game', [3], 'Looks like a backwards N and says ee.'),
  L('Й', 'й', 'и краткое', 'y as in boy: a short, quick y-sound', 'j', 3, 'май', 'May', [1], 'И with a little hat. It is a consonant and joins vowels: май, мой.'),
  L('К', 'к', 'ка', 'k as in skin', 'k', 1, 'кот', 'tomcat, cat', [1], 'Same as Latin K.'),
  L('Л', 'л', 'эль', 'l as in lamp', 'l', 3, 'лампа', 'lamp', [1], 'A roof shape, like Greek Λ.'),
  L('М', 'м', 'эм', 'm as in man', 'm', 1, 'мама', 'mum, mother', [1], 'Same as Latin M.'),
  L('Н', 'н', 'эн', 'n as in no', 'n', 2, 'нос', 'nose', [1], 'Looks like Latin H, sounds like n.'),
  L('О', 'о', 'о', 'o as in more when stressed; unstressed it sounds like a', 'o', 1, 'окно', 'window', [3], 'Same as Latin O. Watch out: unstressed о sounds like a, as in молоко.'),
  L('П', 'п', 'пэ', 'p as in spin', 'p', 3, 'папа', 'dad', [1], 'A gate shape, like Greek Π. Says p, not n.'),
  L('Р', 'р', 'эр', 'r, rolled with the tip of the tongue', 'r', 2, 'рука', 'hand, arm', [3], 'Looks like Latin P, sounds like a rolled r.'),
  L('С', 'с', 'эс', 's as in sun', 's', 2, 'сок', 'juice', [1], 'Looks like Latin C, but always says s.'),
  L('Т', 'т', 'тэ', 't as in stop', 't', 1, 'там', 'there', [1], 'Same as Latin T.'),
  L('У', 'у', 'у', 'oo as in food', 'u', 2, 'утро', 'morning', [0], 'Looks like Latin Y, sounds like oo.'),
  L('Ф', 'ф', 'эф', 'f as in fan', 'f', 3, 'фото', 'photo', [1], 'A circle on a stem. Most often seen in borrowed words.'),
  L('Х', 'х', 'ха', 'kh, like ch in Scottish loch', 'x', 2, 'хлеб', 'bread', [2], 'Looks like Latin X, sounds like a breathy kh.'),
  L('Ц', 'ц', 'цэ', 'ts as in cats', 'c', 3, 'цена', 'price', [3], 'A U-shape with a small tail. Always ts, and always hard.'),
  L('Ч', 'ч', 'чэ', 'ch as in chat; always soft', 'č', 3, 'чай', 'tea', [1], 'A cup on a stem.'),
  L('Ш', 'ш', 'ша', 'sh as in shut; always hard', 'š', 3, 'школа', 'school', [2], 'Three legs, like a comb.'),
  L('Щ', 'щ', 'ща', 'a long, soft sh, like the sh-ch in fresh cheese', 'šč', 3, 'борщ', 'borscht', [1], 'Ш with a tail. Always soft.'),
  L('Ъ', 'ъ', 'твёрдый знак', 'no sound of its own: the hard sign', 'ʺ', 4, 'подъезд', 'entrance (of an apartment block)', [4], 'Rare. Keeps a consonant hard before е ё ю я.'),
  L('Ы', 'ы', 'ы', 'a back-of-the-mouth i with no English match (try ih)', 'y', 3, 'рыба', 'fish', [1], 'It never starts a word. Say it after a hard consonant: мы, рыба.'),
  L('Ь', 'ь', 'мягкий знак', 'no sound of its own: the soft sign', 'ʹ', 4, 'день', 'day', [1], 'Makes the consonant before it soft: день, мать.'),
  L('Э', 'э', 'э', 'e as in bet', 'è', 3, 'это', 'this is, that is', [0], 'A backwards e: the "hard" e. Starts words, often borrowed ones: это, экран.'),
  L('Ю', 'ю', 'ю', 'yoo as in you; after a consonant it softens it and says oo', 'ju', 3, 'юг', 'south', [0], 'Begins with a y-sound, or softens the consonant before it: люблю.'),
  L('Я', 'я', 'я', 'ya as in yacht; after a consonant it softens it and says a', 'ja', 3, 'яблоко', 'apple', [0], 'Looks like a backwards R, sounds like ya.'),
];

/**
 * The order to learn the letters in, lower case. It is built so that every step lets the learner read new real words, the words
 * below being on the first-words list. After a letter is learned, the words that use only the letters learned so far are readable:
 *   а к м о т    как, мама, мак, там, кто, кот, атом, такт, так   (the five letters that look AND sound as expected)
 *   н            он, она, танк, нота
 *   с            сок, мост, стакан
 *   р            рот, март, торт
 *   в            вот, корова, трава
 *   у            тут, рука, утка, туман
 *   е            нет, море, метро, ветер, сестра
 *   д            да, дом, два, вода, дед, доктор
 *   и            и, они, мир, рис, кино, вино, дети, такси
 *   п            Привет, папа, суп, парк, спорт, паспорт
 *   л            стол, молоко, лето, слово, Как дела?
 *   б            брат, банк, билет, собака, работа, Спасибо
 *   г            город, друг, год, книга, дорога, когда
 *   з            зима, магазин, звезда, зуб
 *   ы            мы, вы, ты, рыба, сын, мыло, сыр
 *   я            я, моя, имя, яблоко, дядя, Меня зовут…
 *   ю            люблю, меню, юг
 *   э            это, этот, эти, поэт, экран, Это книга
 *   й            мой, твой, май, музей, трамвай, Здравствуйте
 *   ч            что, час, чай, человек, почему, почта, Я читаю, ключ
 *   ж            жена, можно, муж, уже, Пожалуйста
 *   ш            школа, машина, шапка, наш, ваш
 *   х            хорошо, хлеб, воздух, муха, хочу
 *   ц            цена, центр, конец, отец, улица, цвет
 *   ф            фото, кофе, шкаф, футбол, телефон, факт
 *   щ            щи, борщ, овощи, товарищ
 *   ё            ёлка, её, ещё, всё, идёт, тётя, моё
 *   ь            день, есть, мать, дочь, семья, пять, шесть, жизнь, дверь, учитель, тетрадь, очень
 *   ъ            подъезд, объект
 * Within that, the letters that are the commonest in everyday words and the false friends (н с р в у, which a learner would
 * misread as Latin letters) come early, so the first mistakes are made while there are few letters to confuse; the rare and
 * sound-less letters (ё ь ъ) come last, and ё, ь and ъ only after the letters they modify.
 */
export const RU_SPRINT_ORDER: string[] = [...'акмотнсрвуедиплбгзыяюэйчжшхцфщёьъ'];

/** Pairs of letters that look alike (a, b are lower-case letters of the alphabet), each with a sentence that tells them apart. */
export const RU_CONFUSIONS: Array<{ a: string; b: string; tell: string }> = [
  { a: 'в', b: 'б', tell: 'в has two round bumps like Latin B and says v; б has a flat bar on top and says b.' },
  { a: 'н', b: 'п', tell: 'н has a crossbar like Latin H and says n; п is an arch with no bar and says p.' },
  { a: 'р', b: 'г', tell: 'р has a loop on a stem like Latin P and says r; г is a flat top on a single leg and says g.' },
  { a: 'и', b: 'й', tell: 'й is и with a little hat: it is a consonant, the short y of boy, and it follows a vowel.' },
  { a: 'ш', b: 'щ', tell: 'щ is ш with a tail: щ is longer and softer (sh-ch), ш is plain sh.' },
  { a: 'ь', b: 'ъ', tell: 'ь is common and softens the consonant before it; ъ is rare and only separates a prefix from е ё ю я.' },
  { a: 'е', b: 'э', tell: 'е starts with a y-sound (ye) or softens the consonant before it; э is a backwards e that says plain e.' },
  { a: 'ы', b: 'и', tell: 'ы is a hard, back vowel that follows hard consonants (мы); и is ee and follows soft ones (ми).' },
  { a: 'с', b: 'з', tell: 'с looks like Latin C and says s; з looks like the digit 3 and says z.' },
  { a: 'у', b: 'ю', tell: 'у says oo; ю has a bar and a ring and starts with a y-sound (yoo).' },
  { a: 'а', b: 'я', tell: 'а is Latin A and says a; я looks like a backwards R and says ya.' },
  { a: 'л', b: 'п', tell: 'л is a roof with a point on top; п is flat on top like a gate.' },
  { a: 'д', b: 'л', tell: 'д sits in a little box with feet; л is a plain roof.' },
  { a: 'ц', b: 'щ', tell: 'ц says ts and has a short tail; щ is a wide ш with a tail and says shch.' },
  { a: 'е', b: 'ё', tell: 'ё is е with two dots; it is always stressed and says yo.' },
  { a: 'о', b: 'ё', tell: 'о is a plain circle; ё starts with a y-sound or softens the consonant before it.' },
];

/** Reading rules that the letters do not show on their own. */
export const RU_READING_RULES: Array<{ key: string; title: string; explain: string; examples: string[] }> = [
  {
    key: 'soft-sign', title: 'The soft sign ь',
    explain: 'ь has no sound. It makes the consonant before it soft (the tongue lifts towards the palate): день, мать. After ж, ш, ч and щ it is only a spelling mark (ночь, мышь) and changes nothing you hear.',
    examples: ['день', 'мать', 'ночь'],
  },
  {
    key: 'hard-sign', title: 'The hard sign ъ',
    explain: 'ъ has no sound. It keeps the consonant before it hard and makes е, ё, ю or я after it begin with a y-sound: подъезд, объект.',
    examples: ['подъезд', 'объект'],
  },
  {
    key: 'short-i', title: 'The letter й',
    explain: 'й is a consonant, the y of boy or my. It is written after a vowel and ends syllables: май, мой, чай. It is not the vowel и.',
    examples: ['май', 'мой', 'чай'],
  },
  {
    key: 'vowel-pairs', title: 'Hard and soft vowel pairs',
    explain: 'Five vowels come in pairs: а я, э е, о ё, у ю, ы и. The second letter of each pair makes the consonant before it soft, or begins with a y-sound at the start of a word or after a vowel. The sound of the vowel stays nearly the same; the consonant changes.',
    examples: ['мал — мял', 'был — бил', 'лук — люк', 'нос — нёс'],
  },
  {
    key: 'palatalisation', title: 'Soft and hard consonants',
    explain: 'A consonant before ь, е, ё, и, ю or я is usually soft; before а, о, у, ы or э it is hard. ж, ш and ц are always hard, and ч, щ and й are always soft. The difference is part of the word: брат is "brother", брать is "to take".',
    examples: ['брат — брать', 'угол — уголь', 'лук — люк'],
  },
  {
    key: 'yo', title: 'The letter ё',
    explain: 'ё is always stressed and says yo (or a soft o after a consonant). Most texts print it as е without the dots, so a printed е may be ё: все (everyone) and всё (everything) differ only by it.',
    examples: ['ёлка', 'всё', 'идёт'],
  },
  {
    key: 'unstressed-vowels', title: 'Stress changes the vowels',
    explain: 'Only the stressed vowel is said in full. Unstressed о is said like a short а, and unstressed е and я like a short и. So молоко is said roughly like малако, голова like галава and река like рика (with the stress on the last vowel in each). Russian does not mark the stress in ordinary text, so learn it with each word.',
    examples: ['молоко', 'голова', 'река'],
  },
  {
    key: 'final-devoicing', title: 'Voiced consonants at the end of a word',
    explain: 'At the end of a word б, в, г, д, ж and з are said as п, ф, к, т, ш and с: год is said like гот, хлеб like хлеп, нож like нош and глаз like глас.',
    examples: ['год', 'хлеб', 'нож', 'глаз'],
  },
  {
    key: 'zhi-shi', title: 'ж, ш, ц, ч, щ and the vowels after them',
    explain: 'ж, ш and ц are always hard, so и after them is said like ы: жить, шить and цирк are said as if written жыть, шыть, цырк. ч and щ are always soft, so after them the spelling uses а and у, not я and ю: чашка, щука.',
    examples: ['жить', 'шить', 'цирк', 'чашка', 'щука'],
  },
  {
    key: 'g-as-v', title: 'г said as в',
    explain: 'In the endings -ого and -его, the г is said like в: нового is said like новово and его like ево. The same is true of сегодня. A few words (много, строго, дорого) keep a real г.',
    examples: ['его', 'нового', 'сегодня'],
  },
  {
    key: 'chto', title: 'что and чтобы',
    explain: 'In что and чтобы the ч is said like ш: что sounds like што. In most other words ч is ч (точно).',
    examples: ['что', 'чтобы'],
  },
  {
    key: 'tsya', title: '-тся and -ться',
    explain: 'The verb endings -тся and -ться are both said like ца: учится and учиться sound alike. The ь in -ться is not a sound.',
    examples: ['учится', 'учиться'],
  },
  {
    key: 'stress', title: 'Stress moves',
    explain: 'The stressed syllable is longer and clearer, and it can move between forms of one word (город, города\u0301) or tell apart two words written alike (за\u0301мок "castle", замо\u0301к "lock"). Dictionaries and primers mark it with an acute accent; everyday text does not.',
    examples: ['за\u0301мок — замо\u0301к', 'го\u0301род — города\u0301'],
  },
];

/**
 * The first words and expressions, in learning order. `form` is as a learner would write it (a phrase may carry a capital and
 * punctuation). They are sorted by the number of steps of RU_SPRINT_ORDER that a word needs: each is spelled only with letters
 * introduced by that step or earlier, so every word is readable as soon as its last new letter is learned; within a step the order
 * is by usefulness. `stress` are positions in `ruKey(form)`, spaces and punctuation counted.
 */
export const RU_FIRST_WORDS: Array<{ form: string; gloss: string; stress: number[] }> = [
  { form: 'как', gloss: 'how', stress: [1] },
  { form: 'мама', gloss: 'mum, mother', stress: [1] },
  { form: 'мак', gloss: 'poppy', stress: [1] },
  { form: 'там', gloss: 'there', stress: [1] },
  { form: 'кто', gloss: 'who', stress: [2] },
  { form: 'кот', gloss: 'tomcat, cat', stress: [1] },
  { form: 'атом', gloss: 'atom', stress: [0] },
  { form: 'такт', gloss: 'beat, bar (in music)', stress: [1] },
  { form: 'так', gloss: 'so, like this', stress: [1] },
  { form: 'он', gloss: 'he', stress: [0] },
  { form: 'она', gloss: 'she', stress: [2] },
  { form: 'танк', gloss: 'tank', stress: [1] },
  { form: 'нота', gloss: 'musical note', stress: [1] },
  { form: 'сок', gloss: 'juice', stress: [1] },
  { form: 'мост', gloss: 'bridge', stress: [1] },
  { form: 'стакан', gloss: 'glass (for drinking)', stress: [4] },
  { form: 'рот', gloss: 'mouth', stress: [1] },
  { form: 'март', gloss: 'March', stress: [1] },
  { form: 'торт', gloss: 'cake', stress: [1] },
  { form: 'вот', gloss: 'here is, there is', stress: [1] },
  { form: 'корова', gloss: 'cow', stress: [3] },
  { form: 'трава', gloss: 'grass', stress: [4] },
  { form: 'тут', gloss: 'here', stress: [1] },
  { form: 'рука', gloss: 'hand, arm', stress: [3] },
  { form: 'утка', gloss: 'duck', stress: [0] },
  { form: 'туман', gloss: 'fog', stress: [3] },
  { form: 'нет', gloss: 'no', stress: [1] },
  { form: 'море', gloss: 'sea', stress: [1] },
  { form: 'метро', gloss: 'subway, metro', stress: [4] },
  { form: 'ветер', gloss: 'wind', stress: [1] },
  { form: 'сестра', gloss: 'sister', stress: [5] },
  { form: 'да', gloss: 'yes', stress: [1] },
  { form: 'дом', gloss: 'house, home', stress: [1] },
  { form: 'два', gloss: 'two', stress: [2] },
  { form: 'вода', gloss: 'water', stress: [3] },
  { form: 'дед', gloss: 'grandfather', stress: [1] },
  { form: 'доктор', gloss: 'doctor', stress: [1] },
  { form: 'и', gloss: 'and', stress: [0] },
  { form: 'они', gloss: 'they', stress: [2] },
  { form: 'мир', gloss: 'peace, world', stress: [1] },
  { form: 'рис', gloss: 'rice', stress: [1] },
  { form: 'кино', gloss: 'cinema, film', stress: [3] },
  { form: 'вино', gloss: 'wine', stress: [3] },
  { form: 'дети', gloss: 'children', stress: [1] },
  { form: 'такси', gloss: 'taxi', stress: [4] },
  { form: 'Привет', gloss: 'hi', stress: [4] },
  { form: 'папа', gloss: 'dad', stress: [1] },
  { form: 'суп', gloss: 'soup', stress: [1] },
  { form: 'парк', gloss: 'park', stress: [1] },
  { form: 'спорт', gloss: 'sport', stress: [2] },
  { form: 'паспорт', gloss: 'passport', stress: [1] },
  { form: 'стол', gloss: 'table', stress: [2] },
  { form: 'молоко', gloss: 'milk', stress: [5] },
  { form: 'лето', gloss: 'summer', stress: [1] },
  { form: 'слово', gloss: 'word', stress: [2] },
  { form: 'Как дела?', gloss: 'How are you? (literally: how are things)', stress: [7] },
  { form: 'брат', gloss: 'brother', stress: [2] },
  { form: 'банк', gloss: 'bank', stress: [1] },
  { form: 'билет', gloss: 'ticket', stress: [3] },
  { form: 'собака', gloss: 'dog', stress: [3] },
  { form: 'работа', gloss: 'work, job', stress: [3] },
  { form: 'Спасибо', gloss: 'thank you', stress: [4] },
  { form: 'город', gloss: 'city, town', stress: [1] },
  { form: 'друг', gloss: 'friend', stress: [2] },
  { form: 'год', gloss: 'year', stress: [1] },
  { form: 'книга', gloss: 'book', stress: [2] },
  { form: 'дорога', gloss: 'road', stress: [3] },
  { form: 'когда', gloss: 'when', stress: [4] },
  { form: 'зима', gloss: 'winter', stress: [3] },
  { form: 'магазин', gloss: 'shop, store', stress: [5] },
  { form: 'звезда', gloss: 'star', stress: [5] },
  { form: 'зуб', gloss: 'tooth', stress: [1] },
  { form: 'мы', gloss: 'we', stress: [1] },
  { form: 'вы', gloss: 'you (plural or polite)', stress: [1] },
  { form: 'ты', gloss: 'you (one friend)', stress: [1] },
  { form: 'рыба', gloss: 'fish', stress: [1] },
  { form: 'сын', gloss: 'son', stress: [1] },
  { form: 'мыло', gloss: 'soap', stress: [1] },
  { form: 'сыр', gloss: 'cheese', stress: [1] },
  { form: 'я', gloss: 'I', stress: [0] },
  { form: 'моя', gloss: 'my (feminine)', stress: [2] },
  { form: 'имя', gloss: 'name, first name', stress: [0] },
  { form: 'яблоко', gloss: 'apple', stress: [0] },
  { form: 'дядя', gloss: 'uncle', stress: [1] },
  { form: 'Меня зовут…', gloss: 'My name is … (literally: they call me)', stress: [3, 8] },
  { form: 'люблю', gloss: 'I love, I like', stress: [4] },
  { form: 'меню', gloss: 'menu', stress: [3] },
  { form: 'юг', gloss: 'south', stress: [0] },
  { form: 'это', gloss: 'this is, that is', stress: [0] },
  { form: 'этот', gloss: 'this (masculine)', stress: [0] },
  { form: 'эти', gloss: 'these', stress: [0] },
  { form: 'поэт', gloss: 'poet', stress: [2] },
  { form: 'экран', gloss: 'screen', stress: [3] },
  { form: 'Это книга', gloss: 'This is a book', stress: [0, 6] },
  { form: 'мой', gloss: 'my (masculine)', stress: [1] },
  { form: 'твой', gloss: 'your (one friend), masculine', stress: [2] },
  { form: 'май', gloss: 'May', stress: [1] },
  { form: 'музей', gloss: 'museum', stress: [3] },
  { form: 'трамвай', gloss: 'tram', stress: [5] },
  { form: 'Здравствуйте', gloss: 'Hello (polite)', stress: [3] },
  { form: 'что', gloss: 'what', stress: [2] },
  { form: 'час', gloss: 'hour', stress: [1] },
  { form: 'чай', gloss: 'tea', stress: [1] },
  { form: 'человек', gloss: 'person', stress: [5] },
  { form: 'почему', gloss: 'why', stress: [5] },
  { form: 'почта', gloss: 'post office, mail', stress: [1] },
  { form: 'Я читаю', gloss: 'I read, I am reading', stress: [5] },
  { form: 'ключ', gloss: 'key', stress: [2] },
  { form: 'жена', gloss: 'wife', stress: [3] },
  { form: 'можно', gloss: 'one may, it is possible', stress: [1] },
  { form: 'муж', gloss: 'husband', stress: [1] },
  { form: 'уже', gloss: 'already', stress: [2] },
  { form: 'Пожалуйста', gloss: 'please, you are welcome', stress: [3] },
  { form: 'школа', gloss: 'school', stress: [2] },
  { form: 'машина', gloss: 'car', stress: [3] },
  { form: 'шапка', gloss: 'hat', stress: [1] },
  { form: 'наш', gloss: 'our', stress: [1] },
  { form: 'ваш', gloss: 'your (plural or polite)', stress: [1] },
  { form: 'хорошо', gloss: 'good, well', stress: [5] },
  { form: 'хлеб', gloss: 'bread', stress: [2] },
  { form: 'воздух', gloss: 'air', stress: [1] },
  { form: 'муха', gloss: 'fly (insect)', stress: [1] },
  { form: 'хочу', gloss: 'I want', stress: [3] },
  { form: 'цена', gloss: 'price', stress: [3] },
  { form: 'центр', gloss: 'centre', stress: [1] },
  { form: 'конец', gloss: 'end', stress: [3] },
  { form: 'отец', gloss: 'father', stress: [2] },
  { form: 'улица', gloss: 'street', stress: [0] },
  { form: 'цвет', gloss: 'colour', stress: [2] },
  { form: 'фото', gloss: 'photo', stress: [1] },
  { form: 'кофе', gloss: 'coffee', stress: [1] },
  { form: 'шкаф', gloss: 'cupboard', stress: [2] },
  { form: 'футбол', gloss: 'football, soccer', stress: [4] },
  { form: 'телефон', gloss: 'telephone', stress: [5] },
  { form: 'факт', gloss: 'fact', stress: [1] },
  { form: 'щи', gloss: 'cabbage soup', stress: [1] },
  { form: 'борщ', gloss: 'borscht', stress: [1] },
  { form: 'овощи', gloss: 'vegetables', stress: [0] },
  { form: 'товарищ', gloss: 'comrade, friend', stress: [3] },
  { form: 'ёлка', gloss: 'fir tree, Christmas tree', stress: [0] },
  { form: 'её', gloss: 'her, hers', stress: [1] },
  { form: 'ещё', gloss: 'more, still', stress: [2] },
  { form: 'всё', gloss: 'everything, all', stress: [2] },
  { form: 'идёт', gloss: 'goes, is going', stress: [2] },
  { form: 'тётя', gloss: 'aunt', stress: [1] },
  { form: 'моё', gloss: 'my (neuter)', stress: [2] },
  { form: 'день', gloss: 'day', stress: [1] },
  { form: 'есть', gloss: 'to eat; there is', stress: [0] },
  { form: 'мать', gloss: 'mother', stress: [1] },
  { form: 'дочь', gloss: 'daughter', stress: [1] },
  { form: 'семья', gloss: 'family', stress: [4] },
  { form: 'пять', gloss: 'five', stress: [1] },
  { form: 'шесть', gloss: 'six', stress: [1] },
  { form: 'жизнь', gloss: 'life', stress: [1] },
  { form: 'дверь', gloss: 'door', stress: [2] },
  { form: 'учитель', gloss: 'teacher', stress: [2] },
  { form: 'тетрадь', gloss: 'exercise book', stress: [4] },
  { form: 'очень', gloss: 'very', stress: [0] },
  { form: 'подъезд', gloss: 'entrance (of an apartment block)', stress: [4] },
  { form: 'объект', gloss: 'object', stress: [3] },
];

/** The rows of the Alphabet saved deck for Russian, in alphabet order: [what the card shows, what its back says] (back at most 140 characters). */
export function alphabetDeckRows(): Array<[string, string]> {
  return RU_ALPHABET.map((l): [string, string] => {
    const base = `${l.name}: ${l.sound}`;
    const withNote = l.note ? `${base}. ${l.note}` : base;
    const withExample = `${base}; ${l.example.word} (${l.example.gloss})`;
    const back = withNote.length <= 140 ? withNote : withExample.length <= 140 ? withExample : base;
    return [`${l.upper} ${l.lower}`, back];
  });
}
