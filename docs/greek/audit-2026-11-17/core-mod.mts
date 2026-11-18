// About 330 everyday Modern Greek words (written by the auditor) through the card, each alone: is there a reading, is its lemma the word itself, where does the reading come from?
import { card } from 'C:/Users/CJWal/dev/tmp-mem/elaudit/setup.mts';
const WORDS = `
και να το η ο δεν που της με για του τα την είναι από σε θα τον ένα μια στο αλλά ή αν όταν γιατί επειδή όπως πολύ τώρα εδώ εκεί ναι όχι μόνο ακόμα πάντα ποτέ ίσως μαζί χωρίς μέχρι πριν μετά πάνω κάτω μέσα έξω κοντά μακριά σήμερα αύριο χθες
εγώ εσύ αυτός αυτή αυτό εμείς εσείς αυτοί ποιος τι πού πώς πότε πόσο κάτι τίποτα κάποιος κανένας όλος κάθε άλλος ίδιος δικός
άνθρωπος άντρας γυναίκα παιδί αγόρι κορίτσι πατέρας μητέρα αδελφός αδελφή γιος κόρη φίλος οικογένεια σπίτι δωμάτιο πόρτα παράθυρο τραπέζι καρέκλα κρεβάτι κουζίνα μπάνιο δρόμος πόλη χωριό χώρα θάλασσα βουνό ποτάμι δέντρο λουλούδι ήλιος φεγγάρι αστέρι ουρανός βροχή χιόνι αέρας νερό ψωμί κρέας ψάρι τυρί γάλα αυγό φρούτο μήλο πορτοκάλι ντομάτα πατάτα καφές τσάι κρασί μπίρα ζάχαρη αλάτι φαγητό πρωινό μεσημεριανό βραδινό
σκύλος γάτα πουλί άλογο βιβλίο χαρτί μολύβι σχολείο δάσκαλος μαθητής δουλειά γραφείο χρήματα λεφτά τράπεζα μαγαζί αγορά αυτοκίνητο λεωφορείο τρένο αεροπλάνο πλοίο εισιτήριο ταξίδι ξενοδοχείο νοσοκομείο γιατρός φάρμακο κεφάλι μάτι αυτί μύτη στόμα χέρι πόδι καρδιά σώμα ρούχα παπούτσι μέρα νύχτα πρωί απόγευμα βράδυ ώρα λεπτό εβδομάδα μήνας χρόνος ζωή θάνατος αγάπη φόβος χαρά πρόβλημα ερώτηση απάντηση όνομα λέξη γλώσσα τηλέφωνο υπολογιστής μουσική τραγούδι ταινία παιχνίδι
είμαι έχω κάνω λέω πάω πηγαίνω έρχομαι βλέπω ακούω μιλάω ξέρω θέλω μπορώ πρέπει δίνω παίρνω τρώω πίνω κοιμάμαι ξυπνάω δουλεύω διαβάζω γράφω μαθαίνω καταλαβαίνω ρωτάω απαντάω αγοράζω πουλάω πληρώνω ανοίγω κλείνω αρχίζω τελειώνω περιμένω βρίσκω χάνω ψάχνω βάζω βγάζω μένω ζω πεθαίνω αγαπάω φιλάω παίζω τρέχω περπατάω οδηγώ ταξιδεύω μαγειρεύω πλένω καθαρίζω βοηθάω χρειάζομαι σκέφτομαι θυμάμαι ξεχνάω νομίζω πιστεύω ελπίζω φοβάμαι γελάω κλαίω αισθάνομαι
καλός κακός μεγάλος μικρός νέος παλιός ωραίος άσχημος ψηλός κοντός ζεστός κρύος εύκολος δύσκολος γρήγορος αργός ακριβός φτηνός ανοιχτός κλειστός γεμάτος άδειος καθαρός βρόμικος χαρούμενος λυπημένος κουρασμένος άρρωστος υγιής έτοιμος σωστός λάθος άσπρος μαύρος κόκκινος πράσινος μπλε κίτρινος
μηδέν δύο τρία τέσσερα πέντε έξι επτά οκτώ εννέα δέκα έντεκα δώδεκα είκοσι τριάντα σαράντα πενήντα εκατό χίλια πρώτος δεύτερος τρίτος
Δευτέρα Τρίτη Τετάρτη Πέμπτη Παρασκευή Σάββατο Κυριακή Ιανουάριος Φεβρουάριος Μάρτιος Απρίλιος Μάιος Ιούνιος Ιούλιος Αύγουστος Σεπτέμβριος Οκτώβριος Νοέμβριος Δεκέμβριος
γεια καλημέρα καλησπέρα καληνύχτα ευχαριστώ παρακαλώ συγγνώμη εντάξει αντίο
`.split(/\s+/).filter(Boolean);
const words = [...new Set(WORDS)];
const bad: Record<string, string[]> = { blank: [], otherLemma: [], koine: [], ancient: [], low: [], noGloss: [], xref: [] };
// a headword that is itself an inflected form of a commoner lemma (το → ο, η → ο …) is expected to show another lemma
const FORM_OF: Record<string, string> = { 'το': 'ο', 'η': 'ο', 'του': 'ο', 'της': 'ο', 'τα': 'ο', 'την': 'ο', 'τον': 'ο', 'μια': 'ένας', 'ένα': 'ένας', 'στο': 'σε', 'είναι': 'είμαι', 'αυτή': 'αυτός', 'αυτό': 'αυτός', 'αυτοί': 'αυτός', 'δεν': 'δεν', 'χρήματα': 'χρήμα', 'ρούχα': 'ρούχο', 'τρία': 'τρεις', 'τέσσερα': 'τέσσερις', 'χίλια': 'χίλιοι' };
for (const w of words) {
  const c = await card('ext', w, w, 0);
  const want = FORM_OF[w] ?? w;
  if (!c.lemma) { bad.blank.push(w); continue; }
  const src = c.source?.id ?? '';
  if (src.startsWith('morphgnt')) bad.koine.push(`${w}→${c.lemma} “${(c.gloss ?? '').slice(0, 24)}”`);
  else if (src === 'kaikki-grc-tables') bad.ancient.push(`${w}→${c.lemma} “${(c.gloss ?? '').slice(0, 24)}”`);
  if (c.lemma.toLowerCase() !== want.toLowerCase() && !src.startsWith('morphgnt') && src !== 'kaikki-grc-tables') bad.otherLemma.push(`${w}→${c.lemma}/${c.pos} “${(c.gloss ?? '').slice(0, 24)}”`);
  if (c.confidence < 0.5) bad.low.push(`${w}(${c.confidence})`);
  if (!c.gloss) bad.noGloss.push(w);
  else if (/form of|spelling of|synonym of/.test(c.gloss)) bad.xref.push(`${w} “${c.gloss.slice(0, 40)}”`);
}
console.log(`${words.length} everyday Modern Greek words, each selected alone`);
for (const [k, label] of [['blank', 'blank card'], ['koine', 'the reading shown is a New Testament (MorphGNT) one, with the Koine lemma and gloss'], ['ancient', 'the reading shown is an Ancient Greek (Wiktionary) one'], ['otherLemma', 'a Modern reading whose lemma is not the word'], ['low', 'confidence under 0.5 (the lookup is credited to the written form, not to the lemma)'], ['noGloss', 'no meaning'], ['xref', 'the meaning is a cross-reference']] as const) console.log(`\n${label}: ${bad[k].length}\n   ${bad[k].join(' | ')}`);
