import { describe, expect, it } from 'vitest';
import { documentText, fitsTeamLanguage, guessLanguage, guessScandinavian } from '../../src/ingest/language';

// Paragraphs written for these tests (not from any book). Each is well over the 40 words the guesser needs to judge.
const SPANISH = 'Era una tarde tranquila en el pueblo y los niños jugaban en la plaza mientras sus madres hablaban con las vecinas. El abuelo se sentó bajo el árbol y empezó a contar una historia que todos conocían, '
  + 'pero que nadie se cansaba de escuchar. Cuando terminó, la gente aplaudió, y una niña le preguntó si podía contarla otra vez al día siguiente porque quería aprenderla de memoria.';
const PORTUGUESE = 'Era uma tarde tranquila na aldeia e as crianças brincavam na praça enquanto as mães conversavam com as vizinhas. O avô sentou-se debaixo da árvore e começou a contar uma história que todos conheciam, '
  + 'mas que ninguém se cansava de ouvir. Quando terminou, as pessoas aplaudiram, e uma menina perguntou se ele podia contá-la outra vez no dia seguinte porque queria aprendê-la de cor, e ele disse que sim.';
const ALBANIAN = 'Një ditë të bukur vjeshte, djali shkoi në mal me gjyshin e tij. Ai ishte i lumtur, sepse gjyshi i tregonte histori të vjetra për fshatin dhe për njerëzit që jetonin atje. '
  + 'Kur arritën në majë, ata ndenjën nën një pemë të madhe dhe hëngrën bukë me djathë. Pastaj gjyshi tha se nuk duhet të harrojmë kurrë se nga vijmë dhe ku shkojmë. '
  + 'Djali dëgjoi me vëmendje dhe ia premtoi gjyshit se do të kujtonte çdo fjalë që kishte thënë ai. Në mbrëmje ata u kthyen në shtëpi, të lodhur por të gëzuar, dhe nëna i priti me një gjellë të ngrohtë.';
const GERMAN = 'Es war ein ruhiger Nachmittag im Dorf, und die Kinder spielten auf dem Platz, während ihre Mütter mit den Nachbarinnen sprachen. Der Großvater setzte sich unter den Baum und begann eine Geschichte zu erzählen, '
  + 'die alle kannten, die aber niemand müde wurde zu hören. Als er fertig war, klatschten die Leute, und ein kleines Mädchen fragte, ob er sie am nächsten Tag noch einmal erzählen könne, weil sie sie auswendig lernen wollte.';
const ENGLISH = 'It was a quiet afternoon in the village, and the children were playing in the square while their mothers talked with the neighbours. The grandfather sat down under the tree and began to tell a story that everyone knew, '
  + 'but that nobody ever grew tired of hearing. When he had finished, the people clapped, and a little girl asked if he could tell it again the next day because she wanted to learn it by heart.';
const CHINESE = '那天下午村子里很安静，孩子们在广场上玩耍，母亲们和邻居聊天。爷爷坐在树下，开始讲一个大家都知道的故事，可是没有人听腻。他讲完以后，大家都鼓掌，一个小女孩问他明天能不能再讲一遍，因为她想把它背下来。';
const THAI = 'บ่ายวันนั้นหมู่บ้านเงียบสงบ เด็กๆ เล่นกันที่ลานกว้าง ขณะที่แม่ๆ คุยกับเพื่อนบ้าน ปู่นั่งลงใต้ต้นไม้และเริ่มเล่าเรื่องที่ทุกคนรู้จัก แต่ไม่มีใครเบื่อที่จะฟัง เมื่อเล่าจบ ทุกคนก็ปรบมือ และเด็กหญิงตัวเล็กๆ ถามว่าพรุ่งนี้ปู่จะเล่าอีกได้ไหม';
const GEORGIAN = 'გამარჯობა მსოფლიო, დღეს კარგი ამინდია და ბავშვები სკოლაში მიდიან';
/** Latin letters, but made-up words: no language's common words lead, so the guesser names none. */
const UNKNOWN_LATIN = 'Zorpa kelundi mavrek tosil bruvane qelto narvik sumeli dorka vintel opra zakuri melto grivane tolsek brunada keplo viran sodek lumira hakol trebuna wisek ondara felquin murak taloven zibrek hunola priven kasdor velnik orsabu tiflen gormas yelkun darubi splenit vokra '
  + 'mintal ruxen abelo trosk gevidar lonnu piskal ferdun omaki quinzel hobrat';

const HONDURAS = { lang: 'es', country: 'Honduras' } as const;
const THAILAND = { lang: 'th', country: 'Thailand' } as const;

