import * as fs from 'fs';
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
import { getApiKeyForProvider } from './secrets';
import { ensureNotAborted } from './utils/network';

// Local stand-in for the DOM ImageData shape expected by @jsquash/webp
interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace: string;
}

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
  };
}

// ─── Main generation function ─────────────────────────────────────────────────

export interface GenerateResult {
  absolutePath: string;
  /** Workspace-relative path (e.g. assets/images/imagegen-1234.webp) */
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
  /** Override quality (0-100). Falls back to imagegen.webpQuality setting. */
  quality?: number;
  /** Override provider ID. Falls back to imagegen.provider setting. */
  providerId?: ProviderId;
  signal?: AbortSignal;
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
    quality,
    signal: opts.signal,
  });
  const apiCallDurationMs = Date.now() - apiCallStartedAt;
  ensureNotAborted(opts.signal);

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

  // ── 4. Encode to WebP via WASM ──────────────────────────────────────────────
  // ImageData is a DOM type not in Node.js lib — use our local stand-in shape
  const imageData: ImageDataLike = {
    data: new Uint8ClampedArray(rgbaData.buffer, rgbaData.byteOffset, rgbaData.byteLength),
    width,
    height,
    colorSpace: 'srgb',
  };

  const webpBuffer = await encodeWebp(imageData as unknown as Parameters<typeof encodeWebp>[0], { quality });
  ensureNotAborted(opts.signal);

  // ── 5. Save to workspace ────────────────────────────────────────────────────
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (!workspaceRoot) {
    throw new Error('ImageGen: No workspace folder is open. Please open a folder first.');
  }

  const outDir = path.join(workspaceRoot, config.outputDirectory);
  fs.mkdirSync(outDir, { recursive: true });

  const randomHex = Math.random().toString(16).slice(2, 8);
  const filename = `imagegen-${Date.now()}-${randomHex}.webp`;
  const absolutePath = path.join(outDir, filename);

  fs.writeFileSync(absolutePath, Buffer.from(webpBuffer));

  const relativePath = path
    .relative(workspaceRoot, absolutePath)
    .replace(/\\/g, '/'); // Normalise to forward slashes

  const altText = promptToSlug(opts.prompt);
  const markdownLink = `![${altText}](${relativePath})`;
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
