import type { ImageGenerationOptions, ImageProvider, ProviderId, RawImageData } from './types';
import { aspectRatioToOpenAISize } from './types';
import { fetchWithRetry } from '../utils/network';

const OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images/generations';

/** Maps our internal provider ID to the OpenRouter model string */
const OPENROUTER_MODEL_IDS: Record<string, string> = {
  'flux-2-max': 'black-forest-labs/flux-2-max',
  'flux-2-pro': 'black-forest-labs/flux-2-pro',
  'seedream-4.0': 'bytedance/seedream-4.0',
};

function makeOpenRouterProvider(
  id: ProviderId,
  displayName: string,
): ImageProvider {
  return {
    id,
    displayName,
    apiKeyName: 'openrouter-api-key',
    apiKeyLabel: 'OpenRouter API Key',

    async generate(apiKey: string, opts: ImageGenerationOptions): Promise<RawImageData> {
      const model = OPENROUTER_MODEL_IDS[id];
      if (!model) {
        throw new Error(`Unknown OpenRouter model for provider ID: ${id}`);
      }

      const body = {
        model,
        prompt: opts.prompt,
        response_format: 'b64_json',
        size: aspectRatioToOpenAISize(opts.aspectRatio),
        n: 1,
      };

      const res = await fetchWithRetry(OPENROUTER_IMAGE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/marquaye/vscode-imagegen',
          'X-Title': 'VS Code ImageGen',
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      }, { signal: opts.signal, requestTimeoutMs: opts.requestTimeoutMs });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenRouter API error ${res.status}: ${text}`);
      }

      const json = (await res.json()) as {
        data?: { b64_json?: string; url?: string }[];
      };

      let rawBuffer: Buffer;

      const item = json?.data?.[0];
      if (item?.b64_json) {
        rawBuffer = Buffer.from(item.b64_json, 'base64');
      } else if (item?.url) {
        // Some OpenRouter models return a URL instead of base64
        const imgRes = await fetchWithRetry(
          item.url,
          { signal: opts.signal },
          { signal: opts.signal, requestTimeoutMs: opts.requestTimeoutMs },
        );
        if (!imgRes.ok) {
          throw new Error(`Failed to download image from OpenRouter URL: ${imgRes.status}`);
        }
        const arrayBuffer = await imgRes.arrayBuffer();
        rawBuffer = Buffer.from(arrayBuffer);
      } else {
        throw new Error('OpenRouter API returned no image data.');
      }

      return {
        mimeType: 'image/png',
        rawBuffer,
      };
    },

    async edit(): Promise<RawImageData> {
      throw new Error(`${displayName} does not currently support image-to-image editing in ImageGen.`);
    },
  };
}

export const fluxMaxProvider = makeOpenRouterProvider('flux-2-max', 'FLUX.2 [max]');
export const fluxProProvider = makeOpenRouterProvider('flux-2-pro', 'FLUX.2 [pro]');
export const seedreamProvider = makeOpenRouterProvider('seedream-4.0', 'Seedream 4.0');
