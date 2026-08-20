#!/usr/bin/env node

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { z } from 'zod';
import { embedPromptMetadataInWebp } from '../image/webpMetadata';
import { assertInputImageSize, inferMimeTypeFromPathname } from '../image/inputRules';
import { encodeWebp, initWasm } from '../image/wasm';
import {
  getProvider,
  PROVIDER_API_KEY_MAP,
  PROVIDER_IDS,
  PROVIDER_USD_PER_1K_IMAGES,
  type ProviderId,
} from '../providers';
import type { InputImageData, RawImageData } from '../providers/types';
import { fetchWithRetry } from '../utils/network';

const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
const MAX_DECODED_PIXEL_COUNT = 20_000_000;

type SaveMode = 'persistent' | 'temporary';

interface McpConfig {
  provider: ProviderId;
  outputDirectory: string;
  webpQuality: number;
  requestTimeoutMs: number;
  maxInputImageMB: number;
  embedPromptMetadata: boolean;
  workspaceRoot: string;
}

interface GenerateRequest {
  prompt: string;
  aspectRatio?: string;
  provider?: ProviderId;
  saveMode?: SaveMode;
}

interface EditRequest extends GenerateRequest {
  inputImage: string;
}

const server = new McpServer({ name: 'imagegen', version: '1.2.3' });

server.tool(
  'generate_image',
  'Generate an image from text, optimize it as WebP, and save it to the configured workspace.',
  {
    prompt: z.string().min(1).describe('A detailed description of the image to generate.'),
    aspectRatio: z.enum(ASPECT_RATIOS).optional().describe('Image aspect ratio. Defaults to 16:9.'),
    provider: z.enum(PROVIDER_IDS).optional().describe('Provider model. Defaults to IMAGEGEN_PROVIDER.'),
    saveMode: z.enum(['persistent', 'temporary']).optional().describe('Persistent saves in the workspace; temporary saves in the OS temp directory.'),
  },
  async (request) => asMcpResult(await generateImage(request)),
);

server.tool(
  'edit_image',
  'Edit an image from a local path, URL, data URL, or Markdown image snippet, then optimize and save the result as WebP.',
  {
    prompt: z.string().min(1).describe('Instructions for editing the source image.'),
    inputImage: z.string().min(1).describe('A local path, URL, data URL, or Markdown image snippet.'),
    aspectRatio: z.enum(ASPECT_RATIOS).optional().describe('Image aspect ratio. Defaults to 16:9.'),
    provider: z.enum(PROVIDER_IDS).optional().describe('Provider model. Defaults to IMAGEGEN_PROVIDER.'),
    saveMode: z.enum(['persistent', 'temporary']).optional().describe('Persistent saves in the workspace; temporary saves in the OS temp directory.'),
  },
  async (request) => asMcpResult(await editImage(request)),
);

async function generateImage(request: GenerateRequest): Promise<Record<string, unknown>> {
  const config = readConfig();
  const providerId = request.provider ?? config.provider;
  const startedAt = Date.now();
  const rawImage = await requestProviderImage(providerId, config, request);
  return saveImage(rawImage, providerId, config, request, Date.now() - startedAt, 'imagegen', startedAt);
}

async function editImage(request: EditRequest): Promise<Record<string, unknown>> {
  const config = readConfig();
  const providerId = request.provider ?? config.provider;
  const startedAt = Date.now();
  const inputImage = await resolveInputImage(request.inputImage, config);
  const apiCallStartedAt = Date.now();
  const rawImage = await requestProviderImage(providerId, config, request, inputImage);
  return saveImage(rawImage, providerId, config, request, Date.now() - apiCallStartedAt, 'imageedit', startedAt);
}

