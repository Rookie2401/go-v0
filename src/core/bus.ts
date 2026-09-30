/**
 * StoreEventBus — append-only event log on AppStore.events with dedupe and ordered subscribers.
 */
import type { AppStore } from './store';
import type { DomainEvent, EventBus, EventHandler, EventInput, EventType } from './events';
import { ids } from './ids';

export class StoreEventBus implements EventBus {
  private handlers: Array<{ h: EventHandler; types?: Set<EventType> }> = [];
  private seen = new Set<string>();
  private loaded = false;

  constructor(private readonly store: AppStore, private readonly clock: () => string = () => new Date().toISOString()) {}

  private async loadSeen() {
    if (this.loaded) return;
    for (const e of await this.store.events.all()) this.seen.add(e.dedupeKey);
    this.loaded = true;
  }

  async emit<E extends DomainEvent>(input: EventInput<E>): Promise<E | null> {
    await this.loadSeen();
    if (this.seen.has(input.dedupeKey)) return null;
    const event = { ...input, id: ids.event(), at: input.at ?? this.clock() } as unknown as E;
    this.seen.add(event.dedupeKey);
    await this.store.events.put(event);
    for (const { h, types } of this.handlers) {
      if (!types || types.has(event.type)) await h(event);
    }
    return event;
  }

  subscribe(handler: EventHandler, opts?: { types?: EventType[] }) {
    const entry = { h: handler, types: opts?.types ? new Set(opts.types) : undefined };
    this.handlers.push(entry);
    return () => { this.handlers = this.handlers.filter((x) => x !== entry); };
  }

  async history(filter?: { userId?: string; types?: EventType[]; since?: string }) {
    let rows = filter?.userId ? await this.store.events.where('userId', filter.userId) : await this.store.events.all();
    if (filter?.types) { const t = new Set(filter.types); rows = rows.filter((e) => t.has(e.type)); }
    if (filter?.since) rows = rows.filter((e) => e.at >= filter.since!);
    return rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
  }
}
