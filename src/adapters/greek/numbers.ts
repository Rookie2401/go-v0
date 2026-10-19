/**
 * Numbers 0–999 999 in Modern Greek words, for speech normalisation (a bare digit is spoken, never left as a digit). The neuter forms
 * are used (the form a number has when it counts nothing in particular): ένα, τρία, τέσσερα, διακόσια …; thousands as χίλια / δύο
 * χιλιάδες. Monotonic spelling. Machine-drafted; not reviewed by a native speaker.
 */
const UNITS = ['μηδέν', 'ένα', 'δύο', 'τρία', 'τέσσερα', 'πέντε', 'έξι', 'επτά', 'οκτώ', 'εννέα', 'δέκα', 'έντεκα', 'δώδεκα', 'δεκατρία', 'δεκατέσσερα', 'δεκαπέντε', 'δεκαέξι', 'δεκαεπτά', 'δεκαοκτώ', 'δεκαεννέα'];
const TENS: Record<number, string> = { 2: 'είκοσι', 3: 'τριάντα', 4: 'σαράντα', 5: 'πενήντα', 6: 'εξήντα', 7: 'εβδομήντα', 8: 'ογδόντα', 9: 'ενενήντα' };
const HUNDREDS: Record<number, string> = { 1: 'εκατό', 2: 'διακόσια', 3: 'τριακόσια', 4: 'τετρακόσια', 5: 'πεντακόσια', 6: 'εξακόσια', 7: 'επτακόσια', 8: 'οκτακόσια', 9: 'εννιακόσια' };
/** The hundreds as they count thousands (feminine, agreeing with χιλιάδες). */
const HUNDREDS_FEM: Record<number, string> = { 1: 'εκατό', 2: 'διακόσιες', 3: 'τριακόσιες', 4: 'τετρακόσιες', 5: 'πεντακόσιες', 6: 'εξακόσιες', 7: 'επτακόσιες', 8: 'οκτακόσιες', 9: 'εννιακόσιες' };

function below100(n: number, fem = false): string {
  if (n < 20) return fem && n === 1 ? 'μία' : fem && n === 3 ? 'τρεις' : fem && n === 4 ? 'τέσσερις' : fem && n === 13 ? 'δεκατρείς' : fem && n === 14 ? 'δεκατέσσερις' : UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${TENS[t]} ${below100(u, fem)}` : TENS[t];
}
function below1000(n: number, fem = false): string {
  if (n < 100) return below100(n, fem);
  const h = Math.floor(n / 100);
  const r = n % 100;
  const hundred = h === 1 && r ? 'εκατόν' : (fem ? HUNDREDS_FEM : HUNDREDS)[h];
  return r ? `${hundred} ${below100(r, fem)}` : hundred;
}

export function elNumberToWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return null;
  if (n < 1000) return below1000(n);
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  const head = th === 1 ? 'χίλια' : `${below1000(th, true)} χιλιάδες`;
  return r ? `${head} ${below1000(r)}` : head;
}