describe('guessLanguage', () => {
  it('names the language only when it is sure', () => {
    expect(guessLanguage(SPANISH).lang).toBe('es');
    expect(guessLanguage(PORTUGUESE).lang).toBe('pt');
    expect(guessLanguage(ALBANIAN).lang).toBe('sq');
    expect(guessLanguage(GERMAN).lang).toBe('de');
    expect(guessLanguage(ENGLISH).lang).toBe('en');
    expect(guessLanguage(SPANISH).script).toBe('latin');
  });

  it('knows a language by its script, however short the text', () => {
    expect(guessLanguage(CHINESE)).toMatchObject({ lang: 'zh', script: 'zh' });
    expect(guessLanguage(THAI)).toMatchObject({ lang: 'th', script: 'th' });
    expect(guessLanguage('你好，世界').lang).toBe('zh');
  });

  it('does not judge a short Latin-script text, and names nothing for a text without letters', () => {
    const short = guessLanguage('Hola, buenos días a todos');
    expect(short.lang).toBeUndefined();
    expect(short.script).toBe('latin');
    expect(short.words).toBeLessThan(40);
    expect(guessLanguage('123 456 — 7.8')).toMatchObject({ script: 'none', words: 0 });
    expect(guessLanguage('')).toMatchObject({ script: 'none' });
  });

  it('names nothing for a long Latin text in no language it knows', () => {
    const g = guessLanguage(UNKNOWN_LATIN);
    expect(g.script).toBe('latin');
    expect(g.words).toBeGreaterThanOrEqual(40);
    expect(g.lang).toBeUndefined();
  });

  it('lists the common-word shares, highest first', () => {
    const { shares } = guessLanguage(SPANISH);
    expect(shares[0][0]).toBe('es');
    for (let i = 1; i < shares.length; i++) expect(shares[i - 1][1]).toBeGreaterThanOrEqual(shares[i][1]);
  });
});

describe('fitsTeamLanguage', () => {
  it('lets Spanish through for the Honduras team', () => {
    const v = fitsTeamLanguage(SPANISH, HONDURAS);
    expect(v.ok).toBe(true);
    expect(v.message).toBeUndefined();
    expect(v.guess.lang).toBe('es');
  });

  it.each([
    ['Portuguese', PORTUGUESE],
    ['Albanian', ALBANIAN],
    ['German', GERMAN],
    ['English', ENGLISH],
    ['Chinese', CHINESE],
    ['Thai', THAI],
  ])('turns %s away from the Honduras team, kindly, naming it', (name, text) => {
    const v = fitsTeamLanguage(text, HONDURAS);
    expect(v.ok).toBe(false);
    expect(v.message).toContain('Thank you — but this text');
    expect(v.message).toContain(`looks like ${name}`);
    expect(v.message).toContain('the Honduras team reads Spanish');
    expect(v.message).toContain('It was not added.');
  });

  it('does not judge a text of three words', () => {
    expect(fitsTeamLanguage('Hello brave world', HONDURAS).ok).toBe(true);
    expect(fitsTeamLanguage('Guten Morgen zusammen', HONDURAS).ok).toBe(true);
    expect(fitsTeamLanguage('', HONDURAS).ok).toBe(true);
  });

  it('turns a short text in another script away from a Latin-script team', () => {
    const v = fitsTeamLanguage(GEORGIAN, HONDURAS);
    expect(v.ok).toBe(false);
    expect(v.message).toContain('another script');
    const han = fitsTeamLanguage('你好', HONDURAS);
    expect(han.ok).toBe(false);
    expect(han.message).toContain('looks like Chinese');
  });

  it('turns a text away when the document itself is marked with another language, even if the words are Spanish', () => {
    const v = fitsTeamLanguage(SPANISH, HONDURAS, 'de');
    expect(v.ok).toBe(false);
    expect(v.message).toContain('is marked as German ("de")');
    expect(v.message).toContain('the Honduras team reads Spanish');
    const unknown = fitsTeamLanguage(SPANISH, HONDURAS, 'xx');
    expect(unknown.ok).toBe(false);
    expect(unknown.message).toContain('"xx"');
  });

  it('accepts a text marked with the team language', () => {
    expect(fitsTeamLanguage(SPANISH, HONDURAS, 'es').ok).toBe(true);
    expect(fitsTeamLanguage('Hola', HONDURAS, 'es').ok).toBe(true);
  });

  it('for a Thai team: Thai passes, English is named, and a long Latin-script text of no known language is turned away', () => {
    expect(fitsTeamLanguage(THAI, THAILAND).ok).toBe(true);
    const english = fitsTeamLanguage(ENGLISH, THAILAND);
    expect(english.ok).toBe(false);
    expect(english.message).toContain('looks like English');
    expect(english.message).toContain('the Thailand team reads Thai');
    const latin = fitsTeamLanguage(UNKNOWN_LATIN, THAILAND);
    expect(latin.ok).toBe(false);
    expect(latin.message).toContain('Latin alphabet');
    expect(fitsTeamLanguage('Hello there my friend', THAILAND).ok).toBe(true); // a short Latin phrase is not judged
  });
});

