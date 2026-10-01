/**
 * ItemBook — the items one fold touches, loaded together, changed in memory and written back once.
 *
 * A fold reads the rows of the items in ONE sentence (by id), the encounter rows of that sentence's word items (by id),
 * updates their aggregates (agg.ts) and writes only what changed. Nothing here reads an item's encounter history.
 */
import type { ItemKind, LanguageCode } from '../core';
import { ids } from '../core';
import { blankAgg, buildRow, relevel } from './agg';
import type { StoredItem } from './agg';
import { isOrthId } from './orth';
import type { Ctx, StoredEncounter } from './state';

export type ItemMeta = { lang: LanguageCode; itemKind: ItemKind };

export class ItemBook {
  private readonly rows = new Map<string, StoredItem>();
  private readonly stored = new Set<string>();
  private readonly meta = new Map<string, ItemMeta>();
  private readonly dirty = new Set<string>();
  /** Encounter rows to write: new ones and changed ones. */
  readonly encounters = new Map<string, StoredEncounter>();

  constructor(private readonly ctx: Ctx, private readonly userId: string) {}

  /** Fetch the stored rows of these items (one read). */
  async load(itemIds: Iterable<string>): Promise<void> {
    const want = [...itemIds].filter((i) => !this.rows.has(i) && !this.meta.has(i));
    if (want.length === 0) return;
    const rows = await this.ctx.store.learnerItems.getMany(want.map((i) => ids.learnerItem(this.userId, i)));
    want.forEach((itemId, i) => {
      const r = rows[i] as StoredItem | undefined;
      this.meta.set(itemId, r ? { lang: r.lang, itemKind: r.itemKind } : { lang: 'es', itemKind: 'form' });
      if (!r) return;
      if (!r.agg) r.agg = blankAgg(); // a row from before evidence@6: the policy stamp makes ensureCurrent rebuild it
      this.rows.set(itemId, r);
      this.stored.add(itemId);
    });
  }

  /** The row of an item if it exists (loaded or created in this book). */
  get(itemId: string): StoredItem | undefined {
    return this.rows.get(itemId);
  }

  /** The row of an item, created empty when it does not exist yet. */
  ensure(itemId: string, meta: ItemMeta): StoredItem {
    let r = this.rows.get(itemId);
    if (!r) {
      r = { id: ids.learnerItem(this.userId, itemId), userId: this.userId, lang: meta.lang, itemId, itemKind: meta.itemKind, agg: blankAgg() } as unknown as StoredItem;
      this.rows.set(itemId, r);
      this.meta.set(itemId, meta);
    }
    return r;
  }

  touch(itemId: string) {
    this.dirty.add(itemId);
  }

  putEncounter(enc: StoredEncounter) {
    this.encounters.set(enc.id, enc);
  }

  async flush(): Promise<void> {
    const { store } = this.ctx;
    // 1. priorLevel of the current sitting's entries follows the final head; mirror changes onto the encounter rows
    const priors = new Map<string, StoredEncounter['priorLevel']>();
    for (const itemId of this.dirty) {
      const row = this.rows.get(itemId)!;
      if (isOrthId(itemId)) continue; // orth items have no encounter rows: nothing to mirror
      for (const m of ['reading', 'listening'] as const) {
        for (const c of relevel(this.ctx, row.agg, m)) priors.set(ids.encounter(this.userId, itemId, c.sentenceId, m, c.sitting), c.prior);
      }
    }
    const fetch = [...priors.keys()].filter((id) => !this.encounters.has(id));
    if (fetch.length > 0) {
      const got = await store.encounters.getMany(fetch);
      fetch.forEach((id, i) => { const e = got[i]; if (e) this.encounters.set(id, e as StoredEncounter); });
    }
    for (const [id, prior] of priors) { const e = this.encounters.get(id); if (e) e.priorLevel = prior; }
    if (this.encounters.size > 0) await store.encounters.bulkPut([...this.encounters.values()]);
    this.encounters.clear();

    // 2. the item rows
    const put: StoredItem[] = [];
    for (const itemId of this.dirty) {
      const row = this.rows.get(itemId)!;
      const built = buildRow(this.ctx, this.userId, itemId, this.meta.get(itemId)!, row.agg, row.manualMark);
      if (built) { put.push(built); this.rows.set(itemId, built); this.stored.add(itemId); } else if (this.stored.has(itemId)) {
        await store.learnerItems.delete(row.id);
        this.stored.delete(itemId);
      }
    }
    if (put.length > 0) await store.learnerItems.bulkPut(put);
    this.dirty.clear();
  }
}
