import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import encodeWebp, { init as initWebpEncode } from '@jsquash/webp/encode';
import { simd } from 'wasm-feature-detect';
import {
  getProvider,
  PROVIDER_IDS,
  PROVIDER_USD_PER_1K_IMAGES,
  type ProviderId,
} from './providers';
import type { InputImageData, RawImageData } from './providers/types';
import { getApiKeyForProvider } from './secrets';
import { ensureNotAborted, fetchWithRetry } from './utils/network';

// Local stand-in for the DOM ImageData shape expected by @jsquash/webp
interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace: string;
}

const MAX_DECODED_PIXEL_COUNT = 20_000_000;

// ─── WASM Initialisation ──────────────────────────────────────────────────────

let wasmInitialized = false;

export async function initWasm(extensionPath: string): Promise<void> {
  if (wasmInitialized) {
    return;
  }

  // Load WASM bytes directly from disk and pass a compiled module to init().
  // This avoids path/fetch issues in extension host environments.
  const encoderFile = (await simd()) ? 'webp_enc_simd.wasm' : 'webp_enc.wasm';
  const encWasmPath = path.join(
    extensionPath,
    'node_modules',
    '@jsquash',
    'webp',
    'codec',
    'enc',
    encoderFile,
  );

  if (!fs.existsSync(encWasmPath)) {
    throw new Error(`ImageGen: WebP encoder WASM not found at ${encWasmPath}`);
  }

  const wasmBytes = fs.readFileSync(encWasmPath);
  const wasmApi = (globalThis as unknown as { WebAssembly: { compile: (bytes: Buffer) => Promise<unknown> } }).WebAssembly;
  const wasmModule = await wasmApi.compile(wasmBytes);
  await initWebpEncode(wasmModule);

  wasmInitialized = true;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ImageGenConfig {
  provider: ProviderId;
  outputDirectory: string;
  webpQuality: number;
  requestTimeoutMs: number;
  maxInputImageMB: number;
}

export function getConfig(): ImageGenConfig {
  const cfg = vscode.workspace.getConfiguration('imagegen');
  const provider = cfg.get<string>('provider', 'gemini-3.1-flash-image-preview');

  if (!(PROVIDER_IDS as readonly string[]).includes(provider)) {
    throw new Error(`ImageGen: Unknown provider "${provider}" in settings.`);
  }

  return {
    provider: provider as ProviderId,
    outputDirectory: cfg.get<string>('outputDirectory', 'assets/images'),
    webpQuality: cfg.get<number>('webpQuality', 80),
    requestTimeoutMs: cfg.get<number>('requestTimeoutMs', 45000),
    maxInputImageMB: cfg.get<number>('maxInputImageMB', 12),
  };
}

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

  if (!wasmInitialized) {
    throw new Error('ImageGen: WASM encoder has not been initialized. Please reload the window.');
  }

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

  if (!wasmInitialized) {
    throw new Error('ImageGen: WASM encoder has not been initialized. Please reload the window.');
  }

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
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  const outDir = workspaceRoot
    ? path.join(workspaceRoot, config.outputDirectory)
    : getStandaloneOutputDirectory();
  fs.mkdirSync(outDir, { recursive: true });

  const randomHex = Math.random().toString(16).slice(2, 8);
  const filename = `${filePrefix}-${Date.now()}-${randomHex}.webp`;
  const absolutePath = path.join(outDir, filename);

  fs.writeFileSync(absolutePath, new Uint8Array(webpBuffer));

  const relativePath = workspaceRoot
    ? path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/')
    : absolutePath;

  const altText = promptToSlug(prompt);
  const markdownTarget = workspaceRoot
    ? relativePath
    : vscode.Uri.file(absolutePath).toString();
  const markdownLink = `![${altText}](${markdownTarget})`;
  const estimatedCostUsd = PROVIDER_USD_PER_1K_IMAGES[providerId] / 1000;
  const totalDurationMs = Date.now() - startedAt;

  return {
    absolutePath,
    relativePath,
    markdownLink,
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

const DATA_URL_RE = /^data:(?<mime>[^;]+);base64,(?<data>[\s\S]+)$/i;
const MARKDOWN_IMAGE_RE = /^!\[[^\]]*\]\((?<path>[^)]+)\)$/;

