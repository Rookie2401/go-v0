/** Imported first by the content script so its evaluation time is the start of module loading (load-cost instrumentation). */
export const bootStart: number = typeof performance !== 'undefined' ? performance.now() : 0;
