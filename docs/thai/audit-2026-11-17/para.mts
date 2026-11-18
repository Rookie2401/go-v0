// What the Forms section gets for a Thai word: the adapter's "paradigm" (kind none), its notes and the construction list as passed to the card.
import fs from 'node:fs';
import { thAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/th';
const want: Array<[string, string]> = [['กิน', 'VERB'], ['หมา', 'NOUN'], ['แมว', 'NOUN'], ['หนังสือ', 'NOUN'], ['จดหมาย', 'NOUN'], ['เวลา', 'NOUN'], ['ตอน', 'NOUN'], ['ลูก', 'NOUN'], ['ผ้า', 'NOUN'], ['รถ', 'NOUN'], ['คน', 'NOUN'], ['เด็ก', 'NOUN'], ['ครู', 'NOUN'], ['ปากกา', 'NOUN'], ['ดี', 'ADJ'], ['ตัว', 'CLF'], ['ครับ', 'PART'], ['ผม', 'PRON'], ['สอง', 'NUM'], ['ที่', 'SCONJ']];
const out: string[] = [];
for (const [lemma, pos] of want) {
  const p: any = thAdapter.paradigm!(lemma, pos as any);
  out.push(`== ${lemma} ${pos}: kind=${p.kind} template=${p.template}`);
  out.push('   notes: ' + (p.notes ?? []).join(' || '));
  out.push('   constructions (as passed to the card): ' + (p.constructions ?? []).join(', '));
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/thaudit/para.out.txt', out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));
