import { fetchWithRetry } from '../utils/network';

export interface ProviderImageItem {
  b64_json?: string;
  url?: string;
}

export async function throwProviderHttpError(prefix: string, res: Response): Promise<never> {
  const text = await res.text();
  throw new Error(`${prefix} ${res.status}: ${text}`);
}

export async function imageBufferFromProviderItem(
  item: ProviderImageItem | undefined,
  options: {
    signal?: AbortSignal;
    requestTimeoutMs?: number;
    downloadErrorPrefix: string;
    emptyErrorMessage: string;
  },
): Promise<Buffer> {
  if (item?.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }

  if (item?.url) {
    const imgRes = await fetchWithRetry(
      item.url,
      { signal: options.signal },
      { signal: options.signal, requestTimeoutMs: options.requestTimeoutMs },
    );

    if (!imgRes.ok) {
      throw new Error(`${options.downloadErrorPrefix}: ${imgRes.status}`);
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error(options.emptyErrorMessage);
}
