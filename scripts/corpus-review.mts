/// <reference types="node" />
/**
 * npm run corpus:review -- <file> --by "<name>" [--status reviewed|approved|in-review|rejected] [--date YYYY-MM-DD] [--notes "..."]
 *
 * Records a review in the file's `review` block (status defaults to `reviewed`, date to today) and removes the
 * `needs-native-review` editorial tag when the status is reviewed/approved. No text is ever changed: only `review` and
 * `editorialTags` are touched. Then prints whether the document would now publish and, if not, why.
 *
 * Exit codes: 0 review recorded (or already identical); 1 usage error, unreadable / invalid file, or a refusal
 * (no --by, bad status/date, Scripture without scripture.verification, or the result would not validate - nothing is
 * written in that case). Scripture verification is a separate step (node scripts/verify-scripture.mjs).
 */
import fs from 'node:fs';
import { applyReview, validateBatch, type CorpusDocument, type ReviewOptions } from '../src/ingest';
import { printIssues, printPublication, registry } from './corpus-cli.mts';

const USAGE = 'usage: npm run corpus:review -- <file> --by "<name>" [--status reviewed|approved|in-review|rejected] [--date YYYY-MM-DD] [--notes "..."]';
const fail = (msg: string): never => { console.error(msg); process.exit(1); };

// ── arguments ──
const argv = process.argv.slice(2).filter((a) => a !== '--');
const flags = new Map<string, string>();
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { positional.push(a); continue; }
  const eq = a.indexOf('=');
  const name = eq > 0 ? a.slice(2, eq) : a.slice(2);
  if (!['by', 'status', 'date', 'notes'].includes(name)) fail(`unknown option --${name}\n${USAGE}`);
  if (eq > 0) { flags.set(name, a.slice(eq + 1)); continue; }
  const value = argv[i + 1];
  if (value === undefined || (value.startsWith('--') && name !== 'notes')) { flags.set(name, ''); continue; }
  flags.set(name, value);
  i++;
}
if (positional.length !== 1) fail(`expected exactly one file\n${USAGE}`);
const file = positional[0];

// ── read ──
let raw = '';
try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { fail(`cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`); }
let doc: unknown;
try { doc = JSON.parse(raw.replace(/^﻿/, '')); } catch (e) { fail(`${file}: not valid JSON: ${e instanceof Error ? e.message : String(e)}`); }

// ── review ──
const opts: ReviewOptions = { by: flags.get('by'), status: flags.get('status'), date: flags.get('date'), notes: flags.get('notes') };
const result = applyReview(doc, opts);
if (!result.ok) {
  console.error(`corpus:review - refused ${file}`);
  for (const r of result.refusals) console.error(`  REFUSED ${r.message} [${r.code}]\n        hint: ${r.hint}`);
  process.exit(1);
}
if (!result.ok) process.exit(1); // (narrowing for the type checker)
const { doc: next, review, previous, removedTags, decision } = result;

// the result must still be a valid document, or nothing is written
const batch = validateBatch([next], { registry });
const errors = batch.documents[0].issues.filter((i) => i.severity === 'error');
if (errors.length) {
  console.error(`corpus:review - ${file} would not validate after the review; nothing written`);
  printIssues(errors);
  process.exit(1);
}

// defensive: the review must not have changed a single byte of text
const textsOf = (d: CorpusDocument) => JSON.stringify(d.sections);
if (textsOf(doc as CorpusDocument) !== textsOf(next)) fail('internal error: the review changed document content; nothing written');

const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const out = JSON.stringify(next, null, 2).replace(/\n/g, eol) + eol;
const changed = out !== raw;
if (changed) fs.writeFileSync(file, out, 'utf8');

const sentences = next.sections.reduce((n, s) => n + s.paragraphs.reduce((m, p) => m + ('sentences' in p ? p.sentences.length : 1), 0), 0);
console.log(`corpus:review - ${file}  [${next.id}]`);
console.log(`  review: ${previous?.status ?? '(none)'} -> ${review.status} by ${review.reviewedBy} on ${review.reviewedAt}${review.notes ? ` - ${review.notes}` : ''}`);
console.log(`  review covers wording ${review.contentSignature?.slice(0, 8)}`);
if (removedTags.length) console.log(`  removed editorial tag: ${removedTags.join(', ')}`);
console.log(`  text untouched: sections, sentences and every character of text are byte-identical (${sentences} sentence block(s)); ${changed ? 'file updated' : 'file already recorded this review'}`);
if ((next.editorialTags ?? []).includes('machine-drafted') || next.generated) console.log('  note: the text stays marked machine-drafted / generated; the reader keeps badging it');
printPublication(decision.unpublishedReasons, 0, '  ');
console.log('next: npm run corpus:validate -- ' + file + '   then import it (see docs/IMPORT.md)');
