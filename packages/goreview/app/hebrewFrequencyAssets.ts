import { gzipSync } from 'node:zlib';

export interface HebrewFrequencySource {
  label: string;
  licence: string;
  url: string;
  retrieved: string;
  note: string;
}

export interface HebrewFormFrequencyIndex {
  schema: number;
  id: string;
  source: HebrewFrequencySource;
  built: string;
  forms: Record<string, Array<[string, string, number, ...unknown[]]>>;
}

export interface HebrewFormFrequencyAsset {
  schema: 1;
  id: 'oshb-tanakh-form-frequency';
  indexId: 'oshb-tanakh';
  source: HebrewFrequencySource;
  built: string;
  forms: Record<string, { rank: number; count: number }>;
}

const compareUnicode = (left: string, right: string): number => {
  const a = Array.from(left, (char) => char.codePointAt(0)!);
  const b = Array.from(right, (char) => char.codePointAt(0)!);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};

/** Build exact pointed Hebrew form counts/ranks from the licensed OSHB aligned index. Ties use competition rank. */
export function buildHebrewFormFrequency(index: HebrewFormFrequencyIndex): HebrewFormFrequencyAsset {
  if (index?.schema !== 1 || index.id !== 'oshb-tanakh' || !index.forms || typeof index.forms !== 'object' || Array.isArray(index.forms)) {
    throw new Error('The OSHB biblical index has an invalid schema, id, or forms table.');
  }
  if (typeof index.built !== 'string' || !index.built || !index.source || ['label', 'licence', 'url', 'retrieved', 'note'].some((key) => typeof index.source[key as keyof HebrewFrequencySource] !== 'string' || !index.source[key as keyof HebrewFrequencySource])) {
    throw new Error('The OSHB biblical index is missing its build date or complete source attribution.');
  }

  const counts = new Map<string, number>();
  for (const [form, rows] of Object.entries(index.forms)) {
    if (!form || typeof form !== 'string' || !Array.isArray(rows) || !rows.length) throw new Error(`The OSHB biblical index has malformed rows for form ${JSON.stringify(form)}.`);
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 3 || typeof row[0] !== 'string' || !row[0] || typeof row[1] !== 'string' || !/^[HA]/.test(row[1]) || !Number.isSafeInteger(row[2]) || row[2] <= 0) {
        throw new Error(`The OSHB biblical index has a malformed morphology row for form ${JSON.stringify(form)}.`);
      }
      // OSHB code H marks Hebrew; A marks Aramaic, whose counts do not belong in Hebrew form ranks.
      if (row[1].startsWith('H')) {
        const count = (counts.get(form) ?? 0) + row[2];
        if (!Number.isSafeInteger(count)) throw new Error(`The OSHB count for form ${JSON.stringify(form)} exceeds the safe integer range.`);
        counts.set(form, count);
      }
    }
  }
  if (!counts.size) throw new Error('The OSHB biblical index contains no Hebrew form counts.');

  const ordered = [...counts].sort((a, b) => b[1] - a[1] || compareUnicode(a[0], b[0]));
  const forms: HebrewFormFrequencyAsset['forms'] = {};
  let previousCount: number | undefined;
  let rank = 0;
  ordered.forEach(([form, count], index) => {
    if (count !== previousCount) rank = index + 1;
    forms[form] = { rank, count };
    previousCount = count;
  });
  return { schema: 1, id: 'oshb-tanakh-form-frequency', indexId: 'oshb-tanakh', source: index.source, built: index.built, forms };
}

/** Deterministic gzip bytes for the shipped on-demand data file. */
export function gzipHebrewFormFrequency(index: HebrewFrequencyIndexLike): Buffer {
  return gzipSync(Buffer.from(`${JSON.stringify(buildHebrewFormFrequency(index))}\n`, 'utf8'), { level: 9 });
}

type HebrewFrequencyIndexLike = HebrewFormFrequencyIndex;
