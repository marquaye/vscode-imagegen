import * as vscode from 'vscode';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import {
  getProvider,
  PROVIDER_USD_PER_1K_IMAGES,
  type ProviderId,
} from './providers';
import type { RawImageData } from './providers/types';
import { getConfig, type ImageGenConfig } from './image/config';
import { resolveInputImageSource } from './image/inputResolver';
import { writeOptimizedImage } from './image/outputWriter';
import { assertWasmInitialized, encodeWebp } from './image/wasm';
import { getApiKeyForProvider } from './secrets';
import { ensureNotAborted } from './utils/network';

// Local stand-in for the DOM ImageData shape expected by @jsquash/webp
interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace: string;
}

const MAX_DECODED_PIXEL_COUNT = 20_000_000;

// ─── Main generation function ─────────────────────────────────────────────────

export interface GenerateResult {
  absolutePath: string;
  /** Workspace-relative path, or absolute path when no workspace is open */
  relativePath: string;
  /** Markdown image snippet ready to paste */
  markdownLink: string;
  /** Original provider image size before WebP optimization */
  originalBytes: number;
  /** Final WebP image size after optimization */
  optimizedBytes: number;
  /** Generation/processing metrics useful for agent responses and UI */
  metrics: {
    providerId: ProviderId;
    /** Time spent waiting for the remote provider API response */
    apiCallDurationMs: number;
    /** End-to-end generation time including decode, encode, and file write */
    totalDurationMs: number;
    /** Estimated provider cost for this single image in USD */
    estimatedCostUsd: number;
  };
}

export interface GenerateOptions {
  prompt: string;
  aspectRatio?: string;
  size?: string;
  outputQuality?: string;
  /** Override quality (0-100). Falls back to imagegen.webpQuality setting. */
  quality?: number;
  /** Override provider ID. Falls back to imagegen.provider setting. */
  providerId?: ProviderId;
  signal?: AbortSignal;
}

export interface EditOptions extends GenerateOptions {
  inputImageSource: string;
}

export async function generateAndSaveImage(
  context: vscode.ExtensionContext,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  ensureNotAborted(opts.signal);
  const startedAt = Date.now();

  assertWasmInitialized();

  const config = getConfig();
  const providerId = opts.providerId ?? config.provider;
  const quality = opts.quality ?? config.webpQuality;
  const aspectRatio = opts.aspectRatio ?? '16:9';

  // ── 1. API Key ──────────────────────────────────────────────────────────────
  const apiKey = await getApiKeyForProvider(context, providerId);
  if (!apiKey) {
    throw new Error(
      `ImageGen: No API key set for provider "${providerId}". ` +
        `Run the command "ImageGen: Set API Key" to configure it.`,
    );
  }

  // ── 2. Call provider ────────────────────────────────────────────────────────
  const provider = getProvider(providerId);
  const apiCallStartedAt = Date.now();
  const rawImage = await provider.generate(apiKey, {
    prompt: opts.prompt,
    aspectRatio,
    size: opts.size,
    outputQuality: opts.outputQuality,
    quality,
    requestTimeoutMs: config.requestTimeoutMs,
    signal: opts.signal,
  });
  const apiCallDurationMs = Date.now() - apiCallStartedAt;
  ensureNotAborted(opts.signal);

  return saveProviderImage({
    prompt: opts.prompt,
    providerId,
    config,
    quality,
    rawImage,
    startedAt,
    apiCallDurationMs,
    signal: opts.signal,
    filePrefix: 'imagegen',
  });
}