async function requestProviderImage(
  providerId: ProviderId,
  config: McpConfig,
  request: GenerateRequest,
  inputImage?: InputImageData,
): Promise<RawImageData> {
  const provider = getProvider(providerId);
  const apiKey = getApiKey(providerId);
  const options = {
    prompt: request.prompt,
    aspectRatio: request.aspectRatio ?? '16:9',
    quality: config.webpQuality,
    requestTimeoutMs: config.requestTimeoutMs,
  };

  if (!inputImage) {
    return provider.generate(apiKey, options);
  }
  if (!provider.edit) {
    throw new Error(`ImageGen: Provider "${providerId}" does not support image editing.`);
  }
  return provider.edit(apiKey, { ...options, inputImage });
}

async function saveImage(
  rawImage: RawImageData,
  providerId: ProviderId,
  config: McpConfig,
  request: GenerateRequest,
  apiCallDurationMs?: number,
  filePrefix: 'imagegen' | 'imageedit' = 'imagegen',
  startedAt = Date.now(),
): Promise<Record<string, unknown>> {
  const decoded = decodeRawImage(rawImage);
  const webpBuffer = await encodeWebp({
    data: new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
    width: decoded.width,
    height: decoded.height,
    colorSpace: 'srgb',
  } as unknown as Parameters<typeof encodeWebp>[0], { quality: config.webpQuality });

  const outputDirectory = request.saveMode === 'temporary'
    ? path.join(os.tmpdir(), 'ImageGen')
    : path.resolve(config.workspaceRoot, config.outputDirectory);
  await fs.promises.mkdir(outputDirectory, { recursive: true });

  const filename = `${filePrefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.webp`;
  const absolutePath = path.join(outputDirectory, filename);
  const savedBuffer = config.embedPromptMetadata
    ? embedPromptMetadataInWebp(new Uint8Array(webpBuffer), {
        prompt: request.prompt,
        filePrefix,
        providerId,
        aspectRatio: request.aspectRatio ?? '16:9',
        width: decoded.width,
        height: decoded.height,
        hasAlpha: hasTransparency(decoded.data),
        generatedAt: new Date().toISOString(),
      })
    : new Uint8Array(webpBuffer);
  await fs.promises.writeFile(absolutePath, savedBuffer);

  const relativePath = path.relative(config.workspaceRoot, absolutePath).replace(/\\/g, '/');
  const outputPath = request.saveMode === 'temporary' ? absolutePath : relativePath;
  return {
    absolutePath,
    relativePath: outputPath,
    markdownLink: `![${promptToSlug(request.prompt)}](${outputPath})`,
    originalBytes: rawImage.rawBuffer.byteLength,
    optimizedBytes: savedBuffer.byteLength,
    metrics: {
      providerId,
      apiCallDurationMs,
      totalDurationMs: Date.now() - startedAt,
      estimatedCostUsd: PROVIDER_USD_PER_1K_IMAGES[providerId] / 1000,
    },
  };
}

function decodeRawImage(rawImage: RawImageData): { data: Uint8Array; width: number; height: number } {
  const mimeType = rawImage.mimeType.toLowerCase();
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    const decoded = jpeg.decode(rawImage.rawBuffer, { useTArray: true, formatAsRGBA: true });
    validateDimensions(decoded.width, decoded.height);
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  }
  if (mimeType.includes('png')) {
    const decoded = PNG.sync.read(rawImage.rawBuffer);
    validateDimensions(decoded.width, decoded.height);
    return {
      data: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
      width: decoded.width,
      height: decoded.height,
    };
  }
  throw new Error(`ImageGen: Unsupported image type returned by provider: ${rawImage.mimeType}`);
}

