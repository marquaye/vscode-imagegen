import type { ImageEditOptions, ImageGenerationOptions, ImageProvider, RawImageData } from './types';
import { aspectRatioToOpenAISize } from './types';
import { fetchWithRetry } from '../utils/network';

const OPENAI_IMAGE_URL = 'https://api.openai.com/v1/images/generations';
const OPENAI_IMAGE_EDIT_URL = 'https://api.openai.com/v1/images/edits';

export const openAIProvider: ImageProvider = {
  id: 'gpt-image-1.5',
  displayName: 'GPT Image 1.5 (high)',
  apiKeyName: 'openai-api-key',
  apiKeyLabel: 'OpenAI API Key',

  async generate(apiKey: string, opts: ImageGenerationOptions): Promise<RawImageData> {
    const body = {
      model: 'gpt-image-1.5',
      prompt: opts.prompt,
      size: opts.size ?? aspectRatioToOpenAISize(opts.aspectRatio),
      quality: opts.outputQuality ?? 'high',
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
    }, { signal: opts.signal, requestTimeoutMs: opts.requestTimeoutMs });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      data?: { b64_json?: string; url?: string }[];
    };

    const item = json?.data?.[0];
    let rawBuffer: Buffer;

    if (item?.b64_json) {
      rawBuffer = Buffer.from(item.b64_json, 'base64');
    } else if (item?.url) {
      const imgRes = await fetchWithRetry(
        item.url,
        { signal: opts.signal },
        { signal: opts.signal, requestTimeoutMs: opts.requestTimeoutMs },
      );
      if (!imgRes.ok) {
        throw new Error(`Failed to download image from OpenAI URL: ${imgRes.status}`);
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      rawBuffer = Buffer.from(arrayBuffer);
    } else {
      throw new Error('OpenAI API returned no image data.');
    }

    return {
      mimeType: 'image/png',
      rawBuffer,
    };
  },

  async edit(apiKey: string, opts: ImageEditOptions): Promise<RawImageData> {
    const form = new FormData();
    form.append('model', 'gpt-image-1.5');
    form.append('prompt', opts.prompt);
    form.append('size', opts.size ?? aspectRatioToOpenAISize(opts.aspectRatio));
    form.append('quality', opts.outputQuality ?? 'high');
    form.append('n', '1');
    form.append(
      'image',
      new Blob([opts.inputImage.rawBuffer], { type: opts.inputImage.mimeType }),
      'input-image',
    );

    const res = await fetchWithRetry(OPENAI_IMAGE_EDIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: opts.signal,
    }, { signal: opts.signal, requestTimeoutMs: opts.requestTimeoutMs });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API edit error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      data?: { b64_json?: string; url?: string }[];
    };

    const item = json?.data?.[0];
    let rawBuffer: Buffer;

    if (item?.b64_json) {
      rawBuffer = Buffer.from(item.b64_json, 'base64');
    } else if (item?.url) {
      const imgRes = await fetchWithRetry(
        item.url,
        { signal: opts.signal },
        { signal: opts.signal, requestTimeoutMs: opts.requestTimeoutMs },
      );
      if (!imgRes.ok) {
        throw new Error(`Failed to download edited image from OpenAI URL: ${imgRes.status}`);
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      rawBuffer = Buffer.from(arrayBuffer);
    } else {
      throw new Error('OpenAI API returned no edited image data.');
    }

    return {
      mimeType: 'image/png',
      rawBuffer,
    };
  },
};