export async function editAndSaveImage(
  context: vscode.ExtensionContext,
  opts: EditOptions,
): Promise<GenerateResult> {
  ensureNotAborted(opts.signal);
  const startedAt = Date.now();

  assertWasmInitialized();

  const config = getConfig();
  const providerId = opts.providerId ?? config.provider;
  const quality = opts.quality ?? config.webpQuality;
  const aspectRatio = opts.aspectRatio ?? '16:9';

  const apiKey = await getApiKeyForProvider(context, providerId);
  if (!apiKey) {
    throw new Error(
      `ImageGen: No API key set for provider "${providerId}". ` +
        `Run the command "ImageGen: Set API Key" to configure it.`,
    );
  }

  const provider = getProvider(providerId);
  if (!provider.edit) {
    throw new Error(`ImageGen: Provider "${providerId}" does not support image editing.`);
  }

  const maxInputImageBytes = Math.round(config.maxInputImageMB * 1024 * 1024);
  const inputImage = await resolveInputImageSource(opts.inputImageSource, maxInputImageBytes, opts.signal);

  const apiCallStartedAt = Date.now();
  const rawImage = await provider.edit(apiKey, {
    prompt: opts.prompt,
    aspectRatio,
    size: opts.size,
    outputQuality: opts.outputQuality,
    quality,
    requestTimeoutMs: config.requestTimeoutMs,
    inputImage,
    signal: opts.signal,
  });
  const apiCallDurationMs = Date.now() - apiCallStartedAt;
  ensureNotAborted(opts.signal);

  return saveProviderImage({
    prompt: opts.prompt,
    providerId,
    config,
    quality,
    rawImage,
    startedAt,
    apiCallDurationMs,
    signal: opts.signal,
    filePrefix: 'imageedit',
  });
}

interface SaveProviderImageArgs {
  prompt: string;
  providerId: ProviderId;
  config: ImageGenConfig;
  quality: number;
  rawImage: RawImageData;
  startedAt: number;
  apiCallDurationMs: number;
  signal?: AbortSignal;
  filePrefix: 'imagegen' | 'imageedit';
}

async function saveProviderImage(args: SaveProviderImageArgs): Promise<GenerateResult> {
  const {
    prompt,
    providerId,
    config,
    quality,
    rawImage,
    startedAt,
    apiCallDurationMs,
    signal,
    filePrefix,
  } = args;

  // ── 3. Decode raw image to RGBA pixels ──────────────────────────────────────
  let rgbaData: Uint8Array;
  let width: number;
  let height: number;

  const mimeType = rawImage.mimeType.toLowerCase();

  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    const decoded = jpeg.decode(rawImage.rawBuffer, { useTArray: true, formatAsRGBA: true });
    rgbaData = decoded.data;
    width = decoded.width;
    height = decoded.height;
  } else if (mimeType.includes('png')) {
    const png = PNG.sync.read(rawImage.rawBuffer);
    // pngjs returns a Buffer with RGBA data
    rgbaData = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength);
    width = png.width;
    height = png.height;
  } else {
    throw new Error(`ImageGen: Unsupported image type returned by provider: ${rawImage.mimeType}`);
  }

  validateDecodedDimensions(width, height);

  // ── 4. Encode to WebP via WASM ──────────────────────────────────────────────
  // ImageData is a DOM type not in Node.js lib — use our local stand-in shape
  const imageData: ImageDataLike = {
    data: new Uint8ClampedArray(rgbaData.buffer, rgbaData.byteOffset, rgbaData.byteLength),
    width,
    height,
    colorSpace: 'srgb',
  };

  const webpBuffer = await encodeWebp(imageData as unknown as Parameters<typeof encodeWebp>[0], { quality });
  ensureNotAborted(signal);

  // ── 5. Save to workspace (or fallback directory when no workspace is open) ─
  const outputArtifact = await writeOptimizedImage(
    prompt,
    filePrefix,
    new Uint8Array(webpBuffer),
    config.outputDirectory,
  );
  const estimatedCostUsd = PROVIDER_USD_PER_1K_IMAGES[providerId] / 1000;
  const totalDurationMs = Date.now() - startedAt;

  return {
    absolutePath: outputArtifact.absolutePath,
    relativePath: outputArtifact.relativePath,
    markdownLink: outputArtifact.markdownLink,
    originalBytes: rawImage.rawBuffer.byteLength,
    optimizedBytes: webpBuffer.byteLength,
    metrics: {
      providerId,
      apiCallDurationMs,
      totalDurationMs,
      estimatedCostUsd,
    },
  };
}

function validateDecodedDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    throw new Error('ImageGen: Provider returned an invalid image size.');
  }

  const pixels = width * height;
  if (pixels > MAX_DECODED_PIXEL_COUNT) {
    throw new Error('ImageGen: Image resolution is too large to process safely.');
  }
}
