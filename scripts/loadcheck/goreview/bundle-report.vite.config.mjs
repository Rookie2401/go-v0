// Measurement only: the GoReview build plus a per-chunk, per-area size report (JSON) written to $REPORT_OUT.
//   REPORT_OUT=<file.json> GOREVIEW_OUT=<scratch folder> GOREVIEW_RELEASE_MODE=developer GOREVIEW_DICT= \
//     npx vite build -c scripts/loadcheck/goreview/bundle-report.vite.config.mjs --mode review
// Each chunk's modules are grouped by "adapter:<lang>", "pack:<lang>", "dict+core", "node_modules" or "other"; sizes are rendered bytes.
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import base from '../../../packages/goreview/app/vite.config.ts';

const areaOf = (id) => {
  const p = id.replace(/\\/g, '/');
  let m = p.match(/src\/adapters\/(\w+)\//) || p.match(/src\/adapters\/(\w+)\.ts/);
  if (m && !/^(index|shared|word-analysis)$/.test(m[1])) return `adapter:${m[1]}`;
  m = p.match(/language-packs\/src\/packs\/(\w+)/);
  if (m) return `pack:${m[1]}`;
  if (/node_modules/.test(p)) return 'node_modules';
  if (/\/src\/(dict|core)\//.test(p)) return 'dict+core';
  return 'other';
};

const report = () => ({
  name: 'size-report',
  apply: 'build',
  generateBundle(_o, bundle) {
    const rows = {};
    const per = [];
    for (const o of Object.values(bundle)) {
      if (o.type !== 'chunk') continue;
      per.push({ file: o.fileName, raw: Buffer.byteLength(o.code), gz: gzipSync(Buffer.from(o.code)).length });
      for (const [id, m] of Object.entries(o.modules)) {
        const key = `${o.fileName} ${areaOf(id)}`;
        rows[key] = (rows[key] || 0) + m.renderedLength;
      }
    }
    fs.writeFileSync(process.env.REPORT_OUT, JSON.stringify({ per, rows }, null, 1));
  },
});

export default (env) => {
  const c = base(env);
  return { ...c, plugins: [...c.plugins, report()] };
};
