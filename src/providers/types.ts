// ─── Shared types for all image generation providers ────────────────────────

export interface ImageGenerationOptions {
  prompt: string;
  aspectRatio: string;
  quality: number;
  signal?: AbortSignal;
}

/** Raw response from a provider: decoded pixel data ready for WebP encoding. */
export interface RawImageData {
  /** RGBA pixel buffer */
  data: Uint8Array;
  width: number;
  height: number;
  /** Original mime type returned by the provider */
  mimeType: string;
  /** Original base64-encoded image bytes from the API (before pixel decoding) */
  rawBuffer: Buffer;
}

export interface ImageProvider {
  /** Corresponds to the `imagegen.provider` setting value */
  id: ProviderId;
  displayName: string;
  /** Key name used in SecretStorage */
  apiKeyName: ApiKeyName;
  /** Human-readable label for the API key prompt */
  apiKeyLabel: string;
  generate(apiKey: string, opts: ImageGenerationOptions): Promise<RawImageData>;
}

// ─── Provider IDs ────────────────────────────────────────────────────────────

export const PROVIDER_IDS = [
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'gpt-image-1.5',
  'flux-2-max',
  'flux-2-pro',
  'seedream-4.0',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

// ─── API key names (only 3 secrets needed) ───────────────────────────────────

export const API_KEY_NAMES = ['gemini-api-key', 'openai-api-key', 'openrouter-api-key'] as const;
export type ApiKeyName = (typeof API_KEY_NAMES)[number];

/** Whether each API key is currently stored in SecretStorage */
export type KeyStatuses = Partial<Record<ApiKeyName, boolean>>;

export const PROVIDER_API_KEY_MAP: Record<ProviderId, ApiKeyName> = {
  'gemini-3.1-flash-image-preview': 'gemini-api-key',
  'gemini-3-pro-image-preview': 'gemini-api-key',
  'gpt-image-1.5': 'openai-api-key',
  'flux-2-max': 'openrouter-api-key',
  'flux-2-pro': 'openrouter-api-key',
  'seedream-4.0': 'openrouter-api-key',
};

export const API_KEY_LABELS: Record<ApiKeyName, string> = {
  'gemini-api-key': 'Google Gemini API Key',
  'openai-api-key': 'OpenAI API Key',
  'openrouter-api-key': 'OpenRouter API Key',
};

// ─── Display metadata ─────────────────────────────────────────────────────────

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  detail: string;
  apiKeyName: ApiKeyName;
}

/**
 * Flat image-generation price used for per-call cost estimates.
 * Values are USD per 1000 generated images.
 */
export const PROVIDER_USD_PER_1K_IMAGES: Record<ProviderId, number> = {
  'gemini-3.1-flash-image-preview': 67,
  'gemini-3-pro-image-preview': 134,
  'gpt-image-1.5': 133,
  'flux-2-max': 70,
  'flux-2-pro': 30,
  'seedream-4.0': 30,
};

export const PROVIDER_META: ProviderMeta[] = [
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2 — Gemini 3.1 Flash Image Preview',
    detail: 'Google · $67/1k imgs (default)',
    apiKeyName: 'gemini-api-key',
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro — Gemini 3 Pro Image',
    detail: 'Google · $134/1k imgs',
    apiKeyName: 'gemini-api-key',
  },
  {
    id: 'gpt-image-1.5',
    label: 'GPT Image 1.5 (high)',
    detail: 'OpenAI · $133/1k imgs',
    apiKeyName: 'openai-api-key',
  },
  {
    id: 'flux-2-max',
    label: 'FLUX.2 [max]',
    detail: 'Black Forest Labs via OpenRouter · $70/1k imgs',
    apiKeyName: 'openrouter-api-key',
  },
  {
    id: 'flux-2-pro',
    label: 'FLUX.2 [pro]',
    detail: 'Black Forest Labs via OpenRouter · $30/1k imgs',
    apiKeyName: 'openrouter-api-key',
  },
  {
    id: 'seedream-4.0',
    label: 'Seedream 4.0',
    detail: 'ByteDance Seed via OpenRouter · $30/1k imgs',
    apiKeyName: 'openrouter-api-key',
  },
];

// ─── Aspect ratio helpers ─────────────────────────────────────────────────────

export const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Map a common aspect-ratio string to an OpenAI-compatible size string */
export function aspectRatioToOpenAISize(ar: string): string {
  const map: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '4:3': '1365x1024',
    '3:4': '1024x1365',
  };
  return map[ar] ?? '1024x1024';
}
