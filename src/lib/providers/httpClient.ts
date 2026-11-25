// VeriStack — Shared Telemetry HTTP Client & Bounded Concurrency Runner

export class UpstreamHttpError extends Error {
  public readonly statusCode: number;
  public readonly provider: string;

  constructor(provider: string, statusCode: number, message: string) {
    super(message);
    this.name = "UpstreamHttpError";
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

/** Fetch JSON with strict timeout and single automatic retry on transient 5xx/429 responses. */
export async function fetchJsonWithTimeout<T>(
  url: string,
  options: {
    provider: string;
    method?: "GET" | "POST";
    body?: string;
    headers?: Record<string, string>;
    timeoutMs: number;
    retries?: number;
  }
): Promise<T> {
  const maxAttempts = (options.retries ?? 1) + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "VeriStack-Audit/1.0",
          ...(options.headers ?? {}),
        },
        body: options.body,
      });

      if (!response.ok) {
        const shouldRetry =
          attempt < maxAttempts && (response.status === 429 || response.status >= 500);
        if (shouldRetry) continue;
        throw new UpstreamHttpError(
          options.provider,
          response.status,
          `${options.provider} returned HTTP ${response.status}`
        );
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      if (err instanceof UpstreamHttpError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new UpstreamHttpError(options.provider, 504, `${options.provider} request timed out`);
      }
      if (attempt < maxAttempts) continue;
      throw new UpstreamHttpError(options.provider, 502, `${options.provider} unreachable`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new UpstreamHttpError(options.provider, 502, `${options.provider} exhausted retries`);
}

/** Map items concurrently with a fixed worker pool limit. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      const currentIdx = cursor;
      cursor += 1;
      const item = items[currentIdx];
      if (item !== undefined) {
        results[currentIdx] = await worker(item, currentIdx);
      }
    }
  };

  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
