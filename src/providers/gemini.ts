import type { ImageGenerationOptions, ImageProvider, RawImageData } from './types';
import { fetchWithRetry } from '../utils/network';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

async function callGemini(
  modelId: string,
  apiKey: string,
  opts: ImageGenerationOptions,
): Promise<RawImageData> {
  const url = `${GEMINI_BASE_URL}/${modelId}:generateContent`;

  const body = {
    contents: [{ parts: [{ text: opts.prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: opts.aspectRatio },
    },
  };

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  }, { signal: opts.signal });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    candidates?: {
      content?: {
        parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[];
      };
    }[];
  };

  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));

  if (!imagePart?.inlineData) {
    throw new Error('Gemini API returned no image data. Check your prompt and API key.');
  }

  const { mimeType, data: base64 } = imagePart.inlineData;
  const rawBuffer = Buffer.from(base64, 'base64');

  // Return raw buffer — pixel decoding is handled by imageService
  return {
    data: new Uint8Array(rawBuffer),
    width: 0,
    height: 0,
    mimeType,
    rawBuffer,
  };
}

export const geminiFlashProvider: ImageProvider = {
  id: 'gemini-3.1-flash-image-preview',
  displayName: 'Nano Banana 2 (Gemini 3.1 Flash Image Preview)',
  apiKeyName: 'gemini-api-key',
  apiKeyLabel: 'Google Gemini API Key',
  generate: (apiKey, opts) => callGemini('gemini-3.1-flash-image-preview', apiKey, opts),
};

export const geminiProProvider: ImageProvider = {
  id: 'gemini-3-pro-image-preview',
  displayName: 'Nano Banana Pro (Gemini 3 Pro Image)',
  apiKeyName: 'gemini-api-key',
  apiKeyLabel: 'Google Gemini API Key',
  generate: (apiKey, opts) => callGemini('gemini-3-pro-image-preview', apiKey, opts),
};
