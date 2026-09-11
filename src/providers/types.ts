// ─── Shared types for all image generation providers ────────────────────────

export interface ImageGenerationOptions {
  prompt: string;
  aspectRatio: string;
  size?: string;
  outputQuality?: string;
  quality: number;
  requestTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface InputImageData {
  rawBuffer: Buffer;
  mimeType: string;
}

export interface ImageEditOptions extends ImageGenerationOptions {
  inputImage: InputImageData;
}

/** Raw response from a provider image API. */
export interface RawImageData {
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
  edit?(apiKey: string, opts: ImageEditOptions): Promise<RawImageData>;
}

// ─── Provider IDs ────────────────────────────────────────────────────────────

export const PROVIDER_IDS = [
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gpt-image-2',
  'gpt-image-1.5',
  'mai-image-2.6',
  'mai-image-2.6-flash',
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
  'gpt-image-2.5-flare': 'openai-api-key',
  'gpt-image-2.5-sunburst': 'openai-api-key',
  'gpt-image-2': 'openai-api-key',
  'gpt-image-1.5': 'openai-api-key',
  'mai-image-2.6': 'openrouter-api-key',
  'mai-image-2.6-flash': 'openrouter-api-key',
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
  'gpt-image-2.5-flare': 60,
  'gpt-image-2.5-sunburst': 60,
  'gpt-image-2': 211,
  'gpt-image-1.5': 133,
  'mai-image-2.6': 50,
  'mai-image-2.6-flash': 25,
  'flux-2-max': 70,
  'flux-2-pro': 30,
  'seedream-4.0': 30,
};

export const PROVIDER_META: ProviderMeta[] = [
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    detail: 'Google · $67/1k imgs (default)',
    apiKeyName: 'gemini-api-key',
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'Nano Banana Pro',    
    detail: 'Google · $134/1k imgs',
    apiKeyName: 'gemini-api-key',
  },
  {
    id: 'gpt-image-2.5-flare',
    label: 'GPT Image 2.5 Flare',
    detail: 'OpenAI · ~$60/1k imgs (high, fast)',
    apiKeyName: 'openai-api-key',
  },
  {
    id: 'gpt-image-2.5-sunburst',
    label: 'GPT Image 2.5 Sunburst',
    detail: 'OpenAI · ~$60/1k imgs (high, precise edits)',
    apiKeyName: 'openai-api-key',
  },
  {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    detail: 'OpenAI · $211/1k imgs',
    apiKeyName: 'openai-api-key',
  },
  {
    id: 'gpt-image-1.5',
    label: 'GPT Image 1.5',
    detail: 'OpenAI · $133/1k imgs',
    apiKeyName: 'openai-api-key',
  },
  {
    id: 'mai-image-2.6',
    label: 'MAI-Image-2.6',
    detail: 'Microsoft AI via OpenRouter · ~$50/1k imgs',
    apiKeyName: 'openrouter-api-key',
  },
  {
    id: 'mai-image-2.6-flash',
    label: 'MAI-Image-2.6 Flash',
    detail: 'Microsoft AI via OpenRouter · ~$25/1k imgs',
    apiKeyName: 'openrouter-api-key',
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
    detail: 'ByteDance via OpenRouter · $30/1k imgs',
    apiKeyName: 'openrouter-api-key',
  },
];

// ─── Per-model UI capabilities ────────────────────────────────────────────────

/** Size values accepted by the GPT Image 1.5 endpoint. */
const OPENAI_15_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536'] as const;

/** Size values accepted by GPT Image 2 and the GPT Image 2.5 family. */
const OPENAI_LARGE_SIZES = [
  'auto',
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '2048x2048',
  '2048x1152',
  '1152x2048',
  '3840x2160',
  '2160x3840',
] as const;

/** Quality tiers accepted by GPT Image 1.5 and GPT Image 2. */
const OPENAI_QUALITY_TIERS = ['auto', 'low', 'medium', 'high'] as const;

/** GPT Image 2.5 adds the `xhigh` and `max` tiers above `high`. */
const OPENAI_25_QUALITY_TIERS = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

const NANO_BANANA_2_SIZES = ['1K', '2K', '0.5K'] as const;

export interface ProviderCapabilities {
  /** Size/resolution values offered in the manual UI. Empty when the model has no size control. */
  sizes: readonly string[];
  /** Provider-side quality tiers. Empty when the model has no quality control. */
  qualityTiers: readonly string[];
  /** Quality tier pre-selected in the manual UI, when the model has quality tiers. */
  defaultQualityTier?: string;
}

const NO_EXTRA_CONTROLS: ProviderCapabilities = { sizes: [], qualityTiers: [] };

export const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  'gemini-3.1-flash-image-preview': { sizes: NANO_BANANA_2_SIZES, qualityTiers: [] },
  'gemini-3-pro-image-preview': NO_EXTRA_CONTROLS,
  'gpt-image-2.5-flare': {
    sizes: OPENAI_LARGE_SIZES,
    qualityTiers: OPENAI_25_QUALITY_TIERS,
    defaultQualityTier: 'high',
  },
  'gpt-image-2.5-sunburst': {
    sizes: OPENAI_LARGE_SIZES,
    qualityTiers: OPENAI_25_QUALITY_TIERS,
    defaultQualityTier: 'high',
  },
  'gpt-image-2': {
    sizes: OPENAI_LARGE_SIZES,
    qualityTiers: OPENAI_QUALITY_TIERS,
    defaultQualityTier: 'high',
  },
  'gpt-image-1.5': {
    sizes: OPENAI_15_SIZES,
    qualityTiers: OPENAI_QUALITY_TIERS,
    defaultQualityTier: 'high',
  },
  // The OpenRouter Image API drives MAI purely from `aspect_ratio`.
  'mai-image-2.6': NO_EXTRA_CONTROLS,
  'mai-image-2.6-flash': NO_EXTRA_CONTROLS,
  'flux-2-max': NO_EXTRA_CONTROLS,
  'flux-2-pro': NO_EXTRA_CONTROLS,
  'seedream-4.0': NO_EXTRA_CONTROLS,
};

// ─── Aspect ratio helpers ─────────────────────────────────────────────────────

export const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Map a common aspect-ratio string to an OpenAI-compatible size string */
export function aspectRatioToOpenAISize(ar: string): string {
  if (ar === '1:1') {
    return '1024x1024';
  }

  const parts = ar.split(':');
  if (parts.length !== 2) {
    return 'auto';
  }

  const w = Number(parts[0]);
  const h = Number(parts[1]);

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return 'auto';
  }

  if (w > h) {
    return '1536x1024';
  }

  if (h > w) {
    return '1024x1536';
  }

  return '1024x1024';
}
