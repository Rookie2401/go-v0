/**
 * Event emission helper for UI components. Fills userId / lang / session / surface and a dedupeKey.
 *
 * - View events (SentenceViewed, TextViewed, TextCompleted) pass an explicit key scoped to learner + sitting (the key may be
 *   a function of the session id, resolved at emit time) so a rerender, a remount or a second visit in the same sitting
 *   can never count twice, while a genuine later sitting (new session id after 30 minutes idle) is not swallowed.
 * - Deliberate learner actions (tap, reveal, accept, play) get a unique key per action.
 */
import { useMemo } from 'react';
import type { DomainEvent, EventBus, EventInput, LanguageCode, Surface } from '../core';
import { useApp } from './context';

let counter = 0;
export function uniqueKey(kind: string): string {
  counter += 1;
  return `${kind}:${Date.now().toString(36)}:${counter.toString(36)}:${Math.random().toString(36).slice(2, 6)}`;
}

type Supplied = 'userId' | 'lang' | 'session' | 'surface' | 'dedupeKey';
export type EmitBody<E extends DomainEvent> = Omit<EventInput<E>, Supplied> & { dedupeKey?: string | ((session: string) => string) };

export interface Emitter {
  emit<E extends DomainEvent>(surface: Surface, body: EmitBody<E>): Promise<E | null>;
}

/** `session` may be a function: the sitting id is then resolved at the moment of emission (see AppContextValue.currentSession). */
export function makeEmitter(ctx: { bus: EventBus; userId: string; lang: LanguageCode; session: string | (() => string) }): Emitter {
  return {
    emit<E extends DomainEvent>(surface: Surface, body: EmitBody<E>) {
      const session = typeof ctx.session === 'function' ? ctx.session() : ctx.session;
      const input = {
        ...body,
        userId: ctx.userId,
        lang: ctx.lang,
        session,
        surface,
        dedupeKey: typeof body.dedupeKey === 'function' ? body.dedupeKey(session) : body.dedupeKey ?? uniqueKey(body.type),
      } as unknown as EventInput<E>;
      return ctx.bus.emit<E>(input);
    },
  };
}

export function useEmitter(): Emitter {
  const { bus, userId, lang, currentSession } = useApp();
  return useMemo(() => makeEmitter({ bus, userId, lang, session: currentSession }), [bus, userId, lang, currentSession]);
}
