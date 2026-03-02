export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  retryOnStatuses?: number[];
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms.`);
    this.name = 'RequestTimeoutError';
  }
}

const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;

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
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const signal = options.signal;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    ensureNotAborted(signal);
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), requestTimeoutMs);
    const linkedSignal = createLinkedAbortSignal(signal, timeoutController.signal);

    try {
      const response = await fetch(input, { ...init, signal: linkedSignal });
      clearTimeout(timeout);

      const shouldRetry = retryOnStatuses.includes(response.status) && attempt < retries;
      if (!shouldRetry) {
        return response;
      }

      await waitWithAbort(baseDelayMs * Math.pow(2, attempt), signal);
    } catch (error: unknown) {
      clearTimeout(timeout);

      if (signal?.aborted) {
        throw new Error('Request cancelled.');
      }

      if (timeoutController.signal.aborted) {
        throw new RequestTimeoutError(requestTimeoutMs);
      }

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

function createLinkedAbortSignal(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const validSignals = signals.filter((signal): signal is AbortSignal => !!signal);
  if (validSignals.length === 0) {
    return new AbortController().signal;
  }
  if (validSignals.length === 1) {
    return validSignals[0];
  }

  const controller = new AbortController();

  const onAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
    for (const signal of validSignals) {
      signal.removeEventListener('abort', onAbort);
    }
  };

  for (const signal of validSignals) {
    if (signal.aborted) {
      onAbort();
      break;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return controller.signal;
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
