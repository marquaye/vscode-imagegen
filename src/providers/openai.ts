import type { ImageGenerationOptions, ImageProvider, RawImageData } from './types';
import { aspectRatioToOpenAISize } from './types';
import { fetchWithRetry } from '../utils/network';

const OPENAI_IMAGE_URL = 'https://api.openai.com/v1/images/generations';

export const openAIProvider: ImageProvider = {
  id: 'gpt-image-1.5',
  displayName: 'GPT Image 1.5 (high)',
  apiKeyName: 'openai-api-key',
  apiKeyLabel: 'OpenAI API Key',

  async generate(apiKey: string, opts: ImageGenerationOptions): Promise<RawImageData> {
    const body = {
      model: 'gpt-image-1.5',
      prompt: opts.prompt,
      response_format: 'b64_json',
      size: aspectRatioToOpenAISize(opts.aspectRatio),
      quality: 'high',
      n: 1,
    };

    const res = await fetchWithRetry(OPENAI_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    }, { signal: opts.signal });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      data?: { b64_json?: string }[];
    };

    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('OpenAI API returned no image data.');
    }

    const rawBuffer = Buffer.from(b64, 'base64');

    return {
      data: new Uint8Array(rawBuffer),
      width: 0,
      height: 0,
      mimeType: 'image/png',
      rawBuffer,
    };
  },
};
