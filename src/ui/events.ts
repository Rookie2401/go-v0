/**
 * Event emission helper for UI components. Fills userId / lang / session / surface and a dedupeKey.
 *
 * - View events (SentenceViewed, TextViewed, TextCompleted) pass an explicit session-scoped key so a
 *   rerender, a remount or a second visit in the same session can never count twice.
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
export type EmitBody<E extends DomainEvent> = Omit<EventInput<E>, Supplied> & { dedupeKey?: string };

export interface Emitter {
  emit<E extends DomainEvent>(surface: Surface, body: EmitBody<E>): Promise<E | null>;
}

export function makeEmitter(ctx: { bus: EventBus; userId: string; lang: LanguageCode; session: string }): Emitter {
  return {
    emit<E extends DomainEvent>(surface: Surface, body: EmitBody<E>) {
      const input = {
        ...body,
        userId: ctx.userId,
        lang: ctx.lang,
        session: ctx.session,
        surface,
        dedupeKey: body.dedupeKey ?? uniqueKey(body.type),
      } as unknown as EventInput<E>;
      return ctx.bus.emit<E>(input);
    },
  };
}

export function useEmitter(): Emitter {
  const { bus, userId, lang, session } = useApp();
  return useMemo(() => makeEmitter({ bus, userId, lang, session }), [bus, userId, lang, session]);
}
