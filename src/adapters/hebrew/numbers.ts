/**
 * Numbers 0–999 999 in Modern Hebrew words, for speech normalisation (a bare digit is spoken, never left as a digit). The masculine
 * forms are used throughout (the form a number has when it counts nothing in particular or a masculine noun); 2 is שניים, hundreds and
 * thousands follow the Modern usage (מאתיים, אלפיים, שלושת אלפים …). Unpointed, as Modern Hebrew is written. Machine-drafted; not
 * reviewed by a native speaker.
 */
const UNITS = ['אפס', 'אחד', 'שניים', 'שלושה', 'ארבעה', 'חמישה', 'שישה', 'שבעה', 'שמונה', 'תשעה', 'עשרה'];
const TEENS: Record<number, string> = { 11: 'אחד עשר', 12: 'שנים עשר', 13: 'שלושה עשר', 14: 'ארבעה עשר', 15: 'חמישה עשר', 16: 'שישה עשר', 17: 'שבעה עשר', 18: 'שמונה עשר', 19: 'תשעה עשר' };
const TENS: Record<number, string> = { 2: 'עשרים', 3: 'שלושים', 4: 'ארבעים', 5: 'חמישים', 6: 'שישים', 7: 'שבעים', 8: 'שמונים', 9: 'תשעים' };
const HUNDREDS: Record<number, string> = { 1: 'מאה', 2: 'מאתיים', 3: 'שלוש מאות', 4: 'ארבע מאות', 5: 'חמש מאות', 6: 'שש מאות', 7: 'שבע מאות', 8: 'שמונה מאות', 9: 'תשע מאות' };
const THOUSANDS: Record<number, string> = { 1: 'אלף', 2: 'אלפיים', 3: 'שלושת אלפים', 4: 'ארבעת אלפים', 5: 'חמשת אלפים', 6: 'ששת אלפים', 7: 'שבעת אלפים', 8: 'שמונת אלפים', 9: 'תשעת אלפים', 10: 'עשרת אלפים' };

function below100(n: number): string {
  if (n <= 10) return UNITS[n];
  if (n < 20) return TEENS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${TENS[t]} ו${UNITS[u]}` : TENS[t];
}
function below1000(n: number): string {
  if (n < 100) return below100(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return r ? `${HUNDREDS[h]} ${r < 11 || r >= 20 && r % 10 === 0 ? 'ו' : ''}${below100(r)}` : HUNDREDS[h];
}
function thousands(th: number): string {
  if (THOUSANDS[th]) return THOUSANDS[th];
  return `${below1000(th)} אלף`;
}

export function heNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return null;
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  return r ? `${thousands(th)} ${r < 11 ? 'ו' : ''}${below1000(r)}` : thousands(th);
}

/** The letters as numbers (gematria): א–ט 1–9, י–צ 10–90, ק–ת 100–400; a final letter counts as its ordinary form. */
const GEMATRIA: Record<string, number> = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50,
  'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400,
};

/**
 * The value of letters written as a number (ג׳ 3, י״ב 12, תשפ״ו 786): the sum of the letters, which a well-formed numeral writes from the
 * largest; ט״ו and ט״ז (15, 16) are the customary spellings that avoid the Name. null for anything that is not Hebrew letters only, or
 * for letters that do not descend. The geresh / gershayim are not part of the input.
 */
export function gematriaValue(letters: string): number | null {
  const s = letters.normalize('NFC').replace(/[\u0591-\u05C7]/g, '');
  if (!s || s.length > 5 || !/^[א-ת]+$/u.test(s)) return null;
  let total = 0;
  let last = Infinity;
  for (const ch of s) {
    const v = GEMATRIA[ch];
    if (v === undefined) return null;
    if (v > last) return null;
    total += v; last = v;
  }
  return total;
}