async function resolveInputImage(source: string, config: McpConfig): Promise<InputImageData> {
  const value = source.trim().replace(/^!\[[^\]]*\]\(([^)]+)\)$/, '$1');
  const maxBytes = Math.round(config.maxInputImageMB * 1024 * 1024);
  const dataUrl = value.match(/^data:([^;]+);base64,([\s\S]+)$/i);
  if (dataUrl) {
    const rawBuffer = Buffer.from(dataUrl[2], 'base64');
    assertInputImageSize(rawBuffer.byteLength, maxBytes);
    return { mimeType: dataUrl[1].toLowerCase(), rawBuffer };
  }
  if (/^https?:\/\//i.test(value)) {
    const response = await fetchWithRetry(value, {}, { requestTimeoutMs: config.requestTimeoutMs });
    if (!response.ok) {
      throw new Error(`ImageGen: Failed to download input image (${response.status}).`);
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength)) {
      assertInputImageSize(contentLength, maxBytes);
    }
    const rawBuffer = Buffer.from(await response.arrayBuffer());
    assertInputImageSize(rawBuffer.byteLength, maxBytes);
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.toLowerCase();
    return { mimeType: mimeType?.startsWith('image/') ? mimeType : inferMimeTypeFromPathname(value), rawBuffer };
  }

  const localPath = path.isAbsolute(value) ? value : path.resolve(config.workspaceRoot, value);
  const stats = await fs.promises.stat(localPath).catch(() => undefined);
  if (!stats || !stats.isFile()) {
    throw new Error(`ImageGen: Input image not found at "${value}".`);
  }
  assertInputImageSize(stats.size, maxBytes);
  return { mimeType: inferMimeTypeFromPathname(localPath), rawBuffer: await fs.promises.readFile(localPath) };
}

function getApiKey(providerId: ProviderId): string {
  const variables: Record<string, string | undefined> = {
    'gemini-api-key': process.env.GEMINI_API_KEY,
    'openai-api-key': process.env.OPENAI_API_KEY,
    'openrouter-api-key': process.env.OPENROUTER_API_KEY,
  };
  const environmentNames: Record<string, string> = {
    'gemini-api-key': 'GEMINI_API_KEY',
    'openai-api-key': 'OPENAI_API_KEY',
    'openrouter-api-key': 'OPENROUTER_API_KEY',
  };
  const keyName = PROVIDER_API_KEY_MAP[providerId];
  const apiKey = variables[keyName];
  if (!apiKey) {
    throw new Error(`ImageGen: Missing ${environmentNames[keyName]} for provider "${providerId}".`);
  }
  return apiKey;
}

function readConfig(): McpConfig {
  const provider = process.env.IMAGEGEN_PROVIDER ?? 'gemini-3.1-flash-image-preview';
  if (!(PROVIDER_IDS as readonly string[]).includes(provider)) {
    throw new Error(`ImageGen: Unknown IMAGEGEN_PROVIDER "${provider}".`);
  }
  return {
    provider: provider as ProviderId,
    outputDirectory: process.env.IMAGEGEN_OUTPUT_DIRECTORY ?? 'assets/images',
    webpQuality: readNumber('IMAGEGEN_WEBP_QUALITY', 80, 0, 100),
    requestTimeoutMs: readNumber('IMAGEGEN_REQUEST_TIMEOUT_MS', 45000, 5000, 180000),
    maxInputImageMB: readNumber('IMAGEGEN_MAX_INPUT_IMAGE_MB', 12, 1, 100),
    embedPromptMetadata: process.env.IMAGEGEN_EMBED_PROMPT_METADATA !== 'false',
    workspaceRoot: path.resolve(process.env.IMAGEGEN_WORKSPACE_DIR ?? process.cwd()),
  };
}

function readNumber(name: string, defaultValue: number, min: number, max: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`ImageGen: ${name} must be a number between ${min} and ${max}.`);
  }
  return parsed;
}

function validateDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0 || width * height > MAX_DECODED_PIXEL_COUNT) {
    throw new Error('ImageGen: Image resolution is invalid or too large to process safely.');
  }
}

function hasTransparency(data: Uint8Array): boolean {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 255) {
      return true;
    }
  }
  return false;
}

function promptToSlug(prompt: string): string {
  const firstSentence = prompt.split(/[.!?]/)[0].trim();
  return firstSentence.length > 60 ? `${firstSentence.slice(0, 57).trimEnd()}...` : firstSentence || 'Generated Image';
}

function asMcpResult(result: Record<string, unknown>): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function start(): Promise<void> {
  await initWasm(path.resolve(__dirname, '../..'));
  await server.connect(new StdioServerTransport());
}

void start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});