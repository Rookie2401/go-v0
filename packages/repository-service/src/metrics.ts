/**
 * Prometheus text-format metrics for the service, with no dependency. Counters and one latency histogram are kept in memory by the handler; gauges
 * that need I/O (store counters, process memory) are produced by `collect()` at scrape time.
 *
 * Label values are bounded on purpose: `route` is the route PATTERN (`/units/:id`), never the path, so an id never becomes a label; an unmatched
 * path is `unmatched`. Nothing here carries a learner, an email, a token or an address.
 */

export const LATENCY_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30] as const;

export interface Sample {
  name: string;
  help: string;
  type: 'gauge' | 'counter';
  value: number;
  labels?: Record<string, string>;
}

export interface MetricsRegistry {
  /** One finished request. */
  observeRequest(route: string, method: string, status: number, seconds: number): void;
  /** A request refused by a rate limit rule. */
  observeLimited(rule: string): void;
  /** The text exposition. `samples` are the gauges produced at scrape time. */
  render(samples?: Sample[]): string;
}

const escapeLabel = (v: string): string => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const labelText = (labels: Record<string, string>): string => {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
};
const num = (n: number): string => (Number.isFinite(n) ? String(n) : n > 0 ? '+Inf' : n < 0 ? '-Inf' : 'NaN');

export function createMetricsRegistry(): MetricsRegistry {
  const requests = new Map<string, number>(); // route \0 method \0 status -> count
  const histograms = new Map<string, { buckets: number[]; sum: number; count: number }>(); // route -> histogram
  const limited = new Map<string, number>();

  return {
    observeRequest(route, method, status, seconds) {
      const key = `${route}\u0000${method}\u0000${status}`;
      requests.set(key, (requests.get(key) ?? 0) + 1);
      let h = histograms.get(route);
      if (!h) histograms.set(route, (h = { buckets: LATENCY_BUCKETS_SECONDS.map(() => 0), sum: 0, count: 0 }));
      LATENCY_BUCKETS_SECONDS.forEach((le, i) => { if (seconds <= le) h!.buckets[i]!++; });
      h.sum += seconds;
      h.count++;
    },
    observeLimited(rule) {
      limited.set(rule, (limited.get(rule) ?? 0) + 1);
    },
    render(samples = []) {
      const out: string[] = [];
      out.push('# HELP go_repository_http_requests_total Requests handled, by route pattern, method and status.');
      out.push('# TYPE go_repository_http_requests_total counter');
      for (const [key, n] of [...requests].sort(([a], [b]) => (a < b ? -1 : 1))) {
        const [route, method, status] = key.split('\u0000') as [string, string, string];
        out.push(`go_repository_http_requests_total${labelText({ route, method, status })} ${n}`);
      }
      out.push('# HELP go_repository_http_request_duration_seconds Time from receiving a request to its response being built, by route pattern.');
      out.push('# TYPE go_repository_http_request_duration_seconds histogram');
      for (const [route, h] of [...histograms].sort(([a], [b]) => (a < b ? -1 : 1))) {
        LATENCY_BUCKETS_SECONDS.forEach((le, i) => out.push(`go_repository_http_request_duration_seconds_bucket${labelText({ route, le: String(le) })} ${h.buckets[i]}`));
        out.push(`go_repository_http_request_duration_seconds_bucket${labelText({ route, le: '+Inf' })} ${h.count}`);
        out.push(`go_repository_http_request_duration_seconds_sum${labelText({ route })} ${num(Math.round(h.sum * 1e6) / 1e6)}`);
        out.push(`go_repository_http_request_duration_seconds_count${labelText({ route })} ${h.count}`);
      }
      out.push('# HELP go_repository_rate_limited_total Requests refused with 429 by a rate limit rule.');
      out.push('# TYPE go_repository_rate_limited_total counter');
      for (const [rule, n] of [...limited].sort(([a], [b]) => (a < b ? -1 : 1))) out.push(`go_repository_rate_limited_total${labelText({ rule })} ${n}`);
      const seen = new Set<string>();
      for (const s of samples) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          out.push(`# HELP ${s.name} ${s.help}`);
          out.push(`# TYPE ${s.name} ${s.type}`);
        }
        out.push(`${s.name}${labelText(s.labels ?? {})} ${num(s.value)}`);
      }
      return `${out.join('\n')}\n`;
    },
  };
}
