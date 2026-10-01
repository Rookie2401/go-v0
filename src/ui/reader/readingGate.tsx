/**
 * The reading gate: anything rendered inside the Reader that covers or replaces reading (the passage preparation
 * panel, a preview, a modal) registers itself here while it is open, and the Reader pauses view detection for as
 * long as any such overlay is open. The word sheet is NOT one of them — consulting a word is part of reading.
 *
 * Outside a Reader the default context does nothing, so an overlay component can be rendered anywhere.
 */
import { createContext, useContext, useEffect } from 'react';

export interface ReadingGate {
  setOverlay(id: string, open: boolean): void;
}

export const ReadingGateContext = createContext<ReadingGate>({ setOverlay: () => undefined });

/** Declare that overlay `id` is open (true) or closed (false); it is released automatically when the component unmounts. */
export function useReadingOverlay(id: string, open: boolean): void {
  const gate = useContext(ReadingGateContext);
  useEffect(() => {
    gate.setOverlay(id, open);
    return () => gate.setOverlay(id, false);
  }, [gate, id, open]);
}
