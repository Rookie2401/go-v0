// (1) Which everyday Modern Hebrew words (dictionary forms, unpointed, written by the auditor) have no entry in the Modern index at all,
//     and which have no dictionary record; (2) for those that do, the card's merged "All forms" table (the adapter's cells + the dictionary's
//     table: buildParadigm in packages/golearn-extension/src/content/enrich.ts) and where the two disagree.
import fs from 'node:fs';
import { adapter, card, loadFull, rt } from './lib.mts';
import { buildParadigm, pickRecord } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/content/enrich';
import { installedHebrewIndexes } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/index-store';
await loadFull();
const LIST: Record<string, string> = {
  NOUN: `בית ילד ילדה איש אישה אבא אמא אח אחות בן בת חבר חברה משפחה אדם אנשים שם יום לילה בוקר ערב שבוע חודש שנה שעה דקה זמן היום מחר אתמול עכשיו מים לחם אוכל ארוחה קפה תה חלב ביצה גבינה בשר דג עוף פרי ירק תפוח בננה עגבנייה מלפפון סוכר מלח שולחן כיסא מיטה דלת חלון חדר מטבח שירותים מקלחת בניין דירה רחוב עיר כפר מדינה ארץ עולם דרך כביש מכונית אוטובוס רכבת מטוס אופניים תחנה נמל שדה עבודה משרד בית ספר כיתה מורה תלמיד סטודנט שיעור ספר מחברת עט עיפרון דף מילה משפט שאלה תשובה שפה עברית אנגלית כסף מחיר חנות שוק קניון בנק דואר מכתב טלפון מחשב טלוויזיה רדיו עיתון חדשות תמונה סרט שיר מוזיקה משחק כדור ספורט בריאות רופא אחות בית חולים תרופה כאב ראש יד רגל עין אוזן אף פה שן לב גב בטן גוף בגד חולצה מכנסיים שמלה נעל כובע מעיל שמש ירח כוכב שמיים גשם שלג רוח ענן ים נהר הר עץ פרח חיה כלב חתול ציפור סוס צבע בעיה רעיון דבר מקום צד חלק סוף התחלה חיים מוות אהבה שלום מלחמה ממשלה חוק משטרה צבא חג שבת מסיבה מתנה חופשה מלון מסעדה תפריט חשבון מפתח תיק כרטיס מספר`,
  VERB: `היה עשה אמר הלך בא ראה ידע רצה נתן לקח אכל שתה ישן קם ישב עמד כתב קרא למד לימד דיבר שמע הבין חשב זכר שכח אהב שנא פתח סגר קנה מכר שילם עבד שיחק רץ נסע טס חזר יצא נכנס עלה ירד שם מצא חיפש איבד שאל ענה ביקש עזר התחיל גמר המשיך הפסיק חיכה פגש הכיר גר בנה שבר תיקן ניקה בישל רחץ לבש התלבש קנה שלח קיבל הביא החזיר הראה סיפר צחק בכה שר רקד נהג הרגיש כאב חי מת נולד גדל שינה ניסה הצליח נכשל החליט הסכים סירב קיווה פחד שמר השתמש התקשר הזמין הגיע נשאר עזב נפל זרק תפס משך דחף נגע הרים`,
  ADJ: `גדול קטן טוב רע יפה מכוער חדש ישן צעיר זקן ארוך קצר גבוה נמוך רחב צר שמן רזה חזק חלש חם קר יבש רטוב נקי מלוכלך מלא ריק קל כבד קשה פשוט מהיר איטי יקר זול עשיר עני שמח עצוב עייף רעב צמא חולה בריא חכם טיפש נחמד מעניין משעמם חשוב נכון אמיתי מוכן פתוח סגור חופשי עסוק לבן שחור אדום כחול ירוק צהוב חום אפור ראשון אחרון אחר אותו כזה`,
  OTHER: `אני אתה את הוא היא אנחנו אתם אתן הם הן זה זאת אלה מי מה איפה מתי למה איך כמה איזה של על אל עם בלי אצל לפני אחרי מתחת מעל בין ליד מול דרך בגלל בשביל כמו עד מן כי אבל או גם רק אם אז כבר עוד מאוד קצת הרבה יותר פחות תמיד לפעמים אף פעם כאן שם פה למעלה למטה בחוץ בפנים קרוב רחוק כן לא אולי בבקשה תודה סליחה שלום להתראות אחד שתיים שלוש ארבע חמש שש שבע שמונה תשע עשר עשרים שלושים מאה אלף מיליון ראשון שני שלישי חצי רבע`,
};
const mod = installedHebrewIndexes().filter((i) => i.codes === 'kaikki-tags');
const hasLemma = (w: string): boolean => mod.some((i) => Object.keys(i.lemmas).some((k) => k.split('|')[0] === w));
const out: string[] = [];
let all = 0; const missingIdx: string[] = []; const noCard: string[] = []; const noDict: string[] = [];
const stat = { merged: 0, cells: 0, verified: 0, conflicted: 0, generated: 0, supported: 0, noTable: 0, lemmasWithConflict: 0, adapterNoTable: 0 };
const conflicts: string[] = [];
for (const [pos, text] of Object.entries(LIST)) {
  for (const w of [...new Set(text.split(/\s+/).filter(Boolean))]) {
    all++;
    if (!hasLemma(w)) missingIdx.push(w);
    const c = card(w, w, 0);
    if (!c.lemma) { noCard.push(w); continue; }
    if (pos === 'OTHER') continue;
    let reply: any;
    try { reply = await rt().entry(c.lemma, c.pos, [c.lemma, ...(adapter.lemmaVariants?.(c.lemma, c.pos) ?? []), w]); } catch { reply = undefined; }
    const record: any = pickRecord(reply?.records ?? [], c.pos);
    if (!record) { noDict.push(w); continue; }
    const own = adapter.paradigm?.(c.lemma, c.pos);
    if (!own) stat.adapterNoTable++;
    if (!record.f?.length) { stat.noTable++; continue; }
    let p: any;
    try { p = buildParadigm(adapter, 'he', c.lemma, c.pos as any, record); } catch (e) { p = undefined; }
    if (!p) { stat.noTable++; continue; }
    stat.merged++;
    const bad: string[] = [];
    for (const cell of p.cells) {
      stat.cells++;
      if (cell.status === 'verified') stat.verified++;
      else if (cell.status === 'conflicted') { stat.conflicted++; bad.push(`${Object.values(cell.features).join('.')}: adapter «${(cell.alternatives ?? []).join(' / ')}» vs dictionary «${cell.form}»`); }
      else if (cell.status === 'generated') stat.generated++;
      else stat.supported++;
    }
    if (bad.length) { stat.lemmasWithConflict++; conflicts.push(`${w} → ${c.lemma}/${c.pos}: ${bad.slice(0, 5).join(' ; ')}${bad.length > 5 ? ` ; … ${bad.length} cells` : ''}`); }
  }
}
out.push(`${all} everyday words checked. No lemma of that spelling in the Modern index: ${missingIdx.length}: ${missingIdx.join(' ')}`);
out.push(`Card blank for the bare word: ${noCard.length}: ${noCard.join(' ')}`);
out.push(`No dictionary record for the card's lemma (nouns, verbs, adjectives only): ${noDict.length}: ${noDict.join(' ')}`);
out.push(`"All forms" merge (nouns, verbs, adjectives): merged ${stat.merged}; record without a table ${stat.noTable}; adapter has no table of its own ${stat.adapterNoTable}; cells ${stat.cells}: verified ${stat.verified}, CONFLICT ${stat.conflicted} (in ${stat.lemmasWithConflict} lemmas), adapter only ${stat.generated}, dictionary only ${stat.supported}`);
out.push('', ...conflicts);
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/heaudit/core-out.txt', out.join('\n'));
console.log(out.slice(0, 4).join('\n'));
console.log(conflicts.slice(0, 40).join('\n').slice(0, 6000));
