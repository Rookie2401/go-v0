/**
 * The GoReview shell and the GoLearn extension exchange speech messages across the extension boundary, but GoReview may not
 * import from the extension (test/audit/conformance.structure.test.ts). Each side therefore carries its own copy of the two wire
 * shapes. This file keeps the copies identical: it fails to TYPE-CHECK (npx tsc -b) the moment either side gains, loses or
 * changes a field, because the shapes must be assignable in BOTH directions.
 */
import { describe, expect, it } from 'vitest';
import type { SpeechMessage as ExtMessage, SpeechReply as ExtReply } from '../../packages/golearn-extension/src/speechProtocol';
import type { SpeechMessage as ShellMessage, SpeechReply as ShellReply } from '../../packages/goreview/app/speechProtocol';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Required2<T> = { [K in keyof T]-?: T[K] };

// both directions, with optional fields made required so a dropped or renamed field is also caught
const messageSame: Same<Required2<ExtMessage>, Required2<ShellMessage>> = true;
const replySame: Same<Required2<ExtReply>, Required2<ShellReply>> = true;
const messageKeys: Same<keyof ExtMessage, keyof ShellMessage> = true;
const replyKeys: Same<keyof ExtReply, keyof ShellReply> = true;

describe('the speech wire shapes of the shell and the extension are one and the same', () => {
  it('is checked by the compiler (the constants above would not type-check otherwise)', () => {
    expect([messageSame, replySame, messageKeys, replyKeys]).toEqual([true, true, true, true]);
    const m: ShellMessage = { op: 'status', requestId: 'r', languageId: 'sq' };
    const asExtension: ExtMessage = m;
    expect(asExtension.op).toBe('status');
  });
});
