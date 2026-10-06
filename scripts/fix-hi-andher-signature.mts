import fs from 'node:fs';
import { contentSignatureOf } from '../src/ingest/publish';
const file='data/sources/hi-literature/bharatendu-andher-nagari.json';
const docs=JSON.parse(fs.readFileSync(file,'utf8')); docs[0].review.contentSignature=contentSignatureOf(docs[0]); fs.writeFileSync(file,JSON.stringify(docs,null,2)+'\n'); console.log(docs[0].review.contentSignature);
