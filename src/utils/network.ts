export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  retryOnStatuses?: number[];
  signal?: AbortSignal;
}

const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

export function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Image generation was cancelled.');
  }
}

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 450;
  const retryOnStatuses = options.retryOnStatuses ?? DEFAULT_RETRYABLE_STATUSES;
  const signal = options.signal;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    ensureNotAborted(signal);
    try {
      const response = await fetch(input, { ...init, signal });

      const shouldRetry = retryOnStatuses.includes(response.status) && attempt < retries;
      if (!shouldRetry) {
        return response;
      }

      await waitWithAbort(baseDelayMs * Math.pow(2, attempt), signal);
    } catch (error: unknown) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }

      await waitWithAbort(baseDelayMs * Math.pow(2, attempt), signal);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Request failed after retries.');
}

async function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  ensureNotAborted(signal);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('Request cancelled.'));
    };

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