describe('documentText', () => {
  it('reads paragraphs given as strings and as { text } objects, across sections', () => {
    const doc = { sections: [{ paragraphs: ['Uno', { text: 'Dos' }] }, { paragraphs: [{ text: 'Tres' }, { notText: 1 }, 4] }] };
    expect(documentText(doc)).toBe('Uno\nDos\nTres');
  });

  it('is empty for anything without sections', () => {
    expect(documentText(undefined)).toBe('');
    expect(documentText(null)).toBe('');
    expect(documentText('text')).toBe('');
    expect(documentText({})).toBe('');
    expect(documentText({ sections: 'x' })).toBe('');
    expect(documentText({ sections: [{ paragraphs: 'x' }, null] })).toBe('');
  });
});

// Norwegian, Nynorsk and Danish (paragraphs written for these tests). Danish shares most common words with Norwegian, so the
// guesser tells them apart by the words that belong to one of them only.
const BOKMAL = 'Det var en stille ettermiddag i bygda, og barna lekte på plassen mens mødrene snakket med naboene. Bestefaren satte seg under treet og begynte å fortelle en historie som alle kjente, '
  + 'men som ingen ble lei av å høre. Da han var ferdig, klappet folk, og en liten jente spurte om han kunne fortelle den en gang til dagen etter, fordi hun ville lære den utenat. Jeg har ikke noen penger, hva skal vi gjøre?';
const NYNORSK_TEXT = 'Det var ein stille ettermiddag i bygda, og borna leika på plassen medan mødrene snakka med naboane. Bestefaren sette seg under treet og byrja å fortelje ei soge som alle kjende, '
  + 'men som ingen vart lei av å høyre. Då han var ferdig, klappa folk, og ei lita jente spurde om han kunne fortelje henne ein gong til dagen etter, fordi ho ville lære henne utanåt. Eg har ikkje nokon pengar, kva skal vi gjere?';
const DANISH = 'Det var en stille eftermiddag i landsbyen, og børnene legede på pladsen mens deres mødre snakkede med naboerne. Bedstefaren satte sig under træet og begyndte at fortælle en historie, som alle kendte, '
  + 'men som ingen blev trætte af at høre. Da han var færdig, klappede folk, og en lille pige spurgte, om han kunne fortælle den igen næste dag, fordi hun gerne ville lære den udenad. Jeg har ikke nogen penge, hvad skal vi gøre?';

describe('Norwegian and Danish', () => {
  const NORWAY = { lang: 'nb', country: 'Norway', readsLangs: ['nn'] } as const;

  it('names Bokmål, Nynorsk and Danish apart', () => {
    expect(guessLanguage(BOKMAL).lang).toBe('nb');
    expect(guessLanguage(NYNORSK_TEXT).lang).toBe('nn');
    expect(guessLanguage(DANISH).lang).toBe('da');
  });

  it('accepts Bokmål and Nynorsk for the Norway team and turns Danish away', () => {
    expect(fitsTeamLanguage(BOKMAL, NORWAY).ok).toBe(true);
    expect(fitsTeamLanguage(NYNORSK_TEXT, NORWAY).ok).toBe(true);
    const danish = fitsTeamLanguage(DANISH, NORWAY);
    expect(danish.ok).toBe(false);
    expect(danish.message).toMatch(/looks like Danish/);
  });

  it('judges a single Danish sentence for a Norwegian team too (the decisive words need no 40-word floor), and a Bokmål one passes', () => {
    expect(fitsTeamLanguage('Jeg har ikke nogen penge, hvad skal vi gøre?', NORWAY).ok).toBe(false);
    expect(fitsTeamLanguage('Jeg har ikke noen penger, hva skal vi gjøre?', NORWAY).ok).toBe(true);
    expect(guessScandinavian('Jeg har ikke nogen penge, hvad skal vi gøre?')).toBe('da');
    expect(guessScandinavian('Jeg har ikke noen penger, hva skal vi gjøre?')).toBe('nb');
    expect(guessScandinavian('Eg har ikkje nokon pengar, kva skal vi gjere?')).toBe('nn');
    expect(guessScandinavian('Hello brave world')).toBeUndefined();
  });

  it('leaves the other teams as they were: a short Danish sentence is not judged for a Spanish team', () => {
    expect(fitsTeamLanguage('Jeg har ikke nogen penge, hvad skal vi gøre?', { lang: 'es', country: 'Honduras' }).ok).toBe(true);
  });

  it('does not take Norwegian for any of the older languages', () => {
    expect(guessLanguage(SPANISH).lang).toBe('es');
    expect(guessLanguage(GERMAN).lang).toBe('de');
    expect(guessLanguage(ALBANIAN).lang).toBe('sq');
    expect(guessLanguage(ENGLISH).lang).toBe('en');
  });
});
