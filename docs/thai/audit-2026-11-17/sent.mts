// Reading units the adapter makes of running Thai (segmentSentences), for a few short texts.
import fs from 'node:fs';
import { thAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/th';
const texts = [
  'สวัสดีครับ ผมชื่อแซม ผมมาจากอเมริกา ตอนนี้ผมอยู่ที่เชียงใหม่ ผมชอบอาหารไทยมาก',
  'เมื่อวานฝนตกหนัก ผมเลยไม่ได้ไปทำงาน วันนี้อากาศดี ผมจะไปตลาดกับเพื่อน',
  'ไปไหนมาคะ ไปตลาดมาครับ ซื้ออะไรมาบ้างคะ',
  'พี่ครับ ขอน้ำแก้วหนึ่งครับ ขอบคุณครับ',
  'เขาเกิดเมื่อ พ.ศ. 2540 ที่กรุงเทพฯ เป็นลูกคนที่สอง เวลา 14.30 น. เขาจะมาถึง',
  'พระเยซูตรัสว่า "จงตามเรามา" เขาก็ลุกขึ้นตามพระองค์ไป',
  'ราคาเท่าไรคะ 50 บาทค่ะ แพงไปนะคะ ลดได้ไหมคะ',
];
const out: string[] = [];
for (const t of texts) {
  const s = thAdapter.segmentSentences(t);
  out.push(`TEXT: ${t}\n  ${s.length} unit(s): ${s.map((x) => `⟦${x.text}⟧`).join(' ')}`);
}
fs.writeFileSync('C:/Users/CJWal/dev/tmp-mem/thaudit/sent.out.txt', out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));
