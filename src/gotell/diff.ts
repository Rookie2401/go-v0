/**
 * Sentence-level diff between two revisions (LCS on exact sentence text). Adjacent removed/added
 * runs between unchanged anchors are paired into `changed` entries, the remainder stay removed/added.
 */
export type DiffEntry = { kind: 'same' | 'added' | 'removed' | 'changed'; a?: string; b?: string };

export function diffSentences(a: string[], b: string[]): DiffEntry[] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const raw: DiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { raw.push({ kind: 'same', a: a[i], b: b[j] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { raw.push({ kind: 'removed', a: a[i] }); i++; }
    else { raw.push({ kind: 'added', b: b[j] }); j++; }
  }
  while (i < n) raw.push({ kind: 'removed', a: a[i++] });
  while (j < m) raw.push({ kind: 'added', b: b[j++] });

  // Pair runs of removed/added between anchors into "changed".
  const out: DiffEntry[] = [];
  let k = 0;
  while (k < raw.length) {
    if (raw[k].kind === 'same') { out.push(raw[k++]); continue; }
    const removed: string[] = [];
    const added: string[] = [];
    while (k < raw.length && raw[k].kind !== 'same') {
      if (raw[k].kind === 'removed') removed.push(raw[k].a as string);
      else added.push(raw[k].b as string);
      k++;
    }
    const paired = Math.min(removed.length, added.length);
    for (let p = 0; p < paired; p++) out.push({ kind: 'changed', a: removed[p], b: added[p] });
    for (let p = paired; p < removed.length; p++) out.push({ kind: 'removed', a: removed[p] });
    for (let p = paired; p < added.length; p++) out.push({ kind: 'added', b: added[p] });
  }
  return out;
}
