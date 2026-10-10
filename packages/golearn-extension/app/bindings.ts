/**
 * The one file that imports the language-packs package and adapts it to the views the screens render (ports.ts).
 * Nothing else in the application knows the shape of a manifest, the pack registry or the installer’s results.
 */
import {
  LEVEL_LABEL, PACKS, createPackRuntime, installPack, levelOf, validationOf, packFor as registryPackFor, runCase, verifyInstalled,
} from '../../language-packs/src';
import type { InstallResult, InstalledRecord, PackManifest, PackStorage, Tutorial } from '../../language-packs/src';
import { languagesOf, tutorialOf } from './languages';
import type { StorageArea } from '../src/platform';
import { ensureAnalyser } from './analysers';
import type { InstallOptions, PackBindings, PackView, TutorialView, VerifyCheck, VerifyView } from './ports';

/** Pack records are kept under the extension’s own `golearn:` prefix, in whichever storage area the app uses. */
const PACK_PREFIX = 'golearn:';

export function packStorage(area: StorageArea): PackStorage {
  return {
    async get(key) { const k = PACK_PREFIX + key; return (await area.get(k))[k]; },
    async set(key, value) { await area.set({ [PACK_PREFIX + key]: value }); },
  };
}

export function packView(m: PackManifest): PackView {
  const dict = m.lexical.dictionary;
  return {
    packId: m.packId, languageId: m.languageId, version: m.version, name: m.identity.name, nativeName: m.identity.nativeName,
    status: m.status, level: levelOf(m), levelLabel: LEVEL_LABEL[levelOf(m)], analyzerId: m.analyzer.id, analyzerVersion: m.analyzer.version, validation: validationOf(m), defaultVarietyId: m.varietyId, scriptId: m.scriptId,
    varieties: m.varieties.map((v) => ({ varietyId: v.varietyId, label: v.label, analysed: v.analysed, ...(v.writtenStandard ? { writtenStandard: v.writtenStandard } : {}) })),
    licences: m.rights.licences.map((l) => ({ ...l })),
    attribution: dict ? [dict.attribution] : [],
    reviewStatus: m.rights.reviewStatus,
    provenance: [...m.rights.provenance],
    remoteVoiceProvider: m.pronunciation.remoteVoice.provider,
    manifest: m,
  };
}

function checksOf(m: PackManifest, record: Pick<InstalledRecord['verified'], 'dictionaryManifest' | 'sampleShard'>, cases: Array<{ id: string; pass: boolean; got?: string }>): VerifyCheck[] {
  const dict = m.lexical.dictionary;
  return [
    { id: 'dictionary-manifest', label: dict ? `Dictionary description (${dict.id}, ${dict.entries.toLocaleString('en')} entries)` : 'Dictionary description', ok: record.dictionaryManifest },
    { id: 'sample-shard', label: 'A dictionary shard can be fetched and read', ok: record.sampleShard },
    ...cases.map((c): VerifyCheck => {
      const vc = m.validation.find((x) => x.id === c.id);
      return {
        id: `case:${c.id}`,
        label: vc ? `Validation case: “${vc.surface}”${vc.sentence ? ` in “${vc.sentence}”` : ' alone'}` : `Validation case ${c.id}`,
        ok: c.pass,
        ...(c.pass ? {} : { detail: c.got ? `the analyser gave ${c.got}` : 'the analyser’s reading did not match the expected one' }),
      };
    }),
  ];
}

export function installView(m: PackManifest, r: InstallResult): VerifyView {
  if (!r.ok) {
    return { ok: false, message: `${r.reason}: ${r.detail}`, checks: [{ id: r.reason, label: `The install stopped (${r.reason})`, ok: false, detail: r.detail }] };
  }
  const failed = r.validationFailures;
  return {
    ok: failed === 0, version: m.version, checks: checksOf(m, r.verified, r.verified.validation),
    ...(failed ? { message: `${failed} validation case${failed === 1 ? '' : 's'} did not match; the pack is installed but its analysis is not as described.` } : {}),
  };
}

export function createPackBindings(): PackBindings {
  const all = (): PackView[] => Object.values(PACKS).map(packView);
  return {
    packs: all,
    packFor(languageId) { const m = registryPackFor(languageId); return m ? packView(m) : undefined; },
    languages: () => languagesOf(),
    async install(pack: PackView, o: InstallOptions): Promise<VerifyView> {
      const m = pack.manifest as PackManifest;
      // the analyser the validation cases run through is loaded first (it is a separate chunk); if it cannot be, installPack says there is no analyser
      try { await ensureAnalyser(m.languageId); } catch { /* installPack reports the missing analyser */ }
      const r = await installPack(m, {
        fetch: o.fetch, baseUrl: o.baseUrl, storage: packStorage(o.storage),
        onProgress: (p) => o.onProgress?.(p.index, p.total, p.message),
      });
      return installView(m, r);
    },
    async verify(pack: PackView, storage: StorageArea): Promise<VerifyView> {
      const m = pack.manifest as PackManifest;
      const r = await verifyInstalled(m, packStorage(storage));
      if (!r.installed) return { ok: false, checks: [], message: r.detail };
      try { await ensureAnalyser(m.languageId); } catch { /* the record of the last install is used instead */ }
      // re-run every case through the analyser this build actually bundles, not only the record of the last install
      const adapter = createPackRuntime(m, { fetch: globalThis.fetch.bind(globalThis), baseUrl: './' }).analyzer().adapter;
      const cases = adapter ? m.validation.map((c) => runCase(adapter, c)) : r.record.verified.validation;
      const failures = cases.filter((c) => !c.pass).length;
      const stale = !r.current;
      return {
        ok: failures === 0 && !stale, version: r.record.version, checks: checksOf(m, r.record.verified, cases),
        ...(stale ? { message: `The installed record is for version ${r.record.version}; this pack is ${m.version}. Reinstall it.` } : failures ? { message: `${failures} validation case${failures === 1 ? '' : 's'} no longer match.` } : {}),
      };
    },
    tutorial(languageId): TutorialView | undefined {
      const t: Tutorial | undefined = tutorialOf(languageId);
      if (!t) return undefined;
      return {
        languageId: t.languageId, notice: t.notice, estimatedMinutes: t.estimatedMinutes,
        steps: t.steps.map((s) => ({
          id: s.id, kind: s.kind, title: s.title, body: s.body, estimatedMinutes: s.estimatedMinutes,
          ...(s.examples ? { examples: s.examples.map((e) => ({ ...e })) } : {}),
          ...(s.practice ? { practice: { ...s.practice } } : {}),
          ...(s.passage ? { passage: { title: s.passage.title, sentences: s.passage.sentences.map((x) => ({ ...x })) } } : {}),
        })),
      };
    },
  };
}
