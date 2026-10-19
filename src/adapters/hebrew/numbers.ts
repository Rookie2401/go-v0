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