async function resolveInputImageSource(source: string, maxBytes: number, signal?: AbortSignal): Promise<InputImageData> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('ImageGen: inputImage is required for image editing.');
  }

  const markdownMatch = trimmed.match(MARKDOWN_IMAGE_RE);
  const resolvedSource = markdownMatch?.groups?.path?.trim() ?? trimmed;

  const dataUrlMatch = resolvedSource.match(DATA_URL_RE);
  if (dataUrlMatch?.groups?.mime && dataUrlMatch.groups.data) {
    const rawBuffer = Buffer.from(dataUrlMatch.groups.data, 'base64');
    assertInputImageSize(rawBuffer.byteLength, maxBytes);
    return {
      mimeType: dataUrlMatch.groups.mime.toLowerCase(),
      rawBuffer,
    };
  }

  if (/^https?:\/\//i.test(resolvedSource)) {
    const res = await fetchWithRetry(resolvedSource, { signal }, { signal });
    if (!res.ok) {
      throw new Error(`ImageGen: Failed to download input image (${res.status}).`);
    }

    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isNaN(contentLength)) {
        assertInputImageSize(contentLength, maxBytes);
      }
    }

    const arrayBuffer = await res.arrayBuffer();
    assertInputImageSize(arrayBuffer.byteLength, maxBytes);
    const contentType = res.headers.get('content-type')?.split(';')[0]?.toLowerCase();

    return {
      mimeType: contentType && contentType.startsWith('image/')
        ? contentType
        : inferMimeTypeFromPathname(resolvedSource),
      rawBuffer: Buffer.from(arrayBuffer),
    };
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  const localPath = path.isAbsolute(resolvedSource)
    ? resolvedSource
    : workspaceRoot
      ? path.join(workspaceRoot, resolvedSource)
      : '';

  if (!path.isAbsolute(resolvedSource) && !workspaceRoot) {
    throw new Error(
      'ImageGen: Relative input image paths require an open workspace. Use an absolute path, URL, or data URL.',
    );
  }

  try {
    await fs.promises.access(localPath, fs.constants.R_OK);
  } catch {
    throw new Error(`ImageGen: Input image not found at "${resolvedSource}".`);
  }

  const localStats = await fs.promises.stat(localPath);
  assertInputImageSize(localStats.size, maxBytes);

  return {
    mimeType: inferMimeTypeFromPathname(localPath),
    rawBuffer: await fs.promises.readFile(localPath),
  };
}

function assertInputImageSize(bytes: number, maxBytes: number): void {
  if (bytes > maxBytes) {
    const maxMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    throw new Error(`ImageGen: Input image is too large. Max supported size is ${maxMb} MB.`);
  }
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

function inferMimeTypeFromPathname(imagePath: string): string {
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  if (extension === '.gif') {
    return 'image/gif';
  }
  return 'image/png';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a prompt string into a short, readable alt text slug.
 * e.g. "A futuristic city at dusk, neon lights" → "A futuristic city at dusk"
 */
function promptToSlug(prompt: string): string {
  // Trim to first sentence or first 60 chars, whichever is shorter
  const firstSentence = prompt.split(/[.!?]/)[0].trim();
  const truncated = firstSentence.length > 60
    ? firstSentence.slice(0, 57).trimEnd() + '…'
    : firstSentence;
  return truncated || 'Generated Image';
}

function getStandaloneOutputDirectory(): string {
  const picturesDir = path.join(os.homedir(), 'Pictures');
  if (fs.existsSync(picturesDir)) {
    return path.join(picturesDir, 'ImageGen');
  }

  return path.join(os.homedir(), 'ImageGen');
}
