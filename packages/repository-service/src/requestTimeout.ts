/**
 * Bound one fetch from request start through response-body completion.
 *
 * Unlike a timer around only `fetch()`'s headers promise, this keeps the deadline
 * active while callers consume `response.text()`, `json()`, or the response
 * stream. Caller cancellation is forwarded and all listeners/timers are removed
 * on rejection, body completion, or cancellation.
 */
export function withRequestTimeout(fetcher: typeof fetch, timeoutMs = 8_000): typeof fetch {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const requestSignal = typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined;
    const upstream = init.signal ?? requestSignal;
    const abort = (): void => controller.abort(upstream?.reason);
    const onTimeout = (): void => controller.abort(new DOMException('Request timed out', 'TimeoutError'));
    if (upstream?.aborted) abort();
    else upstream?.addEventListener('abort', abort, { once: true });

    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(onTimeout, Math.max(1, timeoutMs));
    let finished = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let output: ReadableStreamDefaultController<Uint8Array> | undefined;
    const cleanup = (): void => {
      if (finished) return;
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      upstream?.removeEventListener('abort', abort);
    };
    const timedBodyAbort = (): void => {
      if (!controller.signal.aborted) return;
      const reason = controller.signal.reason ?? new DOMException('Request timed out', 'TimeoutError');
      try { output?.error(reason); } catch { /* the stream already closed */ }
      void reader?.cancel(reason).catch(() => undefined);
      cleanup();
    };
    controller.signal.addEventListener('abort', timedBodyAbort, { once: true });

    try {
      if (controller.signal.aborted) throw controller.signal.reason ?? new DOMException('Request aborted', 'AbortError');
      const response = await fetcher(input, { ...init, signal: controller.signal });
      // A fetcher may ignore abort and resolve after its deadline; do not hand out a body without a live deadline.
      if (controller.signal.aborted) throw controller.signal.reason ?? new DOMException('Request aborted', 'AbortError');
      const requestMethod = (init.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
      // Response forbids a body for these statuses even when a nonstandard fetch
      // implementation exposes an empty stream (or a mock does so in tests).
      // Keep the original response intact for HEAD and the bodyless statuses.
      if (requestMethod === 'HEAD' || response.status === 204 || response.status === 205 || response.status === 304 || !response.body) {
        cleanup();
        controller.signal.removeEventListener('abort', timedBodyAbort);
        return response;
      }

      reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        start(streamController) { output = streamController; },
        async pull(streamController) {
          try {
            const part = await reader!.read();
            if (part.done) {
              streamController.close();
              cleanup();
              controller.signal.removeEventListener('abort', timedBodyAbort);
            } else streamController.enqueue(part.value);
          } catch (error) {
            try { streamController.error(error); } catch { /* already errored */ }
            cleanup();
            controller.signal.removeEventListener('abort', timedBodyAbort);
          }
        },
        async cancel(reason) {
          try { await reader!.cancel(reason); } finally {
            cleanup();
            controller.signal.removeEventListener('abort', timedBodyAbort);
          }
        },
      });

      const wrapped = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      // These standard Response metadata properties are read-only accessors;
      // preserve their values while the body stream is wrapped.
      Object.defineProperties(wrapped, {
        url: { configurable: true, value: response.url },
        redirected: { configurable: true, value: response.redirected },
        type: { configurable: true, value: response.type },
      });
      return wrapped;
    } catch (error) {
      cleanup();
      controller.signal.removeEventListener('abort', timedBodyAbort);
      throw error;
    }
  };
}
